import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/master';
import { MasterPrismaService } from '../database/master-prisma.service';
import type {
  BillingStore,
  CheckoutUpdate,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionUpdate,
} from './billing.store';

const planSelect = {
  id: true,
  name: true,
  monthlyAmountMinor: true,
  currency: true,
  stripePriceId: true,
  active: true,
} as const;

@Injectable()
export class PrismaBillingStore implements BillingStore {
  constructor(private readonly prisma: MasterPrismaService) {}

  listPlans(): Promise<PlanRecord[]> {
    return this.prisma.plan.findMany({
      where: { active: true },
      select: planSelect,
      orderBy: { monthlyAmountMinor: 'asc' },
    });
  }

  findPlan(id: string): Promise<PlanRecord | null> {
    return this.prisma.plan.findUnique({ where: { id }, select: planSelect });
  }

  async subscription(tenantId: string): Promise<SubscriptionRecord | null> {
    const row = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        planId: true,
        status: true,
        stripeCustomerId: true,
        trialEndsAt: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: {
          select: {
            name: true,
            monthlyAmountMinor: true,
            currency: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    return {
      planId: row.planId,
      planName: row.plan.name,
      monthlyAmountMinor: row.plan.monthlyAmountMinor,
      currency: row.plan.currency,
      status: row.status,
      stripeCustomerId: row.stripeCustomerId,
      trialEndsAt: row.trialEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    };
  }

  async userEmail(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  }

  async hasEvent(id: string): Promise<boolean> {
    const row = await this.prisma.stripeWebhookEvent.findUnique({
      where: { id },
      select: { id: true },
    });
    return row !== null;
  }

  async claimEvent(id: string, type: string): Promise<boolean> {
    try {
      await this.prisma.stripeWebhookEvent.create({ data: { id, type } });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  async applyCheckout(input: CheckoutUpdate): Promise<boolean> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: input.planId },
      select: { id: true },
    });
    if (!plan) {
      return false;
    }
    const updated = await this.prisma.subscription.updateMany({
      where: { tenantId: input.tenantId },
      data: {
        planId: input.planId,
        status: input.status,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        cancelAtPeriodEnd: false,
      },
    });
    return updated.count === 1;
  }

  async applySubscription(input: SubscriptionUpdate): Promise<boolean> {
    if (input.planId) {
      const plan = await this.prisma.plan.findUnique({
        where: { id: input.planId },
        select: { id: true },
      });
      if (!plan) {
        input = { ...input, planId: null };
      }
    }
    const updated = await this.prisma.subscription.updateMany({
      where: { stripeSubscriptionId: input.stripeSubscriptionId },
      data: {
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.currentPeriodEnd
          ? { currentPeriodEnd: input.currentPeriodEnd }
          : {}),
        ...(input.cancelAtPeriodEnd === null
          ? {}
          : { cancelAtPeriodEnd: input.cancelAtPeriodEnd }),
      },
    });
    return updated.count === 1;
  }
}
