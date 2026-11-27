/** Table Derby's part of a Quizball total: counts synced from Table Derby every 30 minutes, per Tbilisi day. */
export interface TableDerbyPart {
  /** The latest synced Tbilisi day (YYYY-MM-DD): the counts are that day's. */
  day: string;
  updatedAt: string;
}

/** A sync older than this is shown with its time, even when its day is today. */
const SYNC_SHOWN_AFTER_MS = 2 * 60 * 60_000;

const tbilisiDay = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

const tbilisiTime = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit' }).format(at);

const shortDay = (ymd: string) => ymd.slice(5).replace('-', '/');

/**
 * How old Table Derby's numbers are, judged at render time (`now`): its day
 * when that is not today in Tbilisi, and its sync time when that is more than
 * two hours ago. Empty when both are current.
 */
export function tableDerbyAsOf(td: TableDerbyPart, now: Date): string {
  const synced = new Date(td.updatedAt);
  const syncedValid = !Number.isNaN(synced.getTime());
  const syncedText = syncedValid ? `synced ${shortDay(tbilisiDay(synced))} ${tbilisiTime(synced)}` : 'sync time unknown';
  if (td.day !== tbilisiDay(now)) return ` (as of ${shortDay(td.day)}, ${syncedText})`;
  if (!syncedValid || now.getTime() - synced.getTime() > SYNC_SHOWN_AFTER_MS) return ` (${syncedText})`;
  return '';
}

/** The "of which Table Derby" suffix of a figure; empty without Table Derby numbers. */
export function tableDerbyLine<T extends TableDerbyPart>(
  td: T | null | undefined,
  value: (td: T) => number,
  now: Date,
  format: (n: number) => string,
): string {
  if (!td) return '';
  return ` · of which Table Derby ${format(value(td))}${tableDerbyAsOf(td, now)}`;
}
