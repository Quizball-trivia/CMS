import type { AnalyticsOverview } from '@/types/admin-analytics';

type TableDerby = NonNullable<NonNullable<AnalyticsOverview['breakdown']>['tableDerby']>;

const tbilisiDay = (at: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

const tbilisiTime = (at: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit' }).format(at);

/**
 * The "of which Table Derby" suffix of a total. Its numbers are the latest
 * synced day's: when that is not today (Tbilisi) the suffix says which day and
 * when it was synced, so an old count is never read as today's.
 */
export function tableDerbyLine(
  td: TableDerby | null | undefined,
  value: (td: TableDerby) => number,
  generatedAt: string,
  format: (n: number) => string,
): string {
  if (!td) return '';
  const now = new Date(generatedAt);
  const stale = td.day !== tbilisiDay(Number.isNaN(now.getTime()) ? new Date() : now);
  const asOf = stale ? ` (as of ${td.day.slice(5).replace('-', '/')}, synced ${tbilisiDay(new Date(td.updatedAt)).slice(5).replace('-', '/')} ${tbilisiTime(new Date(td.updatedAt))})` : '';
  return ` · of which Table Derby ${format(value(td))}${asOf}`;
}
