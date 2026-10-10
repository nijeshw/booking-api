import { z } from 'zod';

const limitSchema = z.number().int().positive().nullable();

export const entitlementsSchema = z
  .object({
    maxStaff: limitSchema,
    maxServices: limitSchema,
    deposits: z.boolean(),
    onlinePayments: z.boolean(),
    multipleStaff: z.boolean(),
    advancedBookingSettings: z.boolean(),
    customerHistory: z.boolean(),
    reports: z.boolean(),
    advancedReports: z.boolean(),
    customBranding: z.boolean(),
    multipleLocations: z.boolean(),
    teamPermissions: z.boolean(),
  })
  .strict();

export type Entitlements = z.infer<typeof entitlementsSchema>;

export type BooleanCapability = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

export type NumericLimit = {
  [K in keyof Entitlements]: Entitlements[K] extends number | null ? K : never;
}[keyof Entitlements];

export function parseEntitlements(value: unknown): Entitlements {
  return entitlementsSchema.parse(value);
}

export function allows(
  entitlements: Entitlements,
  capability: BooleanCapability,
): boolean {
  return entitlements[capability];
}

/** True when another item can be added. Null means the plan does not cap that resource. */
export function withinLimit(
  entitlements: Entitlements,
  limit: NumericLimit,
  current: number,
): boolean {
  const max = entitlements[limit];
  return max === null || current < max;
}
