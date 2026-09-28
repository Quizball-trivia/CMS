import { describe, expect, it, vi } from 'vitest';
import { createTdApiClient, createTransport, requestTokenRefresh, SESSION_CHANGED, TdApiError } from '../api-client';
import { createRefreshCoordinator } from '../refresh-coordinator';
import { createOrigin, deferred, jsonResponse, put, session, sleep } from './helpers';

const BASE = 'https://td-api.example.test';

function setup(handler: (path: string, init: RequestInit) => Promise<Response> | Response) {
  const origin = createOrigin();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)).pathname, init ?? {}));
  const transport = createTransport(BASE, fetchMock as typeof fetch);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({
    tokens,
    refreshLock: () => refreshLock,
    requestRefresh: (refreshToken) => requestTokenRefresh(transport, refreshToken),
  });
  const api = createTdApiClient({ transport, tokens, coordinator });
  const calls = (path: string) => fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === path);
  return { api, tokens, fetchMock, calls };
}

const bearer = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;
const tokenBody = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresAt: new Date(Date.now() + 900_000).toISOString() });

describe('Table Derby API client', () => {
  it('sends a bearer token and never cookies', async () => {
    const { api, tokens, fetchMock } = setup(() => jsonResponse(200, { items: [] }));
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    await api.get('/admin/staff');

    const [, init] = fetchMock.mock.calls[0];
    expect(bearer(init!)).toBe('Bearer access-1');
    expect(init!.credentials).toBe('omit');
  });

  it('refreshes once for concurrent 401s and retries each request within the same generation', async () => {
    const { api, tokens, calls } = setup(async (path, init) => {
      if (path === '/admin/auth/refresh') {
        await sleep(10);
        return jsonResponse(200, tokenBody(2));
      }
      return bearer(init) === 'Bearer access-2' ? jsonResponse(200, { path }) : jsonResponse(401, { code: 'unauthorized' });
    });
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    const results = await Promise.all([api.get('/admin/me'), api.get('/admin/staff'), api.get('/admin/me')]);

    expect(results).toEqual([{ path: '/admin/me' }, { path: '/admin/staff' }, { path: '/admin/me' }]);
    expect(calls('/admin/auth/refresh')).toHaveLength(1);
    expect(tokens.read()).toMatchObject({ generation: 'gen-a', accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it("never retries a request under another user's sign-in", async () => {
    const answer = deferred<Response>();
    const { api, tokens, calls, fetchMock } = setup((path) => (path === '/admin/players/void' ? answer.promise : jsonResponse(500)));
    await put(tokens, session('gen-a', 'access-a', 'refresh-a'));

    const request = api.post('/admin/players/void', { matchId: 'm1' });
    await sleep(5);
    await put(tokens, session('gen-b', 'access-b', 'refresh-b'));
    answer.resolve(jsonResponse(401, { code: 'unauthorized' }));

    await expect(request).rejects.toMatchObject({ code: SESSION_CHANGED });
    expect(calls('/admin/players/void')).toHaveLength(1);
    expect(calls('/admin/auth/refresh')).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([, init]) => bearer(init!) === 'Bearer access-b')).toBe(false);
  });

  it('cancels in-flight requests when the session is replaced', async () => {
    let signal: AbortSignal | undefined;
    const { api, tokens } = setup((_path, init) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    });
    await put(tokens, session('gen-a', 'access-a', 'refresh-a'));

    const request = api.get('/admin/staff');
    await sleep(5);
    tokens.cancel('gen-a');

    await expect(request).rejects.toMatchObject({ code: SESSION_CHANGED });
    expect(signal?.aborted).toBe(true);
  });

  it('refuses to start a request for a generation that is no longer stored', async () => {
    const { api, tokens, fetchMock } = setup(() => jsonResponse(200, {}));
    await put(tokens, session('gen-b', 'access-b', 'refresh-b'));

    await expect(api.me({ generation: 'gen-a' })).rejects.toMatchObject({ code: SESSION_CHANGED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries only once when the refreshed token is refused too', async () => {
    const { api, tokens, calls } = setup((path) =>
      path === '/admin/auth/refresh' ? jsonResponse(200, tokenBody(2)) : jsonResponse(401, { code: 'forbidden_staff' }),
    );
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 401 });
    expect(calls('/admin/auth/refresh')).toHaveLength(1);
    expect(calls('/admin/me')).toHaveLength(2);
  });

  it('ends the session when the refresh token is refused', async () => {
    const { api, tokens } = setup((path) =>
      path === '/admin/auth/refresh' ? jsonResponse(401, { code: 'invalid_refresh_token' }) : jsonResponse(401, {}),
    );
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 401, code: 'session_expired' });
    expect(tokens.read()).toBeNull();
  });

  it('keeps the session and marks the refresh pending when the refresh endpoint is down', async () => {
    const { api, tokens } = setup((path) => (path === '/admin/auth/refresh' ? jsonResponse(502) : jsonResponse(401, {})));
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 503, code: 'refresh_unavailable' });
    expect(tokens.read()).toMatchObject({ refreshToken: 'refresh-1', refreshPendingSince: expect.any(Number) });
  });

  it('logs out with the refresh token, with no access token needed', async () => {
    const { api, fetchMock } = setup(() => jsonResponse(204));
    await expect(api.logout('refresh-1')).resolves.toBe(true);

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init!.body))).toEqual({ refreshToken: 'refresh-1' });
    expect(bearer(init!)).toBeUndefined();
  });

  it('does not report a refused logout as a revocation', async () => {
    const { api } = setup(() => jsonResponse(401, { code: 'invalid_refresh_token' }));
    await expect(api.logout('refresh-1')).resolves.toBe(false);
  });

  it('rejects a login response that is missing a token', async () => {
    const { api } = setup(() => jsonResponse(200, { accessToken: 'access-1', expiresAt: new Date().toISOString() }));
    await expect(api.login('editor@example.test', 'pw')).rejects.toBeInstanceOf(TdApiError);
  });

  it('surfaces API error codes', async () => {
    const { api, tokens } = setup(() => jsonResponse(403, { code: 'forbidden', message: 'Your role cannot view the team' }));
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));
    await expect(api.get('/admin/staff')).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'Your role cannot view the team' });
  });
});
