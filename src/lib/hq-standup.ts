// Pure helpers for HQ v3: the standup screen, goals and analytics. No React,
// so every transform here is unit-tested directly.

import { HQ_TIMEZONE } from '@/lib/hq-board';
import type { HqAcceptProposalRequest, HqAnalytics, HqEffort, HqGoal, HqGoalMetric, HqProposal, HqStandup, HqStandupEntry, HqTask } from '@/types';

// ── Standup ──

/** "5 of 6 agents reported · 4 ideas waiting for you" */
export function standupStatusSentence(s: Pick<HqStandup, 'entries' | 'waitingOn' | 'proposals'>): string {
  const reported = s.entries.filter((e) => e.standup).length;
  const total = Math.max(s.entries.length, reported + s.waitingOn.length);
  const ideas = s.proposals.length;
  const agents =
    total === 0
      ? 'No agents on the team yet'
      : reported === total
        ? `All ${total} ${total === 1 ? 'agent' : 'agents'} reported`
        : `${reported} of ${total} agents reported`;
  const ideasPart = ideas === 0 ? 'no ideas waiting' : `${ideas} ${ideas === 1 ? 'idea' : 'ideas'} waiting for you`;
  return `${agents} · ${ideasPart}`;
}

/**
 * Agent cards in reading order: anyone blocked first (they need you), then
 * the rest of the reports newest first, then agents that haven't reported.
 */
export function orderStandupEntries(entries: HqStandupEntry[]): HqStandupEntry[] {
  const rank = (e: HqStandupEntry) => (!e.standup ? 2 : e.standup.blockers.trim() ? 0 : 1);
  return [...entries].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.standup && b.standup) return b.standup.createdAt.localeCompare(a.standup.createdAt);
    return a.member.name.localeCompare(b.member.name);
  });
}

export const EFFORT_LABELS: Record<HqEffort, string> = { s: 'Quick win', m: 'A few days', l: 'Big project' };

/**
 * The executable task body for a proposal — byte-for-byte the format the HQ
 * worker writes in `hq_propose` (quizball-question-agents src/hq/tools.ts),
 * so an idea the CEO edited reads exactly like one the agent wrote.
 */
export function proposalBody(p: HqProposal): string {
  return `**Why:** ${p.why}\n\n**Plan:** ${p.plan}\n\n**Expected impact:** ${p.expectedImpact} · **Effort:** ${p.effort.toUpperCase()}`;
}

// ── Goals ──

export const GOAL_METRIC_LABELS: Record<HqGoalMetric, string> = {
  new_users: 'New players',
  active_players: 'Weekly active players',
  matches: 'Matches played',
  d7_retention: 'Day-7 retention',
  avg_rating: 'Player rating',
};

