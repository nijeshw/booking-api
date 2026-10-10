import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/tenant';
import { TenantConnections } from '../database/tenant-connections';
import type { SettingValue } from './setting.registry';
import type { SettingStore } from './setting.store';

@Injectable()
export class PrismaSettingStore implements SettingStore {
  constructor(private readonly connections: TenantConnections) {}

  async read(databaseName: string): Promise<Record<string, unknown>> {
    const rows = await this.connections
      .get(databaseName)
      .businessSetting.findMany();
    const stored: Record<string, unknown> = {};
    for (const row of rows) {
      stored[row.key] = row.value;
    }
    return stored;
  }

  async save(
    databaseName: string,
    values: Record<string, SettingValue>,
  ): Promise<void> {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      return;
    }
    const db = this.connections.get(databaseName);
    await db.$transaction(
      entries.map(([key, value]) =>
        db.businessSetting.upsert({
          where: { key },
          create: { key, value: jsonValue(value) },
          update: { value: jsonValue(value) },
        }),
      ),
    );
  }
}

function jsonValue(value: SettingValue): Prisma.InputJsonValue {
  return value;
}
