import { expect, it } from 'vitest';
import type { HqBuild, HqBuildStage } from '@/types';
import { buildProgress, canCancelBuild } from './hq-builds';

const states = (stage: HqBuildStage) => buildProgress(stage).map((s) => `${s.label}:${s.state}`);

it('marks the steps before the current stage as done', () => {
  expect(states('queued')).toEqual(['Queued:current', 'Building:todo', 'Reviewing:todo', 'Testing:todo', 'Rating:todo', 'Ready:todo']);
  expect(states('testing')).toEqual(['Queued:done', 'Building:done', 'Reviewing:done', 'Testing:current', 'Rating:todo', 'Ready:todo']);
  expect(states('ready_to_publish')).toEqual(['Queued:done', 'Building:done', 'Reviewing:done', 'Testing:done', 'Rating:done', 'Ready:current']);
});

it('has every step done once published, and none marked for a failed or cancelled job', () => {
  for (const stage of ['published', 'done'] as const) expect(buildProgress(stage).every((s) => s.state === 'done')).toBe(true);
  for (const stage of ['failed', 'cancelled'] as const) expect(buildProgress(stage).every((s) => s.state === 'todo')).toBe(true);
});

const base = { id: 'b', number: 1, title: 't', job: null } as unknown as HqBuild;
const withJob = (stage: HqBuildStage) => ({ ...base, status: 'approved', job: { stage } }) as HqBuild;

it('lets a request be cancelled until it is declined or cancelled or its build has finished', () => {
  expect(canCancelBuild({ ...base, status: 'submitted' })).toBe(true);
  expect(canCancelBuild({ ...base, status: 'changes_requested' })).toBe(true);
  expect(canCancelBuild({ ...base, status: 'approved' })).toBe(true);
  expect(canCancelBuild({ ...base, status: 'declined' })).toBe(false);
  expect(canCancelBuild({ ...base, status: 'cancelled' })).toBe(false);
  for (const stage of ['queued', 'building', 'reviewing', 'testing', 'rating', 'ready_to_publish'] as const) expect(canCancelBuild(withJob(stage))).toBe(true);
  for (const stage of ['published', 'done', 'failed', 'cancelled'] as const) expect(canCancelBuild(withJob(stage))).toBe(false);
});
