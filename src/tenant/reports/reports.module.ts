import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TenancyModule } from '../../master/tenancy/tenancy.module';
import { TenantDatabaseModule } from '../database/tenant-database.module';
import { PrismaReportsStore } from './prisma-reports.store';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { REPORTS_STORE } from './reports.tokens';

@Module({
  imports: [TenantDatabaseModule, AuthModule, TenancyModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    PrismaReportsStore,
    { provide: REPORTS_STORE, useExisting: PrismaReportsStore },
  ],
})
export class ReportsModule {}
