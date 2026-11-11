import { expect, it } from 'vitest';
import type { HqBuild, HqBuildJob, HqTask } from '@/types';
import {
  buildForTask,
  buildPipeline,
  doneTodayRows,
  firstLine,
  founderActions,
  modelBadgeLabel,
  modelLabel,
  needReason,
  needsYouItems,
  outcomeLine,
  whyLine,
} from './hq-director';

it('turns a model id into a readable label', () => {
  expect(modelLabel('claude-fable-5-2')).toBe('Fable 5.2');
  expect(modelLabel('claude-opus-4-8')).toBe('Opus 4.8');
  expect(modelLabel('claude-fable-5')).toBe('Fable 5');
  expect(modelLabel('claude-sonnet-4-20250514')).toBe('Sonnet 4');
  expect(modelLabel(null)).toBe('Default model');
  expect(modelBadgeLabel('claude-fable-5-2', 'medium')).toBe('Fable 5.2 · medium');
  expect(modelBadgeLabel('claude-fable-5-2', null)).toBe('Fable 5.2');
});

const base = { status: 'proposed', director: { decision: null, escalatedAt: null } } as unknown as HqTask;
const withState = (status: HqTask['status'], decision: 'approved' | 'declined' | 'escalated' | null, escalatedAt: string | null = null) =>
  ({ ...base, status, director: { ...base.director, decision, escalatedAt } }) as HqTask;

it('works out what the founder can do with a task', () => {
  expect(founderActions(base)).toEqual({ handled: false, doIt: true, notNow: true });
  // an idea he sent up is settled with Do it / Not now, not "Handled"
  expect(founderActions(withState('proposed', 'escalated', '2026-11-09T05:00:00Z')).handled).toBe(false);
  expect(founderActions(withState('todo', 'escalated', '2026-11-09T05:00:00Z')).handled).toBe(true);
  expect(founderActions(withState('cancelled', 'declined'))).toEqual({ handled: false, doIt: true, notNow: false });
  expect(founderActions(withState('todo', 'approved'))).toEqual({ handled: false, doIt: false, notNow: true });
  expect(founderActions(withState('in_progress', 'approved')).notNow).toBe(true);
  expect(founderActions(withState('done', 'approved'))).toEqual({ handled: false, doIt: false, notNow: false });
  expect(founderActions({ status: 'blocked' } as HqTask)).toEqual({ handled: false, doIt: false, notNow: false });
});

const need = (id: string, title: string, note: string | null, extra: Partial<HqTask> = {}) =>
  ({ id, title, status: 'todo', proposal: null, director: { note, escalatedAt: '2026-11-09T05:00:00Z' }, ...extra }) as unknown as HqTask;

const build = (number: number, stage: HqBuildJob['stage'] | null, job: Partial<HqBuildJob> = {}): HqBuild =>
  ({
    id: `b${number}`, number, title: `Invented build ${number}`, repos: ['backend'], status: stage ? 'approved' : 'submitted', spec: '',
    directorSpec: null, job: stage ? { id: `j${number}`, number: number + 10, stage, note: null, runsUsed: 0, runLimit: 40, startedAt: null, finishedAt: null, ...job } : null,
  }) as HqBuild;

it('reads why something needs the founder; the reason named most often wins', () => {
  expect(needReason(need('1', 'Sponsor the invented cup', 'Spends our budget.'), null)).toBe('money');
  expect(needReason(need('2', 'Send the win-back campaign', 'Push and email. It costs one person an hour.'), null)).toBe('players');
  expect(needReason(need('3', 'Fix the landing page copy', 'Public text in 8 languages.'), null)).toBe('public');
  // A public PR or the public schema is code, not a public post.
  expect(needReason(need('4', 'Load the invented days', 'Not in a public PR; reads public.days.'), null)).toBe('decision');
  expect(needReason(need('5', 'Run 3 SQL queries', 'Needs read access to the production database.'), null)).toBe('private');
  expect(needReason(need('6', 'Re-measure', null, { status: 'blocked', director: { note: null, escalatedAt: null } as never }), null)).toBe('blocked');
  expect(needReason(need('7', 'Watch the grid', 'Today’s plan.', { status: 'proposed', proposal: { plan_day: '2026-11-09' } as never }), null)).toBe('plan');
  expect(needReason(need('8', 'Build #1: x', null), build(1, 'published'))).toBe('release');
});

