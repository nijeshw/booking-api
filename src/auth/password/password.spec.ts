import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a matching password and rejects a different one', async () => {
    const hash = await hashPassword('a-correct-password');
    expect(hash).not.toContain('a-correct-password');
    expect(await verifyPassword(hash, 'a-correct-password')).toBe(true);
    expect(await verifyPassword(hash, 'a-wrong-password')).toBe(false);
  });

  it('rejects a hash that is not argon2', async () => {
    expect(await verifyPassword('not-a-hash', 'a-correct-password')).toBe(
      false,
    );
  });
});
