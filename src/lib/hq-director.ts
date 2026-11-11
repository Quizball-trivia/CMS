// Display helpers for the Executive Director page.

import { stripMarkdown } from '@/lib/hq-markdown';
import type { HqBuild, HqBuildStage, HqTask } from '@/types';

/** `claude-fable-5-2` → "Fable 5.2", `claude-opus-4-8` → "Opus 4.8"; a trailing date stamp is ignored. */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return 'Default model';
  const [name, ...rest] = model.replace(/^claude-/, '').split('-');
  const version: string[] = [];
  for (const part of rest) {
    if (!/^\d{1,2}$/.test(part)) break;
    version.push(part);
  }
  const label = `${name.charAt(0).toUpperCase()}${name.slice(1)}${version.length ? ` ${version.join('.')}` : ''}`;
  return label || model;
}

/** "Fable 5.2 · medium" */
export function modelBadgeLabel(model: string | null | undefined, effort: string | null | undefined): string {
  return effort ? `${modelLabel(model)} · ${effort}` : modelLabel(model);
}

export interface FounderActions {
  /** The Director sent it up and it is still waiting for the founder. */
  handled: boolean;
  doIt: boolean;
  notNow: boolean;
}

/**
 * What the founder may do with a task on the Director page. Besides open ideas, he can overrule the Director:
 * "Do it" on an idea he declined, "Not now" on one he approved that hasn't finished.
 */
export function founderActions(task: HqTask): FounderActions {
  const decision = task.director?.decision ?? null;
  const proposed = task.status === 'proposed';
  return {
    // Ideas are settled with Do it / Not now; "Handled" is for everything else he sent up.
    handled: !!task.director?.escalatedAt && !proposed,
    doIt: proposed || (task.status === 'cancelled' && decision === 'declined'),
    notNow: proposed || ((task.status === 'todo' || task.status === 'in_progress') && decision === 'approved'),
  };
}

// ── What needs the founder, and why ──

/** Why something waits for the founder. Only the first five are his by rule; the rest are Romero asking. */
export type NeedReason = 'release' | 'money' | 'players' | 'private' | 'public' | 'decision' | 'blocked' | 'plan';

export const NEED_REASON_LABELS: Record<NeedReason, string> = {
  // Today a build hands in as a draft PR to staging; release cards for production come later.
  release: 'PR to merge',
  money: 'Costs money',
  players: 'Players',
  private: 'Private data',
  public: 'Public',
  decision: 'Decision',
  blocked: 'Blocked',
  plan: 'Plan',
};

const NEED_REASON_ORDER: NeedReason[] = ['release', 'money', 'players', 'private', 'public', 'decision', 'blocked', 'plan'];

// Until Romero tags his escalations, the reason is read from the title and his note (not an idea's "why", which
// mentions players or email in passing). The reason named most often wins; the title counts three times.
const REASON_PATTERNS: Array<[NeedReason, RegExp]> = [
  ['money', /\b(costs?|money|budget|spend(s|ing)?|paid|pricing|invoice|sponsor\w*)\b|[$€£]\s?\d/gi],
  ['private', /\b(payments?|payouts?|wallets?|refunds?|private data|personal data|PII|GDPR|production database)\b/gi],
  ['players', /\b(push|e-?mails?|campaign|win-?back|newsletter|notif(y|ication)s?|message (the )?players)\b/gi],
  // "public PR / repo / schema" is about code, not a public post.
  ['public', /\b(public(?!\s*(PRs?|repos?|repositor\w*|schema)\b)(?!\.\w)|landing[- ]page|social|post(s|ing)? on|tweet|instagram|tiktok|youtube|press|announce\w*)\b/gi],
];

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

const RELEASE_STAGES: readonly HqBuildStage[] = ['ready_to_publish', 'published'];
const CLOSED_STAGES: readonly HqBuildStage[] = ['done', 'cancelled'];

