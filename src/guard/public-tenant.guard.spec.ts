import { HttpException, HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PUBLIC_LOCK_MESSAGE } from '../master/billing/billing-lock';
import type { TenantService } from '../master/tenancy/tenant.service';
import type { TenantRecord } from '../master/tenancy/tenant.types';
import { PublicTenantGuard } from './public-tenant.guard';

const tenant = {
  id: 'tenant-1',
  slug: 'ada-studio',
} as TenantRecord;

function contextFor(header?: string): ExecutionContext {
  const request = {
    header: (name: string) => (name === 'x-tenant-slug' ? header : undefined),
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('PublicTenantGuard', () => {
  it('opens a business whose subscription is current', async () => {
    const tenants = {
      open: jest.fn().mockResolvedValue(tenant),
    };
    const guard = new PublicTenantGuard(tenants as unknown as TenantService);

    await expect(guard.canActivate(contextFor('ada-studio'))).resolves.toBe(
      true,
    );
    expect(tenants.open).toHaveBeenCalledWith('ada-studio');
  });

  it('stops public booking when the business refuses to open', async () => {
    const locked = new HttpException(
      PUBLIC_LOCK_MESSAGE,
      HttpStatus.PAYMENT_REQUIRED,
    );
    const tenants = {
      open: jest.fn().mockRejectedValue(locked),
    };
    const guard = new PublicTenantGuard(tenants as unknown as TenantService);

    await expect(guard.canActivate(contextFor('ada-studio'))).rejects.toBe(
      locked,
    );
  });
});
