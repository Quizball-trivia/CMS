import type { TdApiErrorBody, TdStaff, TdTokenResponse } from '@/types/td';
import type { RefreshCoordinator } from './refresh-coordinator';
import { sessionFromResponse, type TdSession, type TdTokenStore } from './token-store';

const REQUEST_TIMEOUT_MS = 30_000;
const AUTH_TIMEOUT_MS = 15_000;

export class TdApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'TdApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface SendOptions {
  body?: unknown;
  accessToken?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface TdTransport {
  send(method: Method, path: string, options?: SendOptions): Promise<Response>;
}

export function createTransport(baseUrl: string, fetchImpl: typeof fetch): TdTransport {
  return {
    send(method, path, { body, accessToken, signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const timeout = AbortSignal.timeout(timeoutMs);
      const combined = signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal ?? timeout;
      return fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Staff auth is bearer-only; never send or accept cookies from the TD API.
        credentials: 'omit',
        cache: 'no-store',
        signal: combined,
      });
    },
  };
}

async function toApiError(response: Response): Promise<TdApiError> {
  let body: TdApiErrorBody | null = null;
  try {
    body = (await response.json()) as TdApiErrorBody;
  } catch {
    // Non-JSON error body.
  }
  return new TdApiError(
    response.status,
    body?.code ?? `http_${response.status}`,
    body?.message ?? `Request failed with status ${response.status}`,
    body?.details,
  );
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The network half of a refresh; only the refresh coordinator calls it. */
export async function requestTokenRefresh(transport: TdTransport, refreshToken: string): Promise<TdSession> {
  const response = await transport.send('POST', '/admin/auth/refresh', {
    body: { refreshToken },
    timeoutMs: AUTH_TIMEOUT_MS,
  });
  const session = sessionFromResponse(await parse<TdTokenResponse>(response));
  if (!session) throw new TdApiError(502, 'invalid_token_response', 'The API returned an incomplete session');
  return session;
}

export interface TdApiClient {
  get<T>(path: string, signal?: AbortSignal): Promise<T>;
  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
  login(email: string, password: string): Promise<TdSession>;
  logout(): Promise<void>;
  me(signal?: AbortSignal): Promise<TdStaff>;
}

export function createTdApiClient({
  transport,
  tokens,
  coordinator,
}: {
  transport: TdTransport;
  tokens: TdTokenStore;
  coordinator: RefreshCoordinator;
}): TdApiClient {
  async function authed<T>(method: Method, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const usedToken = tokens.read()?.accessToken ?? null;
    if (!usedToken) throw new TdApiError(401, 'not_signed_in', 'Not signed in');

    const response = await transport.send(method, path, { body, accessToken: usedToken, signal });
    if (response.status !== 401) return parse<T>(response);

    const outcome = await coordinator.refresh({ staleAccessToken: usedToken });
    const retryToken = tokens.read()?.accessToken;
    if (outcome !== 'ok' || !retryToken) {
      throw outcome === 'transient'
        ? new TdApiError(503, 'refresh_unavailable', 'Could not renew the session; try again')
        : new TdApiError(401, 'session_expired', 'Your session has ended; sign in again');
    }
    // Retried once: a second 401 is the API's answer, not a stale token.
    return parse<T>(await transport.send(method, path, { body, accessToken: retryToken, signal }));
  }

  return {
    get: (path, signal) => authed('GET', path, undefined, signal),
    post: (path, body, signal) => authed('POST', path, body, signal),

    async login(email, password) {
      const response = await transport.send('POST', '/admin/auth/login', {
        body: { email, password },
        timeoutMs: AUTH_TIMEOUT_MS,
      });
      const session = sessionFromResponse(await parse<TdTokenResponse>(response));
      if (!session) throw new TdApiError(502, 'invalid_token_response', 'The API returned an incomplete session');
      return session;
    },

    async logout() {
      const accessToken = tokens.read()?.accessToken;
      if (!accessToken) return;
      // No refresh-and-retry: spending a refresh token just to revoke it is pointless.
      const response = await transport.send('POST', '/admin/auth/logout', { accessToken, timeoutMs: AUTH_TIMEOUT_MS });
      if (!response.ok && response.status !== 401) throw await toApiError(response);
    },

    me: (signal) => authed<TdStaff>('GET', '/admin/me', undefined, signal),
  };
}
