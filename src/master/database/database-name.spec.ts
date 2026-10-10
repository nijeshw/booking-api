import {
  assertSafeDatabaseName,
  quotedDatabaseName,
  tenantDatabaseName,
} from './database-name';

describe('database names', () => {
  it('builds a tenant database name from a uuid', () => {
    expect(tenantDatabaseName('018f3c2a-6c1e-7b2a-8d4e-9a0b1c2d3e4f')).toBe(
      'nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f',
    );
  });

  it('rejects identifiers that could change the connection target', () => {
    expect(() => assertSafeDatabaseName('nexora_master;drop')).toThrow(
      'Invalid database name',
    );
    expect(() => assertSafeDatabaseName('Nexora')).toThrow(
      'Invalid database name',
    );
    expect(() => tenantDatabaseName('not-a-uuid')).toThrow('Invalid tenant id');
  });

  it('quotes a safe name for CREATE DATABASE', () => {
    expect(quotedDatabaseName('nexora_t_abc')).toBe('"nexora_t_abc"');
    expect(() => quotedDatabaseName('nexora";drop database x;--')).toThrow(
      'Invalid database name',
    );
  });
});
