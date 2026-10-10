import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';

import { Prisma } from '../../../generated/tenant';
import type { HourRange } from '../hours/hours';
import { publicSettings } from '../settings/setting.registry';
import { TenantConnections } from '../database/tenant-connections';
import type {
  AppointmentView,
  BookingSetup,
  BookingStore,
  CustomerDetails,
  CustomerExport,
  CustomerView,
  DueNotification,
  ManagedBooking,
  NewAppointment,
  NotificationDraft,
  Occupancy,
  RescheduleUpdate,
} from './booking.store';

const appointmentInclude = {
  customer: true,
  service: { select: { id: true, name: true } },
  staff: { select: { id: true, name: true } },
} as const;

@Injectable()
export class PrismaBookingStore implements BookingStore {
  constructor(private readonly connections: TenantConnections) {}

  async setup(databaseName: string): Promise<BookingSetup | null> {
    const db = this.connections.get(databaseName);
    const profile = await db.businessProfile.findUnique({
      where: { singletonKey: 1 },
    });
    const policy = await db.bookingPolicy.findUnique({
      where: { singletonKey: 1 },
    });
    if (!profile || !policy) {
      return null;
    }
    const [services, staff, links, weeklyHours, settings] = await Promise.all([
      db.service.findMany({ orderBy: { name: 'asc' } }),
      db.staffMember.findMany({ orderBy: { name: 'asc' } }),
      db.staffService.findMany(),
      db.weeklyHours.findMany(),
      db.businessSetting.findMany(),
    ]);
    const serviceIds = new Map<string, string[]>();
    for (const link of links) {
      const ids = serviceIds.get(link.staffId) ?? [];
      ids.push(link.serviceId);
      serviceIds.set(link.staffId, ids);
    }
    const staffHours = new Map<string, HourRange[]>();
    const businessHours: HourRange[] = [];
    for (const row of weeklyHours) {
      const range = {
        weekday: row.weekday,
        startMinute: row.startMinute,
        endMinute: row.endMinute,
      };
      if (!row.staffId) {
        businessHours.push(range);
        continue;
      }
      const ranges = staffHours.get(row.staffId) ?? [];
      ranges.push(range);
      staffHours.set(row.staffId, ranges);
    }
    const stored: Record<string, unknown> = {};
    for (const row of settings) {
      stored[row.key] = row.value;
    }
    return {
      profile: {
        name: profile.name,
        category: profile.category,
        timezone: profile.timezone,
        currency: profile.currency,
        slug: profile.slug,
        email: profile.email,
        description: profile.description,
        logoUrl: profile.logoUrl,
        brandColor: profile.brandColor,
      },
      policy: {
        minNoticeMinutes: policy.minNoticeMinutes,
        maxAdvanceDays: policy.maxAdvanceDays,
        slotIntervalMinutes: policy.slotIntervalMinutes,
        allowAnyStaff: policy.allowAnyStaff,
        requireCustomerEmail: policy.requireCustomerEmail,
        requireCustomerPhone: policy.requireCustomerPhone,
        cancellationWindowMinutes: policy.cancellationWindowMinutes,
        allowCustomerCancel: policy.allowCustomerCancel,
        allowCustomerReschedule: policy.allowCustomerReschedule,
        reminderLeadMinutes: policy.reminderLeadMinutes,
      },
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceAmountMinor: service.priceAmountMinor,
        currency: service.currency,
        bufferBeforeMinutes: service.bufferBeforeMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        active: service.active,
        onlineBookingEnabled: service.onlineBookingEnabled,
      })),
      staff: staff.map((member) => ({
        id: member.id,
        name: member.name,
        active: member.active,
        serviceIds: serviceIds.get(member.id) ?? [],
        hours: staffHours.has(member.id)
          ? (staffHours.get(member.id) ?? [])
          : null,
      })),
      businessHours,
      page: publicSettings(stored),
    };
  }

  async occupancy(
    databaseName: string,
    from: Date,
    to: Date,
    excludeAppointmentId?: string,
  ): Promise<Occupancy[]> {
    const db = this.connections.get(databaseName);
    const [appointments, timeOff] = await Promise.all([
      db.appointment.findMany({
        where: {
          status: { not: 'CANCELLED' },
          blockStart: { lt: to },
          blockEnd: { gt: from },
          ...(excludeAppointmentId
            ? { id: { not: excludeAppointmentId } }
            : {}),
        },
        select: { id: true, staffId: true, blockStart: true, blockEnd: true },
      }),
      db.timeOff.findMany({
        where: { startsAt: { lt: to }, endsAt: { gt: from } },
        select: { staffId: true, startsAt: true, endsAt: true },
      }),
    ]);
    return [
      ...appointments.map((row) => ({
        staffId: row.staffId,
        startAt: row.blockStart,
        endAt: row.blockEnd,
        appointmentId: row.id,
      })),
      ...timeOff.map((row) => ({
        staffId: row.staffId,
        startAt: row.startsAt,
        endAt: row.endsAt,
      })),
    ];
  }

  async createAppointment(
    databaseName: string,
    input: NewAppointment,
  ): Promise<AppointmentView | 'overlap'> {
    const db = this.connections.get(databaseName);
    try {
      return await db.$transaction(async (tx) => {
        const customerId = await this.customerId(tx, input.customer);
        const appointment = await tx.appointment.create({
          data: {
            customerId,
            serviceId: input.service.id,
            staffId: input.staffId,
            status: 'CONFIRMED',
            startAt: input.startAt,
            endAt: input.endAt,
            blockStart: DateTime.fromJSDate(input.startAt, { zone: 'utc' })
              .minus({ minutes: input.service.bufferBeforeMinutes })
              .toJSDate(),
            blockEnd: DateTime.fromJSDate(input.endAt, { zone: 'utc' })
              .plus({ minutes: input.service.bufferAfterMinutes })
              .toJSDate(),
            bufferBeforeMinutes: input.service.bufferBeforeMinutes,
            bufferAfterMinutes: input.service.bufferAfterMinutes,
            priceAmountMinor: input.service.priceAmountMinor,
            currency: input.service.currency,
            depositAmountMinor: 0,
            customerNote: input.customerNote,
            internalNote: input.internalNote,
            manageTokenHash: input.manageTokenHash,
          },
          include: appointmentInclude,
        });
        return toAppointment(appointment);
      });
    } catch (error) {
      if (isStaffOverlap(error)) {
        return 'overlap';
      }
      throw error;
    }
  }

  async listAppointments(
    databaseName: string,
    from: Date,
    to: Date,
  ): Promise<AppointmentView[]> {
    const rows = await this.connections.get(databaseName).appointment.findMany({
      where: {
        status: { not: 'CANCELLED' },
        startAt: { lt: to },
        endAt: { gt: from },
      },
      include: appointmentInclude,
      orderBy: { startAt: 'asc' },
    });
    return rows.map(toAppointment);
  }

  async listCustomers(
    databaseName: string,
    query?: string,
  ): Promise<CustomerView[]> {
    const rows = await this.connections.get(databaseName).customer.findMany({
      where: {
        archivedAt: null,
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toCustomer);
  }

  async exportCustomer(
    databaseName: string,
    customerId: string,
  ): Promise<CustomerExport | null> {
    const row = await this.connections.get(databaseName).customer.findUnique({
      where: { id: customerId },
      include: {
        appointments: {
          orderBy: { startAt: 'asc' },
          include: {
            service: { select: { name: true } },
            staff: { select: { name: true } },
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    return {
      customer: {
        ...toCustomer(row),
        createdAt: row.createdAt,
      },
      appointments: row.appointments.map((appointment) => ({
        id: appointment.id,
        status: appointment.status,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        serviceName: appointment.service.name,
        staffName: appointment.staff.name,
        priceAmountMinor: appointment.priceAmountMinor,
        currency: appointment.currency,
        customerNote: appointment.customerNote,
      })),
    };
  }

  async eraseCustomer(
    databaseName: string,
    customerId: string,
    at: Date,
  ): Promise<boolean> {
    const db = this.connections.get(databaseName);
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true, appointments: { select: { id: true } } },
    });
    if (!customer) {
      return false;
    }
    const appointmentIds = customer.appointments.map((row) => row.id);
    const writes = [
      db.customer.update({
        where: { id: customerId },
        data: {
          firstName: 'Removed',
          lastName: 'Customer',
          email: null,
          phone: null,
          notes: null,
          archivedAt: at,
        },
      }),
      db.appointment.updateMany({
        where: { customerId },
        data: {
          customerNote: null,
          internalNote: null,
          manageTokenHash: null,
        },
      }),
    ];
    if (appointmentIds.length > 0) {
      writes.push(
        db.notificationJob.updateMany({
          where: { appointmentId: { in: appointmentIds } },
          data: { payload: {} },
        }),
        db.notificationJob.updateMany({
          where: {
            appointmentId: { in: appointmentIds },
            status: { in: ['PENDING', 'PROCESSING'] },
          },
          data: { status: 'CANCELLED', payload: {} },
        }),
      );
    }
    await db.$transaction(writes);
    return true;
  }

  async createCustomer(
    databaseName: string,
    input: CustomerDetails,
  ): Promise<CustomerView> {
    const row = await this.connections.get(databaseName).customer.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        notes: input.notes ?? null,
      },
    });
    return toCustomer(row);
  }

  async updateCustomer(
    databaseName: string,
    customerId: string,
    input: CustomerDetails,
  ): Promise<CustomerView | null> {
    const db = this.connections.get(databaseName);
    const existing = await db.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!existing) {
      return null;
    }
    const row = await db.customer.update({
      where: { id: customerId },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
      },
    });
    return toCustomer(row);
  }

  async findByManageToken(
    databaseName: string,
    manageTokenHash: string,
  ): Promise<ManagedBooking | null> {
    const row = await this.connections
      .get(databaseName)
      .appointment.findUnique({
        where: { manageTokenHash },
        include: appointmentInclude,
      });
    return row ? toManaged(row) : null;
  }

  async findAppointment(
    databaseName: string,
    appointmentId: string,
  ): Promise<ManagedBooking | null> {
    const row = await this.connections
      .get(databaseName)
      .appointment.findUnique({
        where: { id: appointmentId },
        include: appointmentInclude,
      });
    return row ? toManaged(row) : null;
  }

  async cancelAppointment(
    databaseName: string,
    appointmentId: string,
  ): Promise<ManagedBooking | null> {
    const db = this.connections.get(databaseName);
    const existing = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: { status: true },
    });
    if (!existing || existing.status === 'CANCELLED') {
      return null;
    }
    const row = await db.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', manageTokenHash: null },
      include: appointmentInclude,
    });
    return toManaged(row);
  }

  async rescheduleAppointment(
    databaseName: string,
    appointmentId: string,
    input: RescheduleUpdate,
  ): Promise<ManagedBooking | 'overlap' | 'missing'> {
    const db = this.connections.get(databaseName);
    try {
      return await db.$transaction(async (tx) => {
        const existing = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: { status: true },
        });
        if (!existing || existing.status !== 'CONFIRMED') {
          return 'missing';
        }
        const row = await tx.appointment.update({
          where: { id: appointmentId },
          data: {
            staffId: input.staffId,
            startAt: input.startAt,
            endAt: input.endAt,
            blockStart: DateTime.fromJSDate(input.startAt, { zone: 'utc' })
              .minus({ minutes: input.bufferBeforeMinutes })
              .toJSDate(),
            blockEnd: DateTime.fromJSDate(input.endAt, { zone: 'utc' })
              .plus({ minutes: input.bufferAfterMinutes })
              .toJSDate(),
            bufferBeforeMinutes: input.bufferBeforeMinutes,
            bufferAfterMinutes: input.bufferAfterMinutes,
            manageTokenHash: input.manageTokenHash,
          },
          include: appointmentInclude,
        });
        return toManaged(row);
      });
    } catch (error) {
      if (isStaffOverlap(error)) {
        return 'overlap';
      }
      throw error;
    }
  }

  async saveNotifications(
    databaseName: string,
    jobs: NotificationDraft[],
  ): Promise<void> {
    if (jobs.length === 0) {
      return;
    }
    await this.connections.get(databaseName).notificationJob.createMany({
      data: jobs.map((job) => ({
        kind: job.kind,
        appointmentId: job.appointmentId,
        runAt: job.runAt,
        payload: job.payload,
      })),
    });
  }

  async cancelPending(
    databaseName: string,
    appointmentId: string,
  ): Promise<void> {
    await this.connections.get(databaseName).notificationJob.updateMany({
      where: { appointmentId, status: 'PENDING' },
      data: { status: 'CANCELLED', payload: {} },
    });
  }

  async claimDue(databaseName: string, now: Date): Promise<DueNotification[]> {
    const db = this.connections.get(databaseName);
    const due = await db.notificationJob.findMany({
      where: { status: 'PENDING', runAt: { lte: now } },
      orderBy: { runAt: 'asc' },
      take: 20,
    });
    const claimed: DueNotification[] = [];
    for (const job of due) {
      const updated = await db.notificationJob.updateMany({
        where: { id: job.id, status: 'PENDING' },
        data: { status: 'PROCESSING' },
      });
      if (updated.count !== 1) {
        continue;
      }
      const message = readPayload(job.payload);
      if (!message || !isBookingKind(job.kind) || !job.appointmentId) {
        await db.notificationJob.update({
          where: { id: job.id },
          data: { status: 'CANCELLED', payload: {} },
        });
        continue;
      }
      claimed.push({
        id: job.id,
        kind: job.kind,
        appointmentId: job.appointmentId,
        runAt: job.runAt,
        payload: message,
      });
    }
    return claimed;
  }

  async finishNotification(
    databaseName: string,
    id: string,
    status: 'SENT' | 'FAILED' | 'CANCELLED',
    lastError: string | null,
  ): Promise<void> {
    await this.connections.get(databaseName).notificationJob.update({
      where: { id },
      data: {
        status,
        lastError,
        attempts: { increment: 1 },
        ...(status === 'SENT' || status === 'CANCELLED' ? { payload: {} } : {}),
      },
    });
  }

  private async customerId(
    tx: Prisma.TransactionClient,
    customer: CustomerDetails,
  ): Promise<string> {
    if (customer.email) {
      const existing = await tx.customer.findFirst({
        where: { email: customer.email, archivedAt: null },
      });
      if (existing) {
        return existing.id;
      }
    }
    const created = await tx.customer.create({
      data: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes ?? null,
      },
    });
    return created.id;
  }
}

