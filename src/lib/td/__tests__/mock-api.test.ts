import { describe, expect, it } from 'vitest';
import { createMockTdApi, MOCK_PASSWORD } from '../mock-api';
import { MemoryStorage } from './helpers';

const BASE = 'https://td-api.mock';

function mockApi() {
  const storage = new MemoryStorage();
  const fetchMock = createMockTdApi({ storage: () => storage, latencyMs: 0 });
  const call = async (method: string, path: string, { body, token }: { body?: unknown; token?: string } = {}) => {
    const response = await fetchMock(`${BASE}${path}`, {
      method,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  const login = async (email: string) => (await call('POST', '/admin/auth/login', { body: { email, password: MOCK_PASSWORD } })).body;
  return { call, login };
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

  it('rotates refresh tokens and revokes the family when an old one is reused', async () => {
    const { call, login } = mockApi();
    const first = await login('ops@demo.tablederby.test');
    const second = await call('POST', '/admin/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(second.status).toBe(200);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);

    const replay = await call('POST', '/admin/auth/refresh', { body: { refreshToken: first.refreshToken } });
    expect(replay).toMatchObject({ status: 401, body: { code: 'refresh_token_reused' } });
    expect((await call('GET', '/admin/me', { token: second.body.accessToken })).status).toBe(401);
    expect((await call('POST', '/admin/auth/refresh', { body: { refreshToken: second.body.refreshToken } })).status).toBe(401);
  });

  it('revokes the session on logout', async () => {
    const { call, login } = mockApi();
    const tokens = await login('editor@demo.tablederby.test');
    expect((await call('POST', '/admin/auth/logout', { token: tokens.accessToken })).status).toBe(204);
    expect((await call('GET', '/admin/me', { token: tokens.accessToken })).status).toBe(401);
    expect((await call('POST', '/admin/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).status).toBe(401);
  });
});
