import { describe, expect, it, vi } from 'vitest';
import { createTdApiClient, createTransport, requestTokenRefresh, TdApiError } from '../api-client';
import { createStorageLock } from '../cross-tab-lock';
import { createRefreshCoordinator } from '../refresh-coordinator';
import { createTokenStore, TD_STORAGE_KEYS } from '../token-store';
import { jsonResponse, MemoryStorage, session, sleep } from './helpers';

const BASE = 'https://td-api.example.test';

function setup(handler: (path: string, init: RequestInit) => Promise<Response> | Response) {
  const storage = new MemoryStorage();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new URL(String(input)).pathname, init ?? {}));
  const transport = createTransport(BASE, fetchMock as typeof fetch);
  const tokens = createTokenStore(() => storage, null);
  const coordinator = createRefreshCoordinator({
    tokens,
    lock: createStorageLock({ storage: () => storage, key: TD_STORAGE_KEYS.refreshLock, owner: 'tab', ttlMs: 5_000, pollMs: 2, settleMs: 1, waitMs: 2_000 }),
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
    tokens.write(session('access-1', 'refresh-1'));

    await api.get('/admin/staff');

    const [, init] = fetchMock.mock.calls[0];
    expect(bearer(init!)).toBe('Bearer access-1');
    expect(init!.credentials).toBe('omit');
  });

  it('refreshes once for concurrent 401s and retries each request with the new token', async () => {
    const { api, tokens, calls } = setup(async (path, init) => {
      if (path === '/admin/auth/refresh') {
        await sleep(10);
        return jsonResponse(200, tokenBody(2));
      }
      return bearer(init) === 'Bearer access-2' ? jsonResponse(200, { path }) : jsonResponse(401, { code: 'unauthorized' });
    });
    tokens.write(session('access-1', 'refresh-1'));

    const results = await Promise.all([api.get('/admin/me'), api.get('/admin/staff'), api.get('/admin/me')]);

    expect(results).toEqual([{ path: '/admin/me' }, { path: '/admin/staff' }, { path: '/admin/me' }]);
    expect(calls('/admin/auth/refresh')).toHaveLength(1);
    expect(JSON.parse(String(calls('/admin/auth/refresh')[0][1]!.body))).toEqual({ refreshToken: 'refresh-1' });
    expect(tokens.read()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('retries only once when the refreshed token is refused too', async () => {
    const { api, tokens, calls } = setup((path) =>
      path === '/admin/auth/refresh' ? jsonResponse(200, tokenBody(2)) : jsonResponse(401, { code: 'forbidden_staff' }),
    );
    tokens.write(session('access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 401 });
    expect(calls('/admin/auth/refresh')).toHaveLength(1);
    expect(calls('/admin/me')).toHaveLength(2);
  });

  it('ends the session when the refresh token is refused', async () => {
    const { api, tokens } = setup((path) =>
      path === '/admin/auth/refresh' ? jsonResponse(401, { code: 'invalid_refresh_token' }) : jsonResponse(401, {}),
    );
    tokens.write(session('access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 401, code: 'session_expired' });
    expect(tokens.read()).toBeNull();
  });

  it('keeps the session when the refresh endpoint is down', async () => {
    const { api, tokens } = setup((path) => (path === '/admin/auth/refresh' ? jsonResponse(502) : jsonResponse(401, {})));
    tokens.write(session('access-1', 'refresh-1'));

    await expect(api.get('/admin/me')).rejects.toMatchObject({ status: 503, code: 'refresh_unavailable' });
    expect(tokens.read()).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('rejects a login response that is missing a token', async () => {
    const { api } = setup(() => jsonResponse(200, { accessToken: 'access-1', expiresAt: new Date().toISOString() }));
    await expect(api.login('editor@example.test', 'pw')).rejects.toBeInstanceOf(TdApiError);
  });

  it('surfaces API error codes', async () => {
    const { api, tokens } = setup(() => jsonResponse(403, { code: 'forbidden', message: 'Your role cannot view the team' }));
    tokens.write(session('access-1', 'refresh-1'));
    await expect(api.get('/admin/staff')).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'Your role cannot view the team' });
  });
});
