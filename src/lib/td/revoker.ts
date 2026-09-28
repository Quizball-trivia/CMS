import { TD_STORAGE_KEYS } from './token-store';

/**
 * Revocations that must happen even if the first try fails: a session given up
 * after a refresh that may have been spent is revoked on the API (logout with
 * its token), because its successor may be in someone else's hands. Pending
 * tokens are kept in storage and retried, backing off to a minute and at once
 * when the browser is back online, until the API answers; they survive a reload.
 */
export interface Revoker {
  revoke(refreshToken: string): void;
}

export interface RevokerOptions {
  storage: () => Storage | null;
  /** Resolves true when the API has revoked (or no longer knows) the session. */
  send: (refreshToken: string) => Promise<boolean>;
  onOnline?: (callback: () => void) => () => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}

const MAX_DELAY_MS = 60_000;

export function createRevoker({
  storage,
  send,
  onOnline = () => () => {},
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
}: RevokerOptions): Revoker {
  let timer: unknown = null;
  let delay = 1_000;
  let running = false;

  const read = (): string[] => {
    try {
      const value = JSON.parse(storage()?.getItem(TD_STORAGE_KEYS.pendingRevocations) ?? '[]') as unknown;
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  };
  const write = (tokens: string[]) => {
    const s = storage();
    if (!s) return;
    if (tokens.length) s.setItem(TD_STORAGE_KEYS.pendingRevocations, JSON.stringify(tokens));
    else s.removeItem(TD_STORAGE_KEYS.pendingRevocations);
  };

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (const token of read()) {
        const done = await send(token).catch(() => false);
        if (!done) {
          schedule();
          return;
        }
        write(read().filter((t) => t !== token));
      }
      delay = 1_000;
    } finally {
      running = false;
    }
  }

  function schedule() {
    if (timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      void drain();
    }, delay);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  }

  onOnline(() => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    void drain();
  });
  // Left over from before a reload.
  if (read().length) void drain();

  return {
    revoke(refreshToken) {
      const pending = read();
      if (!pending.includes(refreshToken)) write([...pending, refreshToken]);
      void drain();
    },
  };
}
