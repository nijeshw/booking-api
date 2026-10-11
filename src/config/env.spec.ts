import { allowedWebOrigins, canonicalWebOrigin, loadEnv } from './env';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3000',
  APP_URL: 'http://localhost:5173',
  WEB_ORIGIN: 'http://localhost:5173',
  AUTH_SECRET: 'test-only-auth-secret-32chars-min',
  MASTER_DATABASE_URL:
    'postgresql://nexora:secret@nexora.example.eu-west-2.rds.amazonaws.com:5432/nexora_master?sslmode=require',
  TENANT_DATABASE_URL:
    'postgresql://nexora:secret@nexora.example.eu-west-2.rds.amazonaws.com:5432/nexora_tenant_dev?sslmode=require',
};

describe('loadEnv', () => {
  it('accepts the database URLs and coerces the port', () => {
    const env = loadEnv(validEnv);
    expect(env.PORT).toBe(3000);
    expect(env.MASTER_DATABASE_URL).toContain('nexora_master');
  });

  it('allows the production site and local development', () => {
    const value = 'https://appointiva.co.uk, http://localhost:5173/';
    const env = loadEnv({ ...validEnv, WEB_ORIGIN: value });
    expect(allowedWebOrigins(env.WEB_ORIGIN)).toEqual([
      'https://appointiva.co.uk',
      'http://localhost:5173',
    ]);
    expect(canonicalWebOrigin(env.WEB_ORIGIN)).toBe('https://appointiva.co.uk');
  });

  it('rejects an origin list that is not a URL', () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        WEB_ORIGIN: 'https://appointiva.co.uk,localhost',
      }),
    ).toThrow(/^Invalid environment: WEB_ORIGIN$/);
  });

  it('names missing fields and does not echo secrets', () => {
    expect(() =>
      loadEnv({ MASTER_DATABASE_URL: 'super-secret-password' }),
    ).toThrow(/^Invalid environment: (?!.*super-secret-password)/);
  });
});
