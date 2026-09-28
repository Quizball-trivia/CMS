import type { CrossTabLock } from './cross-tab-lock';
import type { TdSession, TdTokenStore } from './token-store';

/**
 * ok: a valid session is stored (refreshed here or by another tab).
 * terminal: the refresh token was refused; the session has been cleared.
 * transient: network or server trouble; the stored session is untouched.
 */
export type RefreshOutcome = 'ok' | 'terminal' | 'transient';

export interface RefreshCoordinator {
  /**
   * `staleAccessToken` is the token a request was refused with; if the store
   * already holds a different one, another caller has refreshed and no network
   * call is made.
   */
  refresh(options?: { staleAccessToken?: string | null }): Promise<RefreshOutcome>;
}

export interface RefreshCoordinatorOptions {
  tokens: TdTokenStore;
  lock: CrossTabLock;
  /** The only network refresh in the app. Rejects with `{ status }` when the API answers. */
  requestRefresh: (refreshToken: string) => Promise<TdSession>;
}

function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * The one place refresh tokens are spent. Refresh tokens rotate and reuse
 * revokes the whole family, so two concurrent refreshes (two requests, the
 * provider's timer, or two tabs) would log the user out. Within a tab callers
 * share one in-flight promise; across tabs a lock serialises them, and a tab
 * that waited re-reads the store instead of spending the rotated-away token.
 */
export function createRefreshCoordinator({ tokens, lock, requestRefresh }: RefreshCoordinatorOptions): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null;

  async function run(seenRefreshToken: string): Promise<RefreshOutcome> {
    try {
      return await lock.run(async () => {
        const current = tokens.read();
        if (!current) return 'terminal';
        if (current.refreshToken !== seenRefreshToken) return 'ok';
        try {
          tokens.write(await requestRefresh(current.refreshToken));
          return 'ok';
        } catch (error) {
          if (!isRefusal(error)) return 'transient';
          // Clear only if nobody replaced the session meanwhile (e.g. a fresh login).
          if (tokens.read()?.refreshToken === current.refreshToken) tokens.clear();
          return 'terminal';
        }
      });
    } catch {
      return 'transient';
    }
  }

  return {
    refresh({ staleAccessToken } = {}) {
      const current = tokens.read();
      if (!current) return Promise.resolve('terminal');
      if (staleAccessToken && current.accessToken !== staleAccessToken) return Promise.resolve('ok');
      if (!inFlight) {
        inFlight = run(current.refreshToken).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
