export type HourRange = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export function hourError(
  ranges: HourRange[],
  requireOne: boolean,
): string | null {
  if (requireOne && ranges.length === 0) {
    return 'Add at least one opening range';
  }

  const byDay = new Map<number, HourRange[]>();
  for (const range of ranges) {
    if (
      !Number.isInteger(range.weekday) ||
      range.weekday < 0 ||
      range.weekday > 6
    ) {
      return 'Choose a day of the week';
    }
    if (
      !Number.isInteger(range.startMinute) ||
      !Number.isInteger(range.endMinute) ||
      range.startMinute < 0 ||
      range.endMinute > 24 * 60 ||
      range.startMinute >= range.endMinute
    ) {
      return 'Choose an opening time before the closing time';
    }
    const day = byDay.get(range.weekday) ?? [];
    day.push(range);
    byDay.set(range.weekday, day);
  }

  for (const day of byDay.values()) {
    const sorted = [...day].sort(
      (left, right) => left.startMinute - right.startMinute,
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous && current && current.startMinute < previous.endMinute) {
        return 'Opening ranges on the same day cannot overlap';
      }
    }
  }

  return null;
}