it('finds the build behind a Builder task by its task id, or by the request number on an older backend', () => {
  const t = need('t1', 'Build #7: Invented ticker', null);
  expect(buildForTask(t, [build(7, 'building', { taskId: 't1' })])?.number).toBe(7);
  expect(buildForTask(t, [build(7, 'building', { taskId: 'other' })])).toBeNull();
  expect(buildForTask(t, [build(7, 'building')])?.number).toBe(7);
});

it('makes one Needs-you list: releases first, plan items once, nothing merged or cancelled', () => {
  const plan = need('p', 'Plan item', 'Today’s plan.', { status: 'proposed', proposal: { plan_day: 'x' } as never });
  const items = needsYouItems(
    [
      need('a', 'Approve the invented thing', 'Your call.'),
      need('r', 'Build #1: ready', null, { status: 'done' }),
      need('m', 'Build #2: merged', null, { status: 'done' }),
      need('c', 'Gone', null, { status: 'cancelled' }),
      plan,
    ],
    [plan, need('q', 'Started already', null, { status: 'in_progress' })],
    [build(1, 'ready_to_publish', { taskId: 'r' }), build(2, 'done', { taskId: 'm' })]
  );
  expect(items.map((i) => [i.task.id, i.reason])).toEqual([['r', 'release'], ['a', 'decision'], ['p', 'plan']]);
});

it('places a build on the path from verified to live, from its stage and what it proved', () => {
  const states = (b: HqBuild) => buildPipeline(b).steps.map((s) => `${s.key}:${s.state}`);
  expect(buildPipeline(build(1, null)).current?.key).toBe('verified');
  expect(buildPipeline(build(1, 'queued')).current?.key).toBe('building');
  expect(states(build(1, 'building', { proof: { redGreen: true, reviews: 0, playtests: 0 } }))).toEqual([
    'verified:done', 'building:current', 'red_green:done', 'review:todo', 'playtest:todo', 'pr:todo', 'staging:todo', 'your_ok:todo', 'live:todo',
  ]);
  // A backend-only build hands in without a play-test: skipped, not done.
  expect(states(build(1, 'published', { proof: { redGreen: true, reviews: 3, playtests: 0 } }))).toEqual([
    'verified:done', 'building:done', 'red_green:done', 'review:done', 'playtest:skipped', 'pr:done', 'staging:current', 'your_ok:todo', 'live:todo',
  ]);
  // A review asked for, or a failed play-test sent back to building, is not a pass.
  expect(states(build(1, 'building', { proof: { redGreen: false, reviews: 2, playtests: 1 } })).slice(3, 5)).toEqual(['review:todo', 'playtest:todo']);
  expect(buildPipeline(build(1, 'reviewing', { proof: { redGreen: true, reviews: 1, playtests: 0 } })).current?.key).toBe('review');
  // No proof from an older backend: what is behind the current step counts as done.
  expect(buildPipeline(build(1, 'rating')).steps.slice(0, 4).every((s) => s.state === 'done')).toBe(true);
  expect(buildPipeline(build(1, 'done')).steps.every((s) => s.state === 'done')).toBe(true);
  const failed = buildPipeline(build(1, 'failed', { proof: { redGreen: true, reviews: 0, playtests: 0 } }));
  expect(failed.outcome).toBe('failed');
  expect(failed.current).toBeNull();
  expect(failed.steps.filter((s) => s.state === 'done').map((s) => s.key)).toEqual(['verified', 'red_green']);
});

it('picks one line out of Markdown', () => {
  expect(firstLine('## Title\n\n- **Bold** point\nmore')).toBe('Bold point');
  expect(whyLine('Intro\n## Why\nFans miss the **live** scores.\n## Plan\nDo it')).toBe('Fans miss the live scores.');
  expect(whyLine('Just a spec line.')).toBe('Just a spec line.');
  expect(outcomeLine('## Swept 4 items\n\nDetails')).toBe('Swept 4 items');
  expect(outcomeLine('**Deploy works.** No problem found.\n## Notes')).toBe('Deploy works. No problem found.');
  expect(outcomeLine(null)).toBe('');
});

it('folds a routine that ran several times today into one row', () => {
  const t = (id: string, scheduleId: string | null, title = 'Sweep') => ({ id, title, scheduleId }) as HqTask;
  const rows = doneTodayRows([t('1', 's'), t('2', null, 'One-off'), t('3', 's'), t('4', 's', 'Other title')]);
  expect(rows.map((r) => [r.task.id, r.runs])).toEqual([['1', 2], ['2', 1], ['4', 1]]);
});
