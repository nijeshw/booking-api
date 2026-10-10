import { BadRequestException } from '@nestjs/common';
import type { TenantAccess } from '../../master/tenancy/tenant.types';
import { SettingService } from './setting.service';
import type { SettingValue } from './setting.registry';
import type { SettingStore } from './setting.store';

const access: TenantAccess = {
  userId: 'user-1',
  role: 'OWNER',
  tenant: {
    id: 'tenant-1',
    slug: 'ada-studio',
    legalName: 'Ada Studio',
    status: 'ACTIVE',
    databaseName: 'nexora_t_ada',
    timezone: 'Europe/London',
    currency: 'GBP',
    email: null,
    phone: null,
    addressLine1: null,
    city: null,
    postcode: null,
    country: null,
    ownerUserId: 'user-1',
    schemaVersion: 1,
  },
};

class MemorySettings implements SettingStore {
  rows: Record<string, unknown> = {};
  saved: Record<string, SettingValue> | null = null;

  read() {
    return Promise.resolve(this.rows);
  }

  save(_databaseName: string, values: Record<string, SettingValue>) {
    this.saved = values;
    this.rows = { ...this.rows, ...values };
    return Promise.resolve();
  }
}

describe('SettingService', () => {
  it('returns defaults before anything is saved', async () => {
    const service = new SettingService(new MemorySettings());
    const catalog = await service.catalog(access);
    expect(catalog.groups[0]?.items.map((item) => item.value)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it('saves a known setting and reads it back', async () => {
    const store = new MemorySettings();
    const service = new SettingService(store);
    const catalog = await service.update(access, {
      values: { 'booking.showPrice': false },
    });
    expect(store.saved).toEqual({ 'booking.showPrice': false });
    expect(
      catalog.groups[0]?.items.find((item) => item.key === 'booking.showPrice')
        ?.value,
    ).toBe(false);
  });

  it('rejects a setting the registry does not know', async () => {
    const service = new SettingService(new MemorySettings());
    await expect(
      service.update(access, { values: { 'booking.unknown': true } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
