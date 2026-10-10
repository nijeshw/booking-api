import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

export function parseBody<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  const fields = [
    ...new Set(
      parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? issue.path.join('.') : 'body',
      ),
    ),
  ];
  throw new BadRequestException({
    statusCode: 400,
    message: 'Invalid input',
    fields,
  });
}
