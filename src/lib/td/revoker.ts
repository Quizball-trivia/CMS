import { TD_STORAGE_KEYS } from './token-store';

/**
 * Revocations that must happen even if the first try fails: a session given up
 * after a refresh that may have been spent is revoked on the API (logout with
 * its token), because its successor may be in someone else's hands. Pending
 * tokens are kept in storage and retried, backing off to a minute and at once
 * when the browser is back online, until the API answers; they survive a reload.
 */
export interface Revoker {
  /** Keeps the token and revokes it, retrying until the API answers. */
  revoke(refreshToken: string): void;
  /** Keeps the token before a first attempt made elsewhere, so a page closed
   *  mid-request still leaves it to retry. */
  remember(refreshToken: string): void;
  /** That attempt settled it. */
  forget(refreshToken: string): void;
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

  // One storage record per pending token, so tabs never overwrite each other's.
  const keyOf = (token: string) => `${TD_STORAGE_KEYS.pendingRevocations}:${token.slice(-24)}`;
  const read = (): string[] => {
    const s = storage();
    if (!s) return [];
    const found: string[] = [];
    try {
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        const token = key?.startsWith(`${TD_STORAGE_KEYS.pendingRevocations}:`) ? s.getItem(key) : null;
        if (token) found.push(token);
      }
    } catch {
      // unreadable: nothing to retry
    }
    return found;
  };
  const keep = (token: string) => storage()?.setItem(keyOf(token), token);
  const forget = (token: string) => storage()?.removeItem(keyOf(token));

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // Until nothing is left, including tokens queued while this ran.
      for (let pending = read(); pending.length; pending = read()) {
        for (const token of pending) {
          const done = await send(token).catch(() => false);
          if (!done) {
            schedule();
            return;
          }
          forget(token);
        }
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
      keep(refreshToken);
      void drain();
    },
    remember(refreshToken) {
      keep(refreshToken);
    },
    forget(refreshToken) {
      forget(refreshToken);
    },
  };
}
