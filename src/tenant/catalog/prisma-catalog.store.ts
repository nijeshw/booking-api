import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/tenant';
import { TenantConnections } from '../database/tenant-connections';
import type {
  BrandingInput,
  OnboardingInput,
  ServiceInput,
  StaffInput,
} from './catalog.schema';
import type {
  CatalogStore,
  OnboardingOwner,
  ServiceView,
  StaffView,
  TimeOffView,
  Workspace,
} from './catalog.store';
import type { HourRange } from '../hours/hours';

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  priceAmountMinor: true,
  currency: true,
  bufferBeforeMinutes: true,
  bufferAfterMinutes: true,
  active: true,
} as const;

@Injectable()
export class PrismaCatalogStore implements CatalogStore {
  constructor(private readonly connections: TenantConnections) {}

  async workspace(databaseName: string): Promise<Workspace | null> {
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
    const [services, staff, weeklyHours, timeOff] = await Promise.all([
      db.service.findMany({
        orderBy: { createdAt: 'asc' },
        select: serviceSelect,
      }),
      this.staff(databaseName),
      db.weeklyHours.findMany(),
      db.timeOff.findMany({ orderBy: { startsAt: 'asc' } }),
    ]);
    const staffHourMap = new Map<string, HourRange[]>();
    for (const row of weeklyHours) {
      if (!row.staffId) {
        continue;
      }
      const ranges = staffHourMap.get(row.staffId) ?? [];
      ranges.push(toRange(row));
      staffHourMap.set(row.staffId, ranges);
    }
    return {
      onboarded: true,
      profile: {
        name: profile.name,
        category: profile.category,
        locationType: profile.locationType,
        email: profile.email,
        phone: profile.phone,
        website: profile.website,
        addressLine1: profile.addressLine1,
        addressLine2: profile.addressLine2,
        city: profile.city,
        postcode: profile.postcode,
        country: profile.country,
        timezone: profile.timezone,
        currency: profile.currency,
        slug: profile.slug,
        description: profile.description,
        logoUrl: profile.logoUrl,
        brandColor: profile.brandColor,
      },
      policy: {
        minNoticeMinutes: policy.minNoticeMinutes,
        maxAdvanceDays: policy.maxAdvanceDays,
        cancellationWindowMinutes: policy.cancellationWindowMinutes,
        allowCustomerCancel: policy.allowCustomerCancel,
        allowCustomerReschedule: policy.allowCustomerReschedule,
        slotIntervalMinutes: policy.slotIntervalMinutes,
      },
      services,
      staff,
      hours: weeklyHours.filter((row) => row.staffId === null).map(toRange),
      staffHours: [...staffHourMap.entries()].map(([staffId, hours]) => ({
        staffId,
        hours,
      })),
      timeOff: timeOff.map((row) => ({
        id: row.id,
        staffId: row.staffId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        reason: row.reason,
      })),
    };
  }

