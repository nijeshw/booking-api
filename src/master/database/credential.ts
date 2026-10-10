import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { assertSafeDatabaseName } from './database-name';

const ROLE_NAME = /^nexora_u_[a-f0-9]{16}$/;

export function createDatabaseLogin(): { user: string; password: string } {
  return {
    user: `nexora_u_${randomBytes(8).toString('hex')}`,
    password: randomBytes(18).toString('base64url'),
  };
}

export function assertSafeRoleName(role: string): void {
  if (!ROLE_NAME.test(role)) {
    throw new Error('Invalid database user');
  }
}

export function sealSecret(secret: string, keyMaterial: string): string {
  const key = createHash('sha256').update(keyMaterial).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64url');
}

export function openSecret(sealed: string, keyMaterial: string): string {
  const raw = Buffer.from(sealed, 'base64url');
  const key = createHash('sha256').update(keyMaterial).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}

export function databaseUrlForLogin(
  masterUrl: string,
  databaseName: string,
  user: string,
  password: string,
): string {
  assertSafeDatabaseName(databaseName);
  assertSafeRoleName(user);
  const url = new URL(masterUrl);
  url.username = user;
  url.password = password;
  url.pathname = `/${databaseName}`;
  return url.toString();
}
