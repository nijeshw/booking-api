import { DateTime } from 'luxon';

import type { AppointmentView, BookingSetup } from '../booking/booking.store';
import { changeJobs, confirmationJobs } from './notification.messages';

const utc = (iso: string): Date =>
  DateTime.fromISO(iso, { zone: 'utc' }).toJSDate();
const NOW = utc('2026-01-05T08:00:00.000Z');

function setup(email: string | null = 'ada@example.com'): BookingSetup {
  return {
    profile: {
      name: 'Ada Studio',
      category: 'Tutor',
      timezone: 'Europe/London',
      currency: 'GBP',
      slug: 'ada-studio',
      email,
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
    services: [],
    staff: [],
    businessHours: [],
  };
}

function appointment(
  email: string | null = 'bea@example.com',
): AppointmentView {
  return {
    id: 'appointment-1',
    status: 'CONFIRMED',
    startAt: utc('2026-01-06T09:00:00.000Z'),
    endAt: utc('2026-01-06T09:30:00.000Z'),
    priceAmountMinor: 4000,
    currency: 'GBP',
    customerNote: null,
    internalNote: null,
    customer: {
      id: 'customer-1',
      firstName: 'Bea',
      lastName: 'Lee',
      email,
      phone: null,
      notes: null,
    },
    service: { id: 'service-1', name: 'Lesson' },
    staff: { id: 'staff-1', name: 'Ada' },
  };
}

describe('booking emails', () => {
  it('confirms the customer with a manage link and reminds them later', () => {
    const jobs = confirmationJobs({
      now: NOW,
      origin: 'http://localhost:5173',
      appointment: appointment(),
      setup: setup(),
      token: 'manage-token',
    });
    const customer = jobs.find(
      (job) => job.kind === 'BOOKING_CONFIRMATION_CUSTOMER',
    );
    const reminder = jobs.find(
      (job) => job.kind === 'BOOKING_REMINDER_CUSTOMER',
    );
    const business = jobs.find(
      (job) => job.kind === 'BOOKING_CONFIRMATION_BUSINESS',
    );
    expect(customer?.payload.text).toContain(
      'http://localhost:5173/book/ada-studio/manage/manage-token',
    );
    expect(customer?.payload.to).toBe('bea@example.com');
    expect(reminder?.runAt.toISOString()).toBe('2026-01-05T09:00:00.000Z');
    expect(reminder?.payload.text).not.toContain('manage-token');
    expect(business?.payload.to).toBe('ada@example.com');
    expect(business?.payload.text).not.toContain('manage-token');
  });

  it('skips customer mail when the booking has no email', () => {
    const jobs = confirmationJobs({
      now: NOW,
      origin: 'http://localhost:5173',
      appointment: appointment(null),
      setup: setup(null),
      token: 'manage-token',
    });
    expect(jobs).toEqual([]);
  });

  it('tells both sides when a booking is cancelled', () => {
    const jobs = changeJobs({
      now: NOW,
      origin: 'http://localhost:5173',
      appointment: appointment(),
      setup: setup(),
      change: 'cancel',
      token: null,
    });
    expect(jobs.map((job) => job.kind)).toEqual([
      'BOOKING_CANCELLED_CUSTOMER',
      'BOOKING_CANCELLED_BUSINESS',
    ]);
    expect(jobs[0]?.payload.text).not.toContain('manage-token');
  });

  it('puts a fresh manage link in a reschedule email', () => {
    const jobs = changeJobs({
      now: NOW,
      origin: 'http://localhost:5173',
      appointment: appointment(),
      setup: setup(),
      change: 'reschedule',
      token: 'next-token',
    });
    const customer = jobs.find(
      (job) => job.kind === 'BOOKING_RESCHEDULED_CUSTOMER',
    );
    expect(customer?.payload.text).toContain(
      'http://localhost:5173/book/ada-studio/manage/next-token',
    );
    expect(jobs.some((job) => job.kind === 'BOOKING_REMINDER_CUSTOMER')).toBe(
      true,
    );
  });
});
