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
import type { BillingSnapshot } from './billing.snapshot';
import { BILLING_STORE, STRIPE_GATEWAY } from './billing.tokens';
import type {
  BillingStore,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionStatusName,
} from './billing.store';
import type { StripeEvent, StripeGateway } from './stripe.port';

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
  canOpenPortal: boolean;
  stripe: BillingSnapshot | null;
  plans: PlanOffer[];
};

const RISK_EVENTS = new Set([
  'charge.dispute.created',
  'charge.refunded',
  'radar.early_fraud_warning.created',
]);

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
    const canManage = allows(access, 'billing.manage');
    return {
      canManage,
      canOpenPortal: canManage && subscription?.stripeCustomerId != null,
      stripe: await this.stripeDetails(subscription),
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

  private async stripeDetails(
    subscription: SubscriptionRecord | null,
  ): Promise<BillingSnapshot | null> {
    const customerId = subscription?.stripeCustomerId ?? null;
    if (!this.stripe.configured() || customerId == null) {
      return null;
    }
    try {
      return await this.stripe.billingSnapshot({
        customerId,
        subscriptionId: subscription?.stripeSubscriptionId ?? null,
      });
    } catch (error) {
      this.logger.warn(
        `Stripe billing details are unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
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

  async portal(access: TenantAccess): Promise<{ url: string }> {
    if (!allows(access, 'billing.manage')) {
      throw new ForbiddenException('You do not have access to do that');
    }
    if (!this.stripe.configured()) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    const current = await this.billing.subscription(access.tenant.id);
    if (!current?.stripeCustomerId) {
      throw new BadRequestException('Subscribe before managing billing');
    }
    const origin = this.config
      .get('WEB_ORIGIN', { infer: true })
      .replace(/\/$/, '');
    return this.stripe.createPortal({
      customerId: current.stripeCustomerId,
      returnUrl: `${origin}/businesses/${access.tenant.slug}/billing`,
    });
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
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.applyCheckout(
        event.object,
        event.type === 'checkout.session.async_payment_succeeded'
          ? 'ACTIVE'
          : undefined,
      );
      return;
    }
    if (event.type === 'checkout.session.async_payment_failed') {
      await this.applyCheckout(event.object, 'INCOMPLETE');
      return;
    }
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      await this.applySubscription(event.object);
      return;
    }
    if (
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_failed'
    ) {
      const subscriptionId = subscriptionIdFrom(event.object);
      if (subscriptionId) {
        await this.billing.applySubscription({
          stripeSubscriptionId: subscriptionId,
          planId: null,
          status: event.type === 'invoice.paid' ? 'ACTIVE' : 'PAST_DUE',
          currentPeriodEnd:
            event.type === 'invoice.paid'
              ? unixDate(event.object.period_end)
              : null,
          cancelAtPeriodEnd: null,
        });
      }
      return;
    }
    if (RISK_EVENTS.has(event.type)) {
      const subscriptionId = await this.stripe.subscriptionIdForRisk(event);
      this.logger.log(
        subscriptionId
          ? `Stripe ${event.type} for subscription ${subscriptionId}`
          : `Stripe ${event.type} is not tied to a subscription`,
      );
      return;
    }
    this.logger.log(`Ignored Stripe event ${event.type}`);
  }

  private async applyCheckout(
    object: Record<string, unknown>,
    forcedStatus?: SubscriptionStatusName,
  ): Promise<void> {
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
      status: forcedStatus ?? (paid ? 'ACTIVE' : 'INCOMPLETE'),
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

function subscriptionIdFrom(object: Record<string, unknown>): string | null {
  const direct = stringField(object, 'subscription');
  if (direct) {
    return direct;
  }
  const parent = recordField(object, 'parent');
  const details = parent ? recordField(parent, 'subscription_details') : null;
  const subscription = details?.subscription;
  if (typeof subscription === 'string' && subscription.length > 0) {
    return subscription;
  }
  if (
    typeof subscription === 'object' &&
    subscription !== null &&
    'id' in subscription &&
    typeof subscription.id === 'string' &&
    subscription.id.length > 0
  ) {
    return subscription.id;
  }
  return null;
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
