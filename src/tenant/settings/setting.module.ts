import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { TenancyModule } from '../../master/tenancy/tenancy.module';
import { TenantDatabaseModule } from '../database/tenant-database.module';
import { PrismaSettingStore } from './prisma-setting.store';
import { SettingController } from './setting.controller';
import { SettingService } from './setting.service';
import { SETTING_STORE } from './setting.store';

@Module({
  imports: [TenantDatabaseModule, AuthModule, TenancyModule],
  controllers: [SettingController],
  providers: [
    SettingService,
    PrismaSettingStore,
    { provide: SETTING_STORE, useExisting: PrismaSettingStore },
  ],
})
export class SettingModule {}
