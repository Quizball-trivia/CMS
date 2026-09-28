import { describe, expect, it, vi } from 'vitest';
import { createStorageLock, createWebLocksLock, type CrossTabLock } from '../cross-tab-lock';
import { createRefreshCoordinator } from '../refresh-coordinator';
import { createTokenStore, TD_STORAGE_KEYS, type TdSession } from '../token-store';
import { createFakeLockManager, deferred, MemoryStorage, session, sleep } from './helpers';

function storageLock(storage: Storage, owner: string): CrossTabLock {
  return createStorageLock({
    storage: () => storage,
    key: TD_STORAGE_KEYS.refreshLock,
    owner,
    ttlMs: 5_000,
    pollMs: 2,
    settleMs: 1,
    waitMs: 2_000,
  });
}

/** One browser tab: its own coordinator and token store over the shared localStorage. */
function openTab(storage: Storage, lock: CrossTabLock, requestRefresh: (refreshToken: string) => Promise<TdSession>) {
  const tokens = createTokenStore(() => storage, null);
  return { tokens, coordinator: createRefreshCoordinator({ tokens, lock, requestRefresh }) };
}

describe('refresh coordinator', () => {
  it('makes exactly one network refresh for concurrent callers in one tab', async () => {
    const storage = new MemoryStorage();
    const network = vi.fn(async () => {
      await sleep(5);
      return session('access-2', 'refresh-2');
    });
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-1', 'refresh-1'));

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => tab.coordinator.refresh()));

    expect(outcomes).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(network).toHaveBeenCalledTimes(1);
    expect(network).toHaveBeenCalledWith('refresh-1');
    expect(tab.tokens.read()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('refreshes again once the previous refresh has settled', async () => {
    const storage = new MemoryStorage();
    let n = 1;
    const network = vi.fn(async (refreshToken: string) => {
      n += 1;
      return session(`access-${n}`, refreshToken.replace(/\d+$/, String(n)));
    });
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-1', 'refresh-1'));

    await tab.coordinator.refresh();
    await tab.coordinator.refresh();

    expect(network.mock.calls.map(([token]) => token)).toEqual(['refresh-1', 'refresh-2']);
  });

  const webLocks = createFakeLockManager();
  const lockFactories: Array<[string, (storage: Storage, owner: string) => CrossTabLock]> = [
    ['localStorage lease', (storage, owner) => storageLock(storage, owner)],
    ['Web Locks', () => createWebLocksLock('td-refresh', webLocks, 2_000)],
  ];

  it.each(lockFactories)('makes a second tab wait for the first and reuse its rotated token (%s)', async (_name, makeLock) => {
    const storage = new MemoryStorage();
    const response = deferred<TdSession>();
    const network = vi.fn(() => response.promise);
    const tabA = openTab(storage, makeLock(storage, 'tab-a'), network);
    const tabB = openTab(storage, makeLock(storage, 'tab-b'), network);
    tabA.tokens.write(session('access-1', 'refresh-1'));

    const first = tabA.coordinator.refresh();
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));

    let secondSettled = false;
    const second = tabB.coordinator.refresh().finally(() => {
      secondSettled = true;
    });
    await sleep(30);
    expect(secondSettled).toBe(false);

    response.resolve(session('access-2', 'refresh-2'));

    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(network).toHaveBeenCalledTimes(1);
    expect(tabB.tokens.read()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(storage.getItem(TD_STORAGE_KEYS.refreshLock)).toBeNull();
  });

  it('takes over a lease left behind by a closed tab', async () => {
    const storage = new MemoryStorage();
    storage.setItem(TD_STORAGE_KEYS.refreshLock, JSON.stringify({ owner: 'closed-tab', expiresAt: Date.now() - 1 }));
    const network = vi.fn(async () => session('access-2', 'refresh-2'));
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-1', 'refresh-1'));

    await expect(tab.coordinator.refresh()).resolves.toBe('ok');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('skips the network when the refused access token has already been replaced', async () => {
    const storage = new MemoryStorage();
    const network = vi.fn(async () => session('access-3', 'refresh-3'));
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-2', 'refresh-2'));

    await expect(tab.coordinator.refresh({ staleAccessToken: 'access-1' })).resolves.toBe('ok');
    expect(network).not.toHaveBeenCalled();
  });

  it('clears the session when the API refuses the refresh token', async () => {
    const storage = new MemoryStorage();
    const network = vi.fn(async () => Promise.reject({ status: 401, code: 'refresh_token_reused' }));
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-1', 'refresh-1'));
    tab.tokens.writeStaffId('staff-1');

    await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
    expect(tab.tokens.read()).toBeNull();
    expect(tab.tokens.readStaffId()).toBeNull();
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch')],
    ['a server error', { status: 503 }],
    ['rate limiting', { status: 429 }],
  ])('keeps the session after %s', async (_name, failure) => {
    const storage = new MemoryStorage();
    const network = vi.fn(async () => Promise.reject(failure));
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);
    tab.tokens.write(session('access-1', 'refresh-1'));

    await expect(tab.coordinator.refresh()).resolves.toBe('transient');
    expect(tab.tokens.read()).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('reports terminal without a network call when there is no session', async () => {
    const storage = new MemoryStorage();
    const network = vi.fn();
    const tab = openTab(storage, storageLock(storage, 'tab-a'), network);

    await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
    expect(network).not.toHaveBeenCalled();
  });
});
