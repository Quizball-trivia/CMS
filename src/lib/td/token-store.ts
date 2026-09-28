import type { TdTokenResponse } from '@/types/td';

/** All Table Derby browser state lives under `td_` keys, apart from Quizball's `quizball_*`. */
export const TD_STORAGE_KEYS = {
  // One JSON value so another tab can never read a half-rotated token pair.
  session: 'td_session',
  staffId: 'td_staff_id',
  refreshLock: 'td_refresh_lock',
  mockServer: 'td_mock_server',
} as const;

export interface TdSession {
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, epoch ms; null when the API sent something unparsable. */
  expiresAt: number | null;
}

export type TdTokenChange = 'session' | 'staff';

export interface TdTokenStore {
  read(): TdSession | null;
  write(session: TdSession): void;
  clear(): void;
  readStaffId(): string | null;
  writeStaffId(id: string | null): void;
  /** Fires for writes in this tab and, through `storage` events, in other tabs. */
  subscribe(listener: (change: TdTokenChange) => void): () => void;
}

export function sessionFromResponse(response: TdTokenResponse): TdSession | null {
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
    if (typeof value.accessToken !== 'string' || typeof value.refreshToken !== 'string') return null;
    return {
      accessToken: value.accessToken,
      refreshToken: value.refreshToken,
      expiresAt: typeof value.expiresAt === 'number' ? value.expiresAt : null,
    };
  } catch {
    return null;
  }
}

export function createTokenStore(
  getStorage: () => Storage | null,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): TdTokenStore {
  const listeners = new Set<(change: TdTokenChange) => void>();
  const emit = (change: TdTokenChange) => listeners.forEach((listener) => listener(change));

  return {
    read: () => parseSession(getStorage()?.getItem(TD_STORAGE_KEYS.session) ?? null),
    write(session) {
      getStorage()?.setItem(TD_STORAGE_KEYS.session, JSON.stringify(session));
      emit('session');
    },
    clear() {
      const storage = getStorage();
      storage?.removeItem(TD_STORAGE_KEYS.session);
      storage?.removeItem(TD_STORAGE_KEYS.staffId);
      emit('session');
    },
    readStaffId: () => getStorage()?.getItem(TD_STORAGE_KEYS.staffId) ?? null,
    writeStaffId(id) {
      const storage = getStorage();
      if (id) storage?.setItem(TD_STORAGE_KEYS.staffId, id);
      else storage?.removeItem(TD_STORAGE_KEYS.staffId);
      emit('staff');
    },
    subscribe(listener) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        // key === null means another tab called localStorage.clear().
        if (event.key === null || event.key === TD_STORAGE_KEYS.session) listener('session');
        if (event.key === null || event.key === TD_STORAGE_KEYS.staffId) listener('staff');
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
