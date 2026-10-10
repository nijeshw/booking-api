import type { SettingValue } from './setting.registry';

export interface SettingStore {
  read(databaseName: string): Promise<Record<string, unknown>>;
  save(
    databaseName: string,
    values: Record<string, SettingValue>,
  ): Promise<void>;
}

export const SETTING_STORE = Symbol('SETTING_STORE');
