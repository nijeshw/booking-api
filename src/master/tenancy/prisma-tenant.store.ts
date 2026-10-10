import { Injectable } from '@nestjs/common';
import { MasterPrismaService } from '../database/master-prisma.service';
import type { NewBusiness, TenantStore } from './tenant.store';
import type {
  AdminTenant,
  BusinessAccount,
  TenantRecord,
  UserTenantLink,
} from './tenant.types';

const tenantSelect = {
  id: true,
  slug: true,
  legalName: true,
  status: true,
  databaseName: true,
  timezone: true,
  currency: true,
  email: true,
  phone: true,
  addressLine1: true,
  city: true,
  postcode: true,
  country: true,
  ownerUserId: true,
  schemaVersion: true,
} as const;

@Injectable()
export class PrismaTenantStore implements TenantStore {
  constructor(private readonly prisma: MasterPrismaService) {}

  async isEmailVerified(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerifiedAt: true },
    });
    return user?.emailVerifiedAt != null;
  }

  findBySlug(slug: string): Promise<TenantRecord | null> {
    return this.prisma.tenant.findUnique({
      where: { slug },
      select: tenantSelect,
    });
  }

  listActive(): Promise<TenantRecord[]> {
    return this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: tenantSelect,
    });
  }

  async listForUser(userId: string): Promise<UserTenantLink[]> {
    const rows = await this.prisma.userTenant.findMany({
      where: { userId },
      select: {
        status: true,
        tenant: { select: tenantSelect },
      },
    });
    return rows;
  }

  async findUserTenant(
    userId: string,
    slug: string,
  ): Promise<UserTenantLink | null> {
    const row = await this.prisma.userTenant.findFirst({
      where: { userId, tenant: { slug } },
      select: {
        status: true,
        tenant: { select: tenantSelect },
      },
    });
    return row;
  }

  findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string; name: string | null } | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    });
  }

  async listBusinessAccounts(tenantId: string): Promise<BusinessAccount[]> {
    const rows = await this.prisma.userTenant.findMany({
      where: { tenantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: {
        userId: true,
        status: true,
        user: { select: { email: true, name: true } },
      },
    });
    return rows.map((row) => ({
      userId: row.userId,
      email: row.user.email,
      name: row.user.name,
      status: row.status,
    }));
  }

  async saveUserTenant(input: {
    tenantId: string;
    userId: string;
  }): Promise<'created' | 'updated'> {
    const existing = await this.prisma.userTenant.findUnique({
      where: {
        userId_tenantId: { userId: input.userId, tenantId: input.tenantId },
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.userTenant.update({
        where: {
          userId_tenantId: { userId: input.userId, tenantId: input.tenantId },
        },
        data: { status: 'ACTIVE' },
      });
      return 'updated';
    }
    await this.prisma.userTenant.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId,
        status: 'ACTIVE',
      },
    });
    return 'created';
  }

  async revokeUserTenant(
    tenantId: string,
    userId: string,
  ): Promise<'ok' | 'missing'> {
    const result = await this.prisma.userTenant.updateMany({
      where: { tenantId, userId, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    return result.count === 1 ? 'ok' : 'missing';
  }

  findPlan(id: string): Promise<{ id: string; trialDays: number } | null> {
    return this.prisma.plan.findUnique({
      where: { id },
      select: { id: true, trialDays: true },
    });
  }

  async findEntitlements(tenantId: string): Promise<unknown> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { entitlements: true } } },
    });
    return subscription?.plan.entitlements ?? null;
  }

  async createBusiness(input: NewBusiness): Promise<TenantRecord> {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          id: input.id,
          slug: input.slug,
          legalName: input.legalName,
          databaseName: input.databaseName,
          timezone: input.timezone,
          currency: input.currency,
          email: input.email,
          phone: input.phone,
          addressLine1: input.addressLine1,
          city: input.city,
          postcode: input.postcode,
          country: input.country,
          ownerUserId: input.ownerUserId,
        },
        select: tenantSelect,
      });
      await tx.userTenant.create({
        data: {
          userId: input.ownerUserId,
          tenantId: tenant.id,
          status: 'ACTIVE',
        },
      });
      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: input.planId,
          status: 'TRIALING',
          trialEndsAt: input.trialEndsAt,
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: tenant.id,
          userId: input.ownerUserId,
          action: 'tenant.created',
          entity: 'Tenant',
          entityId: tenant.id,
        },
      });
      return tenant;
    });
  }

  async markActive(id: string, schemaVersion: number): Promise<void> {
    await this.prisma.tenant.update({
      where: { id },
      data: { status: 'ACTIVE', schemaVersion },
    });
  }

  async updateLocale(
    id: string,
    timezone: string,
    currency: string,
  ): Promise<void> {
    await this.prisma.tenant.update({
      where: { id },
      data: { timezone, currency },
    });
  }

  findById(id: string): Promise<TenantRecord | null> {
    return this.prisma.tenant.findUnique({
      where: { id },
      select: tenantSelect,
    });
  }

  async hasDatabaseLogin(id: string): Promise<boolean> {
    const row = await this.prisma.tenant.findUnique({
      where: { id },
      select: { databaseUser: true },
    });
    return row?.databaseUser != null;
  }

  async saveDatabaseLogin(
    id: string,
    databaseUser: string,
    databaseSecret: string,
  ): Promise<void> {
    await this.prisma.tenant.update({
      where: { id },
      data: { databaseUser, databaseSecret },
    });
  }

  async listForAdmin(): Promise<AdminTenant[]> {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        legalName: true,
        status: true,
        timezone: true,
        currency: true,
        createdAt: true,
        databaseUser: true,
        subscription: { select: { status: true, planId: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      legalName: row.legalName,
      status: row.status,
      timezone: row.timezone,
      currency: row.currency,
      createdAt: row.createdAt,
      planId: row.subscription?.planId ?? null,
      subscriptionStatus: row.subscription?.status ?? null,
      hasDatabaseLogin: row.databaseUser != null,
    }));
  }

  async setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<'ok' | 'missing' | 'blocked'> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!tenant) {
      return 'missing';
    }
    if (tenant.status !== 'ACTIVE' && tenant.status !== 'SUSPENDED') {
      return 'blocked';
    }
    await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });
    return 'ok';
  }
}
