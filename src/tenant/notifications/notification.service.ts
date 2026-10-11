import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAILER } from '../../auth/auth.tokens';
import type { Mailer } from '../../auth/store/auth.store';
import { CLOCK } from '../../common/clock';
import { utcNow } from '../../common/time';
import { canonicalWebOrigin, type Env } from '../../config/env';
import { TENANT_STORE } from '../../master/tenancy/tenancy.tokens';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import { BOOKING_STORE } from '../booking/booking.tokens';
import type {
  AppointmentView,
  BookingSetup,
  BookingStore,
} from '../booking/booking.store';
import { inboxCopy } from '../inbox/inbox.copy';
import type { InboxKind, InboxStore } from '../inbox/inbox.store';
import { INBOX_STORE } from '../inbox/inbox.store';
import { changeJobs, confirmationJobs } from './notification.messages';

export interface BookingNotifier {
  queueBooking(
    databaseName: string,
    appointment: AppointmentView,
    setup: BookingSetup,
    token: string,
  ): Promise<void>;
  queueChange(
    databaseName: string,
    appointment: AppointmentView,
    setup: BookingSetup,
    change: 'cancel' | 'reschedule',
    token: string | null,
  ): Promise<void>;
}

@Injectable()
export class NotificationService
  implements BookingNotifier, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationService.name);
  private readonly now: () => Date;
  private readonly origin: string;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(BOOKING_STORE) private readonly bookings: BookingStore,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_STORE)
    private readonly tenants: Pick<TenantStore, 'listActive'>,
    config: ConfigService<Env, true>,
    @Optional() @Inject(CLOCK) now?: () => Date,
    @Optional() @Inject(INBOX_STORE) private readonly inbox?: InboxStore,
  ) {
    this.now = now ?? utcNow;
    this.origin = canonicalWebOrigin(config.get('WEB_ORIGIN', { infer: true }));
  }

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.dispatchDue().catch(() => {
        this.logger.error('Reminder dispatch failed');
      });
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async queueBooking(
    databaseName: string,
    appointment: AppointmentView,
    setup: BookingSetup,
    token: string,
  ): Promise<void> {
    const jobs = confirmationJobs({
      now: this.now(),
      origin: this.origin,
      appointment,
      setup,
      token,
    });
    await this.enqueue(databaseName, jobs);
    await this.publishInbox(databaseName, appointment, setup, 'booking');
  }

  async queueChange(
    databaseName: string,
    appointment: AppointmentView,
    setup: BookingSetup,
    change: 'cancel' | 'reschedule',
    token: string | null,
  ): Promise<void> {
    await this.bookings.cancelPending(databaseName, appointment.id);
    const jobs = changeJobs({
      now: this.now(),
      origin: this.origin,
      appointment,
      setup,
      change,
      token,
    });
    await this.enqueue(databaseName, jobs);
    await this.publishInbox(databaseName, appointment, setup, change);
  }

  async dispatchDue(): Promise<void> {
    const tenants = await this.tenants.listActive();
    for (const tenant of tenants) {
      try {
        await this.deliver(tenant.databaseName);
      } catch {
        this.logger.error('Reminder dispatch failed for one business');
      }
    }
  }

  private async publishInbox(
    databaseName: string,
    appointment: AppointmentView,
    setup: BookingSetup,
    change: InboxKind,
  ): Promise<void> {
    if (!this.inbox) {
      return;
    }
    try {
      const userIds = await this.inbox.recipientIds(databaseName);
      if (userIds.length === 0) {
        return;
      }
      const copy = inboxCopy(change, appointment, setup.profile.timezone);
      await this.inbox.publish(
        databaseName,
        userIds.map((userId) => ({ userId, ...copy })),
      );
    } catch {
      this.logger.error('Inbox notice could not be saved');
    }
  }

  private async enqueue(
    databaseName: string,
    jobs: ReturnType<typeof confirmationJobs>,
  ): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await this.bookings.saveNotifications(databaseName, jobs);
    await this.deliver(databaseName);
  }

  private async deliver(databaseName: string): Promise<void> {
    const due = await this.bookings.claimDue(databaseName, this.now());
    for (const job of due) {
      try {
        await this.mailer.send(job.payload);
        await this.bookings.finishNotification(
          databaseName,
          job.id,
          'SENT',
          null,
        );
      } catch {
        await this.bookings.finishNotification(
          databaseName,
          job.id,
          'FAILED',
          'Email could not be sent',
        );
      }
    }
  }
}
