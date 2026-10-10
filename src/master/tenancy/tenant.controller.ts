import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { parseBody } from '../../common/parse-body';
import { CurrentUser } from '../../decorator/current-user.decorator';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { AuthGuard } from '../../guard/auth.guard';
import { readTenantSlug, TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from './tenant.types';
import {
  createRoleSchema,
  createTenantSchema,
  grantAccessSchema,
  revokeAccessSchema,
  savePermissionsSchema,
  updateAccessSchema,
} from './tenant.schema';
import { TenantService } from './tenant.service';

@Controller('tenants')
@UseGuards(AuthGuard)
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.tenants.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() body: unknown) {
    return this.tenants.create(user.id, parseBody(createTenantSchema, body));
  }

  @Get('permissions')
  @UseGuards(TenantGuard)
  permissions(@CurrentTenant() access: Access) {
    return this.tenants.permissionSettings(access);
  }

  @Put('permissions')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  async savePermissions(
    @CurrentTenant() access: Access,
    @Body() body: unknown,
  ): Promise<{ status: 'saved' }> {
    const input = parseBody(savePermissionsSchema, body);
    await this.tenants.savePermissions(access, input.role, input.permissions);
    return { status: 'saved' };
  }

  @Get('user-tenants')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  listUsers(@CurrentTenant() access: Access) {
    return this.tenants.listBusinessUsers(access);
  }

  @Post('user-tenants')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  grant(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.tenants.grantAccess(access, parseBody(grantAccessSchema, body));
  }

  @Put('user-tenants')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  updateUser(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.tenants.updateAccess(
      access,
      parseBody(updateAccessSchema, body),
    );
  }

  @Delete('user-tenants')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  async revokeUser(
    @CurrentTenant() access: Access,
    @Body() body: unknown,
  ): Promise<{ status: 'removed' }> {
    await this.tenants.revokeAccess(
      access,
      parseBody(revokeAccessSchema, body),
    );
    return { status: 'removed' };
  }

  @Post('roles')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  createRole(@CurrentTenant() access: Access, @Body() body: unknown) {
    return this.tenants.createRole(access, parseBody(createRoleSchema, body));
  }

  @Delete('roles/:role')
  @UseGuards(TenantGuard)
  @TenantAccess({ permission: 'people.manage' })
  async removeRole(
    @CurrentTenant() access: Access,
    @Param('role') role: string,
  ): Promise<{ status: 'removed' }> {
    await this.tenants.deleteRole(access, role);
    return { status: 'removed' };
  }

  @Post('provision')
  retry(@CurrentUser() user: { id: string }, @Req() request: Request) {
    const slug = readTenantSlug(request);
    if (!slug) {
      throw new BadRequestException('Tenant slug is required');
    }
    return this.tenants.retry(user.id, slug);
  }
}
