import { DateTime } from 'luxon';

import type { HourRange } from '../hours/hours';

export type BusyBlock = {
  startAt: Date;
  endAt: Date;
};

export type SlotRequest = {
  timeZone: string;
  now: Date;
  date: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  slotIntervalMinutes: number;
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  openings: HourRange[];
  busy: BusyBlock[];
};

export type Slot = {
  startAt: Date;
  endAt: Date;
};

export function availableSlots(input: SlotRequest): Slot[] {
  const dayStart = zonedTimeToUtc(input.date, 0, input.timeZone);
  if (!dayStart) {
    return [];
  }
  const today = formatDay(input.now, input.timeZone);
  const lastDay = addDays(today, input.maxAdvanceDays);
  if (input.date < today || input.date > lastDay) {
    return [];
  }

  const weekday = zoned(dayStart, input.timeZone).weekday % 7;
  const openings = input.openings
    .filter((range) => range.weekday === weekday)
    .sort((left, right) => left.startMinute - right.startMinute);
  const earliest = zoned(input.now, 'utc').plus({
    minutes: input.minNoticeMinutes,
  });
  const interval =
    input.slotIntervalMinutes > 0 ? input.slotIntervalMinutes : 15;
  const slots: Slot[] = [];

  for (const opening of openings) {
    for (
      let minute = opening.startMinute;
      minute + input.durationMinutes <= opening.endMinute;
      minute += interval
    ) {
      const startAt = zonedTimeToUtc(input.date, minute, input.timeZone);
      if (!startAt) {
        continue;
      }
      const start = zoned(startAt, 'utc');
      if (start < earliest) {
        continue;
      }
      const endAt = start.plus({ minutes: input.durationMinutes }).toJSDate();
      const blockStart = start.minus({ minutes: input.bufferBeforeMinutes });
      const blockEnd = zoned(endAt, 'utc').plus({
        minutes: input.bufferAfterMinutes,
      });
      const blocked = input.busy.some((busy) => {
        const busyStart = zoned(busy.startAt, 'utc');
        const busyEnd = zoned(busy.endAt, 'utc');
        return blockStart < busyEnd && busyStart < blockEnd;
      });
      if (!blocked) {
        slots.push({ startAt, endAt });
      }
    }
  }

  return slots;
}

export function zonedTimeToUtc(
  date: string,
  minutes: number,
  timeZone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const local = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: timeZone },
  );
  if (
    !local.isValid ||
    local.year !== year ||
    local.month !== month ||
    local.day !== day ||
    local.hour !== hour ||
    local.minute !== minute
  ) {
    return null;
  }
  return local.toUTC().toJSDate();
}

export function dayWindow(
  date: string,
  timeZone: string,
): { start: Date; end: Date } | null {
  const start = zonedTimeToUtc(date, 0, timeZone);
  const end = zonedTimeToUtc(addDays(date, 1), 0, timeZone);
  if (!start || !end) {
    return null;
  }
  return { start, end };
}

export function formatDay(instant: Date, timeZone: string): string {
  return zoned(instant, timeZone).toFormat('yyyy-MM-dd');
}

function addDays(day: string, days: number): string {
  const parsed = DateTime.fromISO(day, { zone: 'utc' });
  if (!parsed.isValid) {
    return day;
  }
  return parsed.plus({ days }).toISODate() ?? day;
}

function zoned(instant: Date, timeZone: string): DateTime {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(timeZone);
}
