import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../guard/auth.guard';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import {
  serviceInputSchema,
  servicePatchSchema,
} from '../catalog/catalog.schema';
import { CatalogService } from '../catalog/catalog.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class ServicesController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('services')
  @TenantAccess({ permission: 'services.manage' })
  createService(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.catalog.createService(
      access,
      parseBody(serviceInputSchema, body),
    );
  }

  @Patch('services/:id')
  @TenantAccess({ permission: 'services.manage' })
  updateService(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.updateService(
      access,
      id,
      parseBody(servicePatchSchema, body),
    );
  }

  @Delete('services/:id')
  @TenantAccess({ permission: 'services.manage' })
  async deleteService(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.catalog.deleteService(access, id);
    return { status: 'deleted' };
  }
}
