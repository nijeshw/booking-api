import { DateTime } from 'luxon';

import { availableSlots, zonedTimeToUtc } from './slots';

const utc = (iso: string): Date =>
  DateTime.fromISO(iso, { zone: 'utc' }).toJSDate();

const open = [{ weekday: 1, startMinute: 9 * 60, endMinute: 10 * 60 }];

describe('availableSlots', () => {
  it('offers interval slots inside opening hours in the business timezone', () => {
    const slots = availableSlots({
      timeZone: 'Europe/London',
      now: utc('2026-01-05T08:00:00.000Z'),
      date: '2026-01-05',
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 60,
      openings: open,
      busy: [],
    });

    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2026-01-05T09:00:00.000Z',
      '2026-01-05T09:30:00.000Z',
    ]);
  });

  it('keeps summer opening hours on local time', () => {
    const slots = availableSlots({
      timeZone: 'Europe/London',
      now: utc('2026-07-06T06:00:00.000Z'),
      date: '2026-07-06',
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 1,
      openings: open,
      busy: [],
    });

    expect(slots[0]?.startAt.toISOString()).toBe('2026-07-06T08:00:00.000Z');
  });

  it('skips slots that overlap a busy block, including buffers, and slots before notice', () => {
    const slots = availableSlots({
      timeZone: 'Europe/London',
      now: utc('2026-01-05T09:10:00.000Z'),
      date: '2026-01-05',
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 15,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 7,
      openings: open,
      busy: [
        {
          startAt: utc('2026-01-05T09:30:00.000Z'),
          endAt: utc('2026-01-05T10:00:00.000Z'),
        },
      ],
    });

    expect(slots).toEqual([]);
  });

  it('allows a slot that starts when the previous block ends', () => {
    const slots = availableSlots({
      timeZone: 'Europe/London',
      now: utc('2026-01-05T08:00:00.000Z'),
      date: '2026-01-05',
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      slotIntervalMinutes: 30,
      minNoticeMinutes: 0,
      maxAdvanceDays: 7,
      openings: open,
      busy: [
        {
          startAt: utc('2026-01-05T09:00:00.000Z'),
          endAt: utc('2026-01-05T09:30:00.000Z'),
        },
      ],
    });

    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2026-01-05T09:30:00.000Z',
    ]);
  });

  it('rejects a date beyond the booking window or a day that does not exist', () => {
    expect(
      availableSlots({
        timeZone: 'Europe/London',
        now: utc('2026-01-05T08:00:00.000Z'),
        date: '2026-04-05',
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        slotIntervalMinutes: 30,
        minNoticeMinutes: 0,
        maxAdvanceDays: 7,
        openings: open,
        busy: [],
      }),
    ).toEqual([]);
    expect(zonedTimeToUtc('2026-02-31', 9 * 60, 'Europe/London')).toBeNull();
  });
});
