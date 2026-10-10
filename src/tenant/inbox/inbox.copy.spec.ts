import { DateTime } from 'luxon';
import type { AppointmentView } from '../booking/booking.store';
import { inboxCopy } from './inbox.copy';

const appointment = (): AppointmentView => ({
  id: 'appointment-1',
  status: 'CONFIRMED',
  startAt: DateTime.fromISO('2026-01-06T09:00:00.000Z', { zone: 'utc' }).toJSDate(),
  endAt: DateTime.fromISO('2026-01-06T09:30:00.000Z', { zone: 'utc' }).toJSDate(),
  priceAmountMinor: 4000,
  currency: 'GBP',
  customerNote: null,
  internalNote: null,
  customer: {
    id: 'customer-1',
    firstName: 'Bea',
    lastName: 'Lee',
    email: 'bea@example.com',
    phone: null,
    notes: null,
  },
  service: { id: 'service-1', name: 'Lesson' },
  staff: { id: 'staff-1', name: 'Ada' },
});

describe('inboxCopy', () => {
  it('names the customer, service, and staff on the business clock', () => {
    expect(inboxCopy('booking', appointment(), 'Europe/London')).toEqual({
      kind: 'booking',
      title: 'Bea Lee booked Lesson with Ada',
      body: '6 Jan 2026, 09:00',
    });
    expect(inboxCopy('cancel', appointment(), 'Europe/London').title).toBe(
      'Bea Lee cancelled Lesson with Ada',
    );
    expect(inboxCopy('reschedule', appointment(), 'America/New_York').body).toBe(
      '6 Jan 2026, 04:00',
    );
  });
});