/** The build whose Builder task this is: by the job's task id, or by "Build #n" (the request number) in the title on an older backend. */
export function buildForTask(task: HqTask, builds: readonly HqBuild[]): HqBuild | null {
  const byId = builds.find((b) => b.job?.taskId && b.job.taskId === task.id);
  if (byId) return byId;
  const m = /^Build #(\d+)\b/.exec(task.title);
  if (!m || builds.some((b) => b.job?.taskId !== undefined)) return null;
  return builds.find((b) => b.job && b.number === Number(m[1])) ?? null;
}

export function needReason(task: HqTask, build: HqBuild | null): NeedReason {
  if (build?.job && RELEASE_STAGES.includes(build.job.stage)) return 'release';
  let best: NeedReason | null = null;
  let bestScore = 0;
  for (const [reason, pattern] of REASON_PATTERNS) {
    const score = 3 * countMatches(task.title, pattern) + countMatches(task.director?.note ?? '', pattern);
    if (score > bestScore) [best, bestScore] = [reason, score];
  }
  if (best) return best;
  if (task.status === 'blocked' && !task.director?.escalatedAt) return 'blocked';
  if (task.status === 'proposed' && task.proposal && 'plan_day' in task.proposal) return 'plan';
  return 'decision';
}

export interface NeedItem {
  task: HqTask;
  reason: NeedReason;
  build: HqBuild | null;
}

/**
 * One list of everything waiting for the founder: his Needs you, plus plan items still waiting for a yes. A build that
 * is merged or cancelled has nothing left for him, whatever its task says. Release first, then what is his by rule.
 */
export function needsYouItems(needsYou: readonly HqTask[], plan: readonly HqTask[], builds: readonly HqBuild[]): NeedItem[] {
  const seen = new Set<string>();
  const items: NeedItem[] = [];
  for (const task of [...needsYou, ...plan.filter((t) => t.status === 'proposed')]) {
    if (seen.has(task.id) || task.status === 'cancelled') continue;
    seen.add(task.id);
    const build = buildForTask(task, builds);
    if (build?.job && CLOSED_STAGES.includes(build.job.stage)) continue;
    items.push({ task, reason: needReason(task, build), build });
  }
  // Stable: within a reason the backend's order (newest escalation first) stays.
  return items.sort((a, b) => NEED_REASON_ORDER.indexOf(a.reason) - NEED_REASON_ORDER.indexOf(b.reason));
}

// ── Where a piece of work is ──

export type PipelineStepKey = 'verified' | 'building' | 'red_green' | 'review' | 'playtest' | 'pr' | 'staging' | 'your_ok' | 'live';
export type PipelineStepState = 'done' | 'current' | 'todo' | 'skipped';

export interface PipelineStep {
  key: PipelineStepKey;
  label: string;
  hint: string;
  state: PipelineStepState;
}

export const PIPELINE_STEPS: Array<{ key: PipelineStepKey; label: string; hint: string }> = [
  { key: 'verified', label: 'Verified', hint: 'The Director checked the problem and approved the build' },
  { key: 'building', label: 'Building', hint: 'The Builder writes the change in its sandbox' },
  { key: 'red_green', label: 'Red/green', hint: 'A test fails before the change and passes after it' },
  { key: 'review', label: 'GPT review', hint: 'GPT reviews the diff until no P0/P1 finding is left' },
  { key: 'playtest', label: 'Play-test', hint: 'Three testers play it on a phone and a desktop' },
  { key: 'pr', label: 'PR', hint: 'A PR to staging is opened' },
  { key: 'staging', label: 'Staging', hint: 'Merged and checked on staging' },
  { key: 'your_ok', label: 'Your OK', hint: 'You accept the production release' },
  { key: 'live', label: 'Live', hint: 'Live on production' },
];

