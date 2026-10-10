import { isSlug, isTimezone } from './slug';

describe('business address', () => {
  it('accepts a short public slug', () => {
    expect(isSlug('ada-studio')).toBe(true);
  });

  it('rejects reserved, uppercase, and empty slugs', () => {
    expect(isSlug('book')).toBe(false);
    expect(isSlug('Ada')).toBe(false);
    expect(isSlug('a')).toBe(false);
    expect(isSlug('ada studio')).toBe(false);
  });

  it('accepts an IANA timezone and rejects an unknown one', () => {
    expect(isTimezone('Europe/London')).toBe(true);
    expect(isTimezone('Not/AZone')).toBe(false);
  });
});
