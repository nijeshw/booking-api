import { hashToken, readAccessToken, signAccessToken } from './token';

const SECRET = 'test-only-auth-secret-32chars-min';

describe('access tokens', () => {
  it('reads a token it just signed', () => {
    const token = signAccessToken({
      userId: 'user-1',
      secret: SECRET,
      issuedAt: 1_000,
      ttlSeconds: 60,
    });
    expect(readAccessToken(token, SECRET, 1_030)).toEqual({ userId: 'user-1' });
  });

  it('rejects an expired, tampered, or wrong-secret token', () => {
    const token = signAccessToken({
      userId: 'user-1',
      secret: SECRET,
      issuedAt: 1_000,
      ttlSeconds: 60,
    });
    expect(readAccessToken(token, SECRET, 1_060)).toBeNull();
    expect(
      readAccessToken(token, 'another-secret-that-is-long-enough', 1_030),
    ).toBeNull();
    const [header, payload] = token.split('.');
    expect(
      readAccessToken(`${header}.${payload}.tampered`, SECRET, 1_030),
    ).toBeNull();
    expect(readAccessToken('not-a-token', SECRET, 1_030)).toBeNull();
  });

  it('hashes tokens without keeping the raw value', () => {
    const hash = hashToken('raw-token');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('raw-token');
    expect(hashToken('raw-token')).toBe(hash);
  });
});
