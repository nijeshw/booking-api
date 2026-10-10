const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const TENANT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertSafeDatabaseName(databaseName: string): void {
  if (!DATABASE_NAME.test(databaseName)) {
    throw new Error('Invalid database name');
  }
}

export function tenantDatabaseName(tenantId: string): string {
  if (!TENANT_ID.test(tenantId)) {
    throw new Error('Invalid tenant id');
  }
  return `nexora_t_${tenantId.replaceAll('-', '')}`;
}

export function quotedDatabaseName(databaseName: string): string {
  assertSafeDatabaseName(databaseName);
  return `"${databaseName}"`;
}
