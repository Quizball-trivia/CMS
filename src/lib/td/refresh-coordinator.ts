import type { CrossTabLock } from './cross-tab-lock';
import type { TdTokenSet, TdTokenStore } from './token-store';

/**
 * ok: the session of the requested generation holds fresh tokens (refreshed here or by another tab).
 * terminal: the refresh token is dead; that generation has been cleared.
 * transient: the tokens did not change; recovery is scheduled if an attempt went unanswered.
 * superseded: the session was signed out or replaced by another sign-in; drop whatever was being done.
 */
export type RefreshOutcome = 'ok' | 'terminal' | 'transient' | 'superseded';

/**
 * API contract (plan §13 notes): after rotating a refresh token, the API
 * answers the immediately previous token with the same successor pair for
 * 60 s (server clock). The client only starts attempts with that token within
 * 25 s of the first one, recorded before the first request is sent, which
 * leaves at least 35 s for latency. After that the session ends rather than
 * risk spending a token the API has already rotated.
 */
export const ROTATION_RECOVERY_MS = 25_000;
const RECOVERY_DELAYS_MS = [1_000, 3_000, 6_000, 10_000];

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
  /** Serialises spending refresh tokens across tabs; held over the network call, unlike the session lock. */
  refreshLock: () => CrossTabLock | null;
  /** The only network refresh in the app. Rejects with `{ status }` when the API answers. */
  requestRefresh: (refreshToken: string) => Promise<TdTokenSet>;
  now?: () => number;
  isOnline?: () => boolean;
  setTimer?: (callback: () => void, ms: number) => unknown;
}

function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

type Plan = { outcome: RefreshOutcome } | { send: string; deadline: number };

/**
 * The one place refresh tokens are spent. Tokens rotate and reuse revokes the
 * whole family, so within a tab callers share one in-flight refresh and across
 * tabs the refresh lock serialises spending. Deciding, recording the attempt
 * and committing the result each happen in a short session transaction, bound
 * to the generation the refresh started for: a stalled refresh never blocks a
 * sign-in, and its late answer can never resurrect or overwrite a session.
 */
export function createRefreshCoordinator({
  tokens,
  refreshLock,
  requestRefresh,
  now = Date.now,
  isOnline = browserOnline,
  setTimer = (callback, ms) => setTimeout(callback, ms),
}: RefreshCoordinatorOptions): RefreshCoordinator {
  let inFlight: { key: string; promise: Promise<RefreshOutcome> } | null = null;
  let recovery: { generation: string; attempt: number } | null = null;

  function scheduleRecovery(generation: string, deadline: number) {
    const attempt = recovery?.generation === generation ? recovery.attempt + 1 : 0;
    const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)];
    if (now() + delay > deadline) return;
    recovery = { generation, attempt };
    // Independent of the provider's renewal tick, so the window is actually used.
    setTimer(() => void refresh({ generation }), delay);
  }

  async function spend(generation: string, seenRefreshToken: string): Promise<RefreshOutcome> {
    const plan = await tokens.transact<Plan>((tx) => {
      const current = tx.read();
      if (!current || current.generation !== generation) return { outcome: 'superseded' };
      if (current.refreshToken !== seenRefreshToken) return { outcome: 'ok' };
      const since = current.refreshPendingSince;
      if (since !== null && now() - since > ROTATION_RECOVERY_MS) {
        // The first attempt may have rotated the token; spending it now could trip reuse detection.
        tx.clear(generation);
        return { outcome: 'terminal' };
      }
      // Offline, nothing would reach the API, so there is nothing to recover later.
      if (!isOnline()) return { outcome: 'transient' };
      // Recorded before sending, so a tab that dies mid-request still leaves the deadline behind.
      if (since === null) tx.update(generation, { refreshPendingSince: now() });
      return { send: current.refreshToken, deadline: (since ?? now()) + ROTATION_RECOVERY_MS };
    });
    if (!('send' in plan)) return plan.outcome;

    try {
      const next = await requestRefresh(plan.send);
      const committed = await tokens.transact((tx) => tx.update(generation, { ...next, refreshPendingSince: null }));
      if (recovery?.generation === generation) recovery = null;
      return committed ? 'ok' : 'superseded';
    } catch (error) {
      if (isRefusal(error)) {
        await tokens.transact((tx) => tx.clear(generation));
        return 'terminal';
      }
      // Unknown outcome: the API may have rotated the token and lost the answer.
      scheduleRecovery(generation, plan.deadline);
      return 'transient';
    }
  }

  async function run(generation: string, seenRefreshToken: string): Promise<RefreshOutcome> {
    const lock = refreshLock();
    if (!lock) return 'transient';
    try {
      return await lock.run(() => spend(generation, seenRefreshToken));
    } catch {
      return 'transient';
    }
  }

  function refresh({ generation, staleAccessToken }: { generation?: string | null; staleAccessToken?: string | null } = {}) {
    const current = tokens.read();
    if (!current) return Promise.resolve<RefreshOutcome>(generation ? 'superseded' : 'terminal');
    if (generation && current.generation !== generation) return Promise.resolve<RefreshOutcome>('superseded');
    if (staleAccessToken && current.accessToken !== staleAccessToken) return Promise.resolve<RefreshOutcome>('ok');

    const key = `${current.generation}:${current.refreshToken}`;
    if (inFlight?.key !== key) {
      const promise = run(current.generation, current.refreshToken).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
      });
      inFlight = { key, promise };
    }
    return inFlight.promise;
  }

  return { refresh };
}
