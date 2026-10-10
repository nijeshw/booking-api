import { z } from 'zod';
import { isSlug, isTimezone } from './slug';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const createTenantSchema = z.object({
  legalName: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      isSlug,
      'Choose a public address using letters, numbers, and dashes',
    ),
  timezone: z
    .string()
    .refine(isTimezone, 'Choose a valid timezone')
    .default('Europe/London'),
  currency: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/))
    .default('GBP'),
  email: z
    .union([z.string().trim().email().max(254), z.literal('')])
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null)),
  phone: optionalText(40),
  addressLine1: optionalText(120),
  city: optionalText(80),
  postcode: optionalText(16),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .transform((value) => value ?? null),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;

const roleName = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9_]{0,39}$/, 'Choose a role');

const emailAddress = z
  .string()
  .trim()
  .email()
  .transform((value) => value.toLowerCase());

const personName = z.string().trim().min(1).max(80);

export const grantAccessSchema = z.object({
  name: personName,
  email: emailAddress,
  role: roleName,
});

export type GrantAccessInput = z.infer<typeof grantAccessSchema>;

export const updateAccessSchema = z.object({
  email: emailAddress,
  name: personName,
  nextEmail: emailAddress,
  role: roleName,
});

export type UpdateAccessInput = z.infer<typeof updateAccessSchema>;

export const revokeAccessSchema = z.object({
  email: emailAddress,
});

export type RevokeAccessInput = z.infer<typeof revokeAccessSchema>;

export const createRoleSchema = z.object({
  label: z.string().trim().min(2).max(40),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const savePermissionsSchema = z.object({
  role: roleName,
  permissions: z.array(z.string()).max(20),
});
