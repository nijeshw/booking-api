import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function signAccessToken(input: {
  userId: string;
  secret: string;
  issuedAt: number;
  ttlSeconds: number;
}): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: input.userId,
    iat: input.issuedAt,
    exp: input.issuedAt + input.ttlSeconds,
  });
  return `${header}.${payload}.${sign(`${header}.${payload}`, input.secret)}`;
}

export function readAccessToken(
  token: string,
  secret: string,
  nowSeconds: number,
): { userId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [header, payload, signature] = parts as [string, string, string];
  const expected = sign(`${header}.${payload}`, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const headerBody = JSON.parse(
      Buffer.from(header, 'base64url').toString(),
    ) as { alg?: unknown };
    if (headerBody.alg !== 'HS256') {
      return null;
    }
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof body.sub !== 'string' || body.sub.length === 0) {
      return null;
    }
    if (typeof body.exp !== 'number' || body.exp <= nowSeconds) {
      return null;
    }
    return { userId: body.sub };
  } catch {
    return null;
  }
}
