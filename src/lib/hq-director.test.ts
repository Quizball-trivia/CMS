import { expect, it } from 'vitest';
import type { HqTask } from '@/types';
import { founderActions, modelBadgeLabel, modelLabel } from './hq-director';

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
