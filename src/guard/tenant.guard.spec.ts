import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { TenantService } from '../master/tenancy/tenant.service';
import type { TenantAccess } from '../master/tenancy/tenant.types';
import { readTenantSlug, TenantGuard } from './tenant.guard';

const access: TenantAccess = {
  userId: 'user-1',
  role: 'OWNER',
  tenant: {
    id: 'tenant-1',
    slug: 'ada-studio',
    legalName: 'Ada Studio',
    status: 'ACTIVE',
    databaseName: 'nexora_t_ada',
    timezone: 'Europe/London',
    currency: 'GBP',
    email: null,
    phone: null,
    addressLine1: null,
    city: null,
    postcode: null,
    country: null,
    ownerUserId: 'user-1',
    schemaVersion: 1,
  },
};

function contextFor(input: {
  header?: string | string[];
  paramSlug?: string;
  userId?: string;
}): ExecutionContext & { request: { tenantAccess?: TenantAccess } } {
  const request: {
    header(name: string): string | string[] | undefined;
    params: { slug?: string };
    user?: { id: string };
    tenantAccess?: TenantAccess;
  } = {
    header: (name) => (name === 'x-tenant-slug' ? input.header : undefined),
    params: { slug: input.paramSlug },
    user: input.userId ? { id: input.userId } : undefined,
  };
  return {
    request,
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
  } as unknown as ExecutionContext & {
    request: { tenantAccess?: TenantAccess };
  };
}

describe('readTenantSlug', () => {
  it('reads and trims the tenant header', () => {
    expect(
      readTenantSlug({
        header: (name) =>
          name === 'x-tenant-slug' ? '  ada-studio  ' : undefined,
      }),
    ).toBe('ada-studio');
  });

  it('rejects a missing, blank, or repeated header', () => {
    expect(readTenantSlug({ header: () => undefined })).toBeUndefined();
    expect(readTenantSlug({ header: () => '   ' })).toBeUndefined();
    expect(readTenantSlug({ header: () => ['ada', 'bea'] })).toBeUndefined();
  });
});

describe('TenantGuard', () => {
  it('resolves the tenant from the header and ignores a slug in the path', async () => {
    const tenants = {
      access: jest.fn().mockResolvedValue(access),
    };
    const reflector = { get: jest.fn().mockReturnValue(undefined) };
    const guard = new TenantGuard(
      tenants as unknown as TenantService,
      reflector as unknown as Reflector,
    );
    const context = contextFor({
      header: 'ada-studio',
      paramSlug: 'other-studio',
      userId: 'user-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tenants.access).toHaveBeenCalledWith({
      userId: 'user-1',
      slug: 'ada-studio',
      permission: undefined,
      roles: undefined,
      statuses: undefined,
    });
    expect(context.request.tenantAccess).toBe(access);
  });

  it('rejects a signed-in request that has no tenant header', async () => {
    const tenants = { access: jest.fn() };
    const guard = new TenantGuard(
      tenants as unknown as TenantService,
      { get: jest.fn() } as unknown as Reflector,
    );

    await expect(
      guard.canActivate(
        contextFor({ paramSlug: 'ada-studio', userId: 'user-1' }),
      ),
    ).resolves.toBe(false);
    expect(tenants.access).not.toHaveBeenCalled();
  });
});
