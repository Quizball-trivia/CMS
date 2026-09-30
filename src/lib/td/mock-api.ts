import type { TdRole, TdTokenResponse } from '@/types/td';
import { defaultBlobStore, type MockBlobStore } from './mock/blob-store';
import { browserMockLock, createMockAdmin, type MockAdminDeps } from './mock/router';
import { MOCK_STAFF } from './mock/staff';
import { TD_STORAGE_KEYS } from './token-store';

export { MOCK_STAFF };

/**
 * Stand-in for the Table Derby API (`NEXT_PUBLIC_TD_API_MOCK=1`, local
 * development only; see env.ts), plugged in as the client's `fetch`. It speaks the
 * real contract, including refresh-token rotation and reuse detection, so the
 * real client and refresh coordinator run against it. Its session table lives
 * in localStorage so every tab talks to the same "server". Every other route
 * of the admin contract is answered by mock/router.ts.
 */

export const MOCK_PASSWORD = 'demo';
const ACCESS_TTL_MS = 15 * 60_000;
const REFRESH_TTL_MS = 12 * 60 * 60_000;
/** A lost refresh answer may be retried this long, as the same request. */
const REFRESH_RETRY_MS = 60_000;

const STAFF_VIEWERS: readonly TdRole[] = ['betsson_admin', 'ops'];

interface RefreshRecord {
  staffId: string;
  family: string;
  expiresAt: number;
  /** The pair this token was last exchanged for, once it has been presented. */
  successor: TdTokenResponse | null;
  /** When it was first presented, and by which request. */
  rotatedAt: number | null;
  rotatedBy: string | null;
}

interface MockServerState {
  refreshTokens: Record<string, RefreshRecord>;
  revokedFamilies: string[];
}

interface AccessClaims {
  sub: string;
  fam: string;
  exp: number;
}

export interface MockTdApiOptions {
  storage: () => Storage | null;
  now?: () => number;
  latencyMs?: number;
  /** Where uploaded images are kept (IndexedDB in a browser). */
  blobs?: MockBlobStore;
  /** Serialises content requests across tabs (Web Locks in a browser). */
  lock?: MockAdminDeps['lock'];
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}

const error = (status: number, code: string, message: string) => json(status, { code, message });

