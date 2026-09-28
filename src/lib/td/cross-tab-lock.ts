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

const sleepFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

export interface StorageLockOptions {
  storage: () => Storage | null;
  key: string;
  /** Unique per tab. */
  owner: string;
  /** Lease length; must outlive the longest task so a live holder is never overtaken. */
  ttlMs: number;
  pollMs: number;
  /** Pause between claiming and re-reading, so the later of two racing claims wins for both. */
  settleMs: number;
  waitMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface Lease {
  owner: string;
  expiresAt: number;
}

function readLease(storage: Storage, key: string): Lease | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null') as Lease | null;
    return value && typeof value.owner === 'string' && typeof value.expiresAt === 'number' ? value : null;
  } catch {
    return null;
  }
}

/** Fallback for browsers without Web Locks: a leased claim in localStorage. */
export function createStorageLock(options: StorageLockOptions): CrossTabLock {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      const storage = options.storage();
      if (!storage) return task();

      const deadline = now() + options.waitMs;
      for (;;) {
        const lease = readLease(storage, options.key);
        if (!lease || lease.expiresAt <= now()) {
          storage.setItem(options.key, JSON.stringify({ owner: options.owner, expiresAt: now() + options.ttlMs }));
          await sleep(options.settleMs);
          if (readLease(storage, options.key)?.owner === options.owner) break;
        }
        if (now() >= deadline) throw new LockTimeoutError();
        await sleep(options.pollMs);
      }

      try {
        return await task();
      } finally {
        if (readLease(storage, options.key)?.owner === options.owner) storage.removeItem(options.key);
      }
    },
  };
}

function randomId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createBrowserLock(name: string, storageKey: string, getStorage: () => Storage | null): CrossTabLock {
  const waitMs = 45_000;
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return createWebLocksLock(name, navigator.locks, waitMs);
  }
  return createStorageLock({
    storage: getStorage,
    key: storageKey,
    owner: randomId(),
    ttlMs: 30_000,
    pollMs: 100,
    settleMs: 50,
    waitMs,
  });
}
