import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  allows,
  parseEntitlements,
  withinLimit,
} from '../../master/entitlements/entitlements';
import { TENANT_STORE } from '../../master/tenancy/tenancy.tokens';
import type { TenantStore } from '../../master/tenancy/tenant.store';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import type {
  BrandingInput,
  OnboardingInput,
  ServiceInput,
  StaffInput,
} from './catalog.schema';
import { policySchema } from './catalog.schema';
import { CATALOG_STORE } from './catalog.tokens';
import type {
  CatalogStore,
  OnboardingOwner,
  ServiceView,
  StaffView,
  TimeOffView,
  Workspace,
} from './catalog.store';
import { hourError, type HourRange } from '../hours/hours';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_STORE) private readonly catalog: CatalogStore,
    @Inject(TENANT_STORE) private readonly tenants: TenantStore,
  ) {}

  async workspace(
    access: TenantAccess,
  ): Promise<Workspace | { onboarded: false }> {
    return (
      (await this.catalog.workspace(access.tenant.databaseName)) ?? {
        onboarded: false,
      }
    );
  }

  async onboard(
    access: TenantAccess,
    input: OnboardingInput,
    owner: OnboardingOwner,
  ): Promise<Workspace> {
    this.assertHours(input.hours, true);
    const policy = input.policy ?? policySchema.parse({});
    const saved = await this.catalog.saveOnboarding(
      access.tenant.databaseName,
      { ...input, policy },
      owner,
      access.tenant.slug,
    );
    if (saved === 'exists') {
      throw new ConflictException('This business is already set up');
    }
    await this.tenants.updateLocale(
      access.tenant.id,
      input.timezone,
      input.currency,
    );
    const workspace = await this.catalog.workspace(access.tenant.databaseName);
    if (!workspace) {
      throw new NotFoundException('Business not found');
    }
    return workspace;
  }

  async createService(
    access: TenantAccess,
    input: ServiceInput,
  ): Promise<ServiceView> {
    const entitlements = await this.entitlements(access.tenant.id);
    const count = await this.catalog.countServices(access.tenant.databaseName);
    if (!withinLimit(entitlements, 'maxServices', count)) {
      throw new ForbiddenException(
        'Your plan does not include another service',
      );
    }
    return this.catalog.createService(access.tenant.databaseName, input);
  }

  async updateService(
    access: TenantAccess,
    id: string,
    input: Partial<ServiceInput>,
  ): Promise<ServiceView> {
    const updated = await this.catalog.updateService(
      access.tenant.databaseName,
      id,
      input,
    );
    if (!updated) {
      throw new NotFoundException('Service not found');
    }
    return updated;
  }

  async deleteService(access: TenantAccess, id: string): Promise<void> {
    const result = await this.catalog.deleteService(
      access.tenant.databaseName,
      id,
    );
    if (result === 'missing') {
      throw new NotFoundException('Service not found');
    }
    if (result === 'in-use') {
      throw new ConflictException('This service has bookings');
    }
  }

  async createStaff(
    access: TenantAccess,
    input: StaffInput,
  ): Promise<StaffView> {
    const entitlements = await this.entitlements(access.tenant.id);
    const count = await this.catalog.countStaff(access.tenant.databaseName);
    if (
      !withinLimit(entitlements, 'maxStaff', count) ||
      (count > 0 && !allows(entitlements, 'multipleStaff'))
    ) {
      throw new ForbiddenException(
        'Your plan does not include another staff member',
      );
    }
    const created = await this.catalog.createStaff(
      access.tenant.databaseName,
      input,
    );
    if (created === 'missing-service') {
      throw new BadRequestException('Choose a service that exists');
    }
    return created;
  }

  async updateStaff(
    access: TenantAccess,
    id: string,
    input: Partial<Omit<StaffInput, 'serviceIds'>> & { active?: boolean },
  ): Promise<StaffView> {
    const updated = await this.catalog.updateStaff(
      access.tenant.databaseName,
      id,
      input,
    );
    if (!updated) {
      throw new NotFoundException('Staff member not found');
    }
    return updated;
  }

  async deleteStaff(access: TenantAccess, id: string): Promise<void> {
    const result = await this.catalog.deleteStaff(
      access.tenant.databaseName,
      id,
    );
    if (result === 'missing') {
      throw new NotFoundException('Staff member not found');
    }
    if (result === 'in-use') {
      throw new ConflictException('This staff member has bookings');
    }
  }

  async replaceStaffServices(
    access: TenantAccess,
    staffId: string,
    serviceIds: string[],
  ): Promise<void> {
    const result = await this.catalog.replaceStaffServices(
      access.tenant.databaseName,
      staffId,
      serviceIds,
    );
    if (result === 'missing') {
      throw new BadRequestException('Choose a service that exists');
    }
  }

  async replaceHours(
    access: TenantAccess,
    staffId: string | null,
    hours: HourRange[],
  ): Promise<void> {
    this.assertHours(hours, staffId === null);
    const result = await this.catalog.replaceHours(
      access.tenant.databaseName,
      staffId,
      hours,
    );
    if (result === 'missing-staff') {
      throw new NotFoundException('Staff member not found');
    }
  }

  async addTimeOff(
    access: TenantAccess,
    input: {
      staffId?: string;
      startsAt: string;
      endsAt: string;
      reason?: string | null;
    },
  ): Promise<TimeOffView> {
    const startsAt = DateTime.fromISO(input.startsAt, { setZone: true });
    const endsAt = DateTime.fromISO(input.endsAt, { setZone: true });
    if (!startsAt.isValid || !endsAt.isValid || startsAt >= endsAt) {
      throw new BadRequestException('Choose an end time after the start time');
    }
    const created = await this.catalog.addTimeOff(access.tenant.databaseName, {
      staffId: input.staffId ?? null,
      startsAt: startsAt.toJSDate(),
      endsAt: endsAt.toJSDate(),
      reason: input.reason ?? null,
    });
    if (created === 'missing-staff') {
      throw new NotFoundException('Staff member not found');
    }
    return created;
  }

  async deleteTimeOff(access: TenantAccess, id: string): Promise<void> {
    const deleted = await this.catalog.deleteTimeOff(
      access.tenant.databaseName,
      id,
    );
    if (!deleted) {
      throw new NotFoundException('Time off not found');
    }
  }

  async updateBranding(
    access: TenantAccess,
    input: BrandingInput,
  ): Promise<Workspace> {
    const entitlements = await this.entitlements(access.tenant.id);
    if (!allows(entitlements, 'customBranding')) {
      throw new ForbiddenException(
        'Your plan does not include custom branding',
      );
    }
    const workspace = await this.catalog.updateBranding(
      access.tenant.databaseName,
      input,
    );
    if (!workspace) {
      throw new NotFoundException('Business not found');
    }
    return workspace;
  }

  private assertHours(hours: HourRange[], requireOne: boolean): void {
    const problem = hourError(hours, requireOne);
    if (problem) {
      throw new BadRequestException(problem);
    }
  }

  private async entitlements(tenantId: string) {
    try {
      return parseEntitlements(await this.tenants.findEntitlements(tenantId));
    } catch {
      throw new ForbiddenException('Your plan does not include that');
    }
  }
}
