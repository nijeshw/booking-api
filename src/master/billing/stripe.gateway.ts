import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

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

export interface StripeGateway {
  configured(): boolean;
  createCheckout(input: CheckoutRequest): Promise<{ url: string }>;
  readEvent(payload: Buffer, signature: string): StripeEvent;
}

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

  readEvent(): StripeEvent {
    throw new Error('Payments are not configured');
  }
}
