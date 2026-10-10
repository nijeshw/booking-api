import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { hashToken } from '../../auth/token/token';
import type { TenantRecord } from '../../master/tenancy/tenant.types';
import type { BookingNotifier } from '../notifications/notification.service';
import { BookingService } from './booking.service';
import type {
  AppointmentView,
  BookingSetup,
  BookingStore,
  CustomerDetails,
  DueNotification,
  ManagedBooking,
  NewAppointment,
  Occupancy,
  RescheduleUpdate,
} from './booking.store';

const utc = (iso: string): Date =>
  DateTime.fromISO(iso, { zone: 'utc' }).toJSDate();
const NOW = utc('2026-01-05T08:00:00.000Z');
const tenant: TenantRecord = {
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
};

function setupData(): BookingSetup {
  return {
    profile: {
      name: 'Ada Studio',
      category: 'Tutor',
      timezone: 'Europe/London',
      currency: 'GBP',
      slug: 'ada-studio',
      email: 'ada@example.com',
      description: null,
      logoUrl: null,
      brandColor: null,
    },
    policy: {
      minNoticeMinutes: 0,
      maxAdvanceDays: 14,
      slotIntervalMinutes: 30,
      allowAnyStaff: true,
      requireCustomerEmail: true,
      requireCustomerPhone: false,
      cancellationWindowMinutes: 0,
      allowCustomerCancel: true,
      allowCustomerReschedule: true,
      reminderLeadMinutes: 1440,
    },
    services: [
      {
        id: 'service-1',
        name: 'Lesson',
        description: null,
        durationMinutes: 30,
        priceAmountMinor: 4000,
        currency: 'GBP',
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        active: true,
        onlineBookingEnabled: true,
      },
    ],
    staff: [
      {
        id: 'staff-1',
        name: 'Ada',
        active: true,
        serviceIds: ['service-1'],
        hours: null,
      },
    ],
    businessHours: [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }],
  };
}

class MemoryNotes implements BookingNotifier {
  queued: Array<{ appointmentId: string; token: string }> = [];
  changes: Array<{
    appointmentId: string;
    change: string;
    token: string | null;
  }> = [];

  queueBooking(
    _databaseName: string,
    appointment: AppointmentView,
    _setup: BookingSetup,
    token: string,
  ) {
    this.queued.push({ appointmentId: appointment.id, token });
    return Promise.resolve();
  }

  queueChange(
    _databaseName: string,
    appointment: AppointmentView,
    _setup: BookingSetup,
    change: 'cancel' | 'reschedule',
    token: string | null,
  ) {
    this.changes.push({ appointmentId: appointment.id, change, token });
    return Promise.resolve();
  }
}

class MemoryBookingStore implements BookingStore {
  setupData: BookingSetup | null = setupData();
  occupancyRows: Occupancy[] = [];
  created: NewAppointment[] = [];
  private rows = new Map<string, ManagedBooking & { hash: string }>();

  setup() {
    return Promise.resolve(this.setupData);
  }

  occupancy(
    _databaseName: string,
    _from: Date,
    _to: Date,
    excludeAppointmentId?: string,
  ) {
    return Promise.resolve(
      this.occupancyRows.filter(
        (row) =>
          !excludeAppointmentId || row.appointmentId !== excludeAppointmentId,
      ),
    );
  }

  createAppointment(_databaseName: string, input: NewAppointment) {
    this.created.push(input);
    const view = this.remember(input, input.manageTokenHash);
    return Promise.resolve(view);
  }

  listAppointments() {
    return Promise.resolve([]);
  }

  listCustomers() {
    return Promise.resolve([]);
  }

  createCustomer(_databaseName: string, input: CustomerDetails) {
    return Promise.resolve({
      id: 'customer-2',
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      notes: input.notes ?? null,
    });
  }

  updateCustomer(_databaseName: string, customerId: string, input: CustomerDetails) {
    return Promise.resolve({
      id: customerId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      notes: input.notes ?? null,
    });
  }

  exportCustomer() {
    return Promise.resolve(null);
  }

  eraseCustomer() {
    return Promise.resolve(false);
  }

  findByManageToken(_databaseName: string, manageTokenHash: string) {
    const row = [...this.rows.values()].find(
      (item) => item.hash === manageTokenHash && item.status === 'CONFIRMED',
    );
    return Promise.resolve(row ? this.copy(row) : null);
  }

  findAppointment(_databaseName: string, appointmentId: string) {
    const row = this.rows.get(appointmentId);
    return Promise.resolve(row ? this.copy(row) : null);
  }

  cancelAppointment(_databaseName: string, appointmentId: string) {
    const row = this.rows.get(appointmentId);
    if (!row || row.status === 'CANCELLED') {
      return Promise.resolve(null);
    }
    row.status = 'CANCELLED';
    row.hash = '';
    return Promise.resolve(this.copy(row));
  }

