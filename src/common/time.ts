import { DateTime } from 'luxon';

export function utcNow(): Date {
  return DateTime.utc().toJSDate();
}

export function parseUtc(iso: string): Date {
  return DateTime.fromISO(iso, { setZone: true }).toUTC().toJSDate();
}

export function plusMs(value: Date, milliseconds: number): Date {
  return atUtc(value).plus({ milliseconds }).toJSDate();
}

export function minusMs(value: Date, milliseconds: number): Date {
  return atUtc(value).minus({ milliseconds }).toJSDate();
}

export function plusMinutes(value: Date, minutes: number): Date {
  return atUtc(value).plus({ minutes }).toJSDate();
}

export function minusMinutes(value: Date, minutes: number): Date {
  return atUtc(value).minus({ minutes }).toJSDate();
}

export function plusDays(value: Date, days: number): Date {
  return atUtc(value).plus({ days }).toJSDate();
}

export function diffMs(left: Date, right: Date): number {
  return atUtc(left).diff(atUtc(right)).milliseconds;
}

export function isBefore(left: Date, right: Date): boolean {
  return atUtc(left) < atUtc(right);
}

export function isAfter(left: Date, right: Date): boolean {
  return atUtc(left) > atUtc(right);
}

export function isSameInstant(left: Date, right: Date): boolean {
  return atUtc(left).equals(atUtc(right));
}

export function unixSeconds(value: Date): number {
  return Math.floor(atUtc(value).toSeconds());
}

export function unixSecondsNow(): number {
  return Math.floor(DateTime.utc().toSeconds());
}

function atUtc(value: Date): DateTime {
  return DateTime.fromJSDate(value, { zone: 'utc' });
}
