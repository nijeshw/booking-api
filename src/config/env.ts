import { z } from 'zod';

const originUrl = z.string().url();

export function allowedWebOrigins(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/\/$/, ''))
    .filter((part) => part.length > 0);
}

export function canonicalWebOrigin(value: string): string {
  return allowedWebOrigins(value)[0] ?? '';
}

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_URL: z.string().url(),
  WEB_ORIGIN: z.string().superRefine((value, ctx) => {
    const origins = allowedWebOrigins(value);
    if (
      origins.length === 0 ||
      origins.some((origin) => !originUrl.safeParse(origin).success)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'must be one or more http(s) URLs',
      });
    }
  }),
  AUTH_SECRET: z.string().min(32),
  MASTER_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a PostgreSQL URL'),
  TENANT_DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a PostgreSQL URL'),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  EMAIL_API_KEY: z.string().min(1).optional(),
  EMAIL_API_URL: z.string().url().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join('.'))
      .join(', ');
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
