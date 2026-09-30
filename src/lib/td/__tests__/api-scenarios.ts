/**
 * Behaviour the tabs rely on, written once and run against the mock
 * (mock-api-contract.test.ts) and, on demand, against a real Table Derby API
 * (real-api.test.ts): the workflow, its refusals and their effects. Every
 * scenario makes its own content under unique keys, so it can run against a
 * database that holds other content.
 */
import { expect, it } from 'vitest';
import { TD_CONTENT_TYPES, type TdContentType } from '../admin-api';
import { addDays } from '../georgia';
import { pngBlob, type Harness } from './api-harness';

type Row = { id: string; version: number; contentVersion: number; status: string; approvedVersion: number | null; data: Record<string, unknown>; approved: Record<string, unknown> | null };
type Body = Record<string, unknown>;

export function apiScenarios(h: () => Harness) {
  const run = Math.random().toString(36).slice(2, 8);
  const farDate = addDays('2031-01-01', Math.floor(Math.random() * 3000));
  const made: Partial<Record<TdContentType, Row>> = {};
  let uploadId = '';

  const create = async (role: Parameters<Harness['call']>[0], type: TdContentType, data: Body, note?: string) => {
    const res = await h().call(role, 'POST', `/admin/content/${type}`, { body: { data, ...(note ? { note } : {}) } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as Row;
  };
  const step = async (role: Parameters<Harness['call']>[0], type: TdContentType, row: Row, action: string, extra: Body = {}) =>
    h().call(role, 'POST', `/admin/content/${type}/${row.id}/${action}`, { body: { version: row.version, ...extra } });
  const ok = (res: { status: number; body: unknown }) => {
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    return res.body as Row;
  };

  const sample = (type: TdContentType): Body => {
    switch (type) {
      case 'card-categories': return { key: `cat-${run}`, prompt: 'Scenario prompt' };
      case 'cards': return { categoryKey: `cat-${run}`, key: `card-${run}`, value: 2, lines: ['Georgia'], display: 'Answer', aliases: ['answer'], photo: null, imageKey: null };
      case 'whoami-subjects': return { key: `who-${run}`, display: 'Answer', aliases: ['answer'], clues: ['First clue', 'Second clue'] };
      case 'box-categories': return { key: `box-${run}`, title: 'Scenario box' };
      case 'box-questions': return { categoryKey: `box-${run}`, key: `bq-${run}`, q: 'Question?', display: 'Answer', aliases: ['answer'] };
      case 'penalty-questions': return { key: `pen-${run}`, q: 'Question?', display: 'Answer', aliases: ['answer'] };
      case 'practice-questions': return { key: `prac-${run}`, difficulty: 'easy', category: 'Scenario', prompt: 'Pick one', options: ['A', 'B'], answer: 0, explanation: null, imageKey: `img-${run}` };
      case 'media': return { key: `img-${run}`, url: null, uploadId, width: 16, height: 9, author: 'Scenario', license: 'CC0', source: 'Generated' };
      case 'clubs': return { key: `club-${run}`, label: 'Scenario FC', value: 'Scenario FC', country: 'Georgia', countryKa: null, flag: null, crest: `club-${run}.webp`, crestImageKey: null, hidden: false };
      case 'football-logic': return { key: `fl-${run}`, puzzle: `flp-${run}`, category: 'Scenario', prompt: '', imageA: null, imageB: null, displayAnswer: 'Answer', acceptedAnswers: ['answer'] };
      case 'put-in-order': return { key: `pio-${run}`, puzzle: `piop-${run}`, prompt: 'Order these', items: [{ key: 'a', label: 'A', sortValue: 1 }, { key: 'b', label: 'B', sortValue: 2 }] };
      case 'career-path': return { key: `cp-${run}`, puzzle: `cpp-${run}`, prompt: 'Whose career?', displayAnswer: 'Answer', acceptedAnswers: ['answer'], clubs: [{ name: 'Scenario FC', clubKey: `club-${run}` }] };
      case 'daily-schedule': return { game: 'footballLogic', date: farDate, puzzle: `flp-${run}` };
      case 'daily-settings': throw new Error('daily settings are one per game');
    }
  };

  it('uploads an image: checked by its bytes, readable back, refused when it is not one', async () => {
    const up = await h().call('editor', 'POST', '/admin/media/uploads', { raw: pngBlob(), contentType: 'image/png' });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({ contentType: 'image/png', width: 16, height: 9 });
    uploadId = (up.body as { id: string }).id;
    expect((await h().call('editor', 'GET', `/admin/media/uploads/${uploadId}`)).status).toBe(200);
    const file = await h().call('editor', 'GET', `/admin/media/uploads/${uploadId}/file`);
    expect(file.status).toBe(200);
    expect(file.contentType).toMatch(/^image\/png/);
    expect((file.body as ArrayBuffer).byteLength).toBeGreaterThan(8);
    const text = await h().call('editor', 'POST', '/admin/media/uploads', { raw: new Blob(['hello'], { type: 'text/plain' }), contentType: 'text/plain' });
    expect(text).toMatchObject({ status: 422, body: { code: 'invalid_image', details: { reason: 'type' } } });
  });

  it('every content type: create, read, list, history, edit, mark ready', async () => {
    // What a row refers to is made first.
    const order: TdContentType[] = ['media', 'clubs', 'card-categories', 'cards', 'whoami-subjects', 'box-categories', 'box-questions', 'penalty-questions', 'practice-questions', 'football-logic', 'put-in-order', 'career-path', 'daily-schedule'];
    expect(new Set([...order, 'daily-settings'])).toEqual(new Set(TD_CONTENT_TYPES));
    for (const type of order) {
      const row = await create('editor', type, sample(type));
      expect(row).toMatchObject({ status: 'draft', version: 1, contentVersion: 1, approvedVersion: null });
      expect((await h().call('editor', 'GET', `/admin/content/${type}/${row.id}`)).body).toMatchObject({ id: row.id });
      expect((await h().call('editor', 'GET', `/admin/content/${type}/${row.id}/history`)).body).toMatchObject({ items: [{ action: 'create' }] });
      const listed = await h().call('editor', 'GET', `/admin/content/${type}?status=draft&sort=created&dir=desc&limit=200`);
      expect((listed.body as { items: Row[] }).items.some((r) => r.id === row.id), type).toBe(true);
      const noted = ok(await h().call('editor', 'PATCH', `/admin/content/${type}/${row.id}`, { body: { version: 1, data: row.data, note: 'checked' } }));
      expect(noted).toMatchObject({ version: 2, contentVersion: 1, status: 'draft' });
      made[type] = ok(await step('editor', type, noted, 'ready'));
      expect(made[type]!.status).toBe('ready');
    }
  });

  it('approves in dependency order; a category with its listed children', async () => {
    const order: TdContentType[] = ['media', 'clubs', 'whoami-subjects', 'penalty-questions', 'practice-questions', 'football-logic', 'put-in-order', 'career-path', 'daily-schedule'];
    for (const type of order) {
      const approved = ok(await step('publisher', type, made[type]!, 'approve'));
      expect(approved, type).toMatchObject({ status: 'approved', approvedVersion: approved.contentVersion });
      made[type] = approved;
    }
    // Children listed at their versions are approved with their category, in one step.
    const cards = made.cards!;
    const conflict = await step('publisher', 'card-categories', made['card-categories']!, 'approve', { children: [{ id: cards.id, version: cards.version + 5 }] });
    expect(conflict).toMatchObject({ status: 409, body: { code: 'revision_conflict', details: { child: { type: 'cards', id: cards.id }, current: { id: made['card-categories']!.id } } } });
    const without = await step('publisher', 'card-categories', made['card-categories']!, 'approve');
    expect(without).toMatchObject({ status: 409, body: { code: 'dependency_unapproved', details: { refs: [{ type: 'cards', id: cards.id }] } } });
    made['card-categories'] = ok(await step('publisher', 'card-categories', made['card-categories']!, 'approve', { children: [{ id: cards.id, version: cards.version }] }));
    made.cards = (await h().call('editor', 'GET', `/admin/content/cards/${cards.id}`)).body as Row;
    expect(made.cards.status).toBe('approved');
    // Once its category is approved, a new card is approved on its own.
    const late = await create('editor', 'cards', { ...sample('cards'), key: `late-${run}` });
    expect(ok(await step('publisher', 'cards', ok(await step('editor', 'cards', late, 'ready')), 'approve')).status).toBe('approved');
    made['box-questions'] = ok(await step('publisher', 'box-questions', made['box-questions']!, 'approve'));
    made['box-categories'] = ok(await step('publisher', 'box-categories', made['box-categories']!, 'approve'));
  });

  it('refuses a stale version with the row as it is now, and self-approval', async () => {
    const pen = made['penalty-questions']!;
    const stale = await h().call('editor', 'PATCH', `/admin/content/penalty-questions/${pen.id}`, { body: { version: pen.version - 1, data: pen.data } });
    expect(stale).toMatchObject({ status: 409, body: { code: 'revision_conflict', details: { current: { id: pen.id, version: pen.version } } } });
    const fixed = await h().call('editor', 'PATCH', `/admin/content/penalty-questions/${pen.id}`, { body: { version: pen.version, data: { ...pen.data, key: `renamed-${run}` } } });
    expect(fixed).toMatchObject({ status: 422, body: { code: 'validation' } });
    // An edit of approved content is a draft again, keeping what was approved.
    const edited = ok(await h().call('publisher', 'PATCH', `/admin/content/penalty-questions/${pen.id}`, { body: { version: pen.version, data: { ...pen.data, display: 'Changed' } } }));
    expect(edited).toMatchObject({ status: 'draft', contentVersion: pen.contentVersion + 1, approvedVersion: pen.contentVersion, approved: { display: 'Answer' } });
    const ready = ok(await step('publisher', 'penalty-questions', edited, 'ready'));
    expect(await step('publisher', 'penalty-questions', ready, 'approve')).toMatchObject({ status: 403, body: { code: 'self_approval' } });
    expect(await step('editor', 'penalty-questions', ready, 'approve')).toMatchObject({ status: 403, body: { code: 'forbidden' } });
    expect(await step('publisher', 'penalty-questions', ready, 'ready')).toMatchObject({ status: 403, body: { code: 'forbidden_transition' } });
    made['penalty-questions'] = ok(await step('betsson_admin', 'penalty-questions', ready, 'approve'));
    const taken = await h().call('editor', 'POST', '/admin/content/penalty-questions', { body: { data: sample('penalty-questions') } });
    expect(taken).toMatchObject({ status: 409, body: { code: 'already_exists' } });
  });

  it('archives and restores: editors only their own untouched drafts; referenced rows stay', async () => {
    const own = await create('editor', 'box-categories', { key: `own-${run}`, title: 'Own' });
    const archived = ok(await step('editor', 'box-categories', own, 'archive'));
    expect(archived.status).toBe('archived');
    expect(await h().call('editor', 'PATCH', `/admin/content/box-categories/${own.id}`, { body: { version: archived.version, data: own.data } })).toMatchObject({
      status: 403,
      body: { code: 'forbidden_transition' },
    });
    expect(await step('editor', 'box-categories', archived, 'restore')).toMatchObject({ status: 403, body: { code: 'forbidden' } });
    expect(ok(await step('publisher', 'box-categories', archived, 'restore')).status).toBe('draft');

    const touched = await create('editor', 'box-categories', { key: `touched-${run}`, title: 'Touched' });
    const noted = ok(await h().call('publisher', 'PATCH', `/admin/content/box-categories/${touched.id}`, { body: { version: 1, data: touched.data, note: 'by someone else' } }));
    expect(await step('editor', 'box-categories', noted, 'archive')).toMatchObject({ status: 403, body: { code: 'forbidden' } });

    expect(await step('publisher', 'media', made.media!, 'archive')).toMatchObject({ status: 409, body: { code: 'in_use' } });
    expect(await h().call('editor', 'DELETE', `/admin/media/uploads/${uploadId}`)).toMatchObject({ status: 409, body: { code: 'in_use' } });
    const spare = await h().call('editor', 'POST', '/admin/media/uploads', { raw: pngBlob(), contentType: 'image/png' });
    expect((await h().call('editor', 'DELETE', `/admin/media/uploads/${(spare.body as { id: string }).id}`)).status).toBe(204);
  });

  it('every content type: archive and restore refuse a stale version', async () => {
    for (const type of TD_CONTENT_TYPES) {
      if (type === 'daily-settings') continue;
      const row = made[type]!;
      const stale = { ...row, version: row.version + 9 };
      expect(await step('publisher', type, stale, 'archive'), type).toMatchObject({ status: 409, body: { code: 'revision_conflict' } });
      expect(await step('publisher', type, stale, 'restore'), type).toMatchObject({ status: 409, body: { code: 'revision_conflict' } });
    }
  });

  it('daily settings: one per game, a note never changes the content, transitions follow the status', async () => {
    const list = await h().call('editor', 'GET', '/admin/content/daily-settings?game=footballLogic');
    const row = (list.body as { items: Row[] }).items[0];
    expect(row).toBeDefined();
    expect((await h().call('editor', 'GET', `/admin/content/daily-settings/${row.id}`)).status).toBe(200);
    expect((await h().call('editor', 'GET', `/admin/content/daily-settings/${row.id}/history?limit=5`)).status).toBe(200);
    expect(await h().call('editor', 'POST', '/admin/content/daily-settings', { body: { data: row.data } })).toMatchObject({ status: 409, body: { code: 'already_exists' } });
    const noted = ok(await h().call('editor', 'PATCH', `/admin/content/daily-settings/${row.id}`, { body: { version: row.version, data: row.data, note: `scenario ${run}` } }));
    expect(noted).toMatchObject({ contentVersion: row.contentVersion, status: row.status });
    if (noted.status === 'approved') {
      expect(await step('editor', 'daily-settings', noted, 'ready')).toMatchObject({ status: 403, body: { code: 'forbidden_transition' } });
      expect(await step('publisher', 'daily-settings', noted, 'approve')).toMatchObject({ status: 403, body: { code: 'forbidden_transition' } });
    }
    const stale = { ...noted, version: noted.version + 9 };
    expect(await step('publisher', 'daily-settings', stale, 'archive')).toMatchObject({ status: 409, body: { code: 'revision_conflict' } });
    expect(await step('publisher', 'daily-settings', stale, 'restore')).toMatchObject({ status: 409, body: { code: 'revision_conflict' } });
  });

  it('lists filter by what each type has, and refuse a filter it has not', async () => {
    const cards = await h().call('editor', 'GET', `/admin/content/cards?category=cat-${run}`);
    expect((cards.body as { items: Row[] }).items.map((r) => r.data.key)).toEqual([`card-${run}`, `late-${run}`]);
    const puzzle = await h().call('editor', 'GET', `/admin/content/football-logic?puzzle=flp-${run}`);
    expect((puzzle.body as { items: Row[] }).items).toHaveLength(1);
    const calendar = await h().call('editor', 'GET', `/admin/content/daily-schedule?game=footballLogic&from=${farDate}&to=${farDate}`);
    expect((calendar.body as { items: Row[] }).items).toHaveLength(1);
    expect((await h().call('editor', 'GET', '/admin/content/penalty-questions?category=x')).status).toBe(400);
    const page = await h().call('editor', 'GET', '/admin/content/penalty-questions?limit=2');
    const next = (page.body as { nextCursor: string | null }).nextCursor;
    expect(next).toEqual(expect.any(String));
    expect((await h().call('editor', 'GET', `/admin/content/penalty-questions?limit=2&cursor=${next}`)).status).toBe(200);
  });

  it('imports: preview judges each item; apply is all or none, once per key; undo keeps what changed', async () => {
    const item = (n: number) => ({ type: 'penalty-questions', data: { key: `imp-${run}-${n}`, q: 'Imported?', display: 'Yes', aliases: ['yes'] } });
    const preview = await h().call('editor', 'POST', '/admin/content/imports/preview', {
      body: { items: [item(1), { type: 'penalty-questions', data: { key: 'Bad Key' } }, { type: 'cards', data: { ...sample('cards'), key: `imp-card-${run}`, categoryKey: `missing-${run}` } }] },
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ counts: { items: 3, create: 1, error: 2 } });
    const codes = (preview.body as { rows: { issues: { code: string }[] }[] }).rows.map((r) => r.issues.map((i) => i.code));
    expect(codes[1]).toContain('invalid');
    expect(codes[2]).toContain('missing_reference');
    const refused = await h().call('editor', 'POST', '/admin/content/imports', { body: { batchKey: `scenario:${run}:bad`, items: [item(1), { type: 'x' }] } });
    expect(refused).toMatchObject({ status: 422, body: { code: 'validation', details: { counts: { error: 1 } } } });
    const key = `scenario:${run}:good`;
    const applied = await h().call('editor', 'POST', '/admin/content/imports', { body: { batchKey: key, items: [item(1), item(2)] } });
    expect(applied).toMatchObject({ status: 201, body: { created: true, batch: { status: 'applied', itemCount: 2 } } });
    const batch = (applied.body as { batch: { id: string; rows: { id: string }[] } }).batch;
    expect(await h().call('editor', 'POST', '/admin/content/imports', { body: { batchKey: key, items: [item(1), item(2)] } })).toMatchObject({ status: 200, body: { created: false } });
    expect(await h().call('editor', 'POST', '/admin/content/imports', { body: { batchKey: key, items: [item(3)] } })).toMatchObject({ status: 409, body: { code: 'conflict' } });
    expect((await h().call('editor', 'GET', '/admin/content/imports?limit=5')).status).toBe(200);
    expect((await h().call('editor', 'GET', `/admin/content/imports/${batch.id}`)).body).toMatchObject({ rows: [{ outcome: 'created' }, { outcome: 'created' }] });
    const first = (await h().call('editor', 'GET', `/admin/content/penalty-questions/${batch.rows[0].id}`)).body as Row;
    ok(await step('editor', 'penalty-questions', first, 'ready'));
    const undone = await h().call('editor', 'POST', `/admin/content/imports/${batch.id}/undo`);
    expect(undone).toMatchObject({ status: 200, body: { status: 'partly_undone', counts: { removed: 1, kept: 1 }, rows: [{ outcome: 'kept', reason: 'edited' }, { outcome: 'removed' }] } });
    expect((await h().call('editor', 'GET', `/admin/content/penalty-questions/${batch.rows[1].id}`)).status).toBe(404);
  });

  it('releases: validate, publish with a key (again: the same run), progress by phase, roll back', async () => {
    const report = await h().call('editor', 'POST', '/admin/releases/validate');
    expect(report.status).toBe(200);
    expect(report.body, JSON.stringify((report.body as { errors: unknown }).errors)).toMatchObject({ ok: true });
    const key = `publish:${run}`;
    expect(await h().call('editor', 'POST', '/admin/releases/publish', { body: { idemKey: key } })).toMatchObject({ status: 403 });
    const started = await h().call('publisher', 'POST', '/admin/releases/publish', { body: { idemKey: key } });
    expect(started.status).toBe(202);
    const id = (started.body as { id: string }).id;
    if (!h().real) {
      expect(await h().call('publisher', 'POST', '/admin/releases/publish', { body: { idemKey: `${key}:other` } })).toMatchObject({
        status: 409,
        body: { code: 'publication_in_progress', details: { publicationId: id } },
      });
    }
    expect(await h().call('publisher', 'POST', '/admin/releases/publish', { body: { idemKey: key } })).toMatchObject({ status: 200, body: { id } });
    let publication = started.body as { status: string; releaseId: string; previousReleaseId: string | null; notify: { state: string }; phases: { state: string }[] };
    for (let i = 0; i < 120 && (publication.status === 'running' || publication.notify.state === 'pending' || publication.notify.state === 'none'); i++) {
      await h().wait(500);
      publication = (await h().call('editor', 'GET', `/admin/publications/${id}`)).body as typeof publication;
      if (publication.status === 'failed') break;
    }
    expect(publication, JSON.stringify(publication)).toMatchObject({ status: 'published' });
    expect(publication.phases.every((p) => p.state === 'done' || p.state === 'skipped')).toBe(true);
    const list = await h().call('editor', 'GET', '/admin/releases?limit=10');
    expect(list.body).toMatchObject({ pointer: { releaseId: publication.releaseId }, active: null });
    const detail = await h().call('editor', 'GET', `/admin/releases/${publication.releaseId}`);
    expect(detail.status).toBe(200);
    expect((detail.body as { members: { id: string }[] }).members.some((m) => m.id === made.media!.id)).toBe(true);
    expect(await h().call('publisher', 'POST', `/admin/releases/${publication.releaseId}/rollback`, { body: { idemKey: key } })).toMatchObject({
      status: 409,
      body: { code: 'idempotency_conflict' },
    });
    expect(await h().call('publisher', 'POST', `/admin/releases/${publication.releaseId}/rollback`, { body: { idemKey: `rollback:${run}:current` } })).toMatchObject({
      status: 409,
      body: { code: 'not_rollback_target' },
    });
    const back = await h().call('publisher', 'POST', `/admin/releases/${publication.previousReleaseId}/rollback`, { body: { idemKey: `rollback:${run}` } });
    expect(back.status, JSON.stringify(back.body)).toBe(202);
    let rolled = back.body as { id: string; status: string };
    for (let i = 0; i < 60 && rolled.status === 'running'; i++) {
      await h().wait(500);
      rolled = (await h().call('editor', 'GET', `/admin/publications/${rolled.id}`)).body as typeof rolled;
    }
    expect(rolled.status).toBe('published');
    expect(((await h().call('editor', 'GET', '/admin/releases')).body as { pointer: { releaseId: string } }).pointer.releaseId).toBe(publication.previousReleaseId);
  });

  it('dashboard is any member’s; players, the leaderboard and settings follow the roles', async () => {
    expect(await h().staffId('editor')).toEqual(expect.any(String));
    expect((await h().call('editor', 'GET', '/admin/dashboard')).body).toMatchObject({ timezone: 'Asia/Tbilisi' });
    expect(await h().call('editor', 'GET', '/admin/players?q=a')).toMatchObject({ status: 403 });
    expect(await h().call('editor', 'GET', '/admin/leaderboard')).toMatchObject({ status: 403 });
    expect(await h().call('betsson_admin', 'GET', '/admin/settings')).toMatchObject({ status: 403 });
    expect(await h().call('betsson_admin', 'GET', '/admin/reviews')).toMatchObject({ status: 403 });
    expect((await h().call('betsson_admin', 'GET', '/admin/staff')).status).toBe(200);

    const settings = (await h().call('ops', 'GET', '/admin/settings')).body as { ticketsPerDay: { version: number; value: number }; maintenance: { version: number; enabled: boolean } };
    const stale = await h().call('ops', 'PATCH', '/admin/settings/tickets-per-day', { body: { version: settings.ticketsPerDay.version + 7, value: 6 } });
    expect(stale).toMatchObject({ status: 409 });
    const tickets = await h().call('ops', 'PATCH', '/admin/settings/tickets-per-day', { body: { version: settings.ticketsPerDay.version, value: settings.ticketsPerDay.value } });
    expect([200, 409]).toContain(tickets.status);
    const on = await h().call('ops', 'PATCH', '/admin/settings/maintenance', { body: { version: settings.maintenance.version, enabled: !settings.maintenance.enabled } });
    expect(on.status).toBe(200);
    const off = (on.body as typeof settings).maintenance;
    expect((await h().call('ops', 'PATCH', '/admin/settings/maintenance', { body: { version: off.version, enabled: settings.maintenance.enabled } })).status).toBe(200);

    const board = await h().call('betsson_admin', 'GET', '/admin/leaderboard?limit=5');
    expect(board.status).toBe(200);
    const csv = await h().call('betsson_admin', 'GET', '/admin/leaderboard/export');
    expect(csv.status).toBe(200);
    expect(csv.contentType).toMatch(/^text\/csv/);
    expect(String(csv.body).replace(/^﻿/, '').split(/\r?\n/)[0]).toMatch(/rank/);
    const label = `Scenario ${run}`;
    const snap = await h().call('betsson_admin', 'POST', '/admin/leaderboard/snapshots', { body: { label } });
    expect(snap.status).toBe(201);
    expect(await h().call('ops', 'POST', '/admin/leaderboard/snapshots', { body: { label: label.toUpperCase() } })).toMatchObject({ status: 409, body: { code: 'already_exists' } });
    const snapId = (snap.body as { id: string }).id;
    expect((await h().call('betsson_admin', 'GET', '/admin/leaderboard/snapshots?limit=5')).status).toBe(200);
    expect((await h().call('betsson_admin', 'GET', `/admin/leaderboard/snapshots/${snapId}`)).body).toMatchObject({ snapshot: { id: snapId, label } });
    expect((await h().call('betsson_admin', 'GET', `/admin/leaderboard/snapshots/${snapId}/export`)).contentType).toMatch(/^text\/csv/);
    expect((await h().call('ops', 'GET', '/admin/reviews?status=all')).status).toBe(200);
  });

  it('players: search, profile, matches, tickets, a match record and its correction', async (ctx) => {
    const found = await h().call('betsson_admin', 'GET', '/admin/players?q=N');
    expect(found.status).toBe(200);
    const players = (found.body as { items: { id: string }[] }).items;
    // A real database needs players with a settled match (the mock has them): reported as skipped, not passed.
    if (h().real && players.length === 0) return ctx.skip();
    expect(players.length).toBeGreaterThan(0);
    const player = players[0].id;
    expect((await h().call('betsson_admin', 'GET', `/admin/players/${player}`)).status).toBe(200);
    expect((await h().call('betsson_admin', 'GET', `/admin/players/${player}/tickets`)).status).toBe(200);
    const matches = (await h().call('betsson_admin', 'GET', `/admin/players/${player}/matches`)).body as { items: { matchId: string; status: string; resultVersion: number }[] };
    const settled = matches.items.find((m) => m.status === 'settled');
    if (h().real && !settled) return ctx.skip();
    expect(settled).toBeDefined();
    if (!settled) return;
    const record = await h().call('betsson_admin', 'GET', `/admin/matches/${settled.matchId}`);
    expect(record.status).toBe(200);
    const correction = { version: settled.resultVersion, outcome: { kind: 'void' }, reason: `Scenario ${run}` };
    expect(await h().call('betsson_admin', 'POST', `/admin/matches/${settled.matchId}/corrections`, { body: correction })).toMatchObject({ status: 403 });
    const voided = await h().call('ops', 'POST', `/admin/matches/${settled.matchId}/corrections`, { body: correction });
    expect(voided).toMatchObject({ status: 201, body: { status: 'void', resultVersion: settled.resultVersion + 1 } });
    expect(await h().call('ops', 'POST', `/admin/matches/${settled.matchId}/corrections`, { body: correction })).toMatchObject({ status: 409, body: { code: 'revision_conflict' } });
    expect(await h().call('ops', 'POST', `/admin/matches/${settled.matchId}/corrections`, { body: { ...correction, version: settled.resultVersion + 1 } })).toMatchObject({
      status: 409,
      body: { code: 'same_result' },
    });
    const reviews = (await h().call('ops', 'GET', '/admin/reviews')).body as { items: { id: string }[] };
    if (reviews.items[0]) {
      expect((await h().call('ops', 'POST', `/admin/reviews/${reviews.items[0].id}/dismiss`, { body: { note: 'Checked' } })).status).toBe(200);
      expect(await h().call('ops', 'POST', `/admin/reviews/${reviews.items[0].id}/dismiss`, { body: { note: 'Again' } })).toMatchObject({ status: 409, body: { code: 'conflict' } });
    }
  });
}
