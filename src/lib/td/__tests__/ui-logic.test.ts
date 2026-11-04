import { describe, expect, it } from 'vitest';
import type { TdStaffMember } from '@/types/td';
import type { WebhookEventDetail } from '@/lib/td/contract';
import { reviewCategory } from '@/components/td/content/td-category-approval';
import { replaySteps } from '@/components/td/tabs/players-tab';
import { pollInterval } from '@/components/td/tabs/integration-tab';
import { canMakeResetLink, canManageMember } from '@/components/td/td-team';
import { followAnswer } from '@/components/td/content/editors/library';
import type { TdContentRow } from '../admin-api';
import { mergeDrafts, resolveConflicts } from '../merge';
import { editorialIssues, TD_FIXED_FIELDS, TD_MERGE_UNITS } from '../content-rules';
import { contentActions } from '../workflow';
import { withShownAnswer } from '../answers';
import type { TdStaff } from '@/types/td';

const EDITOR: TdStaff = { id: 'e1', email: 'e@x.test', name: 'Editor', role: 'betsson_admin' };
const COLLEAGUE: TdStaff = { id: 'e2', email: 'e2@x.test', name: 'Colleague', role: 'betsson_admin' };
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

describe('what the editor asks of a card’s SoFIFA photo', () => {
  const card = (photo: { id: number; ver: string } | null) => ({ categoryKey: 'legends', key: 'messi', value: 2, lines: ['A'], display: 'Messi', aliases: ['messi'], photo, imageKey: null });
  it('takes only what a face is served for: up to seven digits and a two-digit version', () => {
    expect(editorialIssues('cards', card(null))).toEqual([]);
    expect(editorialIssues('cards', card({ id: 158023, ver: '24' }))).toEqual([]);
    expect(editorialIssues('cards', card({ id: 158023, ver: '25_1' })).map((issue) => issue.path)).toEqual(['data.photo.ver']);
    expect(editorialIssues('cards', card({ id: 12345678, ver: '' })).map((issue) => issue.path)).toEqual(['data.photo.id', 'data.photo.ver']);
  });
});

