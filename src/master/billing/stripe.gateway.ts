import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import Stripe from 'stripe';
import type {
  BillingCard,
  BillingSnapshot,
  BillingSnapshotRequest,
} from './billing.snapshot';
import type {
  CheckoutRequest,
  PortalRequest,
  StripeEvent,
  StripeGateway,
} from './stripe.port';

@Injectable()
export class StripeSdkGateway implements StripeGateway {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  configured(): boolean {
    return true;
  }

  async createCheckout(input: CheckoutRequest): Promise<{ url: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: input.priceId, quantity: 1 }],
      customer: input.customerId ?? undefined,
      customer_email: input.customerId ? undefined : input.customerEmail,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { tenantId: input.tenantId, planId: input.planId },
      subscription_data: {
        metadata: { tenantId: input.tenantId, planId: input.planId },
      },
    });
    if (!session.url) {
      throw new Error('Checkout did not return a URL');
    }
    return { url: session.url };
  }

  async createPortal(input: PortalRequest): Promise<{ url: string }> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  async billingSnapshot(
    input: BillingSnapshotRequest,
  ): Promise<BillingSnapshot> {
    const [card, renewal, listed] = await Promise.all([
      this.cardOnFile(input),
      this.renewal(input),
      this.stripe.invoices.list({ customer: input.customerId, limit: 8 }),
    ]);
    return {
      card,
      renewal,
      invoices: listed.data
        .filter((invoice) => invoice.status !== 'draft')
        .map((invoice) => ({
          id: invoice.id ?? '',
          number: invoice.number,
          status: invoice.status ?? 'open',
          amountMinor: invoice.amount_due,
          currency: invoice.currency,
          createdAt: DateTime.fromSeconds(invoice.created, {
            zone: 'utc',
          }).toJSDate(),
          hostedUrl: invoice.hosted_invoice_url ?? null,
        })),
    };
  }

  private async cardOnFile(
    input: BillingSnapshotRequest,
  ): Promise<BillingCard | null> {
    if (input.subscriptionId) {
      const subscription = await this.stripe.subscriptions.retrieve(
        input.subscriptionId,
        { expand: ['default_payment_method'] },
      );
      const card = cardFrom(subscription.default_payment_method);
      if (card) {
        return card;
      }
    }
    const customer = await this.stripe.customers.retrieve(input.customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    if (customer.deleted) {
      return null;
    }
    return cardFrom(customer.invoice_settings.default_payment_method);
  }

  private async renewal(
    input: BillingSnapshotRequest,
  ): Promise<BillingSnapshot['renewal']> {
    if (!input.subscriptionId) {
      return null;
    }
    try {
      const invoice = await this.stripe.invoices.createPreview({
        customer: input.customerId,
        subscription: input.subscriptionId,
      });
      return {
        amountMinor: invoice.amount_due,
        currency: invoice.currency,
        at: DateTime.fromSeconds(invoice.period_start, {
          zone: 'utc',
        }).toJSDate(),
      };
    } catch {
      return null;
    }
  }

  async subscriptionIdForRisk(event: StripeEvent): Promise<string | null> {
    const paymentIntentId = await this.paymentIntentId(event);
    if (!paymentIntentId) {
      return null;
    }
    const payments = await this.stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: paymentIntentId },
      limit: 1,
    });
    const invoiceRef = payments.data[0]?.invoice;
    const invoiceId =
      typeof invoiceRef === 'string' ? invoiceRef : invoiceRef?.id;
    if (!invoiceId) {
      return null;
    }
    const invoice = await this.stripe.invoices.retrieve(invoiceId);
    const subscription = invoice.parent?.subscription_details?.subscription;
    if (!subscription || typeof subscription === 'string') {
      return subscription ?? null;
    }
    return 'id' in subscription ? subscription.id : null;
  }

  private async paymentIntentId(event: StripeEvent): Promise<string | null> {
    const direct = stringField(event.object, 'payment_intent');
    if (direct) {
      return direct;
    }
    const chargeId =
      event.type === 'charge.refunded'
        ? stringField(event.object, 'id')
        : stringField(event.object, 'charge');
    if (!chargeId) {
      return null;
    }
    const charge = await this.stripe.charges.retrieve(chargeId);
    if (typeof charge.payment_intent === 'string') {
      return charge.payment_intent;
    }
    return charge.payment_intent?.id ?? null;
  }

  readEvent(payload: Buffer, signature: string): StripeEvent {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
    return {
      id: event.id,
      type: event.type,
      object: event.data.object as unknown as Record<string, unknown>,
    };
  }
}

@Injectable()
export class UnconfiguredStripeGateway implements StripeGateway {
  configured(): boolean {
    return false;
  }

  createCheckout(): Promise<{ url: string }> {
    return Promise.reject(new Error('Payments are not configured'));
  }

  createPortal(): Promise<{ url: string }> {
    return Promise.reject(new Error('Payments are not configured'));
  }

  billingSnapshot(): Promise<BillingSnapshot> {
    return Promise.reject(new Error('Payments are not configured'));
  }

  readEvent(): StripeEvent {
    throw new Error('Payments are not configured');
  }

  subscriptionIdForRisk(): Promise<string | null> {
    return Promise.reject(new Error('Payments are not configured'));
  }
}

function cardFrom(
  method: string | Stripe.PaymentMethod | null | undefined,
): BillingCard | null {
  if (!method || typeof method === 'string' || !method.card?.last4) {
    return null;
  }
  return { brand: method.card.brand, last4: method.card.last4 };
}

function stringField(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
