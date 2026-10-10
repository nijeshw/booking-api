import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { loadEnv } from './config/env';
import { HealthModule } from './health/health.module';
import { AdminModule } from './master/admin/admin.module';
import { BillingModule } from './master/billing/billing.module';
import { TenancyModule } from './master/tenancy/tenancy.module';
import { BookingModule } from './tenant/booking/booking.module';
import { CatalogModule } from './tenant/catalog/catalog.module';
import { ReportsModule } from './tenant/reports/reports.module';
import { SettingModule } from './tenant/settings/setting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config: Record<string, unknown>) => loadEnv(config),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
    }),
    HealthModule,
    AuthModule,
    TenancyModule,
    BillingModule,
    AdminModule,
    CatalogModule,
    BookingModule,
    ReportsModule,
    SettingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
