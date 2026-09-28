import type { TdSession } from '../token-store';

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

export function session(accessToken: string, refreshToken: string, expiresAt: number | null = Date.now() + 60_000): TdSession {
  return { accessToken, refreshToken, expiresAt };
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

/** Serialises callbacks per lock name, like navigator.locks across tabs of one origin. */
export function createFakeLockManager(): LockManager {
  const tails = new Map<string, Promise<unknown>>();
  const request = (name: string, ...args: unknown[]) => {
    const callback = args[args.length - 1] as (lock: Lock) => Promise<unknown>;
    const run = (tails.get(name) ?? Promise.resolve()).then(() => callback({ name, mode: 'exclusive' } as Lock));
    tails.set(
      name,
      run.catch(() => undefined),
    );
    return run;
  };
  return { request, query: async () => ({ held: [], pending: [] }) } as unknown as LockManager;
}

export function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}
