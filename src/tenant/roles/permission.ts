import type { TenantRole } from '../../master/tenancy/tenant.types';

export const PERMISSIONS = [
  { key: 'setup.view', label: 'View setup' },
  { key: 'setup.manage', label: 'Change branding, hours, and time off' },
  { key: 'services.manage', label: 'Add, edit, and delete services' },
  { key: 'staff.manage', label: 'Add, edit, and delete staff' },
  { key: 'calendar.view', label: 'View the calendar' },
  { key: 'calendar.manage', label: 'Cancel bookings' },
  { key: 'customers.view', label: 'View customers' },
  { key: 'customers.manage', label: 'Add, export, and erase customers' },
  { key: 'reports.view', label: 'View reports' },
  { key: 'billing.view', label: 'View billing' },
  { key: 'billing.manage', label: 'Change the subscription' },
  { key: 'people.manage', label: 'Choose who can open the business' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

const KEYS = new Set<string>(PERMISSIONS.map((item) => item.key));

export function permissionKeys(): PermissionKey[] {
  return PERMISSIONS.map((item) => item.key);
}

export function isPermissionKey(value: string): value is PermissionKey {
  return KEYS.has(value);
}

export function allows(
  access: { role: TenantRole; permissions?: readonly string[] },
  key: PermissionKey,
): boolean {
  if (access.role === 'OWNER') {
    return true;
  }
  return access.permissions?.includes(key) ?? false;
}