describe('what the editor asks of a Football Logic question', () => {
  const question = { key: 'fl-x', puzzle: 'fl-1', category: 'Clubs', prompt: '', imageA: null, imageB: null, imageAKey: null, imageBKey: null, displayAnswer: 'Napoli', acceptedAnswers: ['napoli'] };
  it('needs its text or a picture: an answer alone shows the player nothing', () => {
    expect(editorialIssues('football-logic', question).map((issue) => issue.path)).toEqual(['data.prompt']);
    expect(editorialIssues('football-logic', { ...question, prompt: '  ' })).toHaveLength(1);
    for (const shown of [{ prompt: 'Who?' }, { imageA: '/assets/a.webp' }, { imageB: 'https://x.test/b.png' }, { imageAKey: 'crest-a' }, { imageBKey: 'crest-b' }])
      expect(editorialIssues('football-logic', { ...question, ...shown }), JSON.stringify(shown)).toEqual([]);
  });
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

  it('offers ready on drafts and approval on ready rows, whoever edited them last', () => {
    expect(contentActions(row())).toMatchObject({ save: { allowed: true }, ready: { allowed: true }, approve: { allowed: false }, archive: { allowed: true }, restore: { allowed: false } });
    expect(contentActions(row({ status: 'ready' })).approve).toEqual({ allowed: true });
    expect(contentActions(row({ status: 'ready', lastEditor: actor(COLLEAGUE) })).approve).toEqual({ allowed: true });
    expect(contentActions(row({ approvedVersion: 1, status: 'approved' })).archive.allowed).toBe(true);
  });

  it('archived rows: no edit, restore only', () => {
    expect(contentActions(row({ status: 'archived' }))).toMatchObject({
      save: { allowed: false, reason: 'Restore it before editing.' },
      ready: { allowed: false },
      approve: { allowed: false },
      archive: { allowed: false },
      restore: { allowed: true },
    });
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

describe('who gets a Reset link', () => {
  const member = (role: TdStaffMember['role'], status: TdStaffMember['status'] = 'active', id = `m-${role}`): TdStaffMember => ({ id, email: `${role}@x.test`, name: role, role, status, lastSignInAt: null });
  it('team managers, for an active member who is neither themselves nor ops', () => {
    const admin = { id: 'me', role: 'betsson_admin' as const };
    expect(canMakeResetLink(admin, member('betsson_admin'))).toBe(true);
    expect(canMakeResetLink({ id: 'me', role: 'ops' }, member('betsson_admin'))).toBe(true);
    expect(canMakeResetLink(admin, member('betsson_admin', 'active', 'me'))).toBe(false);
    expect(canMakeResetLink(admin, member('ops'))).toBe(false);
    expect(canMakeResetLink(admin, member('betsson_admin', 'invited'))).toBe(false);
    expect(canMakeResetLink(admin, member('betsson_admin', 'disabled'))).toBe(false);
    expect(canMakeResetLink(null, member('betsson_admin'))).toBe(false);
  });
});

describe('who may change a member', () => {
  const member = (role: TdStaffMember['role'], status: TdStaffMember['status'] = 'active', id = `m-${role}`): TdStaffMember => ({ id, email: `${role}@x.test`, name: role, role, status, lastSignInAt: null });
  it('team managers, for anyone but themselves and ops, whatever their status', () => {
    const admin = { id: 'me', role: 'betsson_admin' as const };
    for (const status of ['active', 'invited', 'disabled'] as const) expect(canManageMember(admin, member('betsson_admin', status))).toBe(true);
    expect(canManageMember({ id: 'me', role: 'ops' }, member('betsson_admin'))).toBe(true);
    expect(canManageMember(admin, member('betsson_admin', 'active', 'me'))).toBe(false);
    expect(canManageMember(admin, member('ops'))).toBe(false);
    expect(canManageMember({ id: 'me', role: 'ops' }, member('ops'))).toBe(false);
    expect(canManageMember(null, member('betsson_admin'))).toBe(false);
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
    // A card the approver edited last goes with the category too.
    const review = reviewCategory([kid('a', 'ready'), kid('b', 'approved'), kid('c', 'draft'), kid('d', 'ready', COLLEAGUE)]);
    expect(review.withIt.map((r) => r.id)).toEqual(['a', 'd']);
    expect(review.approved.map((r) => r.id)).toEqual(['b']);
    expect(review.blockers.map((b) => b.row.id)).toEqual(['c']);
    expect(review.canApprove).toBe(false);
    expect(reviewCategory([kid('a', 'ready')]).canApprove).toBe(true);
    expect(reviewCategory([])).toMatchObject({ canApprove: false, problem: 'A category needs at least one approved row.' });
    expect(reviewCategory(Array.from({ length: 501 }, (_, i) => kid(`k${i}`, 'ready'))).problem).toMatch(/At most 500/);
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

describe('withShownAnswer', () => {
  it('puts the shown answer first among the spellings of the types whose rounds count only those', () => {
    expect(withShownAnswer('cards', { display: 'Lionel Messi', aliases: ['Messi'] })).toEqual({ display: 'Lionel Messi', aliases: ['Lionel Messi', 'Messi'] });
    expect(withShownAnswer('box-questions', { display: ' Mbappé ', aliases: [] }).aliases).toEqual(['Mbappé']);
  });

  it('leaves the spellings alone when the shown answer is among them already, whatever its case or accents', () => {
    const data = { display: 'Luka Modrić', aliases: ['luka modric', 'Modric'] };
    expect(withShownAnswer('cards', data)).toBe(data);
  });

  it('leaves the types that match the shown answer themselves, and an empty answer, alone', () => {
    const daily = { displayAnswer: 'Lewandowski', aliases: [] };
    expect(withShownAnswer('football-logic', daily)).toBe(daily);
    const empty = { display: '', aliases: [] };
    expect(withShownAnswer('cards', empty)).toBe(empty);
  });
});
