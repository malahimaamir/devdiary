const pad = (n: number): string => String(n).padStart(2, '0');

/** Returns the LOCAL calendar date as "YYYY-MM-DD". */
export function localDateKey(d: Date | number = new Date()): string {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** True if `s` is a "YYYY-MM-DD" string naming a real calendar date. */
export function isValidDateKey(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) {
    return false;
  }
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day); // avoids the 0-99 => 19xx quirk of the Date constructor
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Parses a "YYYY-MM-DD" key as a LOCAL date (midnight). */
function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day);
  return date;
}

/** Shifts a "YYYY-MM-DD" key by `days` calendar days (negative goes back). DST-safe. */
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

/** All date keys from `from` to `to`, inclusive, in order. Empty if `from` is after `to`. */
export function dateKeysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let key = from; key <= to; key = addDays(key, 1)) {
    keys.push(key);
  }
  return keys;
}
