import { describe, expect, it } from 'vitest';
import { createMockTdApi, MOCK_PASSWORD } from '../mock-api';
import { MemoryStorage } from './helpers';

const BASE = 'https://td-api.mock';

function mockApi() {
  const storage = new MemoryStorage();
  let clock = Date.parse('2026-09-28T10:00:00Z');
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
      body: { id: 'staff-publisher', email: 'publisher@demo.tablederby.test', name: 'Demo Publisher', role: 'publisher' },
    });
  });

  it('refuses wrong passwords and invited accounts', async () => {
    const { call } = mockApi();
    expect((await call('POST', '/admin/auth/login', { body: { email: 'ops@demo.tablederby.test', password: 'nope' } })).status).toBe(401);
    expect((await call('POST', '/admin/auth/login', { body: { email: 'invited@demo.tablederby.test', password: MOCK_PASSWORD } })).status).toBe(401);
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