const STAGE_AT: Partial<Record<HqBuildStage, number>> = {
  queued: 1,
  building: 1,
  reviewing: 3,
  testing: 4,
  rating: 4,
  ready_to_publish: 5,
  // A draft PR to staging is open; merging it is the next step.
  published: 6,
  done: PIPELINE_STEPS.length,
};

export interface BuildPipeline {
  steps: PipelineStep[];
  /** The step the build is on, null when it has finished or stopped. */
  current: PipelineStep | null;
  outcome: 'failed' | 'cancelled' | null;
}

/**
 * The build's path from verified to live, from its stage. A step the build went past without trying it (no play-test
 * for a backend-only change) is skipped, not done; an older backend sends no proof, so then it counts as done. A failed or stopped build has no
 * known position, so only what it proved is marked.
 */
export function buildPipeline(build: HqBuild): BuildPipeline {
  const job = build.job;
  const outcome = job?.stage === 'failed' || job?.stage === 'cancelled' ? job.stage : null;
  // No job yet: Romero has not approved the request.
  const at = job ? (STAGE_AT[job.stage] ?? -1) : 0;
  const proof = job?.proof;
  // Counts are attempts, not passes: they only tell a step the build went past apart from one it skipped. Red/green
  // is recorded only when it passed, so it can show as done even ahead of the current step.
  const tried: Partial<Record<PipelineStepKey, boolean>> = proof
    ? { red_green: proof.redGreen, review: proof.reviews > 0, playtest: proof.playtests > 0 }
    : {};
  const steps = PIPELINE_STEPS.map((s, i): PipelineStep => {
    const did = tried[s.key];
    const passed = s.key === 'red_green' && did === true;
    let state: PipelineStepState;
    if (outcome) state = s.key === 'verified' || passed ? 'done' : 'todo';
    else if (i < at) state = did === false ? 'skipped' : 'done';
    else if (i === at) state = 'current';
    else state = passed ? 'done' : 'todo';
    return { ...s, state };
  });
  return { steps, current: steps.find((s) => s.state === 'current') ?? null, outcome };
}

// ── One-line summaries ──

/** The first line of prose in Markdown: headings, empty lines and code are skipped. */
export function firstLine(md: string | null | undefined): string {
  if (!md) return '';
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line || /^(#{1,6}\s|```|---|\|)/.test(line)) continue;
    const text = stripMarkdown(line.replace(/^([-*+]|\d+\.)\s+/, ''));
    if (text) return text;
  }
  return '';
}

/** The first line under a "Why" or "Problem" heading of a spec, else its first line. */
export function whyLine(md: string | null | undefined): string {
  if (!md) return '';
  const m = /^#{1,6}\s*(why|problem|the problem)\b.*$/im.exec(md);
  return firstLine(m ? md.slice(m.index + m[0].length) : md);
}

/** The heading a result starts with, else its first line: what was done. */
export function outcomeLine(md: string | null | undefined): string {
  if (!md) return '';
  const heading = /^\s*#{1,6}\s+(.+)$/.exec(md.trimStart().split('\n', 1)[0]);
  return heading ? stripMarkdown(heading[1]) : firstLine(md);
}

// ── Done today ──

export interface DoneRow {
  task: HqTask;
  /** Scheduled runs of the same routine today, newest first (the row shows the newest). */
  runs: number;
}

/** Today's finished work; a routine that ran several times is one row with a count. */
export function doneTodayRows(tasks: readonly HqTask[]): DoneRow[] {
  const rows: DoneRow[] = [];
  const routines = new Map<string, DoneRow>();
  for (const task of tasks) {
    if (!task.scheduleId) {
      rows.push({ task, runs: 1 });
      continue;
    }
    const key = `${task.scheduleId}\n${task.title}`;
    const row = routines.get(key);
    if (row) row.runs += 1;
    else {
      const next = { task, runs: 1 };
      routines.set(key, next);
      rows.push(next);
    }
  }
  return rows;
}
