// Pure helpers for the Command Center: KPI deltas, greeting, and turning a
// free-text "Tell your team…" command into a task.

import { HQ_TIMEZONE } from '@/lib/hq-board';

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface KpiDelta {
  /** Rounded percentage change vs the baseline; null when there's no baseline to compare with. */
  pct: number | null;
  direction: DeltaDirection;
  label: string;
}

/**
 * Change of `current` vs `baseline`, for "↑ 12% vs yesterday" style labels.
 * A zero baseline has no meaningful percentage: it reads "new" if current > 0.
 */
export function kpiDelta(current: number, baseline: number | null | undefined): KpiDelta {
  if (baseline === null || baseline === undefined || !Number.isFinite(baseline)) {
    return { pct: null, direction: 'flat', label: '—' };
  }
  if (baseline === 0) {
    return current > 0 ? { pct: null, direction: 'up', label: 'new' } : { pct: 0, direction: 'flat', label: '0%' };
  }
  const pct = Math.round(((current - baseline) / Math.abs(baseline)) * 100);
  if (pct === 0) return { pct: 0, direction: 'flat', label: '0%' };
  return { pct, direction: pct > 0 ? 'up' : 'down', label: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%` };
}

/** Hour of the day in Tbilisi (0–23). */
export function tbilisiHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: HQ_TIMEZONE, hour: '2-digit', hour12: false }).format(now)
  ) % 24;
}

export function greeting(now: Date): string {
  const h = tbilisiHour(now);
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/** "Monday, 2 November" in Tbilisi. */
export function tbilisiLongDate(now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: HQ_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
}

const TITLE_MAX = 120;

/**
 * A command typed into "Tell your team…" → task title + body.
 * The first line (trimmed to 120 chars on a word boundary) is the title; the
 * full text becomes the body whenever it carries more than the title does.
 */
export function taskFromCommand(text: string): { title: string; body: string } {
  const full = text.trim();
  const firstLine = full.split('\n')[0].trim();
  let title = firstLine;
  if (title.length > TITLE_MAX) {
    const cut = title.slice(0, TITLE_MAX);
    const lastSpace = cut.lastIndexOf(' ');
    title = `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  }
  const body = full === title ? '' : full;
  return { title, body };
}
