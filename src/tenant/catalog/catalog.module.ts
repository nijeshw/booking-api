import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TenancyModule } from '../../master/tenancy/tenancy.module';
import { TenantDatabaseModule } from '../database/tenant-database.module';
import { HoursController } from '../hours/hours.controller';
import { OnboardingController } from '../onboarding/onboarding.controller';
import { ServicesController } from '../services/services.controller';
import { StaffController } from '../staff/staff.controller';
import { CatalogService } from './catalog.service';
import { CATALOG_STORE } from './catalog.tokens';
import { PrismaCatalogStore } from './prisma-catalog.store';

@Module({
  imports: [TenantDatabaseModule, AuthModule, TenancyModule],
  controllers: [
    OnboardingController,
    ServicesController,
    StaffController,
    HoursController,
  ],
  providers: [
    CatalogService,
    PrismaCatalogStore,
    { provide: CATALOG_STORE, useExisting: PrismaCatalogStore },
  ],
})
export class CatalogModule {}