function toCustomer(row: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}): CustomerView {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
  };
}

function toManaged(row: AppointmentRow): ManagedBooking {
  return {
    ...toAppointment(row),
    durationMinutes: Math.round(
      DateTime.fromJSDate(row.endAt, { zone: 'utc' }).diff(
        DateTime.fromJSDate(row.startAt, { zone: 'utc' }),
        'minutes',
      ).minutes,
    ),
    bufferBeforeMinutes: row.bufferBeforeMinutes,
    bufferAfterMinutes: row.bufferAfterMinutes,
  };
}

function toAppointment(row: AppointmentRow): AppointmentView {
  return {
    id: row.id,
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    priceAmountMinor: row.priceAmountMinor,
    currency: row.currency,
    customerNote: row.customerNote,
    internalNote: row.internalNote,
    customer: toCustomer(row.customer),
    service: row.service,
    staff: row.staff,
  };
}

type AppointmentRow = {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceAmountMinor: number;
  currency: string;
  customerNote: string | null;
  internalNote: string | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
  };
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

const BOOKING_KINDS = new Set<string>([
  'BOOKING_CONFIRMATION_CUSTOMER',
  'BOOKING_CONFIRMATION_BUSINESS',
  'BOOKING_REMINDER_CUSTOMER',
  'BOOKING_CANCELLED_CUSTOMER',
  'BOOKING_CANCELLED_BUSINESS',
  'BOOKING_RESCHEDULED_CUSTOMER',
  'BOOKING_RESCHEDULED_BUSINESS',
]);

function isBookingKind(kind: string): kind is DueNotification['kind'] {
  return BOOKING_KINDS.has(kind);
}

function readPayload(value: unknown): DueNotification['payload'] | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.to !== 'string' ||
    typeof record.subject !== 'string' ||
    typeof record.text !== 'string' ||
    record.to.length === 0 ||
    record.subject.length === 0 ||
    record.text.length === 0
  ) {
    return null;
  }
  return { to: record.to, subject: record.subject, text: record.text };
}

function isStaffOverlap(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2004' || error.code === 'P2034';
  }
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    (error.message.includes('23P01') ||
      error.message.includes('Appointment_staff_block_no_overlap'))
  );
}
