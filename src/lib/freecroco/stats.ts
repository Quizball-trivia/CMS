import { addDays, dayNumber } from '@/lib/td/georgia';
import type { PartnerDayStats, PartnerGameStats } from '@/types/freecroco';

/** The backend's limit: at most this many days per overview, both ends included. */
export const STATS_MAX_RANGE_DAYS = 92;
export const STATS_DEFAULT_RANGE_DAYS = 14;
export const STATS_PRESETS = [7, 14, 30, 90] as const;

export interface DayRange {
  from: string;
  to: string;
}

/** The last `days` Georgian days, today included. */
export function lastDays(today: string, days: number): DayRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Why the range cannot be asked for, or null. */
export function rangeProblem(range: DayRange, today: string): string | null {
  const from = dayNumber(range.from);
  const to = dayNumber(range.to);
  if (from === null || to === null) return 'Pick both dates';
  if (from > to) return 'From must be on or before To';
  if (range.to > today) return 'To cannot be after today';
  if (to - from + 1 > STATS_MAX_RANGE_DAYS) return `At most ${STATS_MAX_RANGE_DAYS} days at a time`;
  return null;
}

export function rangeLength(range: DayRange): number {
  return (dayNumber(range.to) ?? 0) - (dayNumber(range.from) ?? 0) + 1;
}

export type StatsMetric = keyof Omit<PartnerDayStats, 'day'>;

export const STATS_METRICS: ReadonlyArray<{ key: StatsMetric; label: string; color: string }> = [
  { key: 'activePlayers', label: 'Active players', color: '#10b981' },
  { key: 'newPlayers', label: 'New players', color: '#6366f1' },
  { key: 'playsStarted', label: 'Plays started', color: '#0ea5e9' },
  { key: 'playsFinished', label: 'Plays finished', color: '#f59e0b' },
  { key: 'pointsSent', label: 'Points sent', color: '#e11d48' },
];

const shortDayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

/** "6 Oct" for a Georgian date (the date is already Georgian; UTC only keeps it from shifting). */
export const shortDay = (day: string) => shortDayFormat.format(new Date(`${day}T00:00:00Z`));

export const formatCount = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-US'));

export function formatAge(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}

export type DeliveryHealth = 'ok' | 'degraded' | 'down';

/** Same thresholds as the partner status endpoint's score_delivery: 5 minutes degraded, an hour down. */
export function deliveryHealth(oldestPendingSeconds: number | null): DeliveryHealth {
  if (oldestPendingSeconds === null || oldestPendingSeconds <= 300) return 'ok';
  return oldestPendingSeconds > 3600 ? 'down' : 'degraded';
}

/** Most played first; games nobody played keep the partner's order at the end. */
export function sortGamesByPlays(games: readonly PartnerGameStats[]): PartnerGameStats[] {
  return games
    .map((game, index) => ({ game, index }))
    .sort((a, b) => b.game.plays - a.game.plays || a.index - b.index)
    .map(({ game }) => game);
}
