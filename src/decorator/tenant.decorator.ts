import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { TenantRequest } from '../guard/tenant.guard';
import type { PermissionKey } from '../tenant/roles/permission';
import type {
  TenantAccess,
  TenantRole,
  TenantStatus,
} from '../master/tenancy/tenant.types';

export const TENANT_ACCESS = 'tenant_access';
export const ALLOW_UNPAID = 'allow_unpaid_subscription';

export function AllowUnpaidSubscription(): MethodDecorator {
  return SetMetadata(ALLOW_UNPAID, true);
}

export function TenantAccess(options: {
  permission?: PermissionKey;
  roles?: TenantRole[];
  statuses?: TenantStatus[];
}): MethodDecorator {
  return SetMetadata(TENANT_ACCESS, options);
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantAccess => {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.tenantAccess) {
      throw new Error('Tenant access is missing');
    }
    return request.tenantAccess;
  },
);
