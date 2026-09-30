import { describe, expect, it, vi } from 'vitest';
import { createTdAdminApi, queryString } from '../admin-api';
import { createTdApiClient, createTransport, requestTokenRefresh, SESSION_CHANGED, TdApiError } from '../api-client';
import { describeTdError, tdErrorText } from '../errors';
import { addDays, georgiaToday, monthGrid, scheduledSet, shiftMonth } from '../georgia';
import { beginOperation, retryConflicts, runEach } from '../operation';
import { createRefreshCoordinator } from '../refresh-coordinator';
import { createOrigin, deferred, jsonResponse, put, session, sleep } from './helpers';

const BASE = 'https://td-api.example.test';

function setup(handler: (path: string, init: RequestInit) => Promise<Response> | Response) {
  const origin = createOrigin();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    return handler(`${url.pathname}${url.search}`, init ?? {});
  });
  const transport = createTransport(BASE, fetchMock as typeof fetch);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({
    tokens,
    refreshLock: () => refreshLock,
    requestRefresh: (refreshToken, requestId) => requestTokenRefresh(transport, refreshToken, requestId),
  });
  const api = createTdApiClient({ transport, tokens, coordinator });
  return { api, admin: createTdAdminApi(api), tokens, fetchMock };
}

describe('api client extensions', () => {
  it('sends PATCH and DELETE with the bearer token', async () => {
    const { api, tokens, fetchMock } = setup((_path, init) => (init.method === 'DELETE' ? jsonResponse(204) : jsonResponse(200, { ok: true })));
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));
    await expect(api.patch('/admin/settings/maintenance', { version: 1, enabled: true })).resolves.toEqual({ ok: true });
    await expect(api.delete('/admin/media/uploads/x')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(([, init]) => [init!.method, (init!.headers as Record<string, string>).Authorization])).toEqual([
      ['PATCH', 'Bearer access-1'],
      ['DELETE', 'Bearer access-1'],
    ]);
  });

  it('uploads a raw body with its own type, and retries it after a refresh', async () => {
    let calls = 0;
    const { admin, tokens, fetchMock } = setup((path, init) => {
      if (path === '/admin/auth/refresh') return jsonResponse(200, { accessToken: 'access-2', refreshToken: 'refresh-2', expiresAt: new Date(Date.now() + 900_000).toISOString() });
      calls++;
      return calls === 1 ? jsonResponse(401, { code: 'unauthorized' }) : jsonResponse(201, { id: 'u1', type: (init.headers as Record<string, string>)['Content-Type'] });
    });
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));
    const file = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
    await expect(admin.media.upload(file, 'image/png')).resolves.toEqual({ id: 'u1', type: 'image/png' });
    const uploads = fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/admin/media/uploads'));
    expect(uploads).toHaveLength(2);
    expect(uploads.every(([, init]) => init!.body === file)).toBe(true);
  });

  it('reads CSV as text and files as blobs; errors stay JSON', async () => {
    const { admin, tokens } = setup((path) => {
      if (path === '/admin/leaderboard/export') return new Response('﻿rank\r\n1', { status: 200, headers: { 'Content-Type': 'text/csv' } });
      if (path.endsWith('/file')) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } });
      return jsonResponse(404, { code: 'not_found', message: 'No such snapshot' });
    });
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));
    await expect(admin.leaderboard.exportCsv()).resolves.toBe('rank\r\n1');
    expect((await admin.media.file('u1')).size).toBe(3);
    await expect(admin.leaderboard.exportSnapshotCsv('missing')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });

  it('builds query strings from the defined values only', async () => {
    expect(queryString({ status: 'draft,ready', q: undefined, category: '', limit: 50, cursor: null })).toBe('?status=draft%2Cready&limit=50');
    expect(queryString({})).toBe('');
    const { admin, tokens, fetchMock } = setup(() => jsonResponse(200, { items: [], nextCursor: null }));
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));
    await admin.content('cards').list({ category: 'legends', sort: 'updated', dir: 'desc', limit: 20 });
    await admin.players.search('Nino ka', { limit: 10 });
    expect(fetchMock.mock.calls.map(([input]) => String(input).slice(BASE.length))).toEqual([
      '/admin/content/cards?category=legends&sort=updated&dir=desc&limit=20',
      '/admin/players?q=Nino+ka&limit=10',
    ]);
  });
});

