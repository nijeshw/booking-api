import type {
  AdminTenant,
  BusinessAccount,
  TenantRecord,
  UserTenantLink,
} from './tenant.types';

export type NewBusiness = {
  id: string;
  slug: string;
  legalName: string;
  databaseName: string;
  timezone: string;
  currency: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  ownerUserId: string;
  planId: string;
  trialEndsAt: Date;
};

export interface TenantStore {
  isEmailVerified(userId: string): Promise<boolean>;
  findBySlug(slug: string): Promise<TenantRecord | null>;
  listActive(): Promise<TenantRecord[]>;
  listForUser(userId: string): Promise<UserTenantLink[]>;
  findUserTenant(userId: string, slug: string): Promise<UserTenantLink | null>;
  findUserByEmail(
    email: string,
  ): Promise<{ id: string; email: string; name: string | null } | null>;
  listBusinessAccounts(tenantId: string): Promise<BusinessAccount[]>;
  saveUserTenant(input: {
    tenantId: string;
    userId: string;
  }): Promise<'created' | 'updated'>;
  revokeUserTenant(tenantId: string, userId: string): Promise<'ok' | 'missing'>;
  findPlan(id: string): Promise<{ id: string; trialDays: number } | null>;
  findEntitlements(tenantId: string): Promise<unknown>;
  createBusiness(input: NewBusiness): Promise<TenantRecord>;
  markActive(id: string, schemaVersion: number): Promise<void>;
  updateLocale(id: string, timezone: string, currency: string): Promise<void>;
  findById(id: string): Promise<TenantRecord | null>;
  hasDatabaseLogin(id: string): Promise<boolean>;
  saveDatabaseLogin(
    id: string,
    databaseUser: string,
    databaseSecret: string,
  ): Promise<void>;
  listForAdmin(): Promise<AdminTenant[]>;
  setStatus(
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<'ok' | 'missing' | 'blocked'>;
}
