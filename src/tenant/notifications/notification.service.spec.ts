import { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Mailer } from '../../auth/store/auth.store';
import type { Env } from '../../config/env';
import type { TenantRecord } from '../../master/tenancy/tenant.types';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import type {
  AppointmentView,
  BookingSetup,
  BookingStore,
  DueNotification,
  NotificationDraft,
} from '../booking/booking.store';
import type { InboxDraft, InboxStore } from '../inbox/inbox.store';
import { NotificationService } from './notification.service';

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

function setup(): BookingSetup {
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
    services: [],
    staff: [],
    businessHours: [],
  };
}

function appointment(): AppointmentView {
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
      email: 'bea@example.com',
      phone: null,
      notes: null,
    },
    service: { id: 'service-1', name: 'Lesson' },
    staff: { id: 'staff-1', name: 'Ada' },
  };
}

class MemoryMailer implements Mailer {
  sent: Array<{ to: string; subject: string; text: string }> = [];
  fail = false;

  send(message: { to: string; subject: string; text: string }) {
    if (this.fail) {
      return Promise.reject(new Error('Email is not configured'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

class MemoryJobs implements Pick<
  BookingStore,
  'saveNotifications' | 'cancelPending' | 'claimDue' | 'finishNotification'
> {
  jobs: Array<DueNotification & { status: string; lastError: string | null }> =
    [];

  saveNotifications(_databaseName: string, drafts: NotificationDraft[]) {
    for (const draft of drafts) {
      this.jobs.push({
        ...draft,
        id: `job-${this.jobs.length + 1}`,
        status: 'PENDING',
        lastError: null,
        payload: { ...draft.payload },
      });
    }
    return Promise.resolve();
  }

  cancelPending(_databaseName: string, appointmentId: string) {
    for (const job of this.jobs) {
      if (job.appointmentId === appointmentId && job.status === 'PENDING') {
        job.status = 'CANCELLED';
        job.payload = { to: '', subject: '', text: '' };
      }
    }
    return Promise.resolve();
  }

  claimDue(_databaseName: string, now: Date) {
    const due = this.jobs.filter(
      (job) =>
        job.status === 'PENDING' &&
        DateTime.fromJSDate(job.runAt, { zone: 'utc' }) <=
          DateTime.fromJSDate(now, { zone: 'utc' }),
    );
    for (const job of due) {
      job.status = 'PROCESSING';
    }
    return Promise.resolve(
      due.map((job) => ({ ...job, payload: { ...job.payload } })),
    );
  }

  finishNotification(
    _databaseName: string,
    id: string,
    status: 'SENT' | 'FAILED' | 'CANCELLED',
    lastError: string | null,
  ) {
    const job = this.jobs.find((item) => item.id === id);
    if (job) {
      job.status = status;
      job.lastError = lastError;
      if (status === 'SENT' || status === 'CANCELLED') {
        job.payload = { to: '', subject: '', text: '' };
      }
    }
    return Promise.resolve();
  }
}

function serviceFor(
  jobs = new MemoryJobs(),
  mailer = new MemoryMailer(),
  inbox?: InboxStore,
) {
  const tenants: Pick<TenantStore, 'listActive'> = {
    listActive: () => Promise.resolve([tenant]),
  };
  const config = {
    get: () => 'http://localhost:5173',
  } as unknown as ConfigService<Env, true>;
  return {
    jobs,
    mailer,
    inbox,
    service: new NotificationService(
      jobs as unknown as BookingStore,
      mailer,
      tenants,
      config,
      () => NOW,
      inbox,
    ),
  };
}

describe('NotificationService', () => {
  it('sends confirmations now and leaves the reminder pending', async () => {
    const { service, jobs, mailer } = serviceFor();
    await service.queueBooking(
      'nexora_t_ada',
      appointment(),
      setup(),
      'secret-token',
    );
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      'Booked: Lesson at Ada Studio',
      'New booking: Lesson',
    ]);
    expect(mailer.sent[0]?.text).toContain(
      '/book/ada-studio/manage/secret-token',
    );
    expect(mailer.sent[1]?.text).not.toContain('secret-token');
    const reminder = jobs.jobs.find(
      (job) => job.kind === 'BOOKING_REMINDER_CUSTOMER',
    );
    expect(reminder?.status).toBe('PENDING');
    expect(reminder?.payload.text).not.toContain('secret-token');
    const confirmation = jobs.jobs.find(
      (job) => job.kind === 'BOOKING_CONFIRMATION_CUSTOMER',
    );
    expect(confirmation?.status).toBe('SENT');
    expect(confirmation?.payload).toEqual({ to: '', subject: '', text: '' });
  });

  it('records a failed send without failing the booking', async () => {
    const mailer = new MemoryMailer();
    mailer.fail = true;
    const { service, jobs } = serviceFor(new MemoryJobs(), mailer);
    await expect(
      service.queueBooking(
        'nexora_t_ada',
        appointment(),
        setup(),
        'secret-token',
      ),
    ).resolves.toBeUndefined();
    expect(jobs.jobs[0]?.status).toBe('FAILED');
    expect(jobs.jobs[0]?.lastError).toBe('Email could not be sent');
  });

  it('sends a due reminder and leaves a future one queued', async () => {
    const jobs = new MemoryJobs();
    jobs.jobs.push(
      {
        id: 'due',
        kind: 'BOOKING_REMINDER_CUSTOMER',
        appointmentId: 'appointment-1',
        runAt: utc('2026-01-05T07:00:00.000Z'),
        status: 'PENDING',
        lastError: null,
        payload: {
          to: 'bea@example.com',
          subject: 'Reminder: Lesson at Ada Studio',
          text: 'Reminder only',
        },
      },
      {
        id: 'later',
        kind: 'BOOKING_REMINDER_CUSTOMER',
        appointmentId: 'appointment-2',
        runAt: utc('2026-01-07T07:00:00.000Z'),
        status: 'PENDING',
        lastError: null,
        payload: {
          to: 'bea@example.com',
          subject: 'Reminder: Lesson at Ada Studio',
          text: 'Later',
        },
      },
    );
    const { service, mailer } = serviceFor(jobs);
    await service.dispatchDue();
    expect(mailer.sent.map((message) => message.text)).toEqual([
      'Reminder only',
    ]);
    expect(jobs.jobs.find((job) => job.id === 'due')?.status).toBe('SENT');
    expect(jobs.jobs.find((job) => job.id === 'later')?.status).toBe('PENDING');
  });

  it('drops a pending reminder when the booking is cancelled', async () => {
    const { service, jobs, mailer } = serviceFor();
    await service.queueBooking(
      'nexora_t_ada',
      appointment(),
      setup(),
      'secret-token',
    );
    mailer.sent = [];
    await service.queueChange(
      'nexora_t_ada',
      appointment(),
      setup(),
      'cancel',
      null,
    );
    expect(
      jobs.jobs.find((job) => job.kind === 'BOOKING_REMINDER_CUSTOMER')?.status,
    ).toBe('CANCELLED');
    expect(mailer.sent.map((message) => message.subject)).toEqual([
      'Cancelled: Lesson at Ada Studio',
      'Cancelled booking: Lesson',
    ]);
  });

  it('does not poll the database while tests are running', () => {
    const { service } = serviceFor();
    service.onModuleInit();
    expect((service as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('writes one inbox notice for each person in the business', async () => {
    const drafts: InboxDraft[] = [];
    const inbox: InboxStore = {
      recipientIds: () => Promise.resolve(['user-1', 'user-2']),
      publish: (_databaseName, next) => {
        drafts.push(...next);
        return Promise.resolve();
      },
      list: () => Promise.resolve([]),
      unreadCount: () => Promise.resolve(0),
      markRead: () => Promise.resolve(),
      markAllRead: () => Promise.resolve(),
    };
    const { service } = serviceFor(new MemoryJobs(), new MemoryMailer(), inbox);
    await service.queueBooking(
      'nexora_t_ada',
      appointment(),
      setup(),
      'secret-token',
    );
    expect(drafts.map((item) => item.userId)).toEqual(['user-1', 'user-2']);
    expect(drafts[0]).toMatchObject({
      kind: 'booking',
      title: 'Bea Lee booked Lesson with Ada',
      body: '6 Jan 2026, 09:00',
    });
  });
});
