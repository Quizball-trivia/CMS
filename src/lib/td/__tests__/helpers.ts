import { createWebLocksLock } from '../cross-tab-lock';
import { createTokenStore, type TdSession, type TdTokenSet, type TdTokenStore } from '../token-store';

/** A Storage that several simulated tabs can share (Node's own localStorage is not usable here). */
export class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

export function tokenSet(accessToken: string, refreshToken: string, expiresAt: number | null = Date.now() + 60_000): TdTokenSet {
  return { accessToken, refreshToken, expiresAt };
}

export function session(
  generation: string,
  accessToken: string,
  refreshToken: string,
  extra: Partial<Omit<TdSession, 'generation' | 'accessToken' | 'refreshToken'>> = {},
): TdSession {
  return { generation, accessToken, refreshToken, expiresAt: Date.now() + 60_000, staffId: null, refreshPendingSince: null, ...extra };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Serialises callbacks per lock name, like navigator.locks across the tabs of
 * one origin, including `signal`: aborting while waiting rejects the request
 * with the signal's reason and never runs the callback. `ifAvailable` gets a
 * null lock while the name is held or queued; `query` lists the held names.
 */
export function createFakeLockManager(): LockManager {
  const tails = new Map<string, Promise<void>>();
  const queued = new Map<string, number>();
  const held = new Map<string, number>();
  const bump = (counts: Map<string, number>, name: string, by: number) => counts.set(name, (counts.get(name) ?? 0) + by);
  const request = (name: string, ...args: unknown[]) => {
    const callback = args[args.length - 1] as (lock: Lock | null) => unknown;
    const options = args.length > 1 ? (args[0] as LockOptions) : undefined;
    const signal = options?.signal;
    if (options?.ifAvailable && (queued.get(name) ?? 0) > 0) return Promise.resolve().then(() => callback(null));
    const previous = tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    bump(queued, name, 1);
    tails.set(name, previous.then(() => new Promise<void>((resolve) => (release = () => {
      bump(queued, name, -1);
      resolve();
    }))));
    return new Promise((resolve, reject) => {
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
      void previous.then(async () => {
        signal?.removeEventListener('abort', onAbort);
        if (aborted) return release();
        bump(held, name, 1);
        try {
          resolve(await callback({ name, mode: 'exclusive' } as Lock));
        } catch (error) {
          reject(error);
        } finally {
          bump(held, name, -1);
          release();
        }
      });
    });
  };
  const query = async () => ({ held: [...held].filter(([, n]) => n > 0).map(([name]) => ({ name, mode: 'exclusive' })), pending: [] });
  return { request, query } as unknown as LockManager;
}

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}

/** One browser origin: a localStorage and a Web Locks manager that its tabs share. */
export function createOrigin() {
  const storage = new MemoryStorage();
  const locks = createFakeLockManager();
  return {
    storage,
    locks,
    lock: (name: string, waitMs = 2_000) => createWebLocksLock(name, locks, waitMs),
    store: (): TdTokenStore => createTokenStore(() => storage, () => createWebLocksLock('td-session', locks, 2_000), null),
  };
}

/** Writes a session the way a sign-in commits it. */
export function put(store: TdTokenStore, value: TdSession): Promise<void> {
  return store.transact((tx) => tx.replace(value));
}
