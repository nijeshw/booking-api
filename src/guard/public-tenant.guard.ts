import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { TenantService } from '../master/tenancy/tenant.service';
import type { TenantRecord } from '../master/tenancy/tenant.types';
import { readTenantSlug } from './tenant.guard';

export type PublicTenantRequest = {
  header(name: string): string | string[] | undefined;
  publicTenant?: TenantRecord;
};

@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(private readonly tenants: TenantService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicTenantRequest>();
    const slug = readTenantSlug(request);
    if (!slug) {
      return false;
    }
    request.publicTenant = await this.tenants.open(slug);
    return true;
  }
}
