import type { CrossTabLock } from './cross-tab-lock';
import type { TdTokenSet, TdTokenStore } from './token-store';

/**
 * ok: the session of the requested generation holds fresh tokens (refreshed here or by another tab).
 * terminal: the refresh token is dead; that generation has been cleared.
 * transient: nothing changed; try again later (within the recovery window).
 * superseded: the session was signed out or replaced by another sign-in; drop whatever was being done.
 */
export type RefreshOutcome = 'ok' | 'terminal' | 'transient' | 'superseded';

/**
 * API contract (plan §13 notes): the API accepts the immediately previous
 * refresh token once more within 30 s of rotating it and answers with the same
 * successor pair. A refresh whose answer never arrived may therefore be retried
 * with the same token, but only inside that window; 25 s leaves room for latency.
 */
export const ROTATION_RECOVERY_MS = 25_000;

export interface RefreshCoordinator {
  /**
   * `generation` binds the refresh to one sign-in. `staleAccessToken` is the
   * token a request was refused with; if that generation already holds a newer
   * one, no network call is made.
   */
  refresh(options?: { generation?: string | null; staleAccessToken?: string | null }): Promise<RefreshOutcome>;
}

export interface RefreshCoordinatorOptions {
  tokens: TdTokenStore;
  lock: () => CrossTabLock | null;
  /** The only network refresh in the app. Rejects with `{ status }` when the API answers. */
  requestRefresh: (refreshToken: string) => Promise<TdTokenSet>;
  now?: () => number;
  isOnline?: () => boolean;
}

function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/**
 * The one place refresh tokens are spent. Tokens rotate and reuse revokes the
 * whole family, so within a tab callers share one in-flight refresh and across
 * tabs the Web Lock serialises them; a tab that waited re-reads the store
 * instead of spending the rotated-away token. Results are committed only to the
 * generation they were started for, so a late answer can never resurrect a
 * signed-out session or overwrite someone else's sign-in.
 */
export function createRefreshCoordinator({
  tokens,
  lock,
  requestRefresh,
  now = Date.now,
  isOnline = browserOnline,
}: RefreshCoordinatorOptions): RefreshCoordinator {
  let inFlight: { key: string; promise: Promise<RefreshOutcome> } | null = null;

  async function run(generation: string, seenRefreshToken: string): Promise<RefreshOutcome> {
    const crossTab = lock();
    if (!crossTab) return 'transient';
    try {
      return await crossTab.run(async () => {
        const current = tokens.read();
        if (!current || current.generation !== generation) return 'superseded';
        if (current.refreshToken !== seenRefreshToken) return 'ok';

        const pendingSince = current.refreshPendingSince;
        if (pendingSince !== null && now() - pendingSince > ROTATION_RECOVERY_MS) {
          // The earlier attempt may have rotated the token; spending it now would trip reuse detection.
          tokens.clear(generation);
          return 'terminal';
        }
        // Offline, the request cannot reach the API, so there is nothing to recover later.
        if (!isOnline()) return 'transient';

        const startedAt = pendingSince ?? now();
        try {
          const next = await requestRefresh(current.refreshToken);
          return tokens.update(generation, { ...next, refreshPendingSince: null }) ? 'ok' : 'superseded';
        } catch (error) {
          if (isRefusal(error)) {
            tokens.clear(generation);
            return 'terminal';
          }
          // Unknown outcome: the API may have rotated the token and lost the answer.
          return tokens.update(generation, { refreshPendingSince: startedAt }) ? 'transient' : 'superseded';
        }
      });
    } catch {
      return 'transient';
    }
  }

  return {
    refresh({ generation, staleAccessToken } = {}) {
      const current = tokens.read();
      if (!current) return Promise.resolve(generation ? 'superseded' : 'terminal');
      if (generation && current.generation !== generation) return Promise.resolve('superseded');
      if (staleAccessToken && current.accessToken !== staleAccessToken) return Promise.resolve('ok');

      const key = `${current.generation}:${current.refreshToken}`;
      if (inFlight?.key !== key) {
        const promise = run(current.generation, current.refreshToken).finally(() => {
          if (inFlight?.promise === promise) inFlight = null;
        });
        inFlight = { key, promise };
      }
      return inFlight.promise;
    },
  };
}