/** 0–100 progress for a goal (computed for metric goals, manual otherwise), or null if unknown. */
export function goalProgressPct(goal: Pick<HqGoal, 'progress' | 'manualProgress'>): number | null {
  const raw = goal.progress?.pct ?? goal.manualProgress;
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function formatMetricValue(metric: HqGoalMetric | null, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  // d7_retention goal values are percentages (0–100) from the backend.
  if (metric === 'd7_retention') return `${Math.round(value * 10) / 10}%`;
  if (metric === 'avg_rating') return `${value.toFixed(1)}★`;
  return Math.round(value).toLocaleString('en-US');
}

/** "6,240 of 10,000" for metric goals, "60% done" for manual ones. */
export function goalProgressLabel(goal: HqGoal): string {
  if (goal.metric) {
    const current = formatMetricValue(goal.metric, goal.progress?.current);
    return goal.target !== null ? `${current} of ${formatMetricValue(goal.metric, goal.target)}` : current;
  }
  const pct = goalProgressPct(goal);
  return pct === null ? 'Not started' : `${pct}% done`;
}

/** YYYY-MM-DD of `date` in Tbilisi. */
export function tbilisiDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HQ_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type PeriodPreset = 'today' | 'this_week' | 'next_90_days';

/** Period quick-picks in Tbilisi dates. A week runs Monday → Sunday. */
export function periodFor(preset: PeriodPreset, now: Date): { periodStart: string; periodEnd: string } {
  const today = tbilisiDate(now);
  if (preset === 'today') return { periodStart: today, periodEnd: today };
  if (preset === 'next_90_days') return { periodStart: today, periodEnd: addDays(today, 90) };
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const monday = addDays(today, -((weekday + 6) % 7));
  return { periodStart: monday, periodEnd: addDays(monday, 6) };
}

/** "Nov 2 – Nov 8" / "Today" style period label. */
export function formatPeriod(start: string, end: string, now: Date): string {
  const today = tbilisiDate(now);
  if (start === end) return start === today ? 'Today' : shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

function shortDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
}

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
export function proposalEditMode(task: Pick<HqTask, 'body' | 'proposal'>): 'plan' | 'instructions' {
  return task.proposal && task.body === proposalBody(task.proposal) ? 'plan' : 'instructions';
}

/** The form's starting text for the given mode. */
export function proposalEditText(task: Pick<HqTask, 'body' | 'proposal'>): string {
  return proposalEditMode(task) === 'plan' ? task.proposal!.plan : task.body;
}

/**
 * The accept-proposal request for the Change form: only what actually changed.
 * Title only → `{ title }` (the backend leaves the body untouched); a new plan
 * → regenerated body + `proposal.plan`; new instructions → `body` as typed.
 */
export function buildProposalChange(
  task: Pick<HqTask, 'title' | 'body' | 'proposal'>,
  title: string,
  text: string
): HqAcceptProposalRequest {
  const req: HqAcceptProposalRequest = {};
  const t = title.trim();
  if (t && t !== task.title) req.title = t;
  if (proposalEditMode(task) === 'plan') {
    const plan = text.trim();
    if (plan !== task.proposal!.plan.trim()) {
      req.proposal = { plan };
      req.body = proposalBody({ ...task.proposal!, plan });
    }
  } else if (text.trim() !== task.body.trim()) {
    req.body = text.trim();
  }
  return req;
}

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
  const sorted = [...modes].sort((a, b) => b.matches - a.matches);
  const total = sorted.reduce((sum, m) => sum + m.matches, 0);
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((sum, m) => sum + m.matches, 0);
  const rows = head.map((m) => ({ mode: m.mode, label: modeLabel(m.mode, labels), matches: m.matches, share: total > 0 ? m.matches / total : 0 }));
  if (rest > 0) rows.push({ mode: 'other', label: 'Other', matches: rest, share: total > 0 ? rest / total : 0 });
  return rows;
}

/** Mode keys present in `modesByDay`, biggest total first (stack order for the area chart). */
export function modeKeys(modesByDay: HqAnalytics['modesByDay']): string[] {
  const totals = new Map<string, number>();
  for (const day of modesByDay) {
    for (const [key, value] of Object.entries(day)) {
      if (key === 'date' || typeof value !== 'number') continue;
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => (a[0] === 'other' ? 1 : b[0] === 'other' ? -1 : b[1] - a[1]))
    .map(([key]) => key);
}

// ── Retention ──

/** Cohort retention arrives as a 0–1 share (null while the window hasn't elapsed) → 0–100. */
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
export function retentionCellClass(pct: number | null): string {
  if (pct === null) return 'bg-slate-50 text-slate-300';
  if (pct >= 40) return 'bg-emerald-600 text-white';
  if (pct >= 25) return 'bg-emerald-400 text-white';
  if (pct >= 15) return 'bg-emerald-200 text-emerald-900';
  if (pct >= 5) return 'bg-emerald-100 text-emerald-800';
  return 'bg-slate-100 text-slate-600';
}

export function formatPct(share: number, digits = 0): string {
  return `${(share * 100).toFixed(digits)}%`;
}
