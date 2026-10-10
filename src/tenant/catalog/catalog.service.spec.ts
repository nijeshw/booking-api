import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CatalogService } from './catalog.service';
import type {
  CatalogStore,
  OnboardingOwner,
  ServiceView,
  StaffView,
  Workspace,
} from './catalog.store';
import type {
  BrandingInput,
  OnboardingInput,
  ServiceInput,
  StaffInput,
} from './catalog.schema';
import type { HourRange } from '../hours/hours';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import type { TenantAccess } from '../../master/tenancy/tenant.types';

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

const owner: OnboardingOwner = {
  userId: 'user-1',
  name: 'Ada',
  email: 'owner@example.com',
};

const starter = {
  maxStaff: 1,
  maxServices: 1,
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

class MemoryCatalog implements CatalogStore {
  workspaceValue: Workspace | null = null;
  services: ServiceView[] = [];
  staff: StaffView[] = [];
  hours: HourRange[] = [];

  workspace() {
    return Promise.resolve(this.workspaceValue);
  }

  saveOnboarding(_databaseName: string, input: OnboardingInput) {
    if (this.workspaceValue) {
      return Promise.resolve('exists' as const);
    }
    const service: ServiceView = {
      id: 'service-1',
      ...input.service,
      description: input.service.description ?? null,
      active: input.service.active,
    };
    this.services = [service];
    this.staff = [
      {
        id: 'staff-1',
        userId: owner.userId,
        name: owner.name,
        email: owner.email,
        phone: null,
        active: true,
        serviceIds: ['service-1'],
      },
    ];
    this.hours = input.hours;
    this.workspaceValue = {
      onboarded: true,
      profile: {
        name: input.name,
        category: input.category,
        locationType: input.locationType,
        email: input.email ?? null,
        phone: input.phone ?? null,
        website: input.website || null,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postcode: input.postcode ?? null,
        country: input.country,
        timezone: input.timezone,
        currency: input.currency,
        slug: 'ada-studio',
        description: null,
        logoUrl: null,
        brandColor: null,
      },
      policy: {
        minNoticeMinutes: input.policy?.minNoticeMinutes ?? 60,
        maxAdvanceDays: input.policy?.maxAdvanceDays ?? 60,
        cancellationWindowMinutes:
          input.policy?.cancellationWindowMinutes ?? 1440,
        allowCustomerCancel: input.policy?.allowCustomerCancel ?? true,
        allowCustomerReschedule: input.policy?.allowCustomerReschedule ?? true,
        slotIntervalMinutes: input.policy?.slotIntervalMinutes ?? 15,
      },
      services: this.services,
      staff: this.staff,
      hours: this.hours,
      staffHours: [],
      timeOff: [],
    };
    return Promise.resolve('ok' as const);
  }

  countServices() {
    return Promise.resolve(this.services.length);
  }

  createService(_databaseName: string, input: ServiceInput) {
    const service: ServiceView = {
      id: `service-${this.services.length + 1}`,
      ...input,
      description: input.description ?? null,
    };
    this.services.push(service);
    return Promise.resolve(service);
  }

  updateService() {
    return Promise.resolve(null);
  }

  deleteService(_databaseName: string, id: string) {
    const index = this.services.findIndex((service) => service.id === id);
    if (index < 0) {
      return Promise.resolve('missing' as const);
    }
    this.services.splice(index, 1);
    return Promise.resolve('ok' as const);
  }

  countStaff() {
    return Promise.resolve(this.staff.length);
  }

  createStaff(_databaseName: string, input: StaffInput) {
    if (
      input.serviceIds.some(
        (id) => !this.services.some((service) => service.id === id),
      )
    ) {
      return Promise.resolve('missing-service' as const);
    }
    const member: StaffView = {
      id: `staff-${this.staff.length + 1}`,
      userId: null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      active: true,
      serviceIds: input.serviceIds,
    };
    this.staff.push(member);
    return Promise.resolve(member);
  }

  updateStaff() {
    return Promise.resolve(null);
  }

  deleteStaff(_databaseName: string, id: string) {
    const index = this.staff.findIndex((member) => member.id === id);
    if (index < 0) {
      return Promise.resolve('missing' as const);
    }
    this.staff.splice(index, 1);
    return Promise.resolve('ok' as const);
  }

  replaceStaffServices() {
    return Promise.resolve('ok' as const);
  }

  replaceHours(
    _databaseName: string,
    staffId: string | null,
    hours: HourRange[],
  ) {
    if (staffId === null) {
      this.hours = hours;
    }
    return Promise.resolve('ok' as const);
  }

  addTimeOff() {
    return Promise.resolve('missing-staff' as const);
  }

  deleteTimeOff() {
    return Promise.resolve(false);
  }

  updateBranding(_databaseName: string, input: BrandingInput) {
    if (!this.workspaceValue) {
      return Promise.resolve(null);
    }
    this.workspaceValue = {
      ...this.workspaceValue,
      profile: {
        ...this.workspaceValue.profile,
        name: input.name,
        description: input.description,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
      },
    };
    return Promise.resolve(this.workspaceValue);
  }
}

const onboarding: OnboardingInput = {
  name: 'Ada Studio',
  category: 'Tutor',
  locationType: 'ONLINE',
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  postcode: null,
  country: 'GB',
  timezone: 'Europe/London',
  currency: 'GBP',
  hours: [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 }],
  service: {
    name: 'Lesson',
    description: null,
    durationMinutes: 60,
    priceAmountMinor: 4000,
    currency: 'GBP',
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
    active: true,
  },
};

function setup(entitlements: unknown = starter) {
  const catalog = new MemoryCatalog();
  const locales: string[] = [];
  const tenants = {
    updateLocale: (_id: string, timezone: string) => {
      locales.push(timezone);
      return Promise.resolve();
    },
    findEntitlements: () => Promise.resolve(entitlements),
  } as unknown as TenantStore;
  return {
    catalog,
    locales,
    service: new CatalogService(catalog, tenants),
  };
}

describe('CatalogService', () => {
  it('saves onboarding with the owner as the first bookable person', async () => {
    const { service, catalog, locales } = setup();
    const workspace = await service.onboard(access, onboarding, owner);
    expect(workspace.staff[0]).toMatchObject({
      name: 'Ada',
      serviceIds: ['service-1'],
    });
    expect(catalog.hours).toEqual(onboarding.hours);
    expect(locales).toEqual(['Europe/London']);
  });

  it('rejects overlapping hours and a second onboarding', async () => {
    const { service } = setup();
    await expect(
      service.onboard(
        access,
        {
          ...onboarding,
          hours: [
            { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
            { weekday: 1, startMinute: 12 * 60, endMinute: 17 * 60 },
          ],
        },
        owner,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.onboard(access, onboarding, owner);
    await expect(
      service.onboard(access, onboarding, owner),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks a second staff member on a plan that allows only one', async () => {
    const { service } = setup();
    await service.onboard(access, onboarding, owner);
    await expect(
      service.createStaff(access, {
        name: 'Bea',
        email: null,
        phone: null,
        serviceIds: ['service-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a second service when the plan cap is one', async () => {
    const { service } = setup();
    await service.onboard(access, onboarding, owner);
    await expect(
      service.createService(access, onboarding.service),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows another staff member when the plan does', async () => {
    const { service } = setup({
      ...starter,
      maxStaff: null,
      multipleStaff: true,
      maxServices: null,
    });
    await service.onboard(access, onboarding, owner);
    const member = await service.createStaff(access, {
      name: 'Bea',
      email: null,
      phone: null,
      serviceIds: ['service-1'],
    });
    expect(member.name).toBe('Bea');
  });
});
