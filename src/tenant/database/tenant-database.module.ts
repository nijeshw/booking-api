import { Module } from '@nestjs/common';
import { MasterDatabaseModule } from '../../master/database/database.module';
import { TenantConnections } from './tenant-connections';

@Module({
  imports: [MasterDatabaseModule],
  providers: [TenantConnections],
  exports: [TenantConnections],
})
export class TenantDatabaseModule {}
