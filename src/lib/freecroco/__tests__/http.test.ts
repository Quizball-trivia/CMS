import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/services/api-client';
import { AUTH_TOKEN_KEY, REFRESH_TOKEN_KEY } from '@/lib/constants';
import { isStaleVersion } from '../errors';
import { adminBaseUrl, freecrocoRequest } from '../http';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Newer Node versions ship their own localStorage global that shadows jsdom's, so use a plain store.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  localStorage.setItem(AUTH_TOKEN_KEY, 'tok-1');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('admin base url', () => {
  it('drops the /api/v1 prefix the rest of the CMS uses', () => {
    expect(adminBaseUrl('https://api.example.com/api/v1')).toBe(
      'https://api.example.com/partner-admin/v1/partners/freecroco',
    );
    expect(adminBaseUrl('http://localhost:8001/api/v1/')).toBe('http://localhost:8001/partner-admin/v1/partners/freecroco');
  });
});

describe('freecroco requests', () => {
  it('sends the bearer, omits cookies and builds the query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchMock);

    await freecrocoRequest('GET', '/deliveries', { query: { status: 'dead', playerId: '', cursor: 'c1' } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/partner-admin/v1/partners/freecroco/deliveries');
    expect(new URL(url).searchParams.get('status')).toBe('dead');
    expect(new URL(url).searchParams.get('cursor')).toBe('c1');
    expect(new URL(url).searchParams.has('playerId')).toBe(false);
    expect(init.headers.Authorization).toBe('Bearer tok-1');
    expect(init.credentials).toBe('omit');
  });

  it('sends a JSON body with the content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { version: 3, games: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await freecrocoRequest('PUT', '/games', { body: { version: 2, games: [] } });
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('PUT');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ version: 2, games: [] });
  });

  it('accepts an empty 202 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
    await expect(freecrocoRequest('POST', '/deliveries/e1/resend')).resolves.toBeUndefined();
  });

  it.each([
    ['flat', { code: 'stale_version', message: 'Someone saved' }],
    ['wrapped', { error: { code: 'stale_version', message: 'Someone saved' } }],
  ])('turns a 409 %s error body into a stale_version error', async (_name, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, body)));
    const error = await freecrocoRequest('PUT', '/games', { body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(isStaleVersion(error)).toBe(true);
  });

  it('does not treat other 409s or other errors as stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(409, { code: 'other_conflict', message: 'x' })));
    const conflict = await freecrocoRequest('PUT', '/games').catch((e: unknown) => e);
    expect(isStaleVersion(conflict)).toBe(false);
    expect(isStaleVersion(new Error('stale_version'))).toBe(false);
  });

  it('ends the session when a 401 cannot be refreshed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { code: 'unauthorized', message: 'no' })));
    const expired = vi.fn();
    window.addEventListener('auth:session-expired', expired);
    const error = await freecrocoRequest('GET', '/games').catch((e: unknown) => e);
    window.removeEventListener('auth:session-expired', expired);
    expect((error as ApiClientError).status).toBe(401);
    expect(expired).toHaveBeenCalledOnce();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('refreshes through the existing auth path on a 401 and sends the request again with the new token', async () => {
    localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1');
    const seen: Array<{ path: string; auth: string | undefined }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        const auth = (init.headers as Record<string, string>)?.Authorization;
        seen.push({ path, auth });
        if (path.endsWith('/auth/refresh')) return json(200, { access_token: 'tok-2', refresh_token: 'refresh-2' });
        return auth === 'Bearer tok-2' ? json(200, { version: 1, games: [] }) : json(401, { code: 'unauthorized', message: 'no' });
      }),
    );

    await expect(freecrocoRequest('GET', '/games')).resolves.toEqual({ version: 1, games: [] });

    const games = seen.filter((c) => c.path.endsWith('/games'));
    expect(games.map((c) => c.auth)).toEqual(['Bearer tok-1', 'Bearer tok-2']);
    expect(seen.filter((c) => c.path.endsWith('/auth/refresh'))).toHaveLength(1);
  });
});

describe('overlapping 401 recoveries', () => {
  /** A backend where `tok-1` is expired: /users/me and the games endpoint answer 401 until the token is rotated. */
  function stubBackend(options: { delayFor?: (auth: string | undefined, path: string) => Promise<void> } = {}) {
    const calls = { refresh: 0, me: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        const auth = (init.headers as Record<string, string>)?.Authorization;
        if (path.endsWith('/auth/refresh')) {
          calls.refresh++;
          await new Promise((resolve) => setTimeout(resolve, 10));
          return json(200, { access_token: 'tok-2', refresh_token: 'refresh-2' });
        }
        if (path.endsWith('/users/me')) calls.me++;
        await options.delayFor?.(auth, path);
        return auth === 'Bearer tok-2' ? json(200, { ok: path }) : json(401, { code: 'unauthorized', message: 'no' });
      }),
    );
    return calls;
  }

  beforeEach(() => localStorage.setItem(REFRESH_TOKEN_KEY, 'refresh-1'));

  it('refreshes once for two requests refused together', async () => {
    const calls = stubBackend();
    const [games, calendar] = await Promise.all([freecrocoRequest('GET', '/games'), freecrocoRequest('GET', '/calendar')]);
    expect(games).toEqual({ ok: expect.stringContaining('/games') });
    expect(calendar).toEqual({ ok: expect.stringContaining('/calendar') });
    expect(calls.refresh).toBe(1);
    // One probe: its refused attempt and its retry.
    expect(calls.me).toBe(2);
  });

  it('does not probe again for a 401 that arrives after the token was already refreshed', async () => {
    // The calendar request is slow: its old-token 401 lands only after the games recovery has finished.
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    const calls = stubBackend({
      delayFor: async (auth, path) => {
        if (path.endsWith('/calendar') && auth === 'Bearer tok-1') await slow;
      },
    });

    const calendar = freecrocoRequest('GET', '/calendar');
    const games = await freecrocoRequest('GET', '/games');
    expect(games).toEqual({ ok: expect.stringContaining('/games') });
    expect(calls.refresh).toBe(1);

    releaseSlow();
    await expect(calendar).resolves.toEqual({ ok: expect.stringContaining('/calendar') });
    expect(calls.refresh).toBe(1);
    expect(calls.me).toBe(2);
  });

  it('does not run a recovery when there is no session left', async () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    const calls = stubBackend();
    const error = await freecrocoRequest('GET', '/games').catch((e: unknown) => e);
    expect((error as ApiClientError).status).toBe(401);
    expect(calls.me).toBe(0);
    expect(calls.refresh).toBe(0);
  });
});

describe('timeout covers the body', () => {
  const stalledBody = (status: number) =>
    vi.fn().mockImplementation(async (_url: string, init: RequestInit) => ({
      status,
      ok: status < 400,
      // Headers arrived; the body never does, until the request is aborted.
      text: () =>
        new Promise<string>((_resolve, reject) =>
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    }));

  it.each([
    ['a success', 200],
    ['an error', 500],
  ])('gives up on a stalled %s body instead of hanging', async (_name, status) => {
    vi.stubGlobal('fetch', stalledBody(status));
    const error = await freecrocoRequest('PUT', '/games', { body: {}, timeoutMs: 20 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('timeout');
  });

  it('leaves a prompt response alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { version: 2 })));
    await expect(freecrocoRequest('GET', '/games', { timeoutMs: 20 })).resolves.toEqual({ version: 2 });
  });
});
