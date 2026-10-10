import { z } from 'zod';
import { isTimezone } from '../../master/tenancy/slug';

const hourRangeSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

const optionalEmail = z
  .union([z.string().trim().email().max(254), z.literal('')])
  .optional()
  .transform((value) => (value ? value.toLowerCase() : null));

export const serviceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(500),
  durationMinutes: z.number().int().min(5).max(480),
  priceAmountMinor: z.number().int().min(0).max(10_000_000),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  bufferBeforeMinutes: z.number().int().min(0).max(240).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(240).default(0),
  active: z.boolean().default(true),
});

const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      return value.length > 0 ? value : null;
    });

export const servicePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: patchText(500),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  priceAmountMinor: z.number().int().min(0).max(10_000_000).optional(),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/))
    .optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(240).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(240).optional(),
  active: z.boolean().optional(),
});

export const policySchema = z.object({
  minNoticeMinutes: z.number().int().min(0).max(10_080).default(60),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  cancellationWindowMinutes: z.number().int().min(0).max(43_200).default(1440),
  allowCustomerCancel: z.boolean().default(true),
  allowCustomerReschedule: z.boolean().default(true),
  slotIntervalMinutes: z
    .number()
    .int()
    .refine((value) => [5, 10, 15, 20, 30, 60].includes(value))
    .default(15),
});

export const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  locationType: z.enum(['PHYSICAL', 'MOBILE', 'ONLINE']),
  email: optionalEmail,
  phone: optionalText(40),
  website: z
    .union([z.string().trim().url().max(200), z.literal('')])
    .optional(),
  addressLine1: optionalText(120),
  addressLine2: optionalText(120),
  city: optionalText(80),
  postcode: optionalText(16),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .default('GB'),
  timezone: z.string().refine(isTimezone),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/)),
  hours: z.array(hourRangeSchema).max(28),
  service: serviceInputSchema,
  policy: policySchema.optional(),
});

export const staffInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: optionalEmail,
  phone: optionalText(40),
  serviceIds: z.array(z.string().uuid()).max(100).default([]),
});

const patchEmail = z
  .union([z.string().trim().email().max(254), z.literal('')])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    return value ? value.toLowerCase() : null;
  });

export const staffPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: patchEmail,
  phone: patchText(40),
  active: z.boolean().optional(),
});

export const staffServicesSchema = z.object({
  serviceIds: z.array(z.string().uuid()).max(100),
});

export const hoursBodySchema = z.object({
  hours: z.array(hourRangeSchema).max(28),
});

export const timeOffSchema = z.object({
  staffId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: optionalText(200),
});

export const brandingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length > 0 ? value : null)),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        return;
      }
      if (!/^https?:\/\//.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid logo URL' });
      }
    })
    .transform((value) => (value.length > 0 ? value : null)),
  brandColor: z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (value.length === 0) {
        return;
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Invalid brand color' });
      }
    })
    .transform((value) => (value.length > 0 ? value.toLowerCase() : null)),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type StaffInput = z.infer<typeof staffInputSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
