import {
  createDatabaseLogin,
  databaseUrlForLogin,
  openSecret,
  sealSecret,
} from './credential';

const master =
  'postgresql://nexora:secret@localhost:5432/nexora?sslmode=require';
const key = 'test-only-auth-secret-32chars-min';

describe('tenant database credentials', () => {
  it('seals a password so the stored value is not the password', () => {
    const sealed = sealSecret('role-password-value', key);
    expect(sealed).not.toContain('role-password-value');
    expect(openSecret(sealed, key)).toBe('role-password-value');
  });

  it('builds a tenant URL with that role and the same server', () => {
    const login = createDatabaseLogin();
    const url = new URL(
      databaseUrlForLogin(
        master,
        'nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f',
        login.user,
        login.password,
      ),
    );
    expect(url.username).toBe(login.user);
    expect(decodeURIComponent(url.password)).toBe(login.password);
    expect(url.pathname).toBe('/nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('rejects a role name that was not issued here', () => {
    expect(() =>
      databaseUrlForLogin(
        master,
        'nexora_t_018f3c2a6c1e7b2a8d4e9a0b1c2d3e4f',
        'postgres',
        'secret',
      ),
    ).toThrow('Invalid database user');
  });
});
