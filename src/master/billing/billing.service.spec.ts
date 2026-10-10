import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Env } from '../../config/env';
import type { TenantAccess } from '../tenancy/tenant.types';
import { BillingService } from './billing.service';
import type {
  BillingStore,
  CheckoutUpdate,
  PlanRecord,
  SubscriptionRecord,
  SubscriptionUpdate,
} from './billing.store';
import type { BillingSnapshot } from './billing.snapshot';
import type {
  CheckoutRequest,
  PortalRequest,
  StripeEvent,
  StripeGateway,
} from './stripe.port';

const access: TenantAccess = {
  userId: 'user-1',
  role: 'OWNER',
  subscriptionStatus: 'ACTIVE',
  tenant: {
    id: 'tenant-1',
    slug: 'ada-studio',
    legalName: 'Ada Studio',
    status: 'ACTIVE',
    databaseName: 'nexora_t_ada',
    timezone: 'Europe/London',
    currency: 'GBP',
    email: null,
    phone: null,
    addressLine1: null,
    city: null,
    postcode: null,
    country: null,
    ownerUserId: 'user-1',
    schemaVersion: 1,
  },
};

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: 'pro',
    name: 'Pro',
    monthlyAmountMinor: 2900,
    currency: 'GBP',
    stripePriceId: 'price_pro',
    active: true,
    ...overrides,
  };
}

class MemoryBilling implements BillingStore {
  plans = [
    plan(),
    plan({
      id: 'trial',
      name: 'Free trial',
      monthlyAmountMinor: 0,
      stripePriceId: null,
    }),
  ];
  current: SubscriptionRecord | null = {
    planId: 'trial',
    planName: 'Free trial',
    monthlyAmountMinor: 0,
    currency: 'GBP',
    status: 'TRIALING',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: DateTime.fromISO('2026-10-12T00:00:00.000Z', {
      zone: 'utc',
    }).toJSDate(),
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
  email: string | null = 'ada@example.com';
  events: string[] = [];
  checkouts: CheckoutUpdate[] = [];
  updates: SubscriptionUpdate[] = [];

  listPlans() {
    return Promise.resolve(this.plans.filter((item) => item.active));
  }

  findPlan(id: string) {
    return Promise.resolve(this.plans.find((item) => item.id === id) ?? null);
  }

  subscription() {
    return Promise.resolve(this.current);
  }

  userEmail() {
    return Promise.resolve(this.email);
  }

  hasEvent(id: string) {
    return Promise.resolve(this.events.includes(id));
  }

  claimEvent(id: string) {
    if (this.events.includes(id)) {
      return Promise.resolve(false);
    }
    this.events.push(id);
    return Promise.resolve(true);
  }

  applyCheckout(input: CheckoutUpdate) {
    this.checkouts.push(input);
    return Promise.resolve(true);
  }

  applySubscription(input: SubscriptionUpdate) {
    this.updates.push(input);
    return Promise.resolve(true);
  }
}

class FakeStripe implements StripeGateway {
  configuredFlag = true;
  failSignature = false;
  event: StripeEvent | null = null;
  lastPriceId: string | null = null;
  lastTenantId: string | null = null;
  lastPortalCustomer: string | null = null;
  lastReturnUrl: string | null = null;
  riskCalls = 0;
  snapshot: BillingSnapshot = {
    card: null,
    renewal: null,
    invoices: [],
  };
  failSnapshot = false;
  snapshotCalls = 0;

  configured() {
    return this.configuredFlag;
  }

  createCheckout(input: CheckoutRequest) {
    this.lastPriceId = input.priceId;
    this.lastTenantId = input.tenantId;
    return Promise.resolve({ url: 'https://checkout.stripe.test/session' });
  }

  createPortal(input: PortalRequest) {
    this.lastPortalCustomer = input.customerId;
    this.lastReturnUrl = input.returnUrl;
    return Promise.resolve({ url: 'https://billing.stripe.test/portal' });
  }

  billingSnapshot() {
    this.snapshotCalls += 1;
    if (this.failSnapshot) {
      return Promise.reject(new Error('Stripe is unavailable'));
    }
    return Promise.resolve(this.snapshot);
  }

  readEvent(): StripeEvent {
    if (this.failSignature || !this.event) {
      throw new Error('Invalid signature');
    }
    return this.event;
  }

