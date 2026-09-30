import { describe, expect, it } from 'vitest';
import type { WebhookEventDetail } from '@/lib/td/contract';
import { reviewCategory } from '@/components/td/content/td-category-approval';
import { planDays } from '@/components/td/tabs/dailies-tab';
import { replaySteps } from '@/components/td/tabs/players-tab';
import { pollInterval } from '@/components/td/tabs/integration-tab';
import { followAnswer } from '@/components/td/content/editors/library';
import type { TdContentRow } from '../admin-api';
import { daysFrom } from '../georgia';
import { mergeDrafts, resolveConflicts } from '../merge';
import { TD_FIXED_FIELDS, TD_MERGE_UNITS } from '../content-rules';
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
  it('keeps a publication key through refusals that say nothing about the request', async () => {
    const { refusedOutright } = await import('@/components/td/tabs/releases-tab');
    const { TdApiError } = await import('../api-client');
    expect(refusedOutright(new TdApiError(409, 'not_rollback_target', 'x'))).toBe(true);
    expect(refusedOutright(new TdApiError(400, 'invalid_request', 'x'))).toBe(true);
    for (const kept of [new TdApiError(401, 'session_expired', 'x'), new TdApiError(429, 'rate_limited', 'x'), new TdApiError(502, 'http_502', 'x'), new TdApiError(0, 'session_changed', 'x'), new TdApiError(409, 'conflict_retry', 'x'), new TypeError('offline')])
      expect(refusedOutright(kept)).toBe(false);
  });

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
    // A trail too long to read whole, or behind the row, is not guessed at.
    expect(contentActions(row(), EDITOR, { ...history(EDITOR), complete: false }).archive.allowed).toBe(false);
    expect(contentActions(row({ version: 3 }), EDITOR, history(EDITOR)).archive.allowed).toBe(false);
    // Without the whole trail (loading, failed) an editor is not offered it.
    expect(contentActions(row(), EDITOR).archive.allowed).toBe(false);
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

describe('webhook detail polling', () => {
  const at = Date.parse('2026-09-30T10:00:00Z');
  const detail = (event: Partial<WebhookEventDetail['event']>) => ({ event: { status: 'pending', sending: false, nextAttemptAt: null, ...event }, payload: {}, attempts: [] }) as unknown as WebhookEventDetail;
  it('looks again soon while an attempt is on its way or due, by its next attempt while pending, never once settled', () => {
    expect(pollInterval(detail({ sending: true }), at)).toBe(3_000);
    expect(pollInterval(detail({ nextAttemptAt: '2026-09-30T10:00:01Z' }), at)).toBe(3_000);
    expect(pollInterval(detail({ nextAttemptAt: '2026-09-30T10:00:20Z' }), at)).toBe(20_000);
    // Due in 15 minutes: still looked at within a minute, so the detail never goes stale.
    expect(pollInterval(detail({ nextAttemptAt: '2026-09-30T10:15:00Z' }), at)).toBe(60_000);
    expect(pollInterval(detail({ status: 'sent' }), at)).toBe(false);
    expect(pollInterval(detail({ status: 'dead' }), at)).toBe(false);
    expect(pollInterval(undefined, at)).toBe(false);
  });
});

describe('merge units: fields that only make sense together merge as one', () => {
  it('a reorder on one side and a new right answer on the other is a conflict, never a silently wrong answer', () => {
    const units = TD_MERGE_UNITS['practice-questions'];
    const q = (options: string[], answer: number) => ({ data: { key: 'q', prompt: 'Which?', options, answer, explanation: null, imageKey: null, category: 'C', difficulty: 'easy' }, position: 0, note: '' });
    const base = q(['A', 'B', 'C'], 0);
    const mine = q(['A', 'C', 'B'], 0);
    const theirs = q(['A', 'B', 'C'], 1);
    // Field by field this "merges cleanly" into [A, C, B] with answer 1 = C, an answer nobody chose.
    expect(mergeDrafts(base, mine, theirs).conflicts).toEqual([]);
    const { merged, conflicts } = mergeDrafts(base, mine, theirs, units);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ field: 'data.difficulty+prompt+options+answer+explanation+imageKey', unit: ['difficulty', 'prompt', 'options', 'answer', 'explanation', 'imageKey'] });
    expect(merged.data).toMatchObject({ options: ['A', 'C', 'B'], answer: 0 });
    expect(resolveConflicts(merged, conflicts, { [conflicts[0].field]: 'theirs' }).data).toMatchObject({ options: ['A', 'B', 'C'], answer: 1 });
    // A change to a field outside the unit still merges.
    const other = { ...theirs, data: { ...base.data, category: 'Clubs' } };
    expect(mergeDrafts(base, mine, other, units)).toMatchObject({ conflicts: [], merged: { data: { options: ['A', 'C', 'B'], answer: 0, category: 'Clubs' } } });
  });

  it('a career path’s prompt goes with its answer and clubs', () => {
    const cp = (prompt: string, displayAnswer: string, clubs: string[]) => ({ data: { key: 'cp', puzzle: 'p', prompt, displayAnswer, acceptedAnswers: [displayAnswer.toLowerCase()], clubs }, position: 0, note: '' });
    const base = cp('Whose career is this?', 'Messi', ['Barcelona', 'PSG']);
    const mine = cp('Whose career is this? An Argentine forward.', 'Messi', ['Barcelona', 'PSG']);
    const theirs = cp('Whose career is this?', 'Ronaldo', ['Sporting', 'Man Utd']);
    expect(mergeDrafts(base, mine, theirs).conflicts).toEqual([]);
    expect(mergeDrafts(base, mine, theirs, TD_MERGE_UNITS['career-path']).conflicts).toHaveLength(1);
  });

  it('an answer and its spellings, an image and its size and rights, a round and its order', () => {
    const cards = TD_MERGE_UNITS.cards;
    const card = (display: string, aliases: string[]) => ({ data: { display, aliases, lines: [], photo: null, imageKey: null }, position: 0, note: '' });
    expect(mergeDrafts(card('Messi', ['messi']), card('Ronaldo', ['messi']), card('Messi', ['messi', 'leo']), cards).conflicts).toHaveLength(1);
    const media = (uploadId: string, width: number, author: string) => ({ data: { url: null, uploadId, width, height: 9, author, license: 'x', source: 'y' }, position: 0, note: '' });
    expect(mergeDrafts(media('u1', 16, 'A'), media('u2', 32, 'A'), media('u1', 16, 'B'), TD_MERGE_UNITS.media).conflicts).toHaveLength(1);
    for (const type of Object.keys(TD_MERGE_UNITS) as (keyof typeof TD_MERGE_UNITS)[])
      for (const unit of TD_MERGE_UNITS[type]) for (const field of unit) expect(TD_FIXED_FIELDS[type], `${type}.${field} is fixed`).not.toContain(field);
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
