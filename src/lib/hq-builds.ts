// Display helpers for the Builds page.

import type { HqBuild, HqBuildKind, HqBuildRepo, HqBuildStage, HqBuildStatus } from '@/types';

export const BUILD_KINDS: Array<{ value: HqBuildKind; label: string }> = [
  { value: 'game_mode', label: 'Game mode' },
  { value: 'feature', label: 'Feature' },
  { value: 'bug_fix', label: 'Bug fix' },
  { value: 'other', label: 'Other' },
];

export const BUILD_REPOS: Array<{ value: HqBuildRepo; label: string }> = [
  { value: 'backend', label: 'Backend' },
  { value: 'web', label: 'Web' },
  { value: 'cms', label: 'CMS' },
];

export const BUILD_KIND_LABELS = Object.fromEntries(BUILD_KINDS.map((k) => [k.value, k.label])) as Record<HqBuildKind, string>;
export const BUILD_REPO_LABELS = Object.fromEntries(BUILD_REPOS.map((r) => [r.value, r.label])) as Record<HqBuildRepo, string>;

export const BUILD_STATUS_LABELS: Record<HqBuildStatus, string> = {
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  declined: 'Declined',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export const BUILD_STAGE_LABELS: Record<HqBuildStage, string> = {
  queued: 'Queued',
  building: 'Building',
  reviewing: 'Reviewing',
  testing: 'Testing',
  rating: 'Rating',
  ready_to_publish: 'Ready to publish',
  published: 'Published',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** The happy path of a job, in order: queued → building → reviewing → testing → rating → ready. */
export const BUILD_STEPS: Array<{ stage: HqBuildStage; label: string }> = [
  { stage: 'queued', label: 'Queued' },
  { stage: 'building', label: 'Building' },
  { stage: 'reviewing', label: 'Reviewing' },
  { stage: 'testing', label: 'Testing' },
  { stage: 'rating', label: 'Rating' },
  { stage: 'ready_to_publish', label: 'Ready' },
];

const FINISHED_STAGES: readonly HqBuildStage[] = ['published', 'done', 'failed', 'cancelled'];

export type BuildStepState = 'done' | 'current' | 'todo';

/**
 * The progress line for a job's stage. A finished job (published, done) has every step behind it; a failed or
 * cancelled one has no known position on the line, so no step is marked and the outcome is shown instead.
 */
export function buildProgress(stage: HqBuildStage): Array<{ stage: HqBuildStage; label: string; state: BuildStepState }> {
  const at = BUILD_STEPS.findIndex((s) => s.stage === stage);
  const finished = stage === 'published' || stage === 'done';
  return BUILD_STEPS.map((s, i) => ({
    ...s,
    state: finished || (at >= 0 && i < at) ? 'done' : i === at ? 'current' : 'todo',
  }));
}

/** A request the person can still cancel: not declined/cancelled, and its build (if any) has not finished. */
export function canCancelBuild(build: HqBuild): boolean {
  if (build.status === 'declined' || build.status === 'cancelled') return false;
  return !(build.job && FINISHED_STAGES.includes(build.job.stage));
}