  subscriptionIdForRisk() {
    this.riskCalls += 1;
    return Promise.resolve('sub_1');
  }
}

function serviceFor(store = new MemoryBilling(), stripe = new FakeStripe()) {
  const config = {
    get: () => 'http://localhost:5173',
  } as unknown as ConfigService<Env, true>;
  return { store, stripe, service: new BillingService(store, stripe, config) };
}

describe('BillingService', () => {
  it('lists plans without Stripe price ids', async () => {
    const { service } = serviceFor();
    const view = await service.view(access);
    expect(view.subscription?.planId).toBe('trial');
    expect(view.plans.find((item) => item.id === 'pro')?.purchasable).toBe(
      true,
    );
    expect(view.plans.find((item) => item.id === 'trial')?.purchasable).toBe(
      false,
    );
    expect(view.canOpenPortal).toBe(false);
    expect(view.stripe).toBeNull();
    expect(JSON.stringify(view)).not.toContain('price_pro');
  });

  it('includes the card, next payment, and invoices from Stripe', async () => {
    const store = new MemoryBilling();
    store.current = {
      ...store.current!,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    };
    const stripe = new FakeStripe();
    const createdAt = DateTime.fromISO('2026-10-01T00:00:00.000Z', {
      zone: 'utc',
    }).toJSDate();
    stripe.snapshot = {
      card: { brand: 'visa', last4: '4242' },
      renewal: {
        amountMinor: 1500,
        currency: 'gbp',
        at: DateTime.fromISO('2026-11-01T00:00:00.000Z', {
          zone: 'utc',
        }).toJSDate(),
      },
      invoices: [
        {
          id: 'in_1',
          number: 'NX-0001',
          status: 'paid',
          amountMinor: 1500,
          currency: 'gbp',
          createdAt,
          hostedUrl: 'https://invoice.stripe.test/in_1',
        },
      ],
    };
    const { service } = serviceFor(store, stripe);
    const view = await service.view(access);
    expect(stripe.snapshotCalls).toBe(1);
    expect(view.stripe).toEqual(stripe.snapshot);
  });

  it('still shows the plan when Stripe details fail', async () => {
    const store = new MemoryBilling();
    store.current = {
      ...store.current!,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
    };
    const stripe = new FakeStripe();
    stripe.failSnapshot = true;
    const { service } = serviceFor(store, stripe);
    const view = await service.view(access);
    expect(view.subscription?.planId).toBe('trial');
    expect(view.stripe).toBeNull();
  });

  it('offers the portal only after Stripe has a customer', async () => {
    const store = new MemoryBilling();
    store.current = {
      ...store.current!,
      stripeCustomerId: 'cus_1',
    };
    const { service } = serviceFor(store);
    const view = await service.view(access);
    expect(view.canOpenPortal).toBe(true);
    const staff = await service.view({ ...access, role: 'STAFF' });
    expect(staff.canOpenPortal).toBe(false);
  });

  it('refuses to sell the trial plan', async () => {
    const { service } = serviceFor();
    await expect(service.checkout(access, 'trial')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a plan that has no Stripe price', async () => {
    const store = new MemoryBilling();
    store.plans = [plan({ stripePriceId: null })];
    const { service } = serviceFor(store);
    await expect(service.checkout(access, 'pro')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses checkout when Stripe is not configured', async () => {
    const stripe = new FakeStripe();
    stripe.configuredFlag = false;
    const { service } = serviceFor(new MemoryBilling(), stripe);
    await expect(service.checkout(access, 'pro')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses checkout for someone who is not the owner', async () => {
    const { service } = serviceFor();
    await expect(
      service.checkout({ ...access, role: 'STAFF' }, 'pro'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('opens the customer portal for the Stripe customer', async () => {
    const store = new MemoryBilling();
    store.current = { ...store.current!, stripeCustomerId: 'cus_1' };
    const { service, stripe } = serviceFor(store);
    await expect(service.portal(access)).resolves.toEqual({
      url: 'https://billing.stripe.test/portal',
    });
    expect(stripe.lastPortalCustomer).toBe('cus_1');
    expect(stripe.lastReturnUrl).toBe(
      'http://localhost:5173/businesses/ada-studio/billing',
    );
  });

  it('refuses the portal before a Stripe customer exists', async () => {
    const { service } = serviceFor();
    await expect(service.portal(access)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses the portal when Stripe is not configured', async () => {
    const store = new MemoryBilling();
    store.current = { ...store.current!, stripeCustomerId: 'cus_1' };
    const stripe = new FakeStripe();
    stripe.configuredFlag = false;
    const { service } = serviceFor(store, stripe);
    await expect(service.portal(access)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('refuses the portal for someone who cannot manage billing', async () => {
    const store = new MemoryBilling();
    store.current = { ...store.current!, stripeCustomerId: 'cus_1' };
    const { service } = serviceFor(store);
    await expect(
      service.portal({ ...access, role: 'STAFF' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('starts checkout for a priced plan', async () => {
    const { service, stripe } = serviceFor();
    const session = await service.checkout(access, 'pro');
    expect(session).toEqual({ url: 'https://checkout.stripe.test/session' });
    expect(stripe.lastPriceId).toBe('price_pro');
    expect(stripe.lastTenantId).toBe('tenant-1');
  });

  it('rejects a webhook with a bad signature', async () => {
    const stripe = new FakeStripe();
    stripe.failSignature = true;
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await expect(
      service.handleWebhook(Buffer.from('{}'), 'bad'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.events).toEqual([]);
  });

  it('applies a paid checkout once', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      object: {
        payment_status: 'paid',
        customer: 'cus_1',
        subscription: 'sub_1',
        metadata: { tenantId: 'tenant-1', planId: 'pro' },
      },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await expect(
      service.handleWebhook(Buffer.from('{}'), 'sig'),
    ).resolves.toEqual({ received: true });
    expect(store.checkouts[0]).toMatchObject({
      tenantId: 'tenant-1',
      planId: 'pro',
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_1',
    });
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.checkouts).toHaveLength(1);
  });

  it('activates a subscription when a delayed checkout payment succeeds', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_async_ok',
      type: 'checkout.session.async_payment_succeeded',
      object: {
        payment_status: 'unpaid',
        customer: 'cus_1',
        subscription: 'sub_1',
        metadata: { tenantId: 'tenant-1', planId: 'pro' },
      },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.checkouts[0]).toMatchObject({
      status: 'ACTIVE',
      stripeSubscriptionId: 'sub_1',
    });
  });

  it('leaves checkout incomplete when a delayed payment fails', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_async_fail',
      type: 'checkout.session.async_payment_failed',
      object: {
        payment_status: 'unpaid',
        customer: 'cus_1',
        subscription: 'sub_1',
        metadata: { tenantId: 'tenant-1', planId: 'pro' },
      },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.checkouts[0]?.status).toBe('INCOMPLETE');
  });

  it('marks the subscription active when an invoice is paid', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_paid',
      type: 'invoice.paid',
      object: {
        period_end: 1_797_120_000,
        parent: { subscription_details: { subscription: 'sub_1' } },
      },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.updates[0]).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      status: 'ACTIVE',
      currentPeriodEnd: DateTime.fromSeconds(1_797_120_000, {
        zone: 'utc',
      }).toJSDate(),
    });
  });

  it('records a dispute against the subscription without changing the plan', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_dispute',
      type: 'charge.dispute.created',
      object: { payment_intent: 'pi_1' },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(stripe.riskCalls).toBe(1);
    expect(store.events).toEqual(['evt_dispute']);
    expect(store.updates).toEqual([]);
    expect(store.checkouts).toEqual([]);
  });

  it('marks the subscription past due when an invoice fails', async () => {
    const stripe = new FakeStripe();
    stripe.event = {
      id: 'evt_2',
      type: 'invoice.payment_failed',
      object: { subscription: 'sub_1' },
    };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.updates[0]).toMatchObject({
      stripeSubscriptionId: 'sub_1',
      status: 'PAST_DUE',
    });
  });

  it('records an unknown event without changing the subscription', async () => {
    const stripe = new FakeStripe();
    stripe.event = { id: 'evt_3', type: 'ping', object: {} };
    const { service, store } = serviceFor(new MemoryBilling(), stripe);
    await service.handleWebhook(Buffer.from('{}'), 'sig');
    expect(store.events).toEqual(['evt_3']);
    expect(store.checkouts).toEqual([]);
    expect(store.updates).toEqual([]);
  });
});
