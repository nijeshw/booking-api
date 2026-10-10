import type {
  BillingSnapshot,
  BillingSnapshotRequest,
} from './billing.snapshot';

export type CheckoutRequest = {
  priceId: string;
  customerId: string | null;
  customerEmail: string;
  tenantId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
};

export type StripeEvent = {
  id: string;
  type: string;
  object: Record<string, unknown>;
};

export type PortalRequest = {
  customerId: string;
  returnUrl: string;
};

export interface StripeGateway {
  configured(): boolean;
  createCheckout(input: CheckoutRequest): Promise<{ url: string }>;
  createPortal(input: PortalRequest): Promise<{ url: string }>;
  billingSnapshot(input: BillingSnapshotRequest): Promise<BillingSnapshot>;
  readEvent(payload: Buffer, signature: string): StripeEvent;
  subscriptionIdForRisk(event: StripeEvent): Promise<string | null>;
}
