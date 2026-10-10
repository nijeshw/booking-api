import type { CookieOptions } from 'express';

export const REFRESH_COOKIE = 'nexora_refresh';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function refreshCookieOptions(nodeEnv: string): CookieOptions {
  return {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: '/auth',
    maxAge: THIRTY_DAYS_MS,
  };
}
