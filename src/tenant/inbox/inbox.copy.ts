import { DateTime } from 'luxon';
import type { AppointmentView } from '../booking/booking.store';
import type { InboxKind } from './inbox.store';

export type InboxCopy = {
  kind: InboxKind;
  title: string;
  body: string;
};

export function inboxCopy(
  change: InboxKind,
  appointment: AppointmentView,
  timeZone: string,
): InboxCopy {
  const who = customerName(appointment);
  const when = DateTime.fromJSDate(appointment.startAt, { zone: 'utc' })
    .setZone(timeZone)
    .toFormat('d LLL yyyy, HH:mm');
  const service = appointment.service.name;
  const staff = appointment.staff.name;
  if (change === 'cancel') {
    return {
      kind: 'cancel',
      title: `${who} cancelled ${service} with ${staff}`,
      body: when,
    };
  }
  if (change === 'reschedule') {
    return {
      kind: 'reschedule',
      title: `${who} rescheduled ${service} with ${staff}`,
      body: when,
    };
  }
  return {
    kind: 'booking',
    title: `${who} booked ${service} with ${staff}`,
    body: when,
  };
}

function customerName(appointment: AppointmentView): string {
  const name = `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim();
  return name.length > 0 ? name : 'A customer';
}
