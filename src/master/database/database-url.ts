import { assertSafeDatabaseName } from './database-name';

export function databaseUrlFor(
  masterUrl: string,
  databaseName: string,
): string {
  assertSafeDatabaseName(databaseName);
  const url = new URL(masterUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
