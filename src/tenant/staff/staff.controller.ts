import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../guard/auth.guard';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import {
  staffInputSchema,
  staffPatchSchema,
  staffServicesSchema,
  timeOffSchema,
} from '../catalog/catalog.schema';
import { CatalogService } from '../catalog/catalog.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class StaffController {
  constructor(private readonly catalog: CatalogService) {}

  @Post('staff')
  @TenantAccess({ permission: 'staff.manage' })
  createStaff(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.catalog.createStaff(access, parseBody(staffInputSchema, body));
  }

  @Patch('staff/:id')
  @TenantAccess({ permission: 'staff.manage' })
  updateStaff(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.catalog.updateStaff(
      access,
      id,
      parseBody(staffPatchSchema, body),
    );
  }

  @Put('staff/:id/services')
  @TenantAccess({ permission: 'staff.manage' })
  async replaceStaffServices(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.catalog.replaceStaffServices(
      access,
      id,
      parseBody(staffServicesSchema, body).serviceIds,
    );
    return { status: 'saved' };
  }

  @Delete('staff/:id')
  @TenantAccess({ permission: 'staff.manage' })
  async deleteStaff(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.catalog.deleteStaff(access, id);
    return { status: 'deleted' };
  }

  @Post('time-off')
  @TenantAccess({ permission: 'setup.manage' })
  addTimeOff(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.catalog.addTimeOff(access, parseBody(timeOffSchema, body));
  }

  @Delete('time-off/:id')
  @TenantAccess({ permission: 'setup.manage' })
  async deleteTimeOff(
    @CurrentTenant() access: Access,
    @Param('id') id: string,
  ) {
    await this.catalog.deleteTimeOff(access, id);
    return { status: 'deleted' };
  }
}
