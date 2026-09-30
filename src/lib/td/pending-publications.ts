import { createBrowserLock, type CrossTabLock } from './cross-tab-lock';

/** A publish or roll back sent whose answer has not been seen yet. */
export interface PendingRequest {
  kind: 'publish' | 'rollback';
  idemKey: string;
  releaseId: string | null;
  publicationId: string | null;
}

interface Kept extends PendingRequest {
  tab: string;
}

export interface PendingPublications {
  /** Records a request of this tab's before it goes out, and again once its publication is known. */
  keep(request: PendingRequest): Promise<void>;
  /** Drops a request of this tab's (refused outright, or forgotten). Another tab's request is never dropped here. */
  forget(idemKey: string): Promise<void>;
  /** Drops the requests whose publication the API reports settled, whichever tab sent them. */
  resolved(publicationId: string): Promise<void>;
  /** This tab's requests plus those of tabs that are gone, which become this tab's to ask again. */
  claim(): Promise<PendingRequest[]>;
}

interface Options {
  staffId: string;
  tab: string;
  storage: () => Storage | null;
  lock: CrossTabLock | null;
  /** The ids of the tabs still open, or null when that cannot be known (then no other tab's request is taken). */
  liveTabs: () => Promise<ReadonlySet<string> | null>;
}

const isKept = (value: unknown): value is Kept => {
  const v = value as Partial<Kept> | null;
  return typeof v === 'object' && v !== null && typeof v.idemKey === 'string' && typeof v.tab === 'string' && (v.kind === 'publish' || v.kind === 'rollback');
};

const requestOf = ({ kind, idemKey, releaseId, publicationId }: PendingRequest): PendingRequest => ({ kind, idemKey, releaseId, publicationId });

export function createPendingPublications({ staffId, tab, storage, lock, liveTabs }: Options): PendingPublications {
  const key = `td_pending_publications:${staffId}`;

  const read = (): Map<string, Kept> => {
    try {
      const parsed: unknown = JSON.parse(storage()?.getItem(key) ?? '{}');
      if (typeof parsed !== 'object' || parsed === null) return new Map();
      return new Map(Object.values(parsed).filter(isKept).map((entry) => [entry.idemKey, entry]));
    } catch {
      return new Map();
    }
  };

  const write = (all: Map<string, Kept>) => {
    try {
      const target = storage();
      if (!target) return;
      if (all.size === 0) target.removeItem(key);
      else target.setItem(key, JSON.stringify(Object.fromEntries(all)));
    } catch {
      // Without storage a lost answer is recovered from the release list's active publication instead.
    }
  };

  // Every change is a read-modify-write of the one entry list, so tabs take turns.
  const update = <T>(change: (all: Map<string, Kept>) => T | Promise<T>): Promise<T> => {
    const task = async () => {
      const all = read();
      const result = await change(all);
      write(all);
      return result;
    };
    return lock ? lock.run(task) : task();
  };

  return {
    keep: (request) =>
      update((all) => {
        all.set(request.idemKey, { ...requestOf(request), tab });
      }),
    forget: (idemKey) =>
      update((all) => {
        if (all.get(idemKey)?.tab === tab) all.delete(idemKey);
      }),
    resolved: (publicationId) =>
      update((all) => {
        for (const [idemKey, entry] of all) if (entry.publicationId === publicationId) all.delete(idemKey);
      }),
    claim: () =>
      update(async (all) => {
        const live = await liveTabs();
        const mine: PendingRequest[] = [];
        for (const entry of all.values()) {
          if (entry.tab !== tab && (live === null || live.has(entry.tab))) continue;
          all.set(entry.idemKey, { ...requestOf(entry), tab });
          mine.push(requestOf(entry));
        }
        return mine;
      }),
  };
}

/* ── this tab's identity, visible to the other tabs while it is open ── */

const TAB_ID_KEY = 'td_tab_id';
const TAB_LOCK_PREFIX = 'td_tab:';

function holdWhileOpen(locks: LockManager, name: string): Promise<boolean> {
  return new Promise((resolve) => {
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        resolve(lock !== null);
        // Never settles: the browser releases the lock when the tab closes, which is what other tabs look for.
        return lock ? new Promise<never>(() => {}) : undefined;
      })
      .catch(() => resolve(true));
  });
}

/** An id for this tab that survives its reloads (sessionStorage), held as a Web Lock for as long as the tab is open. */
export async function claimTabId(locks: LockManager | null, session: Storage | null, newId: () => string = () => crypto.randomUUID()): Promise<string> {
  let id: string | null = null;
  try {
    id = session?.getItem(TAB_ID_KEY) ?? null;
  } catch {
    id = null;
  }
  id ??= newId();
  // A duplicated tab starts with a copy of sessionStorage, so the id is this tab's only if no open tab holds it.
  if (locks) while (!(await holdWhileOpen(locks, TAB_LOCK_PREFIX + id))) id = newId();
  try {
    session?.setItem(TAB_ID_KEY, id);
  } catch {
    // An id that does not survive a reload only means another tab or the next load adopts this tab's requests.
  }
  return id;
}

export async function liveTabIds(locks: LockManager): Promise<ReadonlySet<string>> {
  const { held = [] } = await locks.query();
  return new Set(held.flatMap((lock) => (lock.name?.startsWith(TAB_LOCK_PREFIX) ? [lock.name.slice(TAB_LOCK_PREFIX.length)] : [])));
}

let thisTab: Promise<string> | null = null;

const browserLocks = () => (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null);

function browserStorage(which: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[which];
  } catch {
    return null;
  }
}

export async function browserPendingPublications(staffId: string): Promise<PendingPublications> {
  const locks = browserLocks();
  thisTab ??= claimTabId(locks, browserStorage('sessionStorage'));
  return createPendingPublications({
    staffId,
    tab: await thisTab,
    storage: () => browserStorage('localStorage'),
    lock: createBrowserLock('td-pending-publications'),
    liveTabs: async () => (locks ? liveTabIds(locks) : null),
  });
}
