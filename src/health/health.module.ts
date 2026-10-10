import { Module } from '@nestjs/common';
import { MasterDatabaseModule } from '../master/database/database.module';
import { HealthController } from './health.controller';

@Module({
  imports: [MasterDatabaseModule],
  controllers: [HealthController],
})
export class HealthModule {}
