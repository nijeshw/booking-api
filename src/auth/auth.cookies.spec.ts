import { refreshCookieOptions } from './auth.cookies';

describe('refreshCookieOptions', () => {
  it('keeps the refresh cookie httpOnly and off the script path', () => {
    const options = refreshCookieOptions('development');
    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(false);
    expect(options.path).toBe('/auth');
    expect(options.sameSite).toBe('lax');
  });

  it('marks the cookie secure in production', () => {
    expect(refreshCookieOptions('production').secure).toBe(true);
  });
});
