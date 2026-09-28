/** Mutual exclusion across every tab of this origin. */
export interface CrossTabLock {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export class LockTimeoutError extends Error {
  constructor() {
    super('Timed out waiting for the cross-tab lock');
    this.name = 'LockTimeoutError';
  }
}

/** Web Locks are atomic across tabs and released by the browser if the holder dies. */
export function createWebLocksLock(name: string, locks: LockManager, waitMs: number): CrossTabLock {
  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      try {
        return await locks.request(name, { mode: 'exclusive', signal: AbortSignal.timeout(waitMs) }, () => task());
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
          throw new LockTimeoutError();
        }
        throw error;
      }
    },
  };
}

/**
 * Null without Web Locks. There is deliberately no localStorage fallback: a
 * read-then-write lease cannot guarantee that a refresh token is spent once,
 * so such browsers are refused at sign-in instead.
 */
export function createBrowserLock(name: string): CrossTabLock | null {
  if (typeof navigator === 'undefined' || !navigator.locks) return null;
  return createWebLocksLock(name, navigator.locks, 45_000);
}
