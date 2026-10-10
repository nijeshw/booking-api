import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from './parse-body';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
});

describe('parseBody', () => {
  it('returns the parsed value', () => {
    expect(
      parseBody(schema, {
        email: 'owner@example.com',
        password: 'long-enough-password',
      }),
    ).toEqual({
      email: 'owner@example.com',
      password: 'long-enough-password',
    });
  });

  it('rejects invalid input with field names only', () => {
    expect(() =>
      parseBody(schema, { email: 'not-an-email', password: 'short' }),
    ).toThrow(BadRequestException);

    try {
      parseBody(schema, {
        email: 'secret-user@example.com',
        password: 'short',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse();
      expect(JSON.stringify(body)).not.toContain('secret-user@example.com');
      expect(body).toEqual({
        statusCode: 400,
        message: 'Invalid input',
        fields: ['password'],
      });
    }
  });
});
