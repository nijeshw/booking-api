import { hourError } from './hours';

describe('hourError', () => {
  it('allows a split shift and a closed day', () => {
    expect(
      hourError(
        [
          { weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60 },
          { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 },
        ],
        true,
      ),
    ).toBeNull();
  });

  it('rejects an overlap, a backwards range, and an empty week when hours are required', () => {
    expect(
      hourError(
        [
          { weekday: 1, startMinute: 9 * 60, endMinute: 13 * 60 },
          { weekday: 1, startMinute: 12 * 60, endMinute: 17 * 60 },
        ],
        true,
      ),
    ).toBe('Opening ranges on the same day cannot overlap');
    expect(
      hourError(
        [{ weekday: 2, startMinute: 17 * 60, endMinute: 9 * 60 }],
        true,
      ),
    ).toBe('Choose an opening time before the closing time');
    expect(hourError([], true)).toBe('Add at least one opening range');
    expect(hourError([], false)).toBeNull();
  });
});
