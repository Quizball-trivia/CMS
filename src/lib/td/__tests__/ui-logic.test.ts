import { describe, expect, it } from 'vitest';
import { reviewCategory } from '@/components/td/content/td-category-approval';
import { planDays } from '@/components/td/tabs/dailies-tab';
import { replaySteps } from '@/components/td/tabs/players-tab';
import { followAnswer } from '@/components/td/content/editors/library';
import type { TdContentRow } from '../admin-api';
import { daysFrom } from '../georgia';
import { mergeDrafts, resolveConflicts } from '../merge';
import { contentActions } from '../workflow';
import type { TdStaff } from '@/types/td';

const EDITOR: TdStaff = { id: 'e1', email: 'e@x.test', name: 'Editor', role: 'editor' };
const OTHER_EDITOR: TdStaff = { id: 'e2', email: 'e2@x.test', name: 'Other', role: 'editor' };
const PUBLISHER: TdStaff = { id: 'p1', email: 'p@x.test', name: 'Publisher', role: 'publisher' };
const actor = (who: TdStaff) => ({ id: who.id, name: who.name });

function row(over: Partial<TdContentRow<'cards'>> = {}): TdContentRow<'cards'> {
  return {
    id: 'r1',
    status: 'draft',
    version: 1,
    contentVersion: 1,
    approvedVersion: null,
    position: 0,
    approvedPosition: null,
    note: '',
    lastEditor: actor(EDITOR),
    updatedBy: actor(EDITOR),
    approvedBy: null,
    approvedAt: null,
    createdAt: '2026-09-30T08:00:00.000Z',
    updatedAt: '2026-09-30T08:00:00.000Z',
    data: { categoryKey: 'legends', key: 'k', value: 1, lines: [], display: 'A', aliases: ['a'], photo: null, imageKey: null },
    approved: null,
    ...over,
  };
}

const history = (...actors: TdStaff[]) => ({
  items: actors.map((who, i) => ({ id: String(i + 1), at: '2026-09-30T08:00:00.000Z', actor: actor(who), action: 'edit' as const, fromStatus: null, toStatus: null, version: i + 1, contentVersion: 1, batchId: null })),
  complete: true,
});

describe('workflow actions offered', () => {
  it('offers ready on drafts, approval to publishers who did not make the last edit', () => {
    expect(contentActions(row(), EDITOR)).toMatchObject({ save: { allowed: true }, ready: { allowed: true }, approve: { allowed: false }, restore: { allowed: false } });
    const ready = row({ status: 'ready' });
    expect(contentActions(ready, EDITOR).approve).toEqual({ allowed: false, reason: 'Ready for a publisher to approve.' });
    expect(contentActions(ready, PUBLISHER).approve).toEqual({ allowed: true });
    expect(contentActions({ ...ready, lastEditor: actor(PUBLISHER) }, PUBLISHER).approve.reason).toMatch(/another publisher/);
  });

  it('lets an editor archive only an own, never approved row nobody else touched (by its trail when known)', () => {
    expect(contentActions(row({ status: 'ready' }), EDITOR, history(EDITOR, EDITOR)).archive.allowed).toBe(true);
    expect(contentActions(row(), EDITOR, history(EDITOR, PUBLISHER)).archive.allowed).toBe(false);
    expect(contentActions(row(), OTHER_EDITOR, history(EDITOR)).archive.allowed).toBe(false);
    expect(contentActions(row({ approvedVersion: 1 }), EDITOR, history(EDITOR)).archive.allowed).toBe(false);
    // A trail too long to read whole is not guessed at.
    expect(contentActions(row(), EDITOR, { ...history(EDITOR), complete: false }).archive.allowed).toBe(false);
    // Without the trail: a best guess from the row, the API decides.
    expect(contentActions(row(), EDITOR).archive.allowed).toBe(true);
    expect(contentActions(row({ approvedVersion: 1, status: 'approved' }), PUBLISHER).archive.allowed).toBe(true);
  });

  it('archived rows: no edit, restore for publishers only', () => {
    const archived = row({ status: 'archived' });
    expect(contentActions(archived, EDITOR)).toMatchObject({ save: { allowed: false }, archive: { allowed: false }, restore: { allowed: false } });
    expect(contentActions(archived, PUBLISHER).restore.allowed).toBe(true);
  });
});

describe('three-way merge of a stale edit', () => {
  const base = { data: { display: 'A', aliases: ['a'], lines: ['x'] }, position: 0, note: '' };
  it('keeps their changes to fields I left, mine to fields they left', () => {
    const mine = { ...base, data: { ...base.data, display: 'Mine' } };
    const theirs = { ...base, data: { ...base.data, lines: ['x', 'y'] }, note: 'checked' };
    expect(mergeDrafts(base, mine, theirs)).toEqual({ merged: { data: { display: 'Mine', aliases: ['a'], lines: ['x', 'y'] }, position: 0, note: 'checked' }, conflicts: [] });
  });

  it('asks where we both changed a field differently, lists taken whole', () => {
    const mine = { ...base, data: { ...base.data, aliases: ['a', 'b'] }, position: 3 };
    const theirs = { ...base, data: { ...base.data, aliases: ['a', 'c'] }, position: 3 };
    const { merged, conflicts } = mergeDrafts(base, mine, theirs);
    expect(conflicts).toEqual([{ field: 'data.aliases', base: ['a'], mine: ['a', 'b'], theirs: ['a', 'c'] }]);
    expect(merged.position).toBe(3);
    expect(resolveConflicts(merged, conflicts, { 'data.aliases': 'theirs' }).data.aliases).toEqual(['a', 'c']);
    expect(resolveConflicts(merged, conflicts, {}).data.aliases).toEqual(['a', 'b']);
  });
});

