import { describe, expect, it } from 'vitest';
import { createMockTdApi, MOCK_PASSWORD } from '../mock-api';
import { MemoryStorage } from './helpers';

const BASE = 'https://td-api.mock';

function mockApi(storage = new MemoryStorage(), start = Date.parse('2026-09-28T10:00:00Z')) {
  let clock = start;
  const fetchMock = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => clock });
  const call = async (method: string, path: string, { body, token }: { body?: unknown; token?: string } = {}) => {
    const response = await fetchMock(`${BASE}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const login = async (email: string) => (await call('POST', '/admin/auth/login', { body: { email, password: MOCK_PASSWORD } })).body;
  const refresh = (refreshToken: string, requestId?: string) =>
    call('POST', '/admin/auth/refresh', { body: { refreshToken, ...(requestId ? { requestId } : {}) } });
  const advance = (ms: number) => {
    clock += ms;
  };
  return { call, login, refresh, advance };
}

describe('mock Table Derby API', () => {
  it('signs staff in and returns their profile', async () => {
    const { call, login } = mockApi();
    const tokens = await login('publisher@demo.tablederby.test');
    expect(tokens).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), expiresAt: expect.any(String) });

    const me = await call('GET', '/admin/me', { token: tokens.accessToken });
    expect(me).toEqual({
      status: 200,
      body: { id: '5e1d0000-0000-4000-8000-000000000002', email: 'publisher@demo.tablederby.test', name: 'Demo Publisher', role: 'publisher' },
    });
  });

  it('refuses wrong passwords and invited accounts', async () => {
    const { call } = mockApi();
    expect((await call('POST', '/admin/auth/login', { body: { email: 'ops@demo.tablederby.test', password: 'nope' } })).status).toBe(401);
    expect((await call('POST', '/admin/auth/login', { body: { email: 'invited@demo.tablederby.test', password: MOCK_PASSWORD } })).status).toBe(401);
  });

  it('webhooks: a retried event gets its next attempt; one on its way lands and meanwhile cannot be retried', async () => {
    const { call, login, advance } = mockApi();
    let ops = (await login('ops@demo.tablederby.test')).accessToken as string;
    const get = async (id: string) => (await call('GET', `/admin/integration/webhooks/${id}`, { token: ops })).body;
    const retry = (id: string, body: object = {}) => call('POST', `/admin/integration/webhooks/${id}/retry`, { body, token: ops });

    // Given up; the partner answers again now.
    expect((await retry('td-evt-0018')).body.event).toMatchObject({ status: 'pending', attempts: 31 });
    const delivered = await get('td-evt-0018');
    expect(delivered.event).toMatchObject({ status: 'sent', attempts: 32, lastError: null });
    expect(delivered.attempts.at(-1)).toMatchObject({ attempt: 32, httpStatus: 200, delivered: true, reason: null });
    // Given up and still failing: pending again, with its next attempt failed.
    await retry('td-evt-0004');
    const failing = await get('td-evt-0004');
    expect(failing.event).toMatchObject({ status: 'pending', attempts: 32, lastError: expect.stringMatching(/^webhook_/) });
    expect(failing.attempts.at(-1)).toMatchObject({ attempt: 32, delivered: false });
    // On its way: refused until it lands.
    expect(await retry('td-evt-0056')).toMatchObject({ status: 409, body: { code: 'conflict', message: expect.stringMatching(/being sent now/) } });

    advance(21 * 60_000);
    ops = (await login('ops@demo.tablederby.test')).accessToken;
    expect((await get('td-evt-0056')).event).toMatchObject({ status: 'sent', sending: false, attempts: 1 });
    // A day of failed retries later it is given up again.
    advance(25 * 3_600_000);
    ops = (await login('ops@demo.tablederby.test')).accessToken;
    expect((await get('td-evt-0004')).event).toMatchObject({ status: 'dead', nextAttemptAt: null });
  });

  it('webhooks: an in-flight delivery that fails is retried later; a pending event past its window is given up unsent', async () => {
    const { call, login, advance } = mockApi();
    // The store is seeded at its first admin request.
    const first = (await login('ops@demo.tablederby.test')).accessToken as string;
    expect((await call('GET', '/admin/integration/webhooks/td-evt-0055', { token: first })).body.event).toMatchObject({ sending: true });
    advance(21 * 60_000);
    const ops = (await login('ops@demo.tablederby.test')).accessToken as string;
    const failed = (await call('GET', '/admin/integration/webhooks/td-evt-0055', { token: ops })).body;
    expect(failed.event).toMatchObject({ status: 'pending', sending: false, attempts: 1, lastError: expect.stringMatching(/^webhook_/) });
    expect(failed.attempts).toHaveLength(1);
    expect(Date.parse(failed.event.nextAttemptAt)).toBeGreaterThan(Date.parse('2026-09-28T10:21:00Z'));
    // Read again at once: nothing new is attempted before the backoff.
    expect((await call('GET', '/admin/integration/webhooks/td-evt-0055', { token: ops })).body.attempts).toHaveLength(1);

    // Another browser whose dispatcher was away for a day: the event due in 15 minutes was never tried.
    const away = mockApi();
    const token = (await away.login('ops@demo.tablederby.test')).accessToken as string;
    expect((await away.call('GET', '/admin/integration/webhooks/td-evt-0051', { token })).body.event).toMatchObject({ status: 'pending', attempts: 3 });
    away.advance(25 * 3_600_000);
    const later = (await away.login('ops@demo.tablederby.test')).accessToken as string;
    const expired = (await away.call('GET', '/admin/integration/webhooks/td-evt-0051', { token: later })).body;
    // It would have been delivered at its next attempt, but its window (and the grace) passed first.
    expect(expired.event).toMatchObject({ status: 'dead', attempts: 3, sentAt: null, lastError: 'webhook_http_503' });
    expect(expired.attempts).toHaveLength(3);
  });

  it('webhooks: the next page continues after the last event shown, even when events change status in between', async () => {
    const { call, login } = mockApi();
    const ops = (await login('ops@demo.tablederby.test')).accessToken as string;
    const first = (await call('GET', '/admin/integration/webhooks?status=dead&limit=1', { token: ops })).body;
    expect(first.items.map((e: { eventId: string }) => e.eventId)).toEqual(['td-evt-0018']);
    await call('POST', '/admin/integration/webhooks/td-evt-0018/retry', { body: {}, token: ops });
    const next = (await call('GET', `/admin/integration/webhooks?status=dead&limit=1&cursor=${first.nextCursor}`, { token: ops })).body;
    expect(next.items.map((e: { eventId: string }) => e.eventId)).toEqual(['td-evt-0010']);
  });

  it('a store saved by an older mock is seeded again, not reused', async () => {
    const storage = new MemoryStorage();
    storage.setItem('td_mock_db', JSON.stringify({ schema: 3, webhooks: [] }));
    const { call, login } = mockApi(storage);
    const ops = (await login('ops@demo.tablederby.test')).accessToken as string;
    expect((await call('GET', '/admin/integration/webhooks/td-evt-0001', { token: ops })).body.event.attempts).toBe(230);
    expect(JSON.parse(storage.getItem('td_mock_db')!).schema).toBe(4);
  });

  it('webhooks: an event shows its latest 200 attempts, oldest first', async () => {
    const { call, login } = mockApi();
    const ops = (await login('ops@demo.tablederby.test')).accessToken as string;
    const long = (await call('GET', '/admin/integration/webhooks/td-evt-0001', { token: ops })).body;
    expect(long.event.attempts).toBe(230);
    expect(long.attempts.map((a: { attempt: number }) => a.attempt)).toEqual(Array.from({ length: 200 }, (_, i) => i + 31));
  });

  it('webhooks: 60 hand retries an hour per member, counted in a fixed hour from the first, across tabs', async () => {
    const storage = new MemoryStorage();
    const start = Date.parse('2026-09-28T10:00:00Z');
    const tab = mockApi(storage, start);
    let ops = (await tab.login('ops@demo.tablederby.test')).accessToken as string;
    const retry = (api: ReturnType<typeof mockApi>, token: string) => api.call('POST', '/admin/integration/webhooks/no-such-event/retry', { body: {}, token });
    expect((await retry(tab, ops)).status).toBe(404);
    tab.advance(59 * 60_000);
    ops = (await tab.login('ops@demo.tablederby.test')).accessToken;
    for (let i = 0; i < 59; i++) expect((await retry(tab, ops)).status).toBe(404);
    expect(await retry(tab, ops)).toMatchObject({ status: 429, body: { code: 'rate_limited' } });
    // Another tab of the same browser shares the count.
    const other = mockApi(storage, start + 59 * 60_000);
    const opsThere = (await other.login('ops@demo.tablederby.test')).accessToken as string;
    expect((await retry(other, opsThere)).status).toBe(429);
    // An hour after the first retry the count starts again (a rolling hour would still refuse here).
    tab.advance(60_000);
    expect((await retry(tab, (await tab.login('ops@demo.tablederby.test')).accessToken)).status).toBe(404);
  });

  it('redeems a link under the sign-in lock the browser’s tabs share; passwords compare as NFKC', async () => {
    let locked = 0;
    const storage = new MemoryStorage();
    const fetchMock = createMockTdApi({ storage: () => storage, latencyMs: 0, authLock: async (work) => (locked++, work()) });
    const call = async (path: string, body: unknown, token?: string) => {
      const response = await fetchMock(`${BASE}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const admin = (await call('/admin/auth/login', { email: 'admin@demo.tablederby.test', password: MOCK_PASSWORD })).body.accessToken as string;
    const invite = (await call('/admin/staff/invite', { email: 'nfkc@example.test', role: 'editor' }, admin)).body.token as string;
    const before = locked;
    // "é" as one code point here, as "e" and a combining accent below.
    expect((await call('/admin/auth/accept-invite', { token: invite, password: 'Café password phrase', name: 'NFKC' })).status).toBe(200);
    expect(locked).toBeGreaterThan(before);
    expect((await call('/admin/auth/login', { email: 'nfkc@example.test', password: 'Cafe\u0301 password phrase' })).status).toBe(200);
  });

  it('lists staff only for Betsson admins and ops', async () => {
    const { call, login } = mockApi();
    const editor = await login('editor@demo.tablederby.test');
    const admin = await login('admin@demo.tablederby.test');
    expect((await call('GET', '/admin/staff', { token: editor.accessToken })).status).toBe(403);
    const staff = await call('GET', '/admin/staff', { token: admin.accessToken });
    expect(staff.status).toBe(200);
    expect(staff.body.items.map((member: { role: string }) => member.role)).toEqual(
      expect.arrayContaining(['editor', 'publisher', 'betsson_admin', 'ops']),
    );
  });

  it('answers a retry of the same refresh request within 60 s with the same pair', async () => {
    const { login, refresh, advance } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const lost = await refresh(first.refreshToken, 'req-1');
    expect(lost.status).toBe(200);
    advance(20_000);
    expect(await refresh(first.refreshToken, 'req-1')).toEqual(lost);
    expect((await refresh(lost.body.refreshToken, 'req-2')).status).toBe(200);
  });

  it('treats the token again under another request id, or without one, as reuse', async () => {
    const { call, login, refresh } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const second = await refresh(first.refreshToken, 'req-1');
    expect(await refresh(first.refreshToken)).toMatchObject({ status: 401, body: { code: 'refresh_token_reused' } });
    expect((await call('GET', '/admin/me', { token: second.body.accessToken })).status).toBe(401);
  });

  it('refuses the same request after the window, and the session stands', async () => {
    const { call, login, refresh, advance } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const second = await refresh(first.refreshToken, 'req-1');
    advance(61_000);
    expect(await refresh(first.refreshToken, 'req-1')).toMatchObject({ status: 401, body: { code: 'invalid_refresh_token' } });
    expect((await call('GET', '/admin/me', { token: second.body.accessToken })).status).not.toBe(401);
    expect((await refresh(second.body.refreshToken, 'req-2')).status).toBe(200);
  });

  it('refuses the same request after its successor was used, without ending the session', async () => {
    const { call, login, refresh } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const second = await refresh(first.refreshToken, 'req-1');
    const third = await refresh(second.body.refreshToken, 'req-2');
    expect(await refresh(first.refreshToken, 'req-1')).toMatchObject({ status: 401, body: { code: 'invalid_refresh_token' } });
    expect((await call('GET', '/admin/me', { token: third.body.accessToken })).status).not.toBe(401);
  });

  it("revokes the family once a replayed token's successor has been used (i.e. an older token is replayed)", async () => {
    const { call, login, refresh } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const second = await refresh(first.refreshToken);
    const third = await refresh(second.body.refreshToken);

    expect(await refresh(first.refreshToken)).toMatchObject({ status: 401, body: { code: 'refresh_token_reused' } });
    expect((await call('GET', '/admin/me', { token: third.body.accessToken })).status).toBe(401);
    expect((await refresh(third.body.refreshToken)).status).toBe(401);
  });

  it('logs out by refresh token, even after the access token has expired', async () => {
    const { call, login, refresh, advance } = mockApi();
    const tokens = await login('editor@demo.tablederby.test');
    advance(16 * 60_000);
    expect((await call('GET', '/admin/me', { token: tokens.accessToken })).status).toBe(401);

    expect((await call('POST', '/admin/auth/logout', { body: { refreshToken: tokens.refreshToken } })).status).toBe(204);
    expect((await refresh(tokens.refreshToken)).status).toBe(401);
  });

  it('logout revokes the tokens issued after the one it was given', async () => {
    const { call, login, refresh } = mockApi();
    const first = await login('editor@demo.tablederby.test');
    const second = await refresh(first.refreshToken);

    expect((await call('POST', '/admin/auth/logout', { body: { refreshToken: first.refreshToken } })).status).toBe(204);
    expect((await call('GET', '/admin/me', { token: second.body.accessToken })).status).toBe(401);
    expect((await refresh(second.body.refreshToken)).status).toBe(401);
  });
});
