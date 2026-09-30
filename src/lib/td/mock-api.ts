import type { TdRole, TdStaffMember, TdTokenResponse } from '@/types/td';
import { checkContract } from './contract';
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

interface MockLink {
  kind: 'invite' | 'reset';
  staffId: string;
  expiresAt: number;
  used: boolean;
}

interface MockServerState {
  refreshTokens: Record<string, RefreshRecord>;
  revokedFamilies: string[];
  /** Members invited or changed here, over the seeded ones by id. */
  members?: TdStaffMember[];
  /** Passwords set through a link (the seeded accounts keep "demo"). */
  passwords?: Record<string, string>;
  links?: Record<string, MockLink>;
}

/** Invitation and reset links live 48 hours and work once, as the API's do. */
const LINK_TTL_MS = 48 * 60 * 60_000;
const TEAM_MANAGERS: readonly TdRole[] = ['betsson_admin', 'ops'];

function staffOf(state: MockServerState): TdStaffMember[] {
  const changed = new Map((state.members ?? []).map((m) => [m.id, m]));
  return [...MOCK_STAFF.map((m) => changed.get(m.id) ?? m), ...(state.members ?? []).filter((m) => !MOCK_STAFF.some((seed) => seed.id === m.id))];
}

function putMember(state: MockServerState, member: TdStaffMember) {
  state.members = [...(state.members ?? []).filter((m) => m.id !== member.id), member];
}

/** `tdi_…` / `tdr_…`: base64url, as the API's link tokens. */
function linkToken(prefix: string): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `${prefix}_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function issueLink(state: MockServerState, kind: MockLink['kind'], staffId: string, at: number) {
  // A new link closes the member's earlier ones of the same kind.
  for (const link of Object.values(state.links ?? {})) if (link.staffId === staffId && link.kind === kind) link.used = true;
  const token = linkToken(kind === 'invite' ? 'tdi' : 'tdr');
  state.links = { ...(state.links ?? {}), [token]: { kind, staffId, expiresAt: at + LINK_TTL_MS, used: false } };
  return { token, expiresAt: new Date(at + LINK_TTL_MS).toISOString() };
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
      const staff = staffOf(state).find((s) => s.email === email && s.status === 'active');
      if (!staff || body?.password !== (state.passwords?.[staff.id] ?? MOCK_PASSWORD)) {
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

    if (route === 'POST /admin/auth/accept-invite' || route === 'POST /admin/auth/reset') {
      const invite = route === 'POST /admin/auth/accept-invite';
      const issues = checkContract(invite ? 'AcceptInviteRequest' : 'PasswordResetRequest', body);
      if (issues.length) {
        // As the API: weak_password when only the password is at fault.
        return issues.every((issue) => issue.path === 'password')
          ? error(400, 'weak_password', 'Passwords need 12 to 256 characters')
          : error(400, 'invalid_request', 'The request is not valid');
      }
      const token = String(body!.token);
      const link = state.links?.[token];
      const member = link && staffOf(state).find((m) => m.id === link.staffId);
      const usable = link && !link.used && link.expiresAt > now() && link.kind === (invite ? 'invite' : 'reset') && member?.status === (invite ? 'invited' : 'active');
      if (!link || !member || !usable) return error(400, 'invalid_token', 'This link is not valid any more; ask for a new one');
      link.used = true;
      state.passwords = { ...(state.passwords ?? {}), [member.id]: String(body!.password) };
      if (invite) putMember(state, { ...member, name: String(body!.name), status: 'active', lastSignInAt: new Date(now()).toISOString() });
      else {
        // A reset ends every session the member had.
        for (const record of Object.values(state.refreshTokens))
          if (record.staffId === member.id && !state.revokedFamilies.includes(record.family)) state.revokedFamilies.push(record.family);
      }
      const tokens = issue(state, member.id, randomToken('fam'));
      save(state);
      return json(200, tokens);
    }

    const claims = readClaims(headers, state);
    const staff = claims && staffOf(state).find((s) => s.id === claims.sub && s.status === 'active');
    if (!claims || !staff) return error(401, 'unauthorized', 'Missing or expired access token');

    if (route === 'GET /admin/me') {
      return json(200, { id: staff.id, email: staff.email, name: staff.name, role: staff.role });
    }
    if (route === 'GET /admin/staff') {
      if (!STAFF_VIEWERS.includes(staff.role)) return error(403, 'forbidden', 'Your role cannot view the team');
      return json(200, { items: staffOf(state) });
    }
    if (route === 'POST /admin/staff/invite') {
      if (!TEAM_MANAGERS.includes(staff.role)) return error(403, 'forbidden', 'Your role cannot manage the team');
      if (checkContract('StaffInviteRequest', body).length) return error(400, 'invalid_request', 'The request is not valid');
      const role = body!.role as TdRole;
      if (role === 'ops') return error(403, 'forbidden', 'Ops members are created on the server only');
      const email = String(body!.email).toLowerCase();
      const known = staffOf(state).find((m) => m.email === email);
      if (known && known.status !== 'invited') return error(409, 'already_exists', 'This email is already on the team');
      // An email still invited is invited again (a new link, the earlier one closed).
      const member: TdStaffMember = { id: known?.id ?? crypto.randomUUID(), email, name: typeof body!.name === 'string' ? body!.name : (known?.name ?? ''), role, status: 'invited', lastSignInAt: null };
      putMember(state, member);
      const link = issueLink(state, 'invite', member.id, now());
      save(state);
      return json(201, { ...link, member });
    }
    const resetLink = route.match(/^POST \/admin\/staff\/([^/]+)\/reset-link$/);
    if (resetLink) {
      if (!TEAM_MANAGERS.includes(staff.role)) return error(403, 'forbidden', 'Your role cannot manage the team');
      const target = staffOf(state).find((m) => m.id === decodeURIComponent(resetLink[1]));
      if (!target) return error(404, 'not_found', 'No such member');
      if (target.id === staff.id) return error(403, 'forbidden', 'Change your own password instead');
      if (target.role === 'ops') return error(403, 'forbidden', 'Ops members are managed on the server only');
      if (target.status !== 'active') return error(409, 'conflict', target.status === 'invited' ? 'Not signed up yet: invite them again' : 'Re-enable them first');
      const link = issueLink(state, 'reset', target.id, now());
      save(state);
      return json(201, link);
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
