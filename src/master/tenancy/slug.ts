import { DateTime } from 'luxon';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  'admin',
  'api',
  'auth',
  'book',
  'health',
  'login',
  'register',
]);

export function isSlug(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 48 &&
    SLUG.test(value) &&
    !RESERVED.has(value)
  );
}

export function isTimezone(value: string): boolean {
  if (value.length === 0 || value.length > 64) {
    return false;
  }
  return DateTime.utc().setZone(value).isValid;
}
