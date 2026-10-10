export type SubscriptionStatusName =
  'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'INCOMPLETE' | 'UNPAID';

export type PlanRecord = {
  id: string;
  name: string;
  monthlyAmountMinor: number;
  currency: string;
  stripePriceId: string | null;
  active: boolean;
};

export type SubscriptionRecord = {
  planId: string;
  planName: string;
  monthlyAmountMinor: number;
  currency: string;
  status: SubscriptionStatusName;
  stripeCustomerId: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

export type CheckoutUpdate = {
  tenantId: string;
  planId: string;
  status: SubscriptionStatusName;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export type SubscriptionUpdate = {
  stripeSubscriptionId: string;
  planId: string | null;
  status: SubscriptionStatusName | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean | null;
};

export interface BillingStore {
  listPlans(): Promise<PlanRecord[]>;
  findPlan(id: string): Promise<PlanRecord | null>;
  subscription(tenantId: string): Promise<SubscriptionRecord | null>;
  userEmail(userId: string): Promise<string | null>;
  hasEvent(id: string): Promise<boolean>;
  claimEvent(id: string, type: string): Promise<boolean>;
  applyCheckout(input: CheckoutUpdate): Promise<boolean>;
  applySubscription(input: SubscriptionUpdate): Promise<boolean>;
}
