import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MasterDatabaseModule } from '../database/database.module';
import { TenantLogins } from '../database/tenant-logins';
import { TenantDatabaseModule } from '../../tenant/database/tenant-database.module';
import { PostgresProvisioner } from './provisioner';
import { PrismaTenantStore } from './prisma-tenant.store';
import { PROVISIONER, TENANT_STORE } from './tenancy.tokens';
import { TenantController } from './tenant.controller';
import { TenantGuard } from '../../guard/tenant.guard';
import { ROLE_STORE } from '../../tenant/roles/role.store';
import { PrismaRoleStore } from '../../tenant/roles/prisma-role.store';
import { TenantService } from './tenant.service';

@Module({
  imports: [MasterDatabaseModule, AuthModule, TenantDatabaseModule],
  controllers: [TenantController],
  providers: [
    TenantService,
    TenantLogins,
    TenantGuard,
    PrismaTenantStore,
    PrismaRoleStore,
    PostgresProvisioner,
    { provide: ROLE_STORE, useExisting: PrismaRoleStore },
    { provide: TENANT_STORE, useExisting: PrismaTenantStore },
    { provide: PROVISIONER, useExisting: PostgresProvisioner },
  ],
  exports: [TenantService, TenantGuard, TENANT_STORE],
})
export class TenancyModule {}
