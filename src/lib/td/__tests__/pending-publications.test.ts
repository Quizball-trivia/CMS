import { describe, expect, it } from 'vitest';
import { createWebLocksLock } from '../cross-tab-lock';
import { claimTabId, createPendingPublications, liveTabIds, type PendingRequest } from '../pending-publications';
import { createFakeLockManager, deferred, MemoryStorage, sleep } from './helpers';

const publish = (idemKey: string, publicationId: string | null = null): PendingRequest => ({ kind: 'publish', idemKey, releaseId: null, publicationId });

/** One browser: a localStorage and Web Locks shared by its tabs. */
function browser() {
  const storage = new MemoryStorage();
  const locks = createFakeLockManager();
  const storeFor = (tab: string, liveTabs: () => Promise<ReadonlySet<string> | null> = () => liveTabIds(locks)) =>
    createPendingPublications({ staffId: 'staff-1', tab, storage: () => storage, lock: createWebLocksLock('td-pending-publications', locks, 2_000), liveTabs });
  /** A tab whose closing the test controls. */
  const openTab = async (id: string) => {
    const closed = deferred<void>();
    const holding = deferred<void>();
    void locks.request(`td_tab:${id}`, () => {
      holding.resolve();
      return closed.promise;
    });
    await holding.promise;
    return { store: storeFor(id), close: () => closed.resolve() };
  };
  return { storage, locks, storeFor, openTab };
}

describe('pending publications, kept per request', () => {
  it('a second tab’s refused publish never clears the first tab’s unanswered request', async () => {
    const { openTab } = browser();
    const first = await openTab('tab-a');
    const second = await openTab('tab-b');
    await first.store.keep(publish('publish:a'));
    await second.store.keep(publish('publish:b'));
    // The second tab's publish is refused (publication_in_progress): only its own key goes.
    await second.store.forget('publish:b');
    await second.store.forget('publish:a');

    expect(await second.store.claim()).toEqual([]);
    expect(await first.store.claim()).toEqual([publish('publish:a')]);
  });

  it('a closed tab’s requests are taken by the next tab that looks; an open tab’s never are', async () => {
    const { openTab } = browser();
    const closing = await openTab('tab-a');
    const staying = await openTab('tab-b');
    await closing.store.keep(publish('publish:a', 'pub-1'));
    expect(await staying.store.claim()).toEqual([]);

    closing.close();
    await sleep(0);
    expect(await staying.store.claim()).toEqual([publish('publish:a', 'pub-1')]);
    // Now the second tab's own: it can let it go.
    await staying.store.forget('publish:a');
    expect(await staying.store.claim()).toEqual([]);
  });

  it('a publication the API reports settled clears its request whichever tab sent it', async () => {
    const { openTab } = browser();
    const first = await openTab('tab-a');
    const second = await openTab('tab-b');
    await first.store.keep(publish('publish:a', 'pub-1'));
    await first.store.keep(publish('publish:c'));
    await second.store.resolved('pub-1');
    expect(await first.store.claim()).toEqual([publish('publish:c')]);
  });

  it('without a way to tell which tabs are open, another tab’s request is never taken', async () => {
    const { storeFor } = browser();
    await storeFor('tab-a', async () => null).keep(publish('publish:a'));
    expect(await storeFor('tab-b', async () => null).claim()).toEqual([]);
    expect(await storeFor('tab-a', async () => null).claim()).toEqual([publish('publish:a')]);
  });

  it('keeps every request of one tab, each under its own key, with its publication once known', async () => {
    const { storage, openTab } = browser();
    const tab = await openTab('tab-a');
    await tab.store.keep(publish('publish:a'));
    await tab.store.keep({ kind: 'rollback', idemKey: 'rollback:b', releaseId: 'rel-2', publicationId: null });
    await tab.store.keep(publish('publish:a', 'pub-9'));
    expect(JSON.parse(storage.getItem('td_pending_publications:staff-1')!)).toEqual({
      'publish:a': { ...publish('publish:a', 'pub-9'), tab: 'tab-a' },
      'rollback:b': { kind: 'rollback', idemKey: 'rollback:b', releaseId: 'rel-2', publicationId: null, tab: 'tab-a' },
    });
    await tab.store.resolved('pub-9');
    await tab.store.forget('rollback:b');
    expect(storage.getItem('td_pending_publications:staff-1')).toBeNull();
  });
});

describe('tab identity', () => {
  it('keeps the id across a reload and gives a duplicated tab (a copy of sessionStorage) its own', async () => {
    const locks = createFakeLockManager();
    const ids = ['id-1', 'id-2'];
    const original = new MemoryStorage();
    expect(await claimTabId(locks, original, () => ids.shift()!)).toBe('id-1');
    expect(original.getItem('td_tab_id')).toBe('id-1');

    const duplicate = new MemoryStorage();
    duplicate.setItem('td_tab_id', 'id-1');
    expect(await claimTabId(locks, duplicate, () => ids.shift()!)).toBe('id-2');
    expect(duplicate.getItem('td_tab_id')).toBe('id-2');
    expect([...(await liveTabIds(locks))].sort()).toEqual(['id-1', 'id-2']);

    // A reload (the lock went with the old page) keeps its id.
    const reloaded = await claimTabId(createFakeLockManager(), original, () => 'unused');
    expect(reloaded).toBe('id-1');
  });
});
