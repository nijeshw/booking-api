import { DateTime } from 'luxon';
import { z } from 'zod';

const name = z.string().trim().min(1).max(80);
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

export const slotQuerySchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const bookSchema = z.object({
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startAt: z.string().datetime(),
  firstName: name,
  lastName: name,
  email: optionalEmail,
  phone: optionalText(40),
  customerNote: optionalText(500),
});

export const calendarQuerySchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine(
    (value) => DateTime.fromISO(value.to) > DateTime.fromISO(value.from),
    {
      path: ['to'],
    },
  );

export const customerSchema = z.object({
  firstName: name,
  lastName: name,
  email: optionalEmail,
  phone: optionalText(40),
  notes: optionalText(500),
});

export const customerQuerySchema = z.object({
  query: z.string().trim().max(80).optional(),
});

export const rescheduleSchema = z.object({
  startAt: z.string().datetime(),
  staffId: z.string().uuid().optional(),
});

export const appointmentIdSchema = z.string().uuid();

export type SlotQuery = z.infer<typeof slotQuerySchema>;
export type BookInput = z.infer<typeof bookSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type RescheduleInput = z.infer<typeof rescheduleSchema>;
