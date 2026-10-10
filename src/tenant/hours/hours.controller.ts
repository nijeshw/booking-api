import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guard/auth.guard';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import { hoursBodySchema } from '../catalog/catalog.schema';
import { CatalogService } from '../catalog/catalog.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class HoursController {
  constructor(private readonly catalog: CatalogService) {}

  @Put('hours')
  @TenantAccess({ permission: 'setup.manage' })
  async replaceHours(@CurrentTenant() access: Access, @Body() body: unknown) {
    await this.catalog.replaceHours(
      access,
      null,
      parseBody(hoursBodySchema, body).hours,
    );
    return { status: 'saved' };
  }

  @Put('staff/:id/hours')
  @TenantAccess({ permission: 'setup.manage' })
  async replaceStaffHours(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.catalog.replaceHours(
      access,
      id,
      parseBody(hoursBodySchema, body).hours,
    );
    return { status: 'saved' };
  }
}
