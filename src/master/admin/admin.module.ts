import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PlatformGuard } from '../../guard/platform.guard';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuthModule, TenancyModule],
  controllers: [AdminController],
  providers: [PlatformGuard],
})
export class AdminModule {}
