import type { TdTokenResponse } from '@/types/td';
import type { CrossTabLock } from './cross-tab-lock';

/** All Table Derby browser state lives under `td_` keys, apart from Quizball's `quizball_*`. */
export const TD_STORAGE_KEYS = {
  session: 'td_session',
  /** Generation that has been signed out; a stored session of that generation reads as gone. */
  cancelled: 'td_session_cancelled',
  mockServer: 'td_mock_server',
} as const;

export interface TdTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, epoch ms; null when the API sent something unparsable. */
  expiresAt: number | null;
}

/**
 * One sign-in. Stored as a single JSON value so every tab sees the tokens,
 * the generation and the staff id change together.
 */
export interface TdSession extends TdTokenSet {
  /** New random id per sign-in; token rotation keeps it. Anything started under another generation is discarded. */
  generation: string;
  /** Set once `/admin/me` has confirmed who signed in. */
  staffId: string | null;
  /** When the first attempt to spend `refreshToken` began (rotation recovery deadline); null otherwise. */
  refreshPendingSince: number | null;
}

export type TdSessionPatch = Partial<Omit<TdSession, 'generation'>>;

/** Compare-and-mutate operations; only available inside `transact`, i.e. under the session lock. */
export interface TdSessionTx {
  read(): TdSession | null;
  /** Starts a new generation (sign-in). */
  replace(session: TdSession): void;
  /** Applies only while `generation` is the stored, uncancelled one. */
  update(generation: string, patch: TdSessionPatch): boolean;
  /** Removes the stored session only if it belongs to `generation`. */
  clear(generation: string): boolean;
}

export interface TdTokenStore {
  /** A snapshot for readers; a cancelled generation reads as signed out. */
  read(): TdSession | null;
  /** Runs `fn` under the cross-tab session lock. Every session write goes through here. */
  transact<T>(fn: (tx: TdSessionTx) => T | Promise<T>): Promise<T>;
  /**
   * Signs a generation out at once, without waiting for the lock: a single
   * write of a separate key that only ever makes that generation unreadable
   * and unwritable, so it cannot race another generation. Tidy up with
   * `transact(tx => tx.clear(generation))` afterwards.
   */
  cancel(generation: string): void;
  /** Fires on every change, from this tab directly and from other tabs through `storage` events. */
  subscribe(listener: () => void): () => void;
}

export function newGeneration(): string {
  return crypto.randomUUID();
}

export function tokensFromResponse(response: TdTokenResponse | null | undefined): TdTokenSet | null {
  if (!response?.accessToken || !response.refreshToken) return null;
  const expiresAt = Date.parse(response.expiresAt);
  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
  };
}

function parseSession(raw: string | null): TdSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TdSession>;
    if (typeof value.generation !== 'string' || typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string') {
      return null;
    }
    return {
      generation: value.generation,
      staffId: typeof value.staffId === 'string' ? value.staffId : null,
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : null,
      refreshPendingSince: typeof value.refreshPendingSince === 'number' ? value.refreshPendingSince : null,
    };
  } catch {
    return null;
  }
}

const WATCHED_KEYS = new Set<string>([TD_STORAGE_KEYS.session, TD_STORAGE_KEYS.cancelled]);

export function createTokenStore(
  getStorage: () => Storage | null,
  sessionLock: () => CrossTabLock | null,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): TdTokenStore {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  const readStored = () => parseSession(getStorage()?.getItem(TD_STORAGE_KEYS.session) ?? null);
  const read = () => {
    const session = readStored();
    if (!session) return null;
    return getStorage()?.getItem(TD_STORAGE_KEYS.cancelled) === session.generation ? null : session;
  };
  const write = (session: TdSession) => {
    getStorage()?.setItem(TD_STORAGE_KEYS.session, JSON.stringify(session));
    emit();
  };

  const tx: TdSessionTx = {
    read,
    replace: write,
    update(generation, patch) {
      const current = read();
      if (!current || current.generation !== generation) return false;
      write({ ...current, ...patch, generation });
      return true;
    },
    clear(generation) {
      // Stored, not read(): a cancelled session is still removed here.
      if (readStored()?.generation !== generation) return false;
      getStorage()?.removeItem(TD_STORAGE_KEYS.session);
      emit();
      return true;
    },
  };

  return {
    read,
    async transact(fn) {
      const lock = sessionLock();
      if (!lock) throw new Error('Changing the Table Derby session needs Web Locks');
      return lock.run(async () => fn(tx));
    },
    cancel(generation) {
      getStorage()?.setItem(TD_STORAGE_KEYS.cancelled, generation);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        // key === null means another tab called localStorage.clear().
        if (event.key === null || WATCHED_KEYS.has(event.key)) listener();
      };
      target?.addEventListener('storage', onStorage as EventListener);
      return () => {
        listeners.delete(listener);
        target?.removeEventListener('storage', onStorage as EventListener);
      };
    },
  };
}

export function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
