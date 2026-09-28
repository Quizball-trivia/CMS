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
 * API contract (plan §13 notes): every refresh carries a request id, kept for
 * all its retries (and stored with the pending attempt, so another tab retries
 * with it). A retry of the same request within 60 s, while its successor is
 * unused, gets the same answer; any other reuse of a spent token revokes the
 * family. The client starts no retry later than 25 s after its first attempt
 * (recorded before the request is sent) and gives each request 15 s, so every
 * retry lands inside the window; after that it ends the session, so a dead API
 * cannot hold a session in limbo.
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
  requestRefresh: (refreshToken: string, requestId: string) => Promise<TdTokenSet>;
  newRequestId?: () => string;
  now?: () => number;
  isOnline?: () => boolean;
  /** Subscribes to connectivity coming back; returns an unsubscribe function. */
  onOnline?: (callback: () => void) => () => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

function browserOnOnline(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', callback);
  return () => window.removeEventListener('online', callback);
}

type Plan = { outcome: RefreshOutcome; recoverUntil?: number } | { send: string; requestId: string; deadline: number };

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
  newRequestId = () => crypto.randomUUID(),
  now = Date.now,
  isOnline = browserOnline,
  onOnline = browserOnOnline,
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: RefreshCoordinatorOptions): RefreshCoordinator {
  let inFlight: { key: string; promise: Promise<RefreshOutcome> } | null = null;
  let recovery: { generation: string; attempt: number; deadline: number; timer: unknown } | null = null;

  function stopRecovery(generation?: string) {
    if (!recovery || (generation && recovery.generation !== generation)) return;
    if (recovery.timer !== null) clearTimer(recovery.timer);
    recovery = null;
  }

  // Retries run on their own timer, independent of the provider's renewal
  // tick, and always against the deadline of the first attempt.
  function scheduleRecovery(generation: string, deadline: number) {
    const attempt = recovery?.generation === generation ? recovery.attempt + 1 : 0;
    stopRecovery();
    const delay = RECOVERY_DELAYS_MS[Math.min(attempt, RECOVERY_DELAYS_MS.length - 1)];
    const wait = Math.min(delay, deadline - now());
    if (wait <= 0) return;
    recovery = { generation, attempt, deadline, timer: null };
    const entry = recovery;
    entry.timer = setTimer(() => {
      entry.timer = null;
      void refresh({ generation });
    }, wait);
  }

  // Connectivity is back while a recovery is pending: retry now, not at the next timer.
  onOnline(() => {
    if (recovery && now() < recovery.deadline) void refresh({ generation: recovery.generation });
  });

  async function spend(generation: string, seenRefreshToken: string): Promise<RefreshOutcome> {
    const plan = await tokens.transact<Plan>((tx) => {
      const current = tx.read();
      if (!current || current.generation !== generation) return { outcome: 'superseded' };
      if (current.refreshToken !== seenRefreshToken) return { outcome: 'ok' };
      const since = current.refreshPendingSince;
      if (since !== null && now() - since > ROTATION_RECOVERY_MS) {
        // Recovery has run out of time (a product bound, see ROTATION_RECOVERY_MS): end the session.
        tx.clear(generation);
        return { outcome: 'terminal' };
      }
      if (!isOnline()) {
        // Nothing would reach the API. A recovery already under way keeps its deadline and retries.
        return since === null ? { outcome: 'transient' } : { outcome: 'transient', recoverUntil: since + ROTATION_RECOVERY_MS };
      }
      // Recorded before sending, so a tab that dies mid-request still leaves the deadline, and
      // the request id another tab retries with, behind.
      const requestId = (since !== null ? current.refreshRequestId : null) ?? newRequestId();
      if (since === null || current.refreshRequestId !== requestId)
        tx.update(generation, { refreshPendingSince: since ?? now(), refreshRequestId: requestId });
      return { send: current.refreshToken, requestId, deadline: (since ?? now()) + ROTATION_RECOVERY_MS };
    });
    if (!('send' in plan)) {
      if (plan.recoverUntil !== undefined) scheduleRecovery(generation, plan.recoverUntil);
      else if (plan.outcome !== 'transient') stopRecovery(generation);
      return plan.outcome;
    }

    try {
      const next = await requestRefresh(plan.send, plan.requestId);
      const committed = await tokens.transact((tx) =>
        tx.update(generation, { ...next, refreshPendingSince: null, refreshRequestId: null }),
      );
      stopRecovery(generation);
      return committed ? 'ok' : 'superseded';
    } catch (error) {
      if (isRefusal(error)) {
        stopRecovery(generation);
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
