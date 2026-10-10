import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';

import type { Env } from '../../config/env';
import { allows } from '../../tenant/roles/permission';
import type { TenantAccess } from '../tenancy/tenant.types';
import { BILLING_STORE, STRIPE_GATEWAY } from './billing.tokens';
import type {
  BillingStore,
  PlanRecord,
  SubscriptionStatusName,
} from './billing.store';
import type { StripeEvent, StripeGateway } from './stripe.gateway';

export type PlanOffer = {
  id: string;
  name: string;
  monthlyAmountMinor: number;
  currency: string;
  purchasable: boolean;
};

export type BillingView = {
  canManage: boolean;
  subscription: {
    planId: string;
    planName: string;
    monthlyAmountMinor: number;
    currency: string;
    status: SubscriptionStatusName;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  plans: PlanOffer[];
};

const STRIPE_STATUS: Record<string, SubscriptionStatusName> = {
  trialing: 'TRIALING',
  active: 'ACTIVE',
  past_due: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'CANCELED',
  unpaid: 'UNPAID',
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(BILLING_STORE) private readonly billing: BillingStore,
    @Inject(STRIPE_GATEWAY) private readonly stripe: StripeGateway,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async plans(): Promise<PlanOffer[]> {
    return (await this.billing.listPlans()).map(toOffer);
  }

  async view(access: TenantAccess): Promise<BillingView> {
    const [subscription, plans] = await Promise.all([
      this.billing.subscription(access.tenant.id),
      this.billing.listPlans(),
    ]);
    return {
      canManage: allows(access, 'billing.manage'),
      subscription: subscription
        ? {
            planId: subscription.planId,
            planName: subscription.planName,
            monthlyAmountMinor: subscription.monthlyAmountMinor,
            currency: subscription.currency,
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
      plans: plans.map(toOffer),
    };
  }

  async checkout(
    access: TenantAccess,
    planId: string,
  ): Promise<{ url: string }> {
    if (!allows(access, 'billing.manage')) {
      throw new ForbiddenException('You do not have access to do that');
    }
    if (!this.stripe.configured()) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const plan = await this.billing.findPlan(planId);
    if (!plan || !plan.active) {
      throw new NotFoundException('Plan not found');
    }
    if (!plan.stripePriceId || plan.monthlyAmountMinor <= 0) {
      throw new BadRequestException('This plan cannot be purchased');
    }
    const current = await this.billing.subscription(access.tenant.id);
    if (
      current?.planId === plan.id &&
      current.status === 'ACTIVE' &&
      !current.cancelAtPeriodEnd
    ) {
      throw new BadRequestException('You are already on this plan');
    }
    const email = await this.billing.userEmail(access.userId);
    if (!email) {
      throw new NotFoundException('Account not found');
    }
    const origin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .replace(/\/$/, '');
    const session = await this.stripe.createCheckout({
      priceId: plan.stripePriceId,
      customerId: current?.stripeCustomerId ?? null,
      customerEmail: email,
      tenantId: access.tenant.id,
      planId: plan.id,
      successUrl: `${origin}/businesses/${access.tenant.slug}/billing?checkout=success`,
      cancelUrl: `${origin}/businesses/${access.tenant.slug}/billing?checkout=cancel`,
    });
    return session;
  }

  async handleWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<{ received: true }> {
    let event: StripeEvent;
    try {
      event = this.stripe.readEvent(payload, signature);
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
    if (await this.billing.hasEvent(event.id)) {
      return { received: true };
    }
    await this.apply(event);
    await this.billing.claimEvent(event.id, event.type);
    return { received: true };
  }

  private async apply(event: StripeEvent): Promise<void> {
    if (event.type === 'checkout.session.completed') {
      await this.applyCheckout(event.object);
      return;
    }
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await this.applySubscription(event.object);
      return;
    }
    if (event.type === 'invoice.payment_failed') {
      const subscriptionId = stringField(event.object, 'subscription');
      if (subscriptionId) {
        await this.billing.applySubscription({
          stripeSubscriptionId: subscriptionId,
          planId: null,
          status: 'PAST_DUE',
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null,
        });
      }
      return;
    }
    this.logger.log(`Ignored Stripe event ${event.type}`);
  }

  private async applyCheckout(object: Record<string, unknown>): Promise<void> {
    const metadata = recordField(object, 'metadata');
    const tenantId = metadata ? stringField(metadata, 'tenantId') : null;
    const planId = metadata ? stringField(metadata, 'planId') : null;
    if (!tenantId || !planId) {
      this.logger.log('Ignored checkout without a business');
      return;
    }
    const paid = stringField(object, 'payment_status') === 'paid';
    await this.billing.applyCheckout({
      tenantId,
      planId,
      status: paid ? 'ACTIVE' : 'INCOMPLETE',
      stripeCustomerId: stringField(object, 'customer'),
      stripeSubscriptionId: stringField(object, 'subscription'),
    });
  }

  private async applySubscription(
    object: Record<string, unknown>,
  ): Promise<void> {
    const subscriptionId = stringField(object, 'id');
    if (!subscriptionId) {
      return;
    }
    const metadata = recordField(object, 'metadata');
    const planId = metadata ? stringField(metadata, 'planId') : null;
    const statusName = stringField(object, 'status');
    await this.billing.applySubscription({
      stripeSubscriptionId: subscriptionId,
      planId,
      status: statusName ? (STRIPE_STATUS[statusName] ?? null) : null,
      currentPeriodEnd: unixDate(object.current_period_end),
      cancelAtPeriodEnd:
        typeof object.cancel_at_period_end === 'boolean'
          ? object.cancel_at_period_end
          : null,
    });
  }
}

function toOffer(plan: PlanRecord): PlanOffer {
  return {
    id: plan.id,
    name: plan.name,
    monthlyAmountMinor: plan.monthlyAmountMinor,
    currency: plan.currency,
    purchasable: plan.monthlyAmountMinor > 0 && plan.stripePriceId !== null,
  };
}

function stringField(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function recordField(
  object: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = object[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function unixDate(value: unknown): Date | null {
  return typeof value === 'number'
    ? DateTime.fromSeconds(value, { zone: 'utc' }).toJSDate()
    : null;
}
