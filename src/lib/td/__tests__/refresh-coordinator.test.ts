import { describe, expect, it, vi } from 'vitest';
import { createWebLocksLock, type CrossTabLock } from '../cross-tab-lock';
import { createRefreshCoordinator, ROTATION_RECOVERY_MS } from '../refresh-coordinator';
import { createTokenStore, type TdTokenSet } from '../token-store';
import { createFakeLockManager, deferred, MemoryStorage, session, sleep, tokenSet } from './helpers';

interface TabOptions {
  requestRefresh: (refreshToken: string) => Promise<TdTokenSet>;
  now?: () => number;
  isOnline?: () => boolean;
}

/** A browser origin: one localStorage and one Web Locks manager shared by its tabs. */
function origin() {
  const storage = new MemoryStorage();
  const locks = createFakeLockManager();
  const openTab = ({ requestRefresh, now, isOnline }: TabOptions) => {
    const tokens = createTokenStore(() => storage, null);
    const lock: CrossTabLock = createWebLocksLock('td-session', locks, 2_000);
    return { tokens, lock, coordinator: createRefreshCoordinator({ tokens, lock: () => lock, requestRefresh, now, isOnline }) };
  };
  return { storage, openTab };
}

describe('refresh coordinator', () => {
  it('makes exactly one network refresh for concurrent callers in one tab', async () => {
    const { openTab } = origin();
    const network = vi.fn(async (refreshToken: string) => {
      await sleep(5);
      return tokenSet('access-2', refreshToken.replace('1', '2'));
    });
    const tab = openTab({ requestRefresh: network });
    tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => tab.coordinator.refresh({ generation: 'gen-a' })));

    expect(outcomes).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(network).toHaveBeenCalledTimes(1);
    expect(tab.tokens.read()).toMatchObject({ generation: 'gen-a', accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('lets exactly one of two tabs refresh when both ask at the same moment', async () => {
    const { openTab } = origin();
    const network = vi.fn(async () => {
      await sleep(10);
      return tokenSet('access-2', 'refresh-2');
    });
    const tabA = openTab({ requestRefresh: network });
    const tabB = openTab({ requestRefresh: network });
    tabA.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    const outcomes = await Promise.all([tabA.coordinator.refresh(), tabB.coordinator.refresh()]);

    expect(outcomes).toEqual(['ok', 'ok']);
    expect(network).toHaveBeenCalledTimes(1);
    expect(tabB.tokens.read()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('makes a waiting tab reuse the rotated token instead of spending the old one', async () => {
    const { openTab } = origin();
    const answer = deferred<TdTokenSet>();
    const network = vi.fn(() => answer.promise);
    const tabA = openTab({ requestRefresh: network });
    const tabB = openTab({ requestRefresh: network });
    tabA.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    const first = tabA.coordinator.refresh();
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    let secondSettled = false;
    const second = tabB.coordinator.refresh().finally(() => {
      secondSettled = true;
    });
    await sleep(20);
    expect(secondSettled).toBe(false);

    answer.resolve(tokenSet('access-2', 'refresh-2'));
    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('discards a refresh that answers after sign-out', async () => {
    const { openTab } = origin();
    const answer = deferred<TdTokenSet>();
    const tab = openTab({ requestRefresh: () => answer.promise });
    tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    const pending = tab.coordinator.refresh({ generation: 'gen-a' });
    await sleep(5);
    tab.tokens.clear('gen-a');
    answer.resolve(tokenSet('access-2', 'refresh-2'));

    await expect(pending).resolves.toBe('superseded');
    expect(tab.tokens.read()).toBeNull();
  });

  it("discards a refresh that answers after another user's sign-in", async () => {
    const { openTab } = origin();
    const answer = deferred<TdTokenSet>();
    const tab = openTab({ requestRefresh: () => answer.promise });
    tab.tokens.replace(session('gen-a', 'access-a', 'refresh-a'));

    const pending = tab.coordinator.refresh({ generation: 'gen-a' });
    await sleep(5);
    // Another tab signed in as B without waiting for this tab's lock (e.g. an older build).
    tab.tokens.replace(session('gen-b', 'access-b', 'refresh-b', { staffId: 'staff-b' }));
    answer.resolve(tokenSet('access-a2', 'refresh-a2'));

    await expect(pending).resolves.toBe('superseded');
    expect(tab.tokens.read()).toMatchObject({ generation: 'gen-b', accessToken: 'access-b', staffId: 'staff-b' });
  });

  it('refuses to refresh on behalf of a generation that is no longer stored', async () => {
    const { openTab } = origin();
    const network = vi.fn();
    const tab = openTab({ requestRefresh: network });
    tab.tokens.replace(session('gen-b', 'access-b', 'refresh-b'));

    await expect(tab.coordinator.refresh({ generation: 'gen-a' })).resolves.toBe('superseded');
    expect(network).not.toHaveBeenCalled();
  });

  it('skips the network when the refused access token was already rotated in the same generation', async () => {
    const { openTab } = origin();
    const network = vi.fn();
    const tab = openTab({ requestRefresh: network });
    tab.tokens.replace(session('gen-a', 'access-2', 'refresh-2'));

    await expect(tab.coordinator.refresh({ generation: 'gen-a', staleAccessToken: 'access-1' })).resolves.toBe('ok');
    expect(network).not.toHaveBeenCalled();
  });

  it('clears only its own generation when the API refuses the refresh token', async () => {
    const { openTab } = origin();
    const tab = openTab({ requestRefresh: () => Promise.reject({ status: 401, code: 'refresh_token_reused' }) });
    tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
    expect(tab.tokens.read()).toBeNull();
  });

  describe('rotation recovery', () => {
    it('retries an unanswered refresh with the same token inside the window', async () => {
      const { openTab } = origin();
      let clock = 1_000_000;
      const network = vi
        .fn<(refreshToken: string) => Promise<TdTokenSet>>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(tokenSet('access-2', 'refresh-2'));
      const tab = openTab({ requestRefresh: network, now: () => clock });
      tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      expect(tab.tokens.read()).toMatchObject({ refreshToken: 'refresh-1', refreshPendingSince: 1_000_000 });

      clock += ROTATION_RECOVERY_MS - 1_000;
      await expect(tab.coordinator.refresh()).resolves.toBe('ok');
      expect(network.mock.calls.map(([token]) => token)).toEqual(['refresh-1', 'refresh-1']);
      expect(tab.tokens.read()).toMatchObject({ refreshToken: 'refresh-2', refreshPendingSince: null });
    });

    it('ends the session instead of spending a possibly rotated token after the window', async () => {
      const { openTab } = origin();
      let clock = 1_000_000;
      const network = vi.fn().mockRejectedValue({ status: 503 });
      const tab = openTab({ requestRefresh: network, now: () => clock });
      tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      clock += ROTATION_RECOVERY_MS + 1;
      await expect(tab.coordinator.refresh()).resolves.toBe('terminal');

      expect(network).toHaveBeenCalledTimes(1);
      expect(tab.tokens.read()).toBeNull();
    });

    it('does not start the window while offline', async () => {
      const { openTab } = origin();
      const network = vi.fn();
      const tab = openTab({ requestRefresh: network, isOnline: () => false });
      tab.tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      expect(network).not.toHaveBeenCalled();
      expect(tab.tokens.read()).toMatchObject({ refreshPendingSince: null });
    });
  });

  it('never refreshes without a cross-tab lock', async () => {
    const storage = new MemoryStorage();
    const tokens = createTokenStore(() => storage, null);
    const network = vi.fn();
    const coordinator = createRefreshCoordinator({ tokens, lock: () => null, requestRefresh: network });
    tokens.replace(session('gen-a', 'access-1', 'refresh-1'));

    await expect(coordinator.refresh()).resolves.toBe('transient');
    expect(network).not.toHaveBeenCalled();
  });
});
