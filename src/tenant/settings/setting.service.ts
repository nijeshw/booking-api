import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import type { SettingsPatch } from './setting.schema';
import {
  acceptValue,
  definition,
  settingCatalog,
  type SettingGroupView,
  type SettingValue,
} from './setting.registry';
import { SETTING_STORE, type SettingStore } from './setting.store';

@Injectable()
export class SettingService {
  constructor(@Inject(SETTING_STORE) private readonly settings: SettingStore) {}

  async catalog(access: TenantAccess): Promise<{ groups: SettingGroupView[] }> {
    const stored = await this.settings.read(access.tenant.databaseName);
    return { groups: settingCatalog(stored) };
  }

  async update(
    access: TenantAccess,
    input: SettingsPatch,
  ): Promise<{ groups: SettingGroupView[] }> {
    const next: Record<string, SettingValue> = {};
    const invalid: string[] = [];
    for (const [key, value] of Object.entries(input.values)) {
      const item = definition(key);
      const accepted = item ? acceptValue(item, value) : null;
      if (!item || accepted === null) {
        invalid.push(key);
        continue;
      }
      next[key] = accepted;
    }
    if (invalid.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid input',
        fields: invalid,
      });
    }
    await this.settings.save(access.tenant.databaseName, next);
    return this.catalog(access);
  }
}
