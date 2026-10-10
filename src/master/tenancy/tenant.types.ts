export type TenantStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type TenantRole = string;

export type TenantRecord = {
  id: string;
  slug: string;
  legalName: string;
  status: TenantStatus;
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
  schemaVersion: number;
};

export type UserTenantLink = {
  status: 'INVITED' | 'ACTIVE' | 'REVOKED';
  subscriptionStatus: string | null;
  tenant: TenantRecord;
};

export type UserTenantView = UserTenantLink & {
  role: TenantRole;
};

export type BusinessAccount = {
  userId: string;
  email: string;
  name: string | null;
  status: 'INVITED' | 'ACTIVE' | 'REVOKED';
};

export type BusinessUser = {
  email: string;
  name: string | null;
  role: TenantRole;
  status: 'INVITED' | 'ACTIVE' | 'REVOKED';
};

export type TenantAccess = {
  userId: string;
  role: TenantRole;
  permissions?: string[];
  subscriptionStatus?: string | null;
  tenant: TenantRecord;
};

export type PermissionCatalogItem = {
  key: string;
  label: string;
};

export type RolePermissions = {
  role: string;
  label: string;
  system: boolean;
  locked: boolean;
  permissions: string[];
};

export type PermissionSettings = {
  mine: string[];
  catalog: PermissionCatalogItem[];
  roles: RolePermissions[];
};

export type AdminTenant = {
  id: string;
  slug: string;
  legalName: string;
  status: TenantStatus;
  timezone: string;
  currency: string;
  createdAt: Date;
  planId: string | null;
  subscriptionStatus: string | null;
  hasDatabaseLogin: boolean;
};
