import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../../generated/master';
import type { Env } from '../../config/env';

@Injectable()
export class MasterPrismaService
  extends PrismaClient
  implements OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      datasources: {
        db: { url: config.getOrThrow('MASTER_DATABASE_URL') },
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
