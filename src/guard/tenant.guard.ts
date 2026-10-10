import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_UNPAID, TENANT_ACCESS } from '../decorator/tenant.decorator';
import {
  BILLING_LOCK_MESSAGE,
  subscriptionLocksApp,
} from '../master/billing/billing-lock';
import { TenantService } from '../master/tenancy/tenant.service';
import type { PermissionKey } from '../tenant/roles/permission';
import type {
  TenantAccess,
  TenantRole,
  TenantStatus,
} from '../master/tenancy/tenant.types';
import type { AuthRequest } from './auth.guard';

export const TENANT_SLUG_HEADER = 'x-tenant-slug';

export type TenantRequest = AuthRequest & { tenantAccess?: TenantAccess };

export function readTenantSlug(request: {
  header(name: string): string | string[] | undefined;
}): string | undefined {
  const value = request.header(TENANT_SLUG_HEADER);
  if (typeof value !== 'string') {
    return undefined;
  }
  const slug = value.trim();
  return slug.length > 0 ? slug : undefined;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly tenants: TenantService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const slug = readTenantSlug(request);
    if (!request.user || !slug) {
      return false;
    }
    const options =
      this.reflector.get<{
        permission?: PermissionKey;
        roles?: TenantRole[];
        statuses?: TenantStatus[];
      }>(TENANT_ACCESS, context.getHandler()) ?? {};
    request.tenantAccess = await this.tenants.access({
      userId: request.user.id,
      slug,
      permission: options.permission,
      roles: options.roles,
      statuses: options.statuses,
    });
    const allowUnpaid = this.reflector.get<boolean>(
      ALLOW_UNPAID,
      context.getHandler(),
    );
    if (
      !allowUnpaid &&
      subscriptionLocksApp(request.tenantAccess.subscriptionStatus)
    ) {
      throw new HttpException(
        BILLING_LOCK_MESSAGE,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