  async saveOnboarding(
    databaseName: string,
    input: OnboardingInput,
    owner: OnboardingOwner,
    slug: string,
  ): Promise<'ok' | 'exists'> {
    const db = this.connections.get(databaseName);
    const policy = input.policy;
    if (!policy) {
      throw new Error('Booking policy is missing');
    }
    try {
      await db.$transaction(async (tx) => {
        await tx.businessProfile.create({
          data: {
            singletonKey: 1,
            name: input.name,
            category: input.category,
            locationType: input.locationType,
            email: input.email,
            phone: input.phone,
            website: input.website || null,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2,
            city: input.city,
            postcode: input.postcode,
            country: input.country,
            slug,
            timezone: input.timezone,
            currency: input.currency,
          },
        });
        await tx.bookingPolicy.create({
          data: { singletonKey: 1, ...policy },
        });
        if (input.hours.length > 0) {
          await tx.weeklyHours.createMany({
            data: input.hours.map((range) => ({ ...range, staffId: null })),
          });
        }
        const service = await tx.service.create({
          data: serviceData(input.service),
        });
        const staff = await tx.staffMember.create({
          data: {
            userId: owner.userId,
            name: owner.name,
            email: owner.email,
          },
        });
        await tx.staffService.create({
          data: { staffId: staff.id, serviceId: service.id },
        });
      });
      return 'ok';
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'exists';
      }
      throw error;
    }
  }

  countServices(databaseName: string): Promise<number> {
    return this.connections.get(databaseName).service.count();
  }

  createService(
    databaseName: string,
    input: ServiceInput,
  ): Promise<ServiceView> {
    return this.connections.get(databaseName).service.create({
      data: serviceData(input),
      select: serviceSelect,
    });
  }

  async updateService(
    databaseName: string,
    id: string,
    input: Partial<ServiceInput>,
  ): Promise<ServiceView | null> {
    try {
      return await this.connections.get(databaseName).service.update({
        where: { id },
        data: input,
        select: serviceSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteService(
    databaseName: string,
    id: string,
  ): Promise<'ok' | 'missing' | 'in-use'> {
    try {
      await this.connections
        .get(databaseName)
        .service.delete({ where: { id } });
      return 'ok';
    } catch (error) {
      return deleteResult(error);
    }
  }

  countStaff(databaseName: string): Promise<number> {
    return this.connections.get(databaseName).staffMember.count();
  }

  async createStaff(
    databaseName: string,
    input: StaffInput & { userId?: string },
  ): Promise<StaffView | 'missing-service'> {
    const db = this.connections.get(databaseName);
    const uniqueIds = [...new Set(input.serviceIds)];
    const found = await db.service.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      return 'missing-service';
    }
    const staff = await db.staffMember.create({
      data: {
        userId: input.userId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        services: {
          create: uniqueIds.map((serviceId) => ({ serviceId })),
        },
      },
      include: { services: { select: { serviceId: true } } },
    });
    return toStaff(staff);
  }

  async updateStaff(
    databaseName: string,
    id: string,
    input: Partial<Omit<StaffInput, 'serviceIds'>> & { active?: boolean },
  ): Promise<StaffView | null> {
    try {
      const staff = await this.connections
        .get(databaseName)
        .staffMember.update({
          where: { id },
          data: input,
          include: { services: { select: { serviceId: true } } },
        });
      return toStaff(staff);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }
      throw error;
    }
  }

  async deleteStaff(
    databaseName: string,
    id: string,
  ): Promise<'ok' | 'missing' | 'in-use'> {
    try {
      await this.connections
        .get(databaseName)
        .staffMember.delete({ where: { id } });
      return 'ok';
    } catch (error) {
      return deleteResult(error);
    }
  }

  async replaceStaffServices(
    databaseName: string,
    staffId: string,
    serviceIds: string[],
  ): Promise<'ok' | 'missing'> {
    const db = this.connections.get(databaseName);
    const staff = await db.staffMember.findUnique({ where: { id: staffId } });
    if (!staff) {
      return 'missing';
    }
    const uniqueIds = [...new Set(serviceIds)];
    const found = await db.service.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (found.length !== uniqueIds.length) {
      return 'missing';
    }
    await db.$transaction([
      db.staffService.deleteMany({ where: { staffId } }),
      db.staffService.createMany({
        data: uniqueIds.map((serviceId) => ({ staffId, serviceId })),
      }),
    ]);
    return 'ok';
  }

  async replaceHours(
    databaseName: string,
    staffId: string | null,
    hours: HourRange[],
  ): Promise<'ok' | 'missing-staff'> {
    const db = this.connections.get(databaseName);
    if (staffId) {
      const staff = await db.staffMember.findUnique({ where: { id: staffId } });
      if (!staff) {
        return 'missing-staff';
      }
    }
    const writes: Prisma.PrismaPromise<unknown>[] = [
      db.weeklyHours.deleteMany({ where: { staffId } }),
    ];
    if (hours.length > 0) {
      writes.push(
        db.weeklyHours.createMany({
          data: hours.map((range) => ({ ...range, staffId })),
        }),
      );
    }
    await db.$transaction(writes);
    return 'ok';
  }

  async addTimeOff(
    databaseName: string,
    input: {
      staffId: string | null;
      startsAt: Date;
      endsAt: Date;
      reason: string | null;
    },
  ): Promise<TimeOffView | 'missing-staff'> {
    const db = this.connections.get(databaseName);
    if (input.staffId) {
      const staff = await db.staffMember.findUnique({
        where: { id: input.staffId },
      });
      if (!staff) {
        return 'missing-staff';
      }
    }
    return db.timeOff.create({
      data: input,
      select: {
        id: true,
        staffId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    });
  }

  async deleteTimeOff(databaseName: string, id: string): Promise<boolean> {
    const result = await this.connections
      .get(databaseName)
      .timeOff.deleteMany({ where: { id } });
    return result.count === 1;
  }

  async updateBranding(
    databaseName: string,
    input: BrandingInput,
  ): Promise<Workspace | null> {
    const db = this.connections.get(databaseName);
    const existing = await db.businessProfile.findUnique({
      where: { singletonKey: 1 },
    });
    if (!existing) {
      return null;
    }
    await db.businessProfile.update({
      where: { singletonKey: 1 },
      data: {
        name: input.name,
        description: input.description,
        logoUrl: input.logoUrl,
        brandColor: input.brandColor,
      },
    });
    return this.workspace(databaseName);
  }

  private async staff(databaseName: string): Promise<StaffView[]> {
    const rows = await this.connections.get(databaseName).staffMember.findMany({
      orderBy: { createdAt: 'asc' },
      include: { services: { select: { serviceId: true } } },
    });
    return rows.map(toStaff);
  }
}

function serviceData(input: ServiceInput) {
  return {
    name: input.name,
    description: input.description,
    durationMinutes: input.durationMinutes,
    priceAmountMinor: input.priceAmountMinor,
    currency: input.currency,
    bufferBeforeMinutes: input.bufferBeforeMinutes,
    bufferAfterMinutes: input.bufferAfterMinutes,
    active: input.active,
  };
}

function toRange(row: {
  weekday: number;
  startMinute: number;
  endMinute: number;
}): HourRange {
  return {
    weekday: row.weekday,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  };
}

function deleteResult(error: unknown): 'missing' | 'in-use' {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return 'missing';
    }
    if (error.code === 'P2003') {
      return 'in-use';
    }
  }
  throw error;
}

function toStaff(row: {
  id: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  services: { serviceId: string }[];
}): StaffView {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    active: row.active,
    serviceIds: row.services.map((item) => item.serviceId),
  };
}
