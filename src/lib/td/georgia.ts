/**
 * Georgian days (Asia/Tbilisi: UTC+4, no daylight saving), the contract's
 * unit for dates, the dashboard and the dailies calendar.
 */

export const GEORGIA_TIME_ZONE = 'Asia/Tbilisi';
const OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Georgian date (YYYY-MM-DD) at `now`. */
export function georgiaToday(now: number = Date.now()): string {
  return new Date(now + OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole days since 1970-01-01 for a calendar date, or null when it is not one. */
export function dayNumber(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day ? null : t / DAY_MS;
}

export function addDays(day: string, days: number): string {
  const n = dayNumber(day);
  if (n === null) throw new Error(`Not a date: ${day}`);
  return new Date((n + days) * DAY_MS).toISOString().slice(0, 10);
}

/** `days` consecutive dates from `from`. */
export function daysFrom(from: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

export interface DailyCycle {
  anchor: string;
  sets: string[];
}

/**
 * The puzzle set a daily game plays on `day`: the date's own schedule entry,
 * otherwise the cycle's set counted in whole days from its anchor (backwards
 * too), as the game's release reader does (packages/content `scheduledSet`).
 */
export function scheduledSet(own: string | undefined, cycle: DailyCycle | null, day: string): string | null {
  if (own !== undefined) return own;
  const n = dayNumber(day);
  const anchor = cycle ? dayNumber(cycle.anchor) : null;
  if (n === null || !cycle || anchor === null || cycle.sets.length === 0) return null;
  const count = cycle.sets.length;
  return cycle.sets[(((n - anchor) % count) + count) % count] ?? null;
}

/** The weeks (Monday first) of the month holding `day`, as dates; null pads the edges. */
export function monthGrid(day: string): (string | null)[][] {
  const first = `${day.slice(0, 7)}-01`;
  const start = dayNumber(first)!;
  // 1970-01-01 was a Thursday: Monday-first weekday of `start`.
  const weekday = (((start + 3) % 7) + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: weekday }, () => null);
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}

export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number);
  const index = year * 12 + (m - 1) + by;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const monthFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: GEORGIA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });

/** "Wed 1 Oct" for a Georgian date. */
export const formatDay = (day: string) => dateFormat.format(new Date(`${day}T00:00:00Z`));
/** "October 2026" for YYYY-MM. */
export const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
/** A timestamp in Georgia time. */
export const formatGeorgiaTime = (iso: string | null | undefined) => (iso ? timeFormat.format(new Date(iso)) : '—');
