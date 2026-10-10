import type { HourRange } from '../hours/hours';
import type { SettingValue } from '../settings/setting.registry';

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceAmountMinor: number;
  currency: string;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  active: boolean;
  onlineBookingEnabled: boolean;
};

export type BookableStaff = {
  id: string;
  name: string;
  active: boolean;
  serviceIds: string[];
  hours: HourRange[] | null;
};

export type BookingPolicyView = {
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  allowAnyStaff: boolean;
  requireCustomerEmail: boolean;
  requireCustomerPhone: boolean;
  cancellationWindowMinutes: number;
  allowCustomerCancel: boolean;
  allowCustomerReschedule: boolean;
  reminderLeadMinutes: number;
};

export type BookingSetup = {
  profile: {
    name: string;
    category: string;
    timezone: string;
    currency: string;
    slug: string;
    email: string | null;
    description: string | null;
    logoUrl: string | null;
    brandColor: string | null;
  };
  policy: BookingPolicyView;
  services: BookableService[];
  staff: BookableStaff[];
  businessHours: HourRange[];
  page?: Record<string, SettingValue>;
};

export type Occupancy = {
  staffId: string | null;
  startAt: Date;
  endAt: Date;
  appointmentId?: string;
};

export type CustomerDetails = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
};

export type NewAppointment = {
  service: BookableService;
  staffId: string;
  startAt: Date;
  endAt: Date;
  customer: CustomerDetails;
  customerNote: string | null;
  internalNote: string | null;
  manageTokenHash: string;
};

export type CustomerView = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export type CustomerExport = {
  customer: CustomerView & { createdAt: Date };
  appointments: Array<{
    id: string;
    status: string;
    startAt: Date;
    endAt: Date;
    serviceName: string;
    staffName: string;
    priceAmountMinor: number;
    currency: string;
    customerNote: string | null;
  }>;
};

export type AppointmentView = {
  id: string;
  status: string;
  startAt: Date;
  endAt: Date;
  priceAmountMinor: number;
  currency: string;
  customerNote: string | null;
  internalNote: string | null;
  customer: CustomerView;
  service: { id: string; name: string };
  staff: { id: string; name: string };
};

export type ManagedBooking = AppointmentView & {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

export type NotificationKind =
  | 'BOOKING_CONFIRMATION_CUSTOMER'
  | 'BOOKING_CONFIRMATION_BUSINESS'
  | 'BOOKING_REMINDER_CUSTOMER'
  | 'BOOKING_CANCELLED_CUSTOMER'
  | 'BOOKING_CANCELLED_BUSINESS'
  | 'BOOKING_RESCHEDULED_CUSTOMER'
  | 'BOOKING_RESCHEDULED_BUSINESS';

export type NotificationDraft = {
  kind: NotificationKind;
  appointmentId: string;
  runAt: Date;
  payload: { to: string; subject: string; text: string };
};

export type DueNotification = NotificationDraft & { id: string };

export type RescheduleUpdate = {
  staffId: string;
  startAt: Date;
  endAt: Date;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  manageTokenHash: string;
};

export interface BookingStore {
  setup(databaseName: string): Promise<BookingSetup | null>;
  occupancy(
    databaseName: string,
    from: Date,
    to: Date,
    excludeAppointmentId?: string,
  ): Promise<Occupancy[]>;
  createAppointment(
    databaseName: string,
    input: NewAppointment,
  ): Promise<AppointmentView | 'overlap'>;
  listAppointments(
    databaseName: string,
    from: Date,
    to: Date,
  ): Promise<AppointmentView[]>;
  listCustomers(databaseName: string, query?: string): Promise<CustomerView[]>;
  createCustomer(
    databaseName: string,
    input: CustomerDetails,
  ): Promise<CustomerView>;
  updateCustomer(
    databaseName: string,
    customerId: string,
    input: CustomerDetails,
  ): Promise<CustomerView | null>;
  exportCustomer(
    databaseName: string,
    customerId: string,
  ): Promise<CustomerExport | null>;
  eraseCustomer(
    databaseName: string,
    customerId: string,
    at: Date,
  ): Promise<boolean>;
  findByManageToken(
    databaseName: string,
    manageTokenHash: string,
  ): Promise<ManagedBooking | null>;
  findAppointment(
    databaseName: string,
    appointmentId: string,
  ): Promise<ManagedBooking | null>;
  cancelAppointment(
    databaseName: string,
    appointmentId: string,
  ): Promise<ManagedBooking | null>;
  rescheduleAppointment(
    databaseName: string,
    appointmentId: string,
    input: RescheduleUpdate,
  ): Promise<ManagedBooking | 'overlap' | 'missing'>;
  saveNotifications(
    databaseName: string,
    jobs: NotificationDraft[],
  ): Promise<void>;
  cancelPending(databaseName: string, appointmentId: string): Promise<void>;
  claimDue(databaseName: string, now: Date): Promise<DueNotification[]>;
  finishNotification(
    databaseName: string,
    id: string,
    status: 'SENT' | 'FAILED' | 'CANCELLED',
    lastError: string | null,
  ): Promise<void>;
}
