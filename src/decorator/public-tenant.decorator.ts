import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { PublicTenantRequest } from '../guard/public-tenant.guard';
import type { TenantRecord } from '../master/tenancy/tenant.types';

export const CurrentPublicTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantRecord => {
    const request = context.switchToHttp().getRequest<PublicTenantRequest>();
    if (!request.publicTenant) {
      throw new Error('Public tenant is missing');
    }
    return request.publicTenant;
  },
);
