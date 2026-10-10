import type { TenantRole } from '../../master/tenancy/tenant.types';

export const ROLE_STORE = Symbol('ROLE_STORE');

export type AssignedRole = {
  userId: string;
  role: TenantRole;
};

export type RolePermissionSet = {
  role: string;
  label: string;
  system: boolean;
  locked: boolean;
  permissions: string[];
};

export function roleKey(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export interface RoleStore {
  findRole(databaseName: string, userId: string): Promise<TenantRole | null>;
  listRoles(databaseName: string): Promise<AssignedRole[]>;
  assign(databaseName: string, userId: string, role: TenantRole): Promise<void>;
  removeUser(databaseName: string, userId: string): Promise<void>;
  permissionsFor(databaseName: string, role: TenantRole): Promise<string[]>;
  permissionMatrix(databaseName: string): Promise<RolePermissionSet[]>;
  replacePermissions(
    databaseName: string,
    role: string,
    keys: string[],
  ): Promise<void>;
  createRole(
    databaseName: string,
    name: string,
    label: string,
  ): Promise<RolePermissionSet>;
  deleteRole(databaseName: string, role: string): Promise<void>;
}
