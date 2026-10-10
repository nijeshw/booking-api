import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import { settingsPatchSchema } from './setting.schema';
import { SettingService } from './setting.service';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class SettingController {
  constructor(private readonly settings: SettingService) {}

  @Get('settings')
  @TenantAccess({ permission: 'setup.view' })
  catalog(@CurrentTenant() access: Access) {
    return this.settings.catalog(access);
  }

  @Put('settings')
  @TenantAccess({ permission: 'setup.manage' })
  update(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.settings.update(access, parseBody(settingsPatchSchema, body));
  }
}
