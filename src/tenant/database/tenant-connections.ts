import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../../generated/tenant';
import type { Env } from '../../config/env';
import {
  databaseUrlForLogin,
  openSecret,
} from '../../master/database/credential';
import { databaseUrlFor } from '../../master/database/database-url';
import { MasterPrismaService } from '../../master/database/master-prisma.service';

@Injectable()
export class TenantConnections implements OnModuleInit, OnModuleDestroy {
  private readonly clients = new Map<string, PrismaClient>();
  private readonly urls = new Map<string, string>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly master: MasterPrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.master.tenant.findMany({
      where: {
        databaseUser: { not: null },
        databaseSecret: { not: null },
      },
      select: {
        databaseName: true,
        databaseUser: true,
        databaseSecret: true,
      },
    });
    const masterUrl = this.config.getOrThrow('MASTER_DATABASE_URL', {
      infer: true,
    });
    const secret = this.config.getOrThrow('AUTH_SECRET', { infer: true });
    for (const row of rows) {
      if (!row.databaseUser || !row.databaseSecret) {
        continue;
      }
      this.urls.set(
        row.databaseName,
        databaseUrlForLogin(
          masterUrl,
          row.databaseName,
          row.databaseUser,
          openSecret(row.databaseSecret, secret),
        ),
      );
    }
  }

  register(databaseName: string, url: string): void {
    const existing = this.clients.get(databaseName);
    if (existing) {
      void existing.$disconnect();
      this.clients.delete(databaseName);
    }
    this.urls.set(databaseName, url);
  }

  get(databaseName: string): PrismaClient {
    const existing = this.clients.get(databaseName);
    if (existing) {
      return existing;
    }
    const client = new PrismaClient({
      datasources: {
        db: {
          url:
            this.urls.get(databaseName) ??
            databaseUrlFor(
              this.config.getOrThrow('MASTER_DATABASE_URL', { infer: true }),
              databaseName,
            ),
        },
      },
    });
    this.clients.set(databaseName, client);
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.clients.values()].map((client) => client.$disconnect()),
    );
  }
}