describe('operations stay with the sign-in they started under', () => {
  it('never sends the rest of a bulk run under another account', async () => {
    const gate = deferred<Response>();
    const { admin, tokens, fetchMock } = setup((path) => (path.includes('/r1/') ? gate.promise : jsonResponse(200, { id: 'row' })));
    await put(tokens, session('gen-a', 'access-a', 'refresh-a'));
    const operation = beginOperation(tokens);
    const run = runEach(tokens, operation, ['r1', 'r2', 'r3'], (id) => admin.content('cards').ready(id, 1, operation));
    await sleep(5);
    await put(tokens, session('gen-b', 'access-b', 'refresh-b'));
    gate.resolve(jsonResponse(200, { id: 'r1' }));
    const results = await run;
    expect(results.map((r) => (r.ok ? 'ok' : (r.error as TdApiError).code))).toEqual([SESSION_CHANGED, SESSION_CHANGED, SESSION_CHANGED]);
    expect(fetchMock.mock.calls.some(([, init]) => (init!.headers as Record<string, string>).Authorization === 'Bearer access-b')).toBe(false);
  });

  it('retries only conflict_retry, and never across a sign-in', async () => {
    let n = 0;
    const flaky = vi.fn(async () => {
      if (++n < 3) throw new TdApiError(409, 'conflict_retry', 'again');
      return 'done';
    });
    await expect(retryConflicts(flaky)).resolves.toBe('done');
    expect(flaky).toHaveBeenCalledTimes(3);
    const refused = vi.fn(async () => {
      throw new TdApiError(409, 'revision_conflict', 'stale');
    });
    await expect(retryConflicts(refused)).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(refused).toHaveBeenCalledTimes(1);

    const { admin, tokens, fetchMock } = setup(() => jsonResponse(409, { code: 'conflict_retry', message: 'again' }));
    await put(tokens, session('gen-a', 'access-a', 'refresh-a'));
    const operation = beginOperation(tokens);
    await put(tokens, session('gen-b', 'access-b', 'refresh-b'));
    await expect(retryConflicts(() => admin.releases.publish('key-12345', operation))).rejects.toMatchObject({ code: SESSION_CHANGED });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('refusals in plain words', () => {
  it('keeps what each code carries', () => {
    const conflict = describeTdError(new TdApiError(409, 'revision_conflict', 'Someone changed this row since you read it', { current: { id: 'r', version: 3 } }));
    expect(conflict).toMatchObject({ title: 'Someone changed this since you opened it.', current: { version: 3 } });
    const invalid = describeTdError(new TdApiError(422, 'validation', 'The content is not valid', { issues: [{ path: 'data.key', message: 'taken' }] }));
    expect(invalid.issues).toEqual([{ path: 'data.key', message: 'taken' }]);
    expect(describeTdError(new TdApiError(409, 'dependency_unapproved', 'x', { refs: [{ type: 'media', key: 'img' }] })).refs).toEqual([{ type: 'media', key: 'img' }]);
    expect(describeTdError(new TdApiError(422, 'invalid_image', 'x', { reason: 'animated' })).title).toBe('Animated images are not accepted.');
    expect(describeTdError(new TdApiError(409, 'publication_in_progress', 'x', { publicationId: 'p1' })).publicationId).toBe('p1');
    expect(describeTdError(new TypeError('Failed to fetch')).code).toBe('network');
    expect(tdErrorText(new TdApiError(403, 'forbidden_transition', 'only a draft is marked ready (this one is ready)'))).toBe(
      'This step is not allowed from the current status. only a draft is marked ready (this one is ready)',
    );
  });
});

describe('Georgian days', () => {
  it('turns at midnight UTC+4', () => {
    expect(georgiaToday(Date.parse('2026-09-30T19:59:59Z'))).toBe('2026-09-30');
    expect(georgiaToday(Date.parse('2026-09-30T20:00:00Z'))).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('plays the date’s own set, otherwise the cycle counted from its anchor (backwards too)', () => {
    const cycle = { anchor: '2026-10-01', sets: ['a', 'b', 'c'] };
    expect(scheduledSet(undefined, cycle, '2026-10-01')).toBe('a');
    expect(scheduledSet(undefined, cycle, '2026-10-05')).toBe('b');
    expect(scheduledSet(undefined, cycle, '2026-09-30')).toBe('c');
    expect(scheduledSet('own', cycle, '2026-10-05')).toBe('own');
    expect(scheduledSet(undefined, null, '2026-10-05')).toBeNull();
  });

  it('lays a month out in Monday-first weeks', () => {
    const weeks = monthGrid('2026-10-15');
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});
