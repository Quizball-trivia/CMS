import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { hqKeys } from '@/hooks/use-hq';
import type { HqMember } from '@/types';
import {
  changedScheduleFields,
  defaultDepartmentAssignee,
  formatTbilisi,
  isHqRuntimeAgent,
  isOwnPipelineAgent,
  isRunnableHqAgent,
  sortAgentsForPicker,
} from './hq-board';
import { HQ_DEPARTMENTS, departmentForPath } from './hq-departments';
import { greeting, kpiDelta, taskFromCommand } from './hq-pulse';

describe('departmentForPath', () => {
  it.each([
    ['/stats', 'growth'],
    ['/users/abc', 'growth'],
    ['/questions/new', 'content'],
    ['/agents/stats', 'content'],
    ['/weekend-league', 'competitions'],
    ['/weekend-league/content', 'competitions'],
    ['/bot-tuning', 'engineering'],
    ['/freecroco/staff', 'partners'],
    ['/freecroco', 'partners'],
  ])('%s → %s', (path, key) => {
    expect(departmentForPath(path)?.key).toBe(key);
  });

  it('gives HQ pages and unknown pages no department', () => {
    for (const path of ['/hq', '/hq/board', '/hq/departments/growth', '/login', '/statsx', '/']) {
      expect(departmentForPath(path)).toBeNull();
    }
  });

  it('lists the six departments in the fixed order', () => {
    expect(HQ_DEPARTMENTS.map((d) => d.key)).toEqual(['leadership', 'growth', 'content', 'competitions', 'engineering', 'partners']);
  });
});

describe('kpiDelta', () => {
  it('reports up/down percentages', () => {
    expect(kpiDelta(120, 100)).toEqual({ pct: 20, direction: 'up', label: '↑ 20%' });
    expect(kpiDelta(75, 100)).toEqual({ pct: -25, direction: 'down', label: '↓ 25%' });
    expect(kpiDelta(100, 100)).toEqual({ pct: 0, direction: 'flat', label: '0%' });
  });
  it('handles fractional averages and empty baselines', () => {
    expect(kpiDelta(3, 2.4).pct).toBe(25);
    expect(kpiDelta(5, 0)).toEqual({ pct: null, direction: 'up', label: 'new' });
    expect(kpiDelta(0, 0)).toEqual({ pct: 0, direction: 'flat', label: '0%' });
    expect(kpiDelta(5, null).label).toBe('—');
  });
});

describe('taskFromCommand', () => {
  it('uses a one-line command as the title with no body', () => {
    expect(taskFromCommand('  Draft 3 push notifications  ')).toEqual({ title: 'Draft 3 push notifications', body: '' });
  });
  it('keeps the full text as the body when there is more than the first line', () => {
    expect(taskFromCommand('Write Instagram posts\nThree posts, in Georgian.')).toEqual({
      title: 'Write Instagram posts',
      body: 'Write Instagram posts\nThree posts, in Georgian.',
    });
  });
  it('shortens a long first line on a word boundary', () => {
    const long = 'word '.repeat(60).trim();
    const { title, body } = taskFromCommand(long);
    expect(title.length).toBeLessThanOrEqual(121);
    expect(title.endsWith('…')).toBe(true);
    expect(body).toBe(long);
  });
});

describe('greeting', () => {
  it('follows the Tbilisi clock (UTC+4)', () => {
    expect(greeting(new Date('2026-11-02T05:00:00Z'))).toBe('Good morning'); // 09:00
    expect(greeting(new Date('2026-11-02T10:00:00Z'))).toBe('Good afternoon'); // 14:00
    expect(greeting(new Date('2026-11-02T16:00:00Z'))).toBe('Good evening'); // 20:00
  });
});

describe('changedScheduleFields (edit sends only what changed)', () => {
  const original = { name: 'Morning', cron: '0 8 * * *', timezone: 'Asia/Tbilisi', taskTitle: 'Brief', taskBody: '', enabled: true };
  it('returns only edited fields', () => {
    expect(changedScheduleFields(original, { ...original, name: 'Morning briefing' })).toEqual({ name: 'Morning briefing' });
  });
  it('does not send `enabled` or cron unless the form changed them', () => {
    const changed = changedScheduleFields(original, { ...original, taskBody: 'New body' });
    expect(changed).toEqual({ taskBody: 'New body' });
    expect('enabled' in changed).toBe(false);
  });
  it('returns nothing when the form is untouched', () => {
    expect(changedScheduleFields(original, { ...original })).toEqual({});
  });
});

