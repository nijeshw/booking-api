import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import { hashToken, randomToken } from '../../auth/token/token';
import { CLOCK } from '../../common/clock';
import {
  diffMs,
  isAfter,
  isBefore,
  isSameInstant,
  minusMinutes,
  minusMs,
  parseUtc,
  plusMinutes,
  plusMs,
  utcNow,
} from '../../common/time';
import type {
  TenantAccess,
  TenantRecord,
} from '../../master/tenancy/tenant.types';
import type { BookingNotifier } from '../notifications/notification.service';
import { BOOKING_NOTIFIER } from '../notifications/notification.tokens';
import { publicSettings } from '../settings/setting.registry';
import type {
  BookInput,
  CustomerInput,
  RescheduleInput,
  SlotQuery,
} from './booking.schema';
import { BOOKING_STORE } from './booking.tokens';
import type {
  AppointmentView,
  BookableService,
  BookableStaff,
  BookingSetup,
  BookingStore,
  CustomerExport,
  CustomerView,
  ManagedBooking,
  Occupancy,
} from './booking.store';
import { availableSlots, dayWindow, formatDay } from './slots';

const RANGE_LIMIT_MS = 62 * 24 * 60 * 60 * 1000;
const OCCUPANCY_PAD_MS = 18 * 60 * 60 * 1000;

export type OfferedSlot = {
  startAt: Date;
  endAt: Date;
  staffId: string;
  staffName: string;
};

export type ManageView = {
  status: string;
  startAt: Date;
  endAt: Date;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  customerFirstName: string;
  timezone: string;
  canCancel: boolean;
  canReschedule: boolean;
};

export type PublicProfile = {
  name: string;
  category: string;
  timezone: string;
  currency: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  brandColor: string | null;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceAmountMinor: number;
    currency: string;
  }>;
  staff: Array<{ id: string; name: string; serviceIds: string[] }>;
  policy: BookingSetup['policy'];
  page: Record<string, boolean | number | string>;
};

@Injectable()
export class BookingService {
  private readonly now: () => Date;

  constructor(
    @Inject(BOOKING_STORE) private readonly bookings: BookingStore,
    @Inject(BOOKING_NOTIFIER) private readonly notifications: BookingNotifier,
    @Optional() @Inject(CLOCK) now?: () => Date,
  ) {
    this.now = now ?? utcNow;
  }

