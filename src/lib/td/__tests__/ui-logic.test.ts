import { describe, expect, it } from 'vitest';
import type { TdStaffMember } from '@/types/td';
import type { WebhookEventDetail } from '@/lib/td/contract';
import { reviewCategory } from '@/components/td/content/td-category-approval';
import { buildDays } from '@/components/td/tabs/dailies-tab';
import { uploadDays } from '../dailies';
import { questionKey, type ParsedCareerPath } from '../upload-format';
import { replaySteps } from '@/components/td/tabs/players-tab';
import { pollInterval } from '@/components/td/tabs/integration-tab';
import { canMakeResetLink } from '@/components/td/td-team';
import { followAnswer } from '@/components/td/content/editors/library';
import type { TdContentRow } from '../admin-api';
import { mergeDrafts, resolveConflicts } from '../merge';
import { editorialIssues, TD_FIXED_FIELDS, TD_MERGE_UNITS } from '../content-rules';
import { contentActions } from '../workflow';
import { withShownAnswer } from '../answers';
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

  it('offers ready on drafts, approval to publishers, their own last edit included', () => {
    expect(contentActions(row(), EDITOR)).toMatchObject({ save: { allowed: true }, ready: { allowed: true }, approve: { allowed: false }, restore: { allowed: false } });
    const ready = row({ status: 'ready' });
    expect(contentActions(ready, EDITOR).approve).toEqual({ allowed: false, reason: 'Ready for a publisher to approve.' });
    expect(contentActions(ready, PUBLISHER).approve).toEqual({ allowed: true });
    expect(contentActions({ ...ready, lastEditor: actor(PUBLISHER) }, PUBLISHER).approve).toEqual({ allowed: true });
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

describe('who gets a Reset link', () => {
  const member = (role: TdStaffMember['role'], status: TdStaffMember['status'] = 'active', id = `m-${role}`): TdStaffMember => ({ id, email: `${role}@x.test`, name: role, role, status, lastSignInAt: null });
  it('team managers, for an active member who is neither themselves nor ops', () => {
    const admin = { id: 'me', role: 'betsson_admin' as const };
    expect(canMakeResetLink(admin, member('editor'))).toBe(true);
    expect(canMakeResetLink({ id: 'me', role: 'ops' }, member('betsson_admin'))).toBe(true);
    expect(canMakeResetLink(admin, member('betsson_admin', 'active', 'me'))).toBe(false);
    expect(canMakeResetLink(admin, member('ops'))).toBe(false);
    expect(canMakeResetLink(admin, member('editor', 'invited'))).toBe(false);
    expect(canMakeResetLink(admin, member('editor', 'disabled'))).toBe(false);
    for (const role of ['editor', 'publisher'] as const) expect(canMakeResetLink({ id: 'me', role }, member('editor'))).toBe(false);
    expect(canMakeResetLink(null, member('editor'))).toBe(false);
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
    const review = reviewCategory([kid('a', 'ready'), kid('b', 'approved'), kid('c', 'draft'), kid('d', 'ready', PUBLISHER)]);
    expect(review.withIt.map((r) => r.id)).toEqual(['a', 'd']);
    expect(review.approved.map((r) => r.id)).toEqual(['b']);
    expect(review.blockers.map((b) => b.row.id)).toEqual(['c']);
    expect(review.canApprove).toBe(false);
    expect(reviewCategory([kid('a', 'ready')]).canApprove).toBe(true);
    expect(reviewCategory([])).toMatchObject({ canApprove: false, problem: 'A category needs at least one approved row.' });
    expect(reviewCategory(Array.from({ length: 501 }, (_, i) => kid(`k${i}`, 'ready'))).problem).toMatch(/At most 500/);
  });
});

describe('the days of a daily game', () => {
  let n = 0;
  const question = (puzzle: string, over: Partial<TdContentRow<'cards'>> = {}) =>
    ({ ...row({ id: `q${++n}`, status: 'approved', createdAt: `2026-10-0${n % 9}T00:00:00Z`, ...over }), data: { puzzle, prompt: `Question ${n}?`, displayAnswer: 'x' } }) as unknown as TdContentRow<'football-logic'>;
  const tenOf = (puzzle: string, over: Partial<TdContentRow<'cards'>> = {}) => Array.from({ length: 10 }, () => question(puzzle, over));
  const schedule = (date: string, puzzle: string, over: Partial<TdContentRow<'daily-schedule'>> = {}) =>
    ({ ...row(), id: date, status: 'approved', approvedVersion: 1, data: { game: 'footballLogic', date, puzzle }, approved: { game: 'footballLogic', date, puzzle }, ...over }) as unknown as TdContentRow<'daily-schedule'>;

  it('groups questions by day: dated days by date, then the rest; whole days only can be published', () => {
    const days = buildDays(
      'footballLogic',
      [...tenOf('fl-later'), ...tenOf('fl-ready', { status: 'draft' }), ...tenOf('fl-first'), ...tenOf('fl-edited'), question('fl-short'), question('fl-gone', { status: 'archived' })],
      [schedule('2026-10-08', 'fl-later'), schedule('2026-10-06', 'fl-first'), schedule('2026-10-09', 'fl-archived', { status: 'archived' })],
      ['fl-first', 'fl-later', 'fl-edited'],
    );
    expect(days.map((d) => [d.key, d.status, d.dates, d.questions.length])).toEqual([
      ['fl-first', 'published', ['2026-10-06'], 10],
      ['fl-later', 'published', ['2026-10-08'], 10],
      ['fl-ready', 'ready', [], 10],
      ['fl-edited', 'published', [], 10],
      ['fl-short', 'incomplete', [], 1],
    ]);
  });

  it('dates a day by approved calendar entries only: a draft entry is not on the calendar yet', () => {
    const draft = schedule('2026-10-10', 'fl-x', { status: 'draft', approvedVersion: null, approved: null });
    expect(buildDays('footballLogic', tenOf('fl-x', { status: 'draft' }), [draft], [])[0]!).toMatchObject({ dates: [], status: 'ready' });
    const moved = schedule('2026-10-11', 'fl-y', { status: 'draft', approvedVersion: 1, approved: { game: 'footballLogic', date: '2026-10-11', puzzle: 'fl-x' } } as never);
    expect(buildDays('footballLogic', tenOf('fl-x'), [moved], [])[0]!.dates).toEqual(['2026-10-11']);
  });

  it('a published day with a question changed since has changes to publish', () => {
    const rows = tenOf('fl-a');
    rows[3] = { ...rows[3]!, status: 'draft' };
    expect(buildDays('footballLogic', rows, [schedule('2026-10-07', 'fl-a')], [])[0]!.status).toBe('changes');
  });

  it('an upload’s day keys come from what the file says: a club found later makes the same days', () => {
    const career = (display: string, clubs: string[]): ParsedCareerPath => ({ kind: 'career-path', questionNumber: 1, lineNumber: 1, prompt: null, clubs, display, aliases: [display.toLowerCase()] });
    const questions = Array.from({ length: 10 }, (_, i) => career(`Player ${i}`, ['Dinamo Tbilisi', 'Rubin Kazan']));
    const context = { categoryKey: '', category: '', puzzle: '', clubs: [] };
    const known = { ...context, clubs: [{ key: 'dinamo-tbilisi', label: 'Dinamo Tbilisi', value: 'Dinamo Tbilisi' }] };
    const before = uploadDays('careerPath', questions, (q) => questionKey(q, context));
    expect(uploadDays('careerPath', questions, (q) => questionKey(q, known))).toEqual(before);
    expect(new Set(before.map((d) => d.key)).size).toBe(1);
    // Another answer is another day.
    expect(uploadDays('careerPath', [career('Someone else', ['Rubin Kazan']), ...questions.slice(1)], (q) => questionKey(q, context))[0]!.key).not.toBe(before[0]!.key);
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
