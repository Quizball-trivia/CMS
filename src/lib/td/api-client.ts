import { logger } from '@/lib/logger';
import type { TdApiErrorBody, TdStaff, TdTokenResponse } from '@/types/td';
import type { RefreshCoordinator } from './refresh-coordinator';
import type { Revoker } from './revoker';
import { tokensFromResponse, type TdTokenSet, type TdTokenStore } from './token-store';

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

/** The request belonged to a session that has since been signed out or replaced; it was cancelled. */
export const SESSION_CHANGED = 'session_changed';
const sessionChanged = () => new TdApiError(0, SESSION_CHANGED, 'The session changed; the request was cancelled');

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

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (present.length <= 1) return present[0];
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present);
  // Safari before 17.4 has Web Locks but not AbortSignal.any.
  const controller = new AbortController();
  for (const signal of present) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export function createTransport(baseUrl: string, fetchImpl: typeof fetch): TdTransport {
  return {
    send(method, path, { body, accessToken, signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      return fetchImpl(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // Staff auth is bearer-only; never send or accept cookies from the TD API.
        credentials: 'omit',
        cache: 'no-store',
        signal: combineSignals([signal, AbortSignal.timeout(timeoutMs)]),
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

/**
 * The network half of a refresh; only the refresh coordinator calls it.
 * Retrying an unanswered refresh as the same request (same token, same
 * `requestId`) is safe within the API's 60 s window: the coordinator starts no
 * retry after 25 s and each request times out after 15 s (refresh-coordinator.ts).
 */
export async function requestTokenRefresh(
  transport: TdTransport,
  refreshToken: string,
  requestId: string,
): Promise<TdTokenSet> {
  const response = await transport.send('POST', '/admin/auth/refresh', {
    body: { refreshToken, requestId },
    timeoutMs: AUTH_TIMEOUT_MS,
  });
  const tokens = tokensFromResponse(await parse<TdTokenResponse>(response));
  if (!tokens) throw new TdApiError(502, 'invalid_token_response', 'The API returned an incomplete session');
  return tokens;
}

/** Revokes a session's whole family by any of its refresh tokens (best
 *  effort): the coordinator's answer to a refresh it gives up on. */
export async function requestTokenRevoke(transport: TdTransport, refreshToken: string): Promise<boolean> {
  const response = await transport.send('POST', '/admin/auth/logout', { body: { refreshToken }, timeoutMs: AUTH_TIMEOUT_MS });
  // 401: the API no longer knows the token (already revoked or expired): nothing left to do.
  return response.ok || response.status === 401;
}

export interface TdRequestOptions {
  signal?: AbortSignal;
  /** Refuse to start unless this is still the stored session generation. */
  generation?: string | null;
}

export interface TdApiClient {
  get<T>(path: string, options?: TdRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: TdRequestOptions): Promise<T>;
  login(email: string, password: string): Promise<TdTokenSet>;
  /** Revokes the whole refresh family; true only when the API confirmed it. */
  logout(refreshToken: string): Promise<boolean>;
  me(options?: TdRequestOptions): Promise<TdStaff>;
}

export function createTdApiClient({
  transport,
  tokens,
  coordinator,
  revoker,
}: {
  transport: TdTransport;
  tokens: TdTokenStore;
  coordinator: RefreshCoordinator;
  /** Takes over a logout the API did not confirm, retrying it until it does. */
  revoker?: Revoker;
}): TdApiClient {
  // One abort controller per generation: signing out or in cancels everything
  // the previous session still had in flight.
  const cancellers = new Map<string, AbortController>();
  tokens.subscribe(() => {
    const live = tokens.read()?.generation;
    for (const [generation, controller] of cancellers) {
      if (generation !== live) {
        controller.abort();
        cancellers.delete(generation);
      }
    }
  });
  const cancellerFor = (generation: string) => {
    let controller = cancellers.get(generation);
    if (!controller) {
      controller = new AbortController();
      cancellers.set(generation, controller);
    }
    return controller.signal;
  };

  async function authed<T>(method: Method, path: string, body: unknown, options: TdRequestOptions = {}): Promise<T> {
    const session = tokens.read();
    if (options.generation && session?.generation !== options.generation) throw sessionChanged();
    if (!session) throw new TdApiError(401, 'not_signed_in', 'Not signed in');

    const { generation } = session;
    const stillCurrent = () => tokens.read()?.generation === generation;
    const signal = combineSignals([options.signal, cancellerFor(generation)]);
    const send = async (accessToken: string) => {
      try {
        const response = await transport.send(method, path, { body, accessToken, signal });
        if (!stillCurrent()) throw sessionChanged();
        return response;
      } catch (error) {
        throw stillCurrent() ? error : sessionChanged();
      }
    };

    const response = await send(session.accessToken);
    if (response.status !== 401) return parse<T>(response);

    const outcome = await coordinator.refresh({ generation, staleAccessToken: session.accessToken });
    if (outcome === 'terminal') throw new TdApiError(401, 'session_expired', 'Your session has ended; sign in again');
    const current = tokens.read();
    // Never retry under someone else's sign-in.
    if (outcome === 'superseded' || !current || current.generation !== generation) throw sessionChanged();
    if (outcome === 'transient') throw new TdApiError(503, 'refresh_unavailable', 'Could not renew the session; try again');
    // Retried once: a second 401 is the API's answer, not a stale token.
    return parse<T>(await send(current.accessToken));
  }

  return {
    get: (path, options) => authed('GET', path, undefined, options),
    post: (path, body, options) => authed('POST', path, body, options),

    async login(email, password) {
      const response = await transport.send('POST', '/admin/auth/login', {
        body: { email, password },
        timeoutMs: AUTH_TIMEOUT_MS,
      });
      const tokens = tokensFromResponse(await parse<TdTokenResponse>(response));
      if (!tokens) throw new TdApiError(502, 'invalid_token_response', 'The API returned an incomplete session');
      return tokens;
    },

    async logout(refreshToken) {
      // The refresh token, not the access token, identifies the family, so this
      // still revokes the session after the access token has expired.
      // Kept before the request goes out: a page closed mid-request still retries it.
      revoker?.remember(refreshToken);
      try {
        const response = await transport.send('POST', '/admin/auth/logout', { body: { refreshToken }, timeoutMs: AUTH_TIMEOUT_MS });
        if (response.ok) {
          revoker?.forget(refreshToken);
          return true;
        }
        // Refused (the token is unknown or already ended): not a revocation, and asking again won't change that.
        if (response.status === 401) {
          revoker?.forget(refreshToken);
          return false;
        }
        logger.warn('auth', 'Table Derby logout was not confirmed; retrying until it is', { status: response.status });
      } catch (error) {
        logger.warn('auth', 'Table Derby logout request failed; retrying until it goes through', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      revoker?.revoke(refreshToken);
      return false;
    },

    me: (options) => authed<TdStaff>('GET', '/admin/me', undefined, options),
  };
}