  rescheduleAppointment(
    _databaseName: string,
    appointmentId: string,
    input: RescheduleUpdate,
  ) {
    const row = this.rows.get(appointmentId);
    if (!row || row.status !== 'CONFIRMED') {
      return Promise.resolve('missing' as const);
    }
    row.startAt = input.startAt;
    row.endAt = input.endAt;
    row.staff = { id: input.staffId, name: row.staff.name };
    row.bufferBeforeMinutes = input.bufferBeforeMinutes;
    row.bufferAfterMinutes = input.bufferAfterMinutes;
    row.hash = input.manageTokenHash;
    return Promise.resolve(this.copy(row));
  }

  saveNotifications() {
    return Promise.resolve();
  }

  cancelPending() {
    return Promise.resolve();
  }

  claimDue(): Promise<DueNotification[]> {
    return Promise.resolve([]);
  }

  finishNotification() {
    return Promise.resolve();
  }

  private remember(input: NewAppointment, hash: string): ManagedBooking {
    const id = `appointment-${this.rows.size + 1}`;
    const row: ManagedBooking & { hash: string } = {
      id,
      status: 'CONFIRMED',
      startAt: input.startAt,
      endAt: input.endAt,
      priceAmountMinor: input.service.priceAmountMinor,
      currency: input.service.currency,
      customerNote: input.customerNote,
      internalNote: input.internalNote,
      customer: {
        id: 'customer-1',
        firstName: input.customer.firstName,
        lastName: input.customer.lastName,
        email: input.customer.email,
        phone: input.customer.phone,
        notes: input.customer.notes ?? null,
      },
      service: { id: input.service.id, name: input.service.name },
      staff: { id: input.staffId, name: 'Ada' },
      durationMinutes: input.service.durationMinutes,
      bufferBeforeMinutes: input.service.bufferBeforeMinutes,
      bufferAfterMinutes: input.service.bufferAfterMinutes,
      hash,
    };
    this.rows.set(id, row);
    return this.copy(row);
  }

  private copy(row: ManagedBooking & { hash: string }): ManagedBooking {
    return {
      id: row.id,
      status: row.status,
      startAt: row.startAt,
      endAt: row.endAt,
      priceAmountMinor: row.priceAmountMinor,
      currency: row.currency,
      customerNote: row.customerNote,
      internalNote: row.internalNote,
      customer: { ...row.customer },
      service: { ...row.service },
      staff: { ...row.staff },
      durationMinutes: row.durationMinutes,
      bufferBeforeMinutes: row.bufferBeforeMinutes,
      bufferAfterMinutes: row.bufferAfterMinutes,
    };
  }
}

function serviceFor(store = new MemoryBookingStore()) {
  const notes = new MemoryNotes();
  return {
    store,
    notes,
    service: new BookingService(store, notes, () => NOW),
  };
}

const bookingInput = {
  serviceId: 'service-1',
  staffId: 'staff-1',
  startAt: '2026-01-05T09:00:00.000Z',
  firstName: 'Bea',
  lastName: 'Lee',
  email: 'bea@example.com',
  phone: null,
  customerNote: null,
};

