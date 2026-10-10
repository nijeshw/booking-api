import { Module } from '@nestjs/common';
import { MasterPrismaService } from './master-prisma.service';

@Module({
  providers: [MasterPrismaService],
  exports: [MasterPrismaService],
})
export class MasterDatabaseModule {}
