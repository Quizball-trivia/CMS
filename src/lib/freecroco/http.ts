import { API_BASE_URL, AUTH_TOKEN_KEY } from '@/lib/constants';
import { ApiClientError, apiClient } from '@/services/api-client';

const TIMEOUT_MS = 30_000;

/**
 * The admin API lives at the backend root (`/partner-admin/v1`), not under `/api/v1`,
 * so the prefix the rest of the CMS uses is stripped from the configured base URL.
 */
export function adminBaseUrl(apiBaseUrl: string = API_BASE_URL): string {
  return `${apiBaseUrl.replace(/\/api\/v1\/?$/, '')}/partner-admin/v1/partners/freecroco`;
}

type Query = Record<string, string | number | undefined>;

interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
  /** Covers headers and body together. */
  timeoutMs?: number;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${adminBaseUrl()}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
  }
  return url.toString();
}

const storedToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(AUTH_TOKEN_KEY));

/** Accepts both `{ code, message }` and the partner format `{ error: { code, message } }`. */
function toError(status: number, text: string): ApiClientError {
  let code = 'NETWORK_ERROR';
  let message = `Request failed with status ${status}`;
  let details: unknown = null;
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const body = (json && typeof json.error === 'object' && json.error ? json.error : json) as Record<string, unknown>;
    if (typeof body.code === 'string') code = body.code;
    if (typeof body.message === 'string') message = body.message;
    details = body.details ?? null;
  } catch {
    // Not JSON: keep the generic message.
  }
  return new ApiClientError({ code, message, details, request_id: null }, status);
}

const timedOut = () =>
  new ApiClientError({ code: 'timeout', message: 'The request timed out. Try again.', details: null, request_id: null }, 0);

interface Reply {
  status: number;
  ok: boolean;
  text: string;
  /** The token this request was sent with, to tell a stale 401 from a current one. */
  usedToken: string | null;
}

/** One round trip. The timer runs until the body has been read, so a stalled body cannot hang a caller. */
async function send(method: string, path: string, options: RequestOptions): Promise<Reply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('timeout'), options.timeoutMs ?? TIMEOUT_MS);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
  try {
    const headers: Record<string, string> = {};
    const usedToken = storedToken();
    if (usedToken) headers.Authorization = `Bearer ${usedToken}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Bearer only: the staff API never accepts, and the CMS never sends, cookies.
      credentials: 'omit',
      signal: controller.signal,
    });
    // 202 and 204 have no body; reading success and error bodies alike happens under the same timer.
    const text = await response.text();
    return { status: response.status, ok: response.ok, text, usedToken };
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason === 'timeout') throw timedOut();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// One recovery at a time, however many requests were refused: each extra probe could spend the refresh
// token again. The staging auth path owns the refresh and its helpers are private, so a cheap call
// through apiClient runs that same refresh-and-retry (and ends the session if it cannot).
let recovery: Promise<boolean> | null = null;
function recoverSession(): Promise<boolean> {
  recovery ??= apiClient
    .get('/users/me')
    .then(
      () => true,
      () => false,
    )
    .finally(() => {
      recovery = null;
    });
  return recovery;
}

export async function freecrocoRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let reply = await send(method, path, options);

  if (reply.status === 401) {
    const current = storedToken();
    // The refused token is already gone: another recovery refreshed meanwhile (this reply was just slow),
    // so go straight to the retry. No token at all means the session ended: report the 401.
    const refreshedElsewhere = current !== null && current !== reply.usedToken;
    if (current !== null && (refreshedElsewhere || (await recoverSession()))) reply = await send(method, path, options);
  }

  if (!reply.ok) throw toError(reply.status, reply.text);
  return (reply.text ? JSON.parse(reply.text) : undefined) as T;
}
