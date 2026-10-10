export type SettingValue = boolean | number | string;

export type SettingType = 'boolean' | 'number' | 'string';

export type SettingOption = {
  value: string;
  label: string;
};

export type SettingDefinition = {
  key: string;
  group: string;
  label: string;
  description: string;
  type: SettingType;
  defaultValue: SettingValue;
  public: boolean;
  options?: readonly SettingOption[];
  min?: number;
  max?: number;
};

export const SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    key: 'booking.showPrice',
    group: 'Public booking page',
    label: 'Show price',
    description: 'Customers see the price on each service.',
    type: 'boolean',
    defaultValue: true,
    public: true,
  },
  {
    key: 'booking.showDuration',
    group: 'Public booking page',
    label: 'Show duration',
    description: 'Customers see how long each service lasts.',
    type: 'boolean',
    defaultValue: true,
    public: true,
  },
  {
    key: 'booking.showStaffName',
    group: 'Public booking page',
    label: 'Show staff name',
    description: 'Customers see the name of the person on the booking page.',
    type: 'boolean',
    defaultValue: true,
    public: true,
  },
];

const BY_KEY = new Map(
  SETTING_DEFINITIONS.map((item) => [item.key, item]),
);

export type SettingField = {
  key: string;
  label: string;
  description: string;
  type: SettingType;
  value: SettingValue;
  options?: readonly SettingOption[];
};

export type SettingGroupView = {
  label: string;
  items: SettingField[];
};

export function definition(key: string): SettingDefinition | undefined {
  return BY_KEY.get(key);
}

export function acceptValue(
  item: SettingDefinition,
  value: unknown,
): SettingValue | null {
  if (item.type === 'boolean') {
    return typeof value === 'boolean' ? value : null;
  }
  if (item.type === 'number') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return null;
    }
    if (item.min !== undefined && value < item.min) {
      return null;
    }
    if (item.max !== undefined && value > item.max) {
      return null;
    }
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    return null;
  }
  if (item.options && !item.options.some((option) => option.value === trimmed)) {
    return null;
  }
  return trimmed;
}

export function resolveSettings(
  stored: Record<string, unknown>,
): Record<string, SettingValue> {
  const resolved: Record<string, SettingValue> = {};
  for (const item of SETTING_DEFINITIONS) {
    resolved[item.key] = acceptValue(item, stored[item.key]) ?? item.defaultValue;
  }
  return resolved;
}

export function publicSettings(
  stored: Record<string, unknown>,
): Record<string, SettingValue> {
  const resolved = resolveSettings(stored);
  const page: Record<string, SettingValue> = {};
  for (const item of SETTING_DEFINITIONS) {
    if (item.public) {
      page[item.key] = resolved[item.key];
    }
  }
  return page;
}

export function settingCatalog(
  stored: Record<string, unknown>,
): SettingGroupView[] {
  const values = resolveSettings(stored);
  const groups = new Map<string, SettingField[]>();
  for (const item of SETTING_DEFINITIONS) {
    const items = groups.get(item.group) ?? [];
    items.push({
      key: item.key,
      label: item.label,
      description: item.description,
      type: item.type,
      value: values[item.key],
      ...(item.options ? { options: item.options } : {}),
    });
    groups.set(item.group, items);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
