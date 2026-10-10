import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import type { ReportAppointment, ReportsStore } from './reports.store';
import { ReportsService } from './reports.service';

const utc = (iso: string): Date =>
  DateTime.fromISO(iso, { zone: 'utc' }).toJSDate();

const access: TenantAccess = {
  userId: 'user-1',
  role: 'OWNER',
  subscriptionStatus: 'ACTIVE',
  tenant: {
    id: 'tenant-1',
    slug: 'ada-studio',
    legalName: 'Ada Studio',
    status: 'ACTIVE',
    databaseName: 'nexora_t_abc',
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
  },
};

const trial = {
  maxStaff: null,
  maxServices: null,
  deposits: true,
  onlinePayments: true,
  multipleStaff: true,
  advancedBookingSettings: true,
  customerHistory: true,
  reports: true,
  advancedReports: true,
  customBranding: true,
  multipleLocations: true,
  teamPermissions: true,
};

const pro = {
  ...trial,
  advancedReports: false,
};

const starter = {
  maxStaff: 1,
  maxServices: null,
  deposits: false,
  onlinePayments: false,
  multipleStaff: false,
  advancedBookingSettings: false,
  customerHistory: true,
  reports: false,
  advancedReports: false,
  customBranding: false,
  multipleLocations: false,
  teamPermissions: false,
};

const mixed: ReportAppointment[] = [
  {
    status: 'CONFIRMED',
    priceAmountMinor: 4000,
    service: { id: 'svc-lesson', name: 'Lesson' },
    staff: { id: 'staff-ada', name: 'Ada' },
  },
  {
    status: 'COMPLETED',
    priceAmountMinor: 2500,
    service: { id: 'svc-consult', name: 'Consult' },
    staff: { id: 'staff-ada', name: 'Ada' },
  },
  {
    status: 'PENDING',
    priceAmountMinor: 4000,
    service: { id: 'svc-lesson', name: 'Lesson' },
    staff: { id: 'staff-bea', name: 'Bea' },
  },
  {
    status: 'NO_SHOW',
    priceAmountMinor: 2500,
    service: { id: 'svc-consult', name: 'Consult' },
    staff: { id: 'staff-ada', name: 'Ada' },
  },
  {
    status: 'CANCELLED',
    priceAmountMinor: 4000,
    service: { id: 'svc-lesson', name: 'Lesson' },
    staff: { id: 'staff-ada', name: 'Ada' },
  },
];

class MemoryReports implements ReportsStore {
  rows: ReportAppointment[] = mixed;

  appointments(): Promise<ReportAppointment[]> {
    return Promise.resolve(this.rows);
  }
}

function setup(entitlements: unknown) {
  const reports = new MemoryReports();
  const tenants = {
    findEntitlements: () => Promise.resolve(entitlements),
  } as unknown as TenantStore;
  return {
    reports,
    service: new ReportsService(reports, tenants),
  };
}

describe('ReportsService', () => {
  it('summarises mixed statuses for trial with advanced breakdowns', async () => {
    const { service } = setup(trial);
    const summary = await service.summary(
      access,
      utc('2026-01-01T00:00:00.000Z'),
      utc('2026-02-01T00:00:00.000Z'),
    );
    expect(summary).toMatchObject({
      currency: 'GBP',
      bookings: 4,
      cancelled: 1,
      noShows: 1,
      revenueAmountMinor: 6500,
      advanced: true,
    });
    expect(summary.byService).toEqual([
      {
        id: 'svc-lesson',
        name: 'Lesson',
        bookings: 2,
        revenueAmountMinor: 4000,
      },
      {
        id: 'svc-consult',
        name: 'Consult',
        bookings: 2,
        revenueAmountMinor: 2500,
      },
    ]);
    expect(summary.byStaff).toEqual([
      {
        id: 'staff-ada',
        name: 'Ada',
        bookings: 3,
        revenueAmountMinor: 6500,
      },
      {
        id: 'staff-bea',
        name: 'Bea',
        bookings: 1,
        revenueAmountMinor: 0,
      },
    ]);
  });

  it('omits advanced breakdowns on pro', async () => {
    const { service } = setup(pro);
    const summary = await service.summary(
      access,
      utc('2026-01-01T00:00:00.000Z'),
      utc('2026-02-01T00:00:00.000Z'),
    );
    expect(summary.advanced).toBe(false);
    expect(summary.byService).toEqual([]);
    expect(summary.byStaff).toEqual([]);
    expect(summary.revenueAmountMinor).toBe(6500);
    expect(summary.bookings).toBe(4);
  });

  it('rejects starter plans without reports', async () => {
    const { service } = setup(starter);
    await expect(
      service.summary(
        access,
        utc('2026-01-01T00:00:00.000Z'),
        utc('2026-02-01T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects ranges longer than 366 days', async () => {
    const { service } = setup(trial);
    await expect(
      service.summary(
        access,
        utc('2026-01-01T00:00:00.000Z'),
        utc('2027-02-01T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
