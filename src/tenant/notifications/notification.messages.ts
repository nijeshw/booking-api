import { DateTime } from 'luxon';

import type {
  AppointmentView,
  BookingSetup,
  NotificationDraft,
} from '../booking/booking.store';

export function formatBookingWhen(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: 'utc' })
    .setZone(timeZone)
    .setLocale('en-GB')
    .toLocaleString({
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
}

export function confirmationJobs(input: {
  now: Date;
  origin: string;
  appointment: AppointmentView;
  setup: BookingSetup;
  token: string;
}): NotificationDraft[] {
  const jobs: NotificationDraft[] = [];
  const when = formatBookingWhen(
    input.appointment.startAt,
    input.setup.profile.timezone,
  );
  const customerEmail = input.appointment.customer.email;
  if (customerEmail) {
    const manageUrl = manageLink(
      input.origin,
      input.setup.profile.slug,
      input.token,
    );
    jobs.push(
      job(
        'BOOKING_CONFIRMATION_CUSTOMER',
        input.appointment.id,
        input.now,
        customerEmail,
        `Booked: ${input.appointment.service.name} at ${input.setup.profile.name}`,
        [
          `You are booked for ${input.appointment.service.name} with ${input.appointment.staff.name} at ${input.setup.profile.name} on ${when}.`,
          '',
          `Change or cancel: ${manageUrl}`,
        ].join('\n'),
      ),
    );
    const remindAt = laterReminder(
      input.appointment.startAt,
      input.setup.policy.reminderLeadMinutes,
      input.now,
    );
    if (remindAt) {
      jobs.push(
        job(
          'BOOKING_REMINDER_CUSTOMER',
          input.appointment.id,
          remindAt,
          customerEmail,
          `Reminder: ${input.appointment.service.name} at ${input.setup.profile.name}`,
          `Reminder: ${input.appointment.service.name} with ${input.appointment.staff.name} at ${input.setup.profile.name} on ${when}. Use the link in your confirmation email if you need to change it.`,
        ),
      );
    }
  }
  const businessEmail = input.setup.profile.email;
  if (businessEmail) {
    jobs.push(
      job(
        'BOOKING_CONFIRMATION_BUSINESS',
        input.appointment.id,
        input.now,
        businessEmail,
        `New booking: ${input.appointment.service.name}`,
        `${input.appointment.customer.firstName} ${input.appointment.customer.lastName} booked ${input.appointment.service.name} with ${input.appointment.staff.name} on ${when}.`,
      ),
    );
  }
  return jobs;
}

export function changeJobs(input: {
  now: Date;
  origin: string;
  appointment: AppointmentView;
  setup: BookingSetup;
  change: 'cancel' | 'reschedule';
  token: string | null;
}): NotificationDraft[] {
  const jobs: NotificationDraft[] = [];
  const when = formatBookingWhen(
    input.appointment.startAt,
    input.setup.profile.timezone,
  );
  const customerEmail = input.appointment.customer.email;
  const manageUrl =
    input.token && customerEmail
      ? manageLink(input.origin, input.setup.profile.slug, input.token)
      : null;
  if (customerEmail) {
    const cancelled = input.change === 'cancel';
    jobs.push(
      job(
        cancelled
          ? 'BOOKING_CANCELLED_CUSTOMER'
          : 'BOOKING_RESCHEDULED_CUSTOMER',
        input.appointment.id,
        input.now,
        customerEmail,
        `${cancelled ? 'Cancelled' : 'Rescheduled'}: ${input.appointment.service.name} at ${input.setup.profile.name}`,
        cancelled
          ? `Your ${input.appointment.service.name} at ${input.setup.profile.name} on ${when} is cancelled.`
          : [
              `Your ${input.appointment.service.name} with ${input.appointment.staff.name} at ${input.setup.profile.name} is now ${when}.`,
              '',
              `Change or cancel: ${manageUrl ?? ''}`,
            ].join('\n'),
      ),
    );
    if (!cancelled) {
      const remindAt = laterReminder(
        input.appointment.startAt,
        input.setup.policy.reminderLeadMinutes,
        input.now,
      );
      if (remindAt) {
        jobs.push(
          job(
            'BOOKING_REMINDER_CUSTOMER',
            input.appointment.id,
            remindAt,
            customerEmail,
            `Reminder: ${input.appointment.service.name} at ${input.setup.profile.name}`,
            `Reminder: ${input.appointment.service.name} with ${input.appointment.staff.name} at ${input.setup.profile.name} on ${when}. Use the link in your confirmation email if you need to change it.`,
          ),
        );
      }
    }
  }
  const businessEmail = input.setup.profile.email;
  if (businessEmail) {
    const cancelled = input.change === 'cancel';
    jobs.push(
      job(
        cancelled
          ? 'BOOKING_CANCELLED_BUSINESS'
          : 'BOOKING_RESCHEDULED_BUSINESS',
        input.appointment.id,
        input.now,
        businessEmail,
        `${cancelled ? 'Cancelled booking' : 'Rescheduled booking'}: ${input.appointment.service.name}`,
        `${input.appointment.customer.firstName} ${input.appointment.customer.lastName} ${cancelled ? 'cancelled' : 'moved'} ${input.appointment.service.name} with ${input.appointment.staff.name}. It ${cancelled ? 'was' : 'is now'} ${when}.`,
      ),
    );
  }
  return jobs;
}

function laterReminder(
  startAt: Date,
  leadMinutes: number,
  now: Date,
): Date | null {
  const remindAt = DateTime.fromJSDate(startAt, { zone: 'utc' }).minus({
    minutes: leadMinutes,
  });
  if (remindAt <= DateTime.fromJSDate(now, { zone: 'utc' })) {
    return null;
  }
  return remindAt.toJSDate();
}

function manageLink(origin: string, slug: string, token: string): string {
  return `${origin}/book/${slug}/manage/${token}`;
}

function job(
  kind: NotificationDraft['kind'],
  appointmentId: string,
  runAt: Date,
  to: string,
  subject: string,
  text: string,
): NotificationDraft {
  return { kind, appointmentId, runAt, payload: { to, subject, text } };
}