function randomToken(prefix: string): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `${prefix}.${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: Record<string, unknown> | null;
  raw: ArrayBuffer | null;
}

export function createMockTdApi({
  storage,
  now = Date.now,
  latencyMs = 120,
  blobs = defaultBlobStore(),
  lock = browserMockLock(),
}: MockTdApiOptions): typeof fetch {
  const admin = createMockAdmin({ storage, blobs, now, lock });
  const empty = (): MockServerState => ({ refreshTokens: {}, revokedFamilies: [] });
  let memoryState = empty();

  const load = (): MockServerState => {
    const store = storage();
    if (!store) return memoryState;
    try {
      return (JSON.parse(store.getItem(TD_STORAGE_KEYS.mockServer) ?? 'null') as MockServerState | null) ?? empty();
    } catch {
      return empty();
    }
  };
  const save = (state: MockServerState) => {
    const store = storage();
    if (store) store.setItem(TD_STORAGE_KEYS.mockServer, JSON.stringify(state));
    else memoryState = state;
  };

  function issue(state: MockServerState, staffId: string, family: string): TdTokenResponse {
    const exp = now() + ACCESS_TTL_MS;
    const refreshToken = randomToken('mock-refresh');
    for (const [token, record] of Object.entries(state.refreshTokens)) {
      if (record.expiresAt <= now()) delete state.refreshTokens[token];
    }
    state.refreshTokens[refreshToken] = {
      staffId,
      family,
      expiresAt: now() + REFRESH_TTL_MS,
      successor: null,
      rotatedAt: null,
      rotatedBy: null,
    };
    const claims: AccessClaims = { sub: staffId, fam: family, exp };
    return {
      accessToken: `mock-access.${btoa(JSON.stringify(claims))}.${randomToken('sig')}`,
      refreshToken,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  function readClaims(headers: Headers, state: MockServerState): AccessClaims | null {
    const token = headers.get('Authorization')?.match(/^Bearer (mock-access\.[^.]+\..+)$/)?.[1];
    if (!token) return null;
    try {
      const claims = JSON.parse(atob(token.split('.')[1])) as AccessClaims;
      return claims.exp > now() && !state.revokedFamilies.includes(claims.fam) ? claims : null;
    } catch {
      return null;
    }
  }

  async function handle({ method, path, query, headers, body, raw }: MockRequest): Promise<Response> {
    const route = `${method} ${path}`;
    const state = load();

    if (route === 'POST /admin/auth/login') {
      const email = String(body?.email ?? '').trim().toLowerCase();
      const staff = MOCK_STAFF.find((s) => s.email === email && s.status === 'active');
      if (!staff || body?.password !== MOCK_PASSWORD) {
        return error(401, 'invalid_credentials', 'Email or password is incorrect');
      }
      const tokens = issue(state, staff.id, randomToken('fam'));
      save(state);
      return json(200, tokens);
    }

    if (route === 'POST /admin/auth/refresh') {
      const record = state.refreshTokens[String(body?.refreshToken ?? '')];
      if (!record || record.expiresAt <= now() || state.revokedFamilies.includes(record.family)) {
        return error(401, 'invalid_refresh_token', 'Refresh token is not valid');
      }
      const requestId = typeof body?.requestId === 'string' ? body.requestId : null;
      if (record.successor) {
        // Under another request id (or none): reuse, and the whole family ends.
        if (requestId === null || record.rotatedBy !== requestId) {
          state.revokedFamilies.push(record.family);
          save(state);
          return error(401, 'refresh_token_reused', 'Refresh token was already used; the session is revoked');
        }
        // The same request again (a retry, or a discarded original arriving late) never ends the
        // session: the same pair while the successor is unused and within 60 s, otherwise refused.
        // A client refused like this gives up and logs out, which ends the family.
        const successor = state.refreshTokens[record.successor.refreshToken];
        if (successor && !successor.successor && now() - (record.rotatedAt ?? 0) <= REFRESH_RETRY_MS)
          return json(200, record.successor);
        return error(401, 'invalid_refresh_token', 'This refresh has already been answered');
      }
      const tokens = issue(state, record.staffId, record.family);
      record.successor = tokens;
      record.rotatedAt = now();
      record.rotatedBy = requestId;
      save(state);
      return json(200, tokens);
    }

    if (route === 'POST /admin/auth/logout') {
      // Identified by any refresh token of the family, so it works after the access token has expired.
      const record = state.refreshTokens[String(body?.refreshToken ?? '')];
      if (!record) return error(401, 'invalid_refresh_token', 'Refresh token is not valid');
      if (!state.revokedFamilies.includes(record.family)) state.revokedFamilies.push(record.family);
      save(state);
      return json(204, undefined);
    }

    const claims = readClaims(headers, state);
    const staff = claims && MOCK_STAFF.find((s) => s.id === claims.sub && s.status === 'active');
    if (!claims || !staff) return error(401, 'unauthorized', 'Missing or expired access token');

    if (route === 'GET /admin/me') {
      return json(200, { id: staff.id, email: staff.email, name: staff.name, role: staff.role });
    }
    if (route === 'GET /admin/staff') {
      if (!STAFF_VIEWERS.includes(staff.role)) return error(403, 'forbidden', 'Your role cannot view the team');
      return json(200, { items: MOCK_STAFF });
    }
    return admin({ method, path, query, headers, body, raw }, { id: staff.id, name: staff.name, role: staff.role });
  }

  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    let body: Record<string, unknown> | null = null;
    let raw: ArrayBuffer | null = null;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    } else if (init.body instanceof Blob) {
      raw = await init.body.arrayBuffer();
    } else if (init.body instanceof ArrayBuffer) {
      raw = init.body;
    }
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs));
    return handle({
      method: (init.method ?? 'GET').toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      headers: new Headers(init.headers),
      body,
      raw,
    });
  };
}
