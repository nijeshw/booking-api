import { z } from 'zod';

export const noticeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const noticeIdSchema = z.string().uuid();
