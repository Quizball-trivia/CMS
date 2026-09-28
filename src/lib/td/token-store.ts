import type { TdTokenResponse } from '@/types/td';

/** All Table Derby browser state lives under `td_` keys, apart from Quizball's `quizball_*`. */
export const TD_STORAGE_KEYS = {
  session: 'td_session',
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
  /** When an unanswered refresh of `refreshToken` began (rotation recovery window); null otherwise. */
  refreshPendingSince: number | null;
}

export type TdSessionPatch = Partial<Omit<TdSession, 'generation'>>;

export interface TdTokenStore {
  read(): TdSession | null;
  /** Starts a new generation (sign-in). */
  replace(session: TdSession): void;
  /** Applies only while `generation` is still the stored one. */
  update(generation: string, patch: TdSessionPatch): boolean;
  /** Clears only while `generation` is still the stored one. */
  clear(generation: string): boolean;
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

export function createTokenStore(
  getStorage: () => Storage | null,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): TdTokenStore {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const read = () => parseSession(getStorage()?.getItem(TD_STORAGE_KEYS.session) ?? null);
  const write = (session: TdSession) => {
    getStorage()?.setItem(TD_STORAGE_KEYS.session, JSON.stringify(session));
    emit();
  };

  // Read-compare-write is synchronous, so it is atomic within a tab; across
  // tabs, sign-in, sign-out and refresh commits also hold the refresh lock.
  return {
    read,
    replace: write,
    update(generation, patch) {
      const current = read();
      if (!current || current.generation !== generation) return false;
      write({ ...current, ...patch, generation });
      return true;
    },
    clear(generation) {
      if (read()?.generation !== generation) return false;
      getStorage()?.removeItem(TD_STORAGE_KEYS.session);
      emit();
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        // key === null means another tab called localStorage.clear().
        if (event.key === null || event.key === TD_STORAGE_KEYS.session) listener();
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
