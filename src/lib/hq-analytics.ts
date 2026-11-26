// Pure helpers for the HQ analytics page (countries, game modes, retention). No React, so each is unit-tested directly.

import type { HqAnalytics } from '@/types';

// ── Countries ──

/** ISO-2 code → flag emoji; anything else → a globe. */
export function countryFlag(code: string | null | undefined): string {
  const c = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🌐';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

let regionNames: Intl.DisplayNames | null | undefined;
/** ISO-2 → "Georgia"; non-codes are shown as stored; empty → "Unknown". */
export function countryName(code: string | null | undefined): string {
  const raw = (code ?? '').trim();
  if (!raw) return 'Unknown';
  if (!/^[A-Za-z]{2}$/.test(raw)) return raw;
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  return regionNames?.of(raw.toUpperCase()) ?? raw.toUpperCase();
}

/**
 * What the "Change" form edits. The task body is the single source of truth:
 * if it's still exactly what the proposal generates, the CEO edits the plan
 * (and the body is regenerated); if someone hand-edited the body (task sheet),
 * the CEO edits those instructions directly so nothing is lost.
 */


/**
 * Top countries by active players, each with its share. Shares use
 * `allPlayersTotal` (every country, before the backend's top-30 cut) when the
 * backend sends it; otherwise the sum of the countries we have — in which case
 * `basis` is 'top' and the UI must say "of top countries".
 */
export function countryShares(countries: HqAnalytics['countries'], top = 15, allPlayersTotal?: number | null) {
  const visibleTotal = countries.reduce((sum, c) => sum + c.players, 0);
  const useAll = typeof allPlayersTotal === 'number' && Number.isFinite(allPlayersTotal) && allPlayersTotal >= visibleTotal && allPlayersTotal > 0;
  const total = useAll ? allPlayersTotal : visibleTotal;
  return countryRows(countries, top, total, useAll ? 'all' : 'top');
}

function countryRows(countries: HqAnalytics['countries'], top: number, total: number, basis: 'all' | 'top') {
  return [...countries]
    .sort((a, b) => b.players - a.players)
    .slice(0, top)
    .map((c) => ({
      ...c,
      flag: countryFlag(c.country),
      name: countryName(c.country),
      share: total > 0 ? c.players / total : 0,
      basis,
    }));
}

// ── Game modes ──

/** Friendly label for a raw `matches.mode` value. */
export function modeLabel(mode: string, labels?: Record<string, string>): string {
  if (labels?.[mode]) return labels[mode];
  if (mode === 'other') return 'Other';
  return mode
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

/** Top `n` modes by matches, the rest folded into "Other" (for a donut). */
export function topModesWithOther(modes: HqAnalytics['modes'], labels?: Record<string, string>, n = 6) {
  // A real `other` mode from the API always joins the remainder bucket, so
  // there is exactly one Other row (unique React keys, one donut slice).
  const named = [...modes].filter((m) => m.mode !== 'other').sort((a, b) => b.matches - a.matches);
  const apiOther = modes.filter((m) => m.mode === 'other').reduce((sum, m) => sum + m.matches, 0);
  const total = named.reduce((sum, m) => sum + m.matches, 0) + apiOther;
  const head = named.slice(0, n);
  const rest = named.slice(n).reduce((sum, m) => sum + m.matches, 0) + apiOther;
  const rows = head.map((m) => ({ mode: m.mode, label: modeLabel(m.mode, labels), matches: m.matches, share: total > 0 ? m.matches / total : 0 }));
  if (rest > 0) rows.push({ mode: 'other', label: 'Other', matches: rest, share: total > 0 ? rest / total : 0 });
  return rows;
}

/** Mode keys present in `modesByDay`, biggest total first (stack order for the area chart). */

export function retentionPct(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v * 100;
}

/** Day-7 retention of the most recent cohort whose 7-day window has elapsed. */
export function latestD7(retention: HqAnalytics['retention']): { pct: number; cohortStart: string } | null {
  const done = [...retention].filter((r) => retentionPct(r.d7) !== null).sort((a, b) => b.cohortStart.localeCompare(a.cohortStart));
  return done[0] ? { pct: retentionPct(done[0].d7)!, cohortStart: done[0].cohortStart } : null;
}

/** Heatmap cell colour by retention bucket (Tailwind classes). */

export function formatPct(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}
