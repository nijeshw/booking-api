import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../guard/auth.guard';
import { AuthService } from '../../auth/auth.service';
import { parseBody } from '../../common/parse-body';
import { CurrentTenant, TenantAccess } from '../../decorator/tenant.decorator';
import { TenantGuard } from '../../guard/tenant.guard';
import type { TenantAccess as Access } from '../../master/tenancy/tenant.types';
import { brandingSchema, onboardingSchema } from '../catalog/catalog.schema';
import { CatalogService } from '../catalog/catalog.service';
import type { Workspace } from '../catalog/catalog.store';

@Controller('tenants')
@UseGuards(AuthGuard, TenantGuard)
export class OnboardingController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly auth: AuthService,
  ) {}

  @Get('workspace')
  @TenantAccess({ permission: 'setup.view' })
  workspace(@CurrentTenant() access: Access) {
    return this.catalog.workspace(access);
  }

  @Post('onboarding')
  @TenantAccess({ permission: 'setup.manage' })
  async onboard(@CurrentTenant() access: Access, @Body() body: unknown) {
    const user = await this.auth.me(access.userId);
    return this.catalog.onboard(access, parseBody(onboardingSchema, body), {
      userId: user.id,
      name: user.name ?? access.tenant.legalName,
      email: user.email,
    });
  }

  @Put('profile')
  @TenantAccess({ permission: 'setup.manage' })
  updateBranding(
    @CurrentTenant() access: Access,
    @Body() body: unknown,
  ): Promise<Workspace> {
    return this.catalog.updateBranding(access, parseBody(brandingSchema, body));
  }
}
