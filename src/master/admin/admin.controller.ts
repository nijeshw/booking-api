import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../common/parse-body';
import { AuthGuard } from '../../guard/auth.guard';
import { PlatformGuard } from '../../guard/platform.guard';
import { TenantService } from '../tenancy/tenant.service';
import type { AdminTenant } from '../tenancy/tenant.types';

const tenantIdSchema = z.string().uuid();

@Controller('admin')
@UseGuards(AuthGuard, PlatformGuard)
export class AdminController {
  constructor(private readonly tenants: TenantService) {}

  @Get('tenants')
  list(): Promise<AdminTenant[]> {
    return this.tenants.listForAdmin();
  }

  @Post('tenants/:id/suspend')
  suspend(@Param('id') id: string): Promise<void> {
    return this.tenants.setStatus(parseBody(tenantIdSchema, id), 'SUSPENDED');
  }

  @Post('tenants/:id/activate')
  activate(@Param('id') id: string): Promise<void> {
    return this.tenants.setStatus(parseBody(tenantIdSchema, id), 'ACTIVE');
  }

  @Post('tenants/:id/database-login')
  databaseLogin(@Param('id') id: string): Promise<void> {
    return this.tenants.issueDatabaseLogin(parseBody(tenantIdSchema, id));
  }
}
