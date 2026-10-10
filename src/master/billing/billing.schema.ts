import { z } from 'zod';

export const checkoutSchema = z.object({
  planId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/),
});