describe('formatTbilisi with a schedule timezone', () => {
  it('formats in the given zone and falls back on an unknown one', () => {
    const iso = '2026-11-02T06:00:00Z';
    expect(formatTbilisi(iso)).toContain('10:00'); // Tbilisi
    expect(formatTbilisi(iso, 'Europe/London')).toContain('06:00');
    expect(formatTbilisi(iso, 'Not/AZone')).toContain('10:00');
  });
});

describe('hqKeys: parent keys prefix every filtered variant', () => {
  it('omits undefined params so invalidating the parent matches filtered feeds', async () => {
    expect(hqKeys.events()).toEqual(['hq', 'events']);
    expect(hqKeys.tasksList()).toEqual(['hq', 'tasks', 'list']);
    expect(hqKeys.runsList()).toEqual(['hq', 'runs', 'list']);

    const client = new QueryClient();
    client.setQueryData(hqKeys.events({ memberId: 'm1' }), { pages: [] });
    client.setQueryData(hqKeys.tasksList({ department: 'growth' }), []);
    await client.invalidateQueries({ queryKey: hqKeys.events() });
    await client.invalidateQueries({ queryKey: hqKeys.tasksList() });
    expect(client.getQueryState(hqKeys.events({ memberId: 'm1' }))?.isInvalidated).toBe(true);
    expect(client.getQueryState(hqKeys.tasksList({ department: 'growth' }))?.isInvalidated).toBe(true);
    client.clear();
  });
});

describe('agent eligibility (who the HQ worker will actually run)', () => {
  const m = (id: string, over: Partial<HqMember>) => ({ id, kind: 'agent', runtime: 'hq', status: 'active', ...over }) as HqMember;
  const questionWriter = m('qw', { runtime: 'question_agents' });
  const bugFixer = m('bf', { runtime: 'bug_triage' });
  const pausedHq = m('p', { status: 'paused' });
  const growthWriter = m('gw', {});
  const human = m('h', { kind: 'human', runtime: 'none' });

  it('isRunnableHqAgent: active + HQ runtime only', () => {
    expect(isRunnableHqAgent(growthWriter)).toBe(true);
    for (const x of [questionWriter, bugFixer, pausedHq, human, undefined, null]) expect(isRunnableHqAgent(x)).toBe(false);
  });

  it('isHqRuntimeAgent ignores status (the worker still owns a paused agent’s claimed task)', () => {
    expect(isHqRuntimeAgent(pausedHq)).toBe(true);
    expect(isHqRuntimeAgent(bugFixer)).toBe(false);
  });

  it('own-pipeline agents sort after HQ agents in pickers', () => {
    expect(isOwnPipelineAgent(questionWriter)).toBe(true);
    expect(isOwnPipelineAgent(human)).toBe(false);
    expect(sortAgentsForPicker([questionWriter, growthWriter, bugFixer, pausedHq]).map((a) => a.id)).toEqual(['gw', 'p', 'qw', 'bf']);
  });

  it('defaultDepartmentAssignee picks the first runnable HQ agent, skipping own-pipeline and paused ones', () => {
    const team = [questionWriter, bugFixer, pausedHq, growthWriter, human];
    // Engineering-like: Bug Fixer is listed first, but QA (HQ) should get the task.
    expect(defaultDepartmentAssignee([{ id: 'bf' }, { id: 'p' }, { id: 'gw' }], team)).toBe('gw');
    // Content-like: only Question Writer → unassigned.
    expect(defaultDepartmentAssignee([{ id: 'qw' }], team)).toBeNull();
    // Only a paused HQ agent and a person → unassigned.
    expect(defaultDepartmentAssignee([{ id: 'p' }, { id: 'h' }], team)).toBeNull();
    // Unknown member (not loaded yet) → unassigned.
    expect(defaultDepartmentAssignee([{ id: 'zzz' }], team)).toBeNull();
  });
});
