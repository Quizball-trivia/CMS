/**
 * Georgian days (Asia/Tbilisi: UTC+4, no daylight saving), the contract's
 * unit for dates, the dashboard and the dailies calendar.
 */
import { TD_LANG } from '@/lib/td/i18n';

export const GEORGIA_TIME_ZONE = 'Asia/Tbilisi';
const OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Georgian date (YYYY-MM-DD) at `now`. */
export function georgiaToday(now: number = Date.now()): string {
  return new Date(now + OFFSET_MS).toISOString().slice(0, 10);
}

/** Milliseconds from `now` to the next Georgian midnight (20:00 UTC). */
export function msToNextGeorgiaDay(now: number = Date.now()): number {
  return DAY_MS - ((((now + OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS);
}

/**
 * Calls `onChange` at every Georgian midnight, and when the page is shown
 * again: a timer does not run while the machine sleeps.
 */
export function subscribeGeorgiaDay(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    // A little past midnight, so the date read then is already the new one.
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msToNextGeorgiaDay() + 250);
  };
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    onChange();
    arm();
  };
  arm();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
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

// Georgian month and weekday names are spelled out here, not taken from the
// browser: one without Georgian locale data would print English, and differ
// from what the server rendered.
const KA_MONTHS = ['იანვარი', 'თებერვალი', 'მარტი', 'აპრილი', 'მაისი', 'ივნისი', 'ივლისი', 'აგვისტო', 'სექტემბერი', 'ოქტომბერი', 'ნოემბერი', 'დეკემბერი'];
const KA_MONTHS_SHORT = ['იან', 'თებ', 'მარ', 'აპრ', 'მაი', 'ივნ', 'ივლ', 'აგვ', 'სექ', 'ოქტ', 'ნოე', 'დეკ'];
/** From Sunday, as `getUTCDay` counts. */
const KA_WEEKDAYS_SHORT = ['კვი', 'ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ'];

const dateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const shortDateFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const monthFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: GEORGIA_TIME_ZONE, dateStyle: 'medium', timeStyle: 'short' });
const timeParts = new Intl.DateTimeFormat('en-GB', { timeZone: GEORGIA_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "Wed 1 Oct" for a Georgian date. */
export const formatDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  return TD_LANG === 'ka' ? `${KA_WEEKDAYS_SHORT[date.getUTCDay()]}, ${date.getUTCDate()} ${KA_MONTHS_SHORT[date.getUTCMonth()]}` : dateFormat.format(date);
};
/** "1 Oct" for a Georgian date. */
export const formatDate = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);
  return TD_LANG === 'ka' ? `${date.getUTCDate()} ${KA_MONTHS_SHORT[date.getUTCMonth()]}` : shortDateFormat.format(date);
};
/** "October 2026" for YYYY-MM. */
export const formatMonth = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  return TD_LANG === 'ka' ? `${KA_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` : monthFormat.format(date);
};
/** A timestamp in Georgia time. */
export const formatGeorgiaTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  if (TD_LANG !== 'ka') return timeFormat.format(new Date(iso));
  const part = Object.fromEntries(timeParts.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${Number(part.day)} ${KA_MONTHS_SHORT[Number(part.month) - 1]} ${part.year}, ${part.hour}:${part.minute}`;
};
/** The weekdays' short names, Monday first, as a month grid is (5 January 1970 was a Monday). */
export const WEEKDAYS_SHORT: readonly string[] =
  TD_LANG === 'ka' ? [...KA_WEEKDAYS_SHORT.slice(1), KA_WEEKDAYS_SHORT[0]!] : Array.from({ length: 7 }, (_, i) => weekdayFormat.format(new Date(Date.UTC(1970, 0, 5 + i))));
