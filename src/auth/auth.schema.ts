import { z } from 'zod';

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

const password = z.string().min(10).max(128);

export const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1).max(80).optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export const emailOnlySchema = z.object({ email });

export const tokenSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export const resetPasswordSchema = tokenSchema.extend({
  password,
});

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
