import { describe, expect, it } from 'vitest';
import { createWebLocksLock } from '../cross-tab-lock';
import { createTokenStore, TD_STORAGE_KEYS } from '../token-store';
import { createFakeLockManager, createOrigin, MemoryStorage, put, session } from './helpers';

/** Storage that runs `onRead` whenever the session key is read, to force an interleaving at that exact point. */
class InterleavingStorage extends MemoryStorage {
  onRead: (() => void) | null = null;
  getItem(key: string) {
    const value = super.getItem(key);
    if (key === TD_STORAGE_KEYS.session && this.onRead) {
      const hook = this.onRead;
      this.onRead = null;
      hook();
    }
    return value;
  }
}

function interleavingOrigin() {
  const storage = new InterleavingStorage();
  const locks = createFakeLockManager();
  const store = () => createTokenStore(() => storage, () => createWebLocksLock('td-session', locks, 2_000), null);
  return { storage, store };
}

describe('token store', () => {
  it("serialises A's clean-up with B's sign-in, so B is never deleted", async () => {
    const { storage, store } = interleavingOrigin();
    const tabA = store();
    const tabB = store();
    await put(tabA, session('gen-a', 'access-a', 'refresh-a'));

    // B commits its sign-in at the exact moment A's clean-up has read generation A.
    let signInB: Promise<void> | null = null;
    storage.onRead = () => {
      signInB = put(tabB, session('gen-b', 'access-b', 'refresh-b'));
    };
    const cleared = await tabA.transact((tx) => tx.clear('gen-a'));
    await signInB;

    expect(cleared).toBe(true);
    expect(tabA.read()).toMatchObject({ generation: 'gen-b', accessToken: 'access-b' });
  });

  it('never lets a refresh commit racing an unlocked sign-out restore that session', async () => {
    const { storage, store } = interleavingOrigin();
    const refreshingTab = store();
    const signingOutTab = store();
    await put(refreshingTab, session('gen-a', 'access-a', 'refresh-a'));

    // The sign-out's unlocked cancellation lands between the commit's read and its write.
    storage.onRead = () => signingOutTab.cancel('gen-a');
    const committed = await refreshingTab.transact((tx) => tx.update('gen-a', { accessToken: 'access-a2', refreshToken: 'refresh-a2' }));

    expect(committed).toBe(false);
    expect(refreshingTab.read()).toBeNull();
    await signingOutTab.transact((tx) => tx.clear('gen-a'));
    expect(storage.getItem(TD_STORAGE_KEYS.session)).toBeNull();
  });

  it('treats a cancelled generation as gone for readers and writers, but not other generations', async () => {
    const origin = createOrigin();
    const store = origin.store();
    await put(store, session('gen-a', 'access-a', 'refresh-a'));

    store.cancel('gen-a');
    expect(store.read()).toBeNull();
    expect(await store.transact((tx) => tx.update('gen-a', { accessToken: 'x' }))).toBe(false);
    expect(await store.transact((tx) => tx.clear('gen-a'))).toBe(true);

    await put(store, session('gen-b', 'access-b', 'refresh-b'));
    store.cancel('gen-a');
    expect(store.read()).toMatchObject({ generation: 'gen-b' });
  });

  it('refuses to change the session without Web Locks', async () => {
    const storage = new MemoryStorage();
    const store = createTokenStore(() => storage, () => null, null);
    await expect(store.transact((tx) => tx.replace(session('gen-a', 'a', 'r')))).rejects.toThrow(/Web Locks/);
    expect(store.read()).toBeNull();
  });
});