describe('BookingService', () => {
  it('offers open slots for a bookable service', async () => {
    const { service } = serviceFor();
    const slots = await service.slots(tenant, {
      serviceId: 'service-1',
      date: '2026-01-05',
    });
    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2026-01-05T09:00:00.000Z',
      '2026-01-05T09:30:00.000Z',
    ]);
    expect(slots[0]?.staffId).toBe('staff-1');
  });

  it('rejects a public booking without the required email', async () => {
    const { service } = serviceFor();
    await expect(
      service.book(tenant, {
        serviceId: 'service-1',
        startAt: '2026-01-05T09:00:00.000Z',
        firstName: 'Bea',
        lastName: 'Lee',
        email: null,
        phone: null,
        customerNote: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the service price when the chosen slot is open', async () => {
    const { service, store } = serviceFor();
    const booked = await service.book(tenant, {
      serviceId: 'service-1',
      staffId: 'staff-1',
      startAt: '2026-01-05T09:00:00.000Z',
      firstName: 'Bea',
      lastName: 'Lee',
      email: 'bea@example.com',
      phone: null,
      customerNote: null,
    });
    expect(booked.priceAmountMinor).toBe(4000);
    expect(store.created[0]?.staffId).toBe('staff-1');
  });

  it('refuses a time that is already occupied', async () => {
    const store = new MemoryBookingStore();
    store.occupancyRows = [
      {
        staffId: 'staff-1',
        startAt: utc('2026-01-05T09:00:00.000Z'),
        endAt: utc('2026-01-05T09:30:00.000Z'),
      },
    ];
    const service = new BookingService(store, new MemoryNotes(), () => NOW);
    await expect(
      service.book(tenant, {
        serviceId: 'service-1',
        startAt: '2026-01-05T09:00:00.000Z',
        firstName: 'Bea',
        lastName: 'Lee',
        email: 'bea@example.com',
        phone: null,
        customerNote: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not export a customer who is not on file', async () => {
    const service = new BookingService(
      new MemoryBookingStore(),
      new MemoryNotes(),
      () => NOW,
    );
    await expect(
      service.exportCustomer(
        { userId: 'user-1', role: 'OWNER', tenant },
        '018f3c2a-6c1e-7b2a-8d4e-9a0b1c2d3e4f',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a service that is not offered online', async () => {
    const store = new MemoryBookingStore();
    const serviceRow = store.setupData?.services[0];
    if (!serviceRow || !store.setupData) {
      throw new Error('missing service');
    }
    serviceRow.onlineBookingEnabled = false;
    const service = new BookingService(store, new MemoryNotes(), () => NOW);
    await expect(service.profile(tenant)).resolves.toMatchObject({
      services: [],
      page: {
        'booking.showPrice': true,
        'booking.showDuration': true,
        'booking.showStaffName': true,
      },
    });
    await expect(
      service.slots(tenant, { serviceId: 'service-1', date: '2026-01-05' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores a hash of the manage token and does not return the token', async () => {
    const { service, store, notes } = serviceFor();
    const booked = await service.book(tenant, bookingInput);
    const token = notes.queued[0]?.token;
    expect(token).toEqual(expect.any(String));
    expect(booked).not.toHaveProperty('manageTokenHash');
    expect(JSON.stringify(booked)).not.toContain(token);
    expect(store.created[0]?.manageTokenHash).toBe(hashToken(token ?? ''));
  });

  it('lets the customer cancel inside the window', async () => {
    const { service, notes } = serviceFor();
    await service.book(tenant, bookingInput);
    const token = notes.queued[0]?.token ?? '';
    await expect(service.cancelByCustomer(tenant, token)).resolves.toEqual({
      status: 'cancelled',
    });
    expect(notes.changes[0]?.change).toBe('cancel');
    await expect(service.managed(tenant, token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a customer cancel after the window has closed', async () => {
    const { service, store, notes } = serviceFor();
    if (store.setupData) {
      store.setupData.policy.cancellationWindowMinutes = 1440;
    }
    await service.book(tenant, bookingInput);
    const token = notes.queued[0]?.token ?? '';
    await expect(
      service.cancelByCustomer(tenant, token),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notes.changes).toEqual([]);
  });

  it('refuses a customer cancel when the business has turned it off', async () => {
    const { service, store, notes } = serviceFor();
    if (store.setupData) {
      store.setupData.policy.allowCustomerCancel = false;
    }
    await service.book(tenant, bookingInput);
    await expect(
      service.cancelByCustomer(tenant, notes.queued[0]?.token ?? ''),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves a booking onto a free slot and retires the old link', async () => {
    const { service, store, notes } = serviceFor();
    await service.book(tenant, bookingInput);
    const token = notes.queued[0]?.token ?? '';
    store.occupancyRows = [
      {
        staffId: 'staff-1',
        startAt: utc('2026-01-05T09:00:00.000Z'),
        endAt: utc('2026-01-05T09:30:00.000Z'),
        appointmentId: 'appointment-1',
      },
    ];
    const moved = await service.rescheduleByCustomer(tenant, token, {
      startAt: '2026-01-05T09:00:00.000Z',
      staffId: 'staff-1',
    });
    expect(moved.startAt.toISOString()).toBe('2026-01-05T09:00:00.000Z');
    expect(notes.changes[0]?.change).toBe('reschedule');
    expect(notes.changes[0]?.token).not.toBe(token);
    await expect(service.managed(tenant, token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to reschedule onto a taken slot', async () => {
    const { service, store, notes } = serviceFor();
    await service.book(tenant, bookingInput);
    store.occupancyRows = [
      {
        staffId: 'staff-1',
        startAt: utc('2026-01-05T09:30:00.000Z'),
        endAt: utc('2026-01-05T10:00:00.000Z'),
      },
    ];
    await expect(
      service.rescheduleByCustomer(tenant, notes.queued[0]?.token ?? '', {
        startAt: '2026-01-05T09:30:00.000Z',
        staffId: 'staff-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown manage token', async () => {
    const { service } = serviceFor();
    await expect(
      service.managed(tenant, 'missing-token'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the business cancel after the customer window has closed', async () => {
    const { service, store, notes } = serviceFor();
    if (store.setupData) {
      store.setupData.policy.cancellationWindowMinutes = 1440;
    }
    const booked = await service.book(tenant, bookingInput);
    await expect(
      service.cancelByBusiness(
        { tenant, userId: 'user-1', role: 'OWNER' },
        booked.id,
      ),
    ).resolves.toEqual({ status: 'cancelled' });
    expect(notes.changes[0]?.change).toBe('cancel');
  });
});