  async profile(tenant: TenantRecord): Promise<PublicProfile> {
    const setup = await this.requireSetup(tenant.databaseName);
    const services = setup.services.filter(
      (service) => service.active && service.onlineBookingEnabled,
    );
    const serviceIds = new Set(services.map((service) => service.id));
    return {
      name: setup.profile.name,
      category: setup.profile.category,
      timezone: setup.profile.timezone,
      currency: setup.profile.currency,
      slug: setup.profile.slug,
      description: setup.profile.description,
      logoUrl: setup.profile.logoUrl,
      brandColor: setup.profile.brandColor,
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        durationMinutes: service.durationMinutes,
        priceAmountMinor: service.priceAmountMinor,
        currency: service.currency,
      })),
      staff: setup.staff
        .filter(
          (member) =>
            member.active && member.serviceIds.some((id) => serviceIds.has(id)),
        )
        .map((member) => ({
          id: member.id,
          name: member.name,
          serviceIds: member.serviceIds.filter((id) => serviceIds.has(id)),
        })),
      policy: setup.policy,
      page: publicSettings(setup.page ?? {}),
    };
  }

  async slots(tenant: TenantRecord, query: SlotQuery): Promise<OfferedSlot[]> {
    const setup = await this.requireSetup(tenant.databaseName);
    const service = this.publicService(setup, query.serviceId);
    const members = this.candidates(setup, service, query.staffId, true);
    return this.offer(tenant.databaseName, setup, service, members, query.date);
  }

  async book(tenant: TenantRecord, input: BookInput): Promise<AppointmentView> {
    const setup = await this.requireSetup(tenant.databaseName);
    this.requireContact(setup, input.email, input.phone);
    const service = this.publicService(setup, input.serviceId);
    const startAt = parseUtc(input.startAt);
    const members = this.candidates(setup, service, input.staffId, true);
    const chosen = await this.choose(
      tenant.databaseName,
      setup,
      service,
      members,
      startAt,
    );
    const token = randomToken();
    const saved = await this.bookings.createAppointment(tenant.databaseName, {
      service,
      staffId: chosen.id,
      startAt,
      endAt: plusMinutes(startAt, service.durationMinutes),
      customer: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
      },
      customerNote: input.customerNote,
      internalNote: null,
      manageTokenHash: hashToken(token),
    });
    if (saved === 'overlap') {
      throw new ConflictException('That time is not available');
    }
    await this.notifications.queueBooking(
      tenant.databaseName,
      saved,
      setup,
      token,
    );
    return saved;
  }

  async managed(tenant: TenantRecord, token: string): Promise<ManageView> {
    const setup = await this.requireSetup(tenant.databaseName);
    const booking = await this.requireManaged(tenant.databaseName, token);
    return this.toManageView(booking, setup);
  }

  async cancelByCustomer(
    tenant: TenantRecord,
    token: string,
  ): Promise<{ status: 'cancelled' }> {
    const setup = await this.requireSetup(tenant.databaseName);
    const booking = await this.requireManaged(tenant.databaseName, token);
    this.assertCustomerChange(setup, booking, 'cancel');
    const cancelled = await this.bookings.cancelAppointment(
      tenant.databaseName,
      booking.id,
    );
    if (!cancelled) {
      throw new NotFoundException('Booking not found');
    }
    await this.notifications.queueChange(
      tenant.databaseName,
      cancelled,
      setup,
      'cancel',
      null,
    );
    return { status: 'cancelled' };
  }

  async rescheduleByCustomer(
    tenant: TenantRecord,
    token: string,
    input: RescheduleInput,
  ): Promise<ManageView> {
    const setup = await this.requireSetup(tenant.databaseName);
    const booking = await this.requireManaged(tenant.databaseName, token);
    this.assertCustomerChange(setup, booking, 'reschedule');
    const service = this.publicService(setup, booking.service.id);
    const startAt = parseUtc(input.startAt);
    const members = this.candidates(setup, service, input.staffId, true);
    const chosen = await this.choose(
      tenant.databaseName,
      setup,
      service,
      members,
      startAt,
      booking.id,
    );
    const nextToken = randomToken();
    const saved = await this.bookings.rescheduleAppointment(
      tenant.databaseName,
      booking.id,
      {
        staffId: chosen.id,
        startAt,
        endAt: plusMinutes(startAt, service.durationMinutes),
        bufferBeforeMinutes: service.bufferBeforeMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        manageTokenHash: hashToken(nextToken),
      },
    );
    if (saved === 'missing') {
      throw new NotFoundException('Booking not found');
    }
    if (saved === 'overlap') {
      throw new ConflictException('That time is not available');
    }
    await this.notifications.queueChange(
      tenant.databaseName,
      saved,
      setup,
      'reschedule',
      nextToken,
    );
    return this.toManageView(saved, setup);
  }

  async cancelByBusiness(
    access: TenantAccess,
    appointmentId: string,
  ): Promise<{ status: 'cancelled' }> {
    const databaseName = access.tenant.databaseName;
    const setup = await this.requireSetup(databaseName);
    const existing = await this.bookings.findAppointment(
      databaseName,
      appointmentId,
    );
    if (!existing) {
      throw new NotFoundException('Appointment not found');
    }
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('This booking is already cancelled');
    }
    const cancelled = await this.bookings.cancelAppointment(
      databaseName,
      appointmentId,
    );
    if (!cancelled) {
      throw new BadRequestException('This booking is already cancelled');
    }
    await this.notifications.queueChange(
      databaseName,
      cancelled,
      setup,
      'cancel',
      null,
    );
    return { status: 'cancelled' };
  }

  async calendar(
    access: TenantAccess,
    from: Date,
    to: Date,
  ): Promise<AppointmentView[]> {
    if (diffMs(to, from) > RANGE_LIMIT_MS) {
      throw new BadRequestException('Choose a shorter date range');
    }
    return this.bookings.listAppointments(access.tenant.databaseName, from, to);
  }

  async customers(
    access: TenantAccess,
    query?: string,
  ): Promise<CustomerView[]> {
    return this.bookings.listCustomers(access.tenant.databaseName, query);
  }

  async createCustomer(
    access: TenantAccess,
    input: CustomerInput,
  ): Promise<CustomerView> {
    return this.bookings.createCustomer(access.tenant.databaseName, input);
  }

  async updateCustomer(
    access: TenantAccess,
    customerId: string,
    input: CustomerInput,
  ): Promise<CustomerView> {
    const updated = await this.bookings.updateCustomer(
      access.tenant.databaseName,
      customerId,
      input,
    );
    if (!updated) {
      throw new NotFoundException('Customer not found');
    }
    return updated;
  }

  async exportCustomer(
    access: TenantAccess,
    customerId: string,
  ): Promise<CustomerExport> {
    const exported = await this.bookings.exportCustomer(
      access.tenant.databaseName,
      customerId,
    );
    if (!exported) {
      throw new NotFoundException('Customer not found');
    }
    return exported;
  }

  async eraseCustomer(access: TenantAccess, customerId: string): Promise<void> {
    const erased = await this.bookings.eraseCustomer(
      access.tenant.databaseName,
      customerId,
      this.now(),
    );
    if (!erased) {
      throw new NotFoundException('Customer not found');
    }
  }

  private async requireSetup(databaseName: string): Promise<BookingSetup> {
    const setup = await this.bookings.setup(databaseName);
    if (!setup) {
      throw new NotFoundException('Business not found');
    }
    return setup;
  }

  private publicService(
    setup: BookingSetup,
    serviceId: string,
  ): BookableService {
    const service = setup.services.find((item) => item.id === serviceId);
    if (!service || !service.active || !service.onlineBookingEnabled) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  private candidates(
    setup: BookingSetup,
    service: BookableService,
    staffId: string | undefined,
    publicBooking: boolean,
  ): BookableStaff[] {
    const members = setup.staff.filter(
      (member) =>
        member.active &&
        member.serviceIds.includes(service.id) &&
        (staffId === undefined || member.id === staffId),
    );
    if (staffId && members.length === 0) {
      throw new NotFoundException('Staff member not found');
    }
    if (!staffId && publicBooking && !setup.policy.allowAnyStaff) {
      throw new BadRequestException('Choose a person');
    }
    return members.sort((left, right) => left.name.localeCompare(right.name));
  }

  private async offer(
    databaseName: string,
    setup: BookingSetup,
    service: BookableService,
    members: BookableStaff[],
    date: string,
  ): Promise<OfferedSlot[]> {
    const window = dayWindow(date, setup.profile.timezone);
    if (!window) {
      throw new BadRequestException('Choose a valid date');
    }
    const occupancy = await this.bookings.occupancy(
      databaseName,
      minusMs(window.start, OCCUPANCY_PAD_MS),
      plusMs(window.end, OCCUPANCY_PAD_MS),
    );
    return this.slotsFor(setup, service, members, date, occupancy, window);
  }

  private async choose(
    databaseName: string,
    setup: BookingSetup,
    service: BookableService,
    members: BookableStaff[],
    startAt: Date,
    excludeAppointmentId?: string,
  ): Promise<BookableStaff> {
    const date = formatDay(startAt, setup.profile.timezone);
    const window = dayWindow(date, setup.profile.timezone);
    if (!window) {
      throw new BadRequestException('Choose a valid date');
    }
    const occupancy = await this.bookings.occupancy(
      databaseName,
      minusMs(window.start, OCCUPANCY_PAD_MS),
      plusMs(window.end, OCCUPANCY_PAD_MS),
      excludeAppointmentId,
    );
    const slots = this.slotsFor(
      setup,
      service,
      members,
      date,
      occupancy,
      window,
    );
    const match = slots.find((slot) => isSameInstant(slot.startAt, startAt));
    const member = members.find((item) => item.id === match?.staffId);
    if (!match || !member) {
      throw new ConflictException('That time is not available');
    }
    return member;
  }

  private slotsFor(
    setup: BookingSetup,
    service: BookableService,
    members: BookableStaff[],
    date: string,
    occupancy: Occupancy[],
    window: { start: Date; end: Date },
  ): OfferedSlot[] {
    const offered: OfferedSlot[] = [];
    for (const member of members) {
      const openings = member.hours ?? setup.businessHours;
      const busy = occupancy
        .filter(
          (block) => block.staffId === null || block.staffId === member.id,
        )
        .filter(
          (block) =>
            isBefore(block.startAt, plusMs(window.end, OCCUPANCY_PAD_MS)) &&
            isAfter(block.endAt, minusMs(window.start, OCCUPANCY_PAD_MS)),
        );
      for (const slot of availableSlots({
        timeZone: setup.profile.timezone,
        now: this.now(),
        date,
        durationMinutes: service.durationMinutes,
        bufferBeforeMinutes: service.bufferBeforeMinutes,
        bufferAfterMinutes: service.bufferAfterMinutes,
        slotIntervalMinutes: setup.policy.slotIntervalMinutes,
        minNoticeMinutes: setup.policy.minNoticeMinutes,
        maxAdvanceDays: setup.policy.maxAdvanceDays,
        openings,
        busy,
      })) {
        offered.push({ ...slot, staffId: member.id, staffName: member.name });
      }
    }
    return offered.sort(
      (left, right) =>
        diffMs(left.startAt, right.startAt) ||
        left.staffName.localeCompare(right.staffName),
    );
  }

  private async requireManaged(
    databaseName: string,
    token: string,
  ): Promise<ManagedBooking> {
    const booking = await this.bookings.findByManageToken(
      databaseName,
      hashToken(token),
    );
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private assertCustomerChange(
    setup: BookingSetup,
    booking: ManagedBooking,
    change: 'cancel' | 'reschedule',
  ): void {
    if (booking.status !== 'CONFIRMED') {
      throw new BadRequestException('This booking can no longer be changed');
    }
    if (change === 'cancel' && !setup.policy.allowCustomerCancel) {
      throw new BadRequestException('This booking cannot be cancelled online');
    }
    if (change === 'reschedule' && !setup.policy.allowCustomerReschedule) {
      throw new BadRequestException(
        'This booking cannot be rescheduled online',
      );
    }
    const deadline = minusMinutes(
      booking.startAt,
      setup.policy.cancellationWindowMinutes,
    );
    if (isAfter(this.now(), deadline)) {
      throw new BadRequestException('It is too late to change this booking');
    }
  }

  private toManageView(
    booking: ManagedBooking,
    setup: BookingSetup,
  ): ManageView {
    const open = booking.status === 'CONFIRMED';
    const inWindow = !isAfter(
      this.now(),
      minusMinutes(booking.startAt, setup.policy.cancellationWindowMinutes),
    );
    return {
      status: booking.status,
      startAt: booking.startAt,
      endAt: booking.endAt,
      serviceId: booking.service.id,
      serviceName: booking.service.name,
      staffId: booking.staff.id,
      staffName: booking.staff.name,
      customerFirstName: booking.customer.firstName,
      timezone: setup.profile.timezone,
      canCancel: open && inWindow && setup.policy.allowCustomerCancel,
      canReschedule: open && inWindow && setup.policy.allowCustomerReschedule,
    };
  }

  private requireContact(
    setup: BookingSetup,
    email: string | null,
    phone: string | null,
  ): void {
    if (setup.policy.requireCustomerEmail && !email) {
      throw new BadRequestException('Enter an email');
    }
    if (setup.policy.requireCustomerPhone && !phone) {
      throw new BadRequestException('Enter a phone number');
    }
  }
}