describe('category approval review', () => {
  const kid = (id: string, status: TdContentRow['status'], editor = EDITOR) => row({ id, status, lastEditor: actor(editor) });
  it('lists ready rows to approve with it and what holds it up', () => {
    const review = reviewCategory([kid('a', 'ready'), kid('b', 'approved'), kid('c', 'draft'), kid('d', 'ready', PUBLISHER)], PUBLISHER.id);
    expect(review.withIt.map((r) => r.id)).toEqual(['a']);
    expect(review.approved.map((r) => r.id)).toEqual(['b']);
    expect(review.blockers.map((b) => b.row.id)).toEqual(['c', 'd']);
    expect(review.canApprove).toBe(false);
    expect(reviewCategory([kid('a', 'ready')], PUBLISHER.id).canApprove).toBe(true);
    expect(reviewCategory([], PUBLISHER.id)).toMatchObject({ canApprove: false, problem: 'A category needs at least one approved row.' });
    expect(reviewCategory(Array.from({ length: 501 }, (_, i) => kid(`k${i}`, 'ready')), PUBLISHER.id).problem).toMatch(/At most 500/);
  });
});

describe('dailies calendar projection', () => {
  const schedule = (date: string, puzzle: string, over: Partial<TdContentRow<'daily-schedule'>> = {}) =>
    ({ ...row(), id: date, data: { game: 'footballLogic', date, puzzle }, approved: null, approvedVersion: null, ...over }) as unknown as TdContentRow<'daily-schedule'>;
  const settings = { ...row(), status: 'approved', approvedVersion: 1, data: { game: 'footballLogic', seconds: 30, cycle: { anchor: '2026-10-01', sets: ['a', 'b'] } }, approved: { game: 'footballLogic', seconds: 30, cycle: { anchor: '2026-10-01', sets: ['a', 'b'] } } } as unknown as TdContentRow<'daily-settings'>;
  const puzzles = [
    { key: 'a', questions: 1, playable: true },
    { key: 'b', questions: 1, playable: true },
    { key: 'c', questions: 1, playable: false },
  ];

  it('plays approved dates, else the approved cycle; drafts are pending changes; archived rows count for nothing', () => {
    const rows = [
      schedule('2026-10-02', 'c'),
      schedule('2026-10-03', 'a', { status: 'approved', approvedVersion: 1, approved: { game: 'footballLogic', date: '2026-10-03', puzzle: 'a' } }),
      schedule('2026-10-04', 'b', { status: 'archived', approvedVersion: 1, approved: { game: 'footballLogic', date: '2026-10-04', puzzle: 'b' } }),
    ];
    const days = planDays(daysFrom('2026-10-01', 4), '2026-10-01', rows, settings, puzzles);
    expect(days.map((d) => [d.date, d.planned, d.source, d.pending])).toEqual([
      ['2026-10-01', 'a', 'cycle', null],
      ['2026-10-02', 'b', 'cycle', 'c'],
      ['2026-10-03', 'a', 'date', null],
      ['2026-10-04', 'b', 'cycle', null],
    ]);
    expect(days[3].row?.status).toBe('archived');
  });

  it('flags days of the next 30 with no playable puzzle', () => {
    const days = planDays(daysFrom('2026-10-01', 31), '2026-10-01', [], null, puzzles);
    expect(days.filter((d) => d.missing)).toHaveLength(30);
    expect(days[30].inWindow).toBe(false);
  });
});

describe('replay of the kept inputs', () => {
  it('reads the queue’s <stamp µs>|<input> entries, commands nested, and keeps what it cannot read', () => {
    const entry = (us: number, input: object) => `${us}|${JSON.stringify(input)}`;
    expect(
      replaySteps([
        entry(1_000_000, { kind: 'ready', seat: 'me' }),
        entry(3_500_000, { kind: 'command', seat: 'op', command: { id: 'x', seat: 'op', kind: 'submit', text: 'messi', roundId: 1, step: 2 } }),
        entry(4_000_000, { kind: 'presence', seat: 'me', connected: false }),
        'odd',
        { at: 5_000, seat: 'me', kind: 'ready' },
      ]),
    ).toEqual([
      { offset: 0, seat: 'me', kind: 'ready', details: null, raw: null },
      { offset: 2500, seat: 'op', kind: 'submit', details: { text: 'messi', roundId: 1, step: 2 }, raw: null },
      { offset: 3000, seat: 'me', kind: 'presence', details: { connected: false }, raw: null },
      { offset: null, seat: null, kind: 'unknown', details: null, raw: 'odd' },
      { offset: 4000, seat: 'me', kind: 'ready', details: null, raw: null },
    ]);
  });
});

describe('practice: the right option follows its option', () => {
  it('moves with it, and shifts when an earlier option goes', () => {
    expect(followAnswer(1, { kind: 'move', from: 1, to: 0 })).toBe(0);
    expect(followAnswer(0, { kind: 'move', from: 1, to: 0 })).toBe(1);
    expect(followAnswer(2, { kind: 'move', from: 0, to: 1 })).toBe(2);
    expect(followAnswer(2, { kind: 'remove', index: 0 })).toBe(1);
    expect(followAnswer(1, { kind: 'remove', index: 3 })).toBe(1);
    expect(followAnswer(1, { kind: 'edit' })).toBe(1);
  });
});
