import { describe, expect, it, vi } from 'vitest';
import { createRefreshCoordinator, ROTATION_RECOVERY_MS } from '../refresh-coordinator';
import type { TdTokenSet } from '../token-store';
import { createOrigin, deferred, put, session, sleep, tokenSet } from './helpers';

interface TabOptions {
  requestRefresh: (refreshToken: string, requestId: string) => Promise<TdTokenSet>;
  revoke?: (refreshToken: string) => Promise<unknown>;
  now?: () => number;
  isOnline?: () => boolean;
  onOnline?: (callback: () => void) => () => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  refreshWaitMs?: number;
}

type Origin = ReturnType<typeof createOrigin>;

function openTab(origin: Origin, { refreshWaitMs = 2_000, onOnline = () => () => {}, ...options }: TabOptions) {
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh', refreshWaitMs);
  return { tokens, coordinator: createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, onOnline, ...options }) };
}

/** Timers driven by the test's own clock. */
function manualTimers(clock: { now: number }) {
  const queue: Array<{ at: number; run: () => void }> = [];
  return {
    setTimer: (run: () => void, ms: number) => {
      const timer = { at: clock.now + ms, run };
      queue.push(timer);
      return timer;
    },
    clearTimer: (timer: unknown) => {
      const index = queue.indexOf(timer as (typeof queue)[number]);
      if (index >= 0) queue.splice(index, 1);
    },
    pending: () => queue.length,
    async advance(ms: number) {
      clock.now += ms;
      for (const timer of queue.filter((t) => t.at <= clock.now)) {
        queue.splice(queue.indexOf(timer), 1);
        timer.run();
      }
      await sleep(10);
    },
  };
}

describe('refresh coordinator', () => {
  it('makes exactly one network refresh for concurrent callers in one tab', async () => {
    const origin = createOrigin();
    const network = vi.fn(async () => {
      await sleep(5);
      return tokenSet('access-2', 'refresh-2');
    });
    const tab = openTab(origin, { requestRefresh: network });
    await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

    const outcomes = await Promise.all(Array.from({ length: 5 }, () => tab.coordinator.refresh({ generation: 'gen-a' })));

    expect(outcomes).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
    expect(network).toHaveBeenCalledTimes(1);
    expect(tab.tokens.read()).toMatchObject({ generation: 'gen-a', accessToken: 'access-2', refreshToken: 'refresh-2', refreshPendingSince: null });
  });

  it('lets exactly one of two tabs refresh when both ask at the same moment', async () => {
    const origin = createOrigin();
    const network = vi.fn(async () => {
      await sleep(10);
      return tokenSet('access-2', 'refresh-2');
    });
    const tabA = openTab(origin, { requestRefresh: network });
    const tabB = openTab(origin, { requestRefresh: network });
    await put(tabA.tokens, session('gen-a', 'access-1', 'refresh-1'));

    expect(await Promise.all([tabA.coordinator.refresh(), tabB.coordinator.refresh()])).toEqual(['ok', 'ok']);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('makes a waiting tab reuse the rotated token instead of spending the old one', async () => {
    const origin = createOrigin();
    const answer = deferred<TdTokenSet>();
    const network = vi.fn(() => answer.promise);
    const tabA = openTab(origin, { requestRefresh: network });
    const tabB = openTab(origin, { requestRefresh: network });
    await put(tabA.tokens, session('gen-a', 'access-1', 'refresh-1'));

    const first = tabA.coordinator.refresh();
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    const second = tabB.coordinator.refresh();
    answer.resolve(tokenSet('access-2', 'refresh-2'));

    await expect(first).resolves.toBe('ok');
    await expect(second).resolves.toBe('ok');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('never blocks a sign-in behind a stalled refresh, and discards that refresh when it answers', async () => {
    const origin = createOrigin();
    const answer = deferred<TdTokenSet>();
    const stalled = openTab(origin, { requestRefresh: () => answer.promise });
    const signingIn = openTab(origin, { requestRefresh: vi.fn() });
    await put(stalled.tokens, session('gen-a', 'access-a', 'refresh-a'));

    const refreshing = stalled.coordinator.refresh({ generation: 'gen-a' });
    await sleep(5);
    const signIn = put(signingIn.tokens, session('gen-b', 'access-b', 'refresh-b', { staffId: 'staff-b' }));
    await expect(Promise.race([signIn.then(() => 'committed'), sleep(200).then(() => 'blocked')])).resolves.toBe('committed');

    answer.resolve(tokenSet('access-a2', 'refresh-a2'));
    await expect(refreshing).resolves.toBe('superseded');
    expect(signingIn.tokens.read()).toMatchObject({ generation: 'gen-b', accessToken: 'access-b', staffId: 'staff-b' });
  });

  it('discards a refresh that answers after sign-out', async () => {
    const origin = createOrigin();
    const answer = deferred<TdTokenSet>();
    const tab = openTab(origin, { requestRefresh: () => answer.promise });
    await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

    const pending = tab.coordinator.refresh({ generation: 'gen-a' });
    await sleep(5);
    tab.tokens.cancel('gen-a');
    await tab.tokens.transact((tx) => tx.clear('gen-a'));
    answer.resolve(tokenSet('access-2', 'refresh-2'));

    await expect(pending).resolves.toBe('superseded');
    expect(origin.storage.getItem('td_session')).toBeNull();
  });

  it('refuses to refresh on behalf of a generation that is no longer stored', async () => {
    const origin = createOrigin();
    const network = vi.fn();
    const tab = openTab(origin, { requestRefresh: network });
    await put(tab.tokens, session('gen-b', 'access-b', 'refresh-b'));

    await expect(tab.coordinator.refresh({ generation: 'gen-a' })).resolves.toBe('superseded');
    expect(network).not.toHaveBeenCalled();
  });

  it('skips the network when the refused access token was already rotated in the same generation', async () => {
    const origin = createOrigin();
    const network = vi.fn();
    const tab = openTab(origin, { requestRefresh: network });
    await put(tab.tokens, session('gen-a', 'access-2', 'refresh-2'));

    await expect(tab.coordinator.refresh({ generation: 'gen-a', staleAccessToken: 'access-1' })).resolves.toBe('ok');
    expect(network).not.toHaveBeenCalled();
  });

  it('clears its generation when the API refuses the refresh token', async () => {
    const origin = createOrigin();
    const tab = openTab(origin, { requestRefresh: () => Promise.reject({ status: 401, code: 'refresh_token_reused' }) });
    await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

    await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
    expect(tab.tokens.read()).toBeNull();
  });

  it('gives up waiting for a refresh lock held by a stalled tab without spending anything', async () => {
    const origin = createOrigin();
    const stalled = openTab(origin, { requestRefresh: () => new Promise<TdTokenSet>(() => {}) });
    const network = vi.fn();
    const waiting = openTab(origin, { requestRefresh: network, refreshWaitMs: 50 });
    await put(stalled.tokens, session('gen-a', 'access-1', 'refresh-1'));

    void stalled.coordinator.refresh();
    await sleep(5);
    await expect(waiting.coordinator.refresh()).resolves.toBe('transient');
    expect(network).not.toHaveBeenCalled();
  });

  it('revokes the session on the API when a refresh is refused', async () => {
    const origin = createOrigin();
    const revoke = vi.fn(async () => true);
    const tab = openTab(origin, { requestRefresh: vi.fn().mockRejectedValue({ status: 401 }), revoke });
    await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));
    await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
    expect(revoke).toHaveBeenCalledWith('refresh-1');
  });

  describe('rotation recovery', () => {
    it('records the attempt before the request is sent', async () => {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      const answer = deferred<TdTokenSet>();
      const tab = openTab(origin, { requestRefresh: () => answer.promise, now: () => clock.now });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      const pending = tab.coordinator.refresh();
      await sleep(5);
      expect(tab.tokens.read()).toMatchObject({ refreshToken: 'refresh-1', refreshPendingSince: 1_000_000 });
      answer.resolve(tokenSet('access-2', 'refresh-2'));
      await pending;
    });

    /** A tab dies while its refresh is on the wire; later another tab of the same origin needs a refresh. */
    async function afterDeadTab(elapsedMs: number) {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      let sent = '';
      const dying = openTab(origin, {
        requestRefresh: (_token, requestId) => {
          sent = requestId;
          return new Promise<TdTokenSet>(() => {});
        },
        now: () => clock.now,
      });
      await put(dying.tokens, session('gen-a', 'access-1', 'refresh-1'));
      void dying.coordinator.refresh();
      await sleep(5);

      clock.now += elapsedMs;
      const network = vi.fn(async () => tokenSet('access-2', 'refresh-2'));
      const tokens = origin.store();
      // The browser released the dead tab's refresh lock; its storage stays.
      const refreshLock = createOrigin().lock('td-refresh');
      const revoke = vi.fn(async () => true);
      const survivor = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: network, revoke, now: () => clock.now });
      return { outcome: await survivor.refresh(), network, tokens, sent, revoke };
    }

    it('after a tab dies mid-request, another tab retries the same token inside the window', async () => {
      const { outcome, network, tokens, sent } = await afterDeadTab(ROTATION_RECOVERY_MS - 5_000);
      expect(outcome).toBe('ok');
      // As the same request: the API answers it again if the dead tab's attempt went through.
      expect(sent).not.toBe('');
      expect(network).toHaveBeenCalledWith('refresh-1', sent);
      expect(tokens.read()).toMatchObject({ refreshToken: 'refresh-2', refreshPendingSince: null });
    });

    it('after a tab dies mid-request, another tab ends the session past the window instead of spending the token', async () => {
      const { outcome, network, tokens, revoke } = await afterDeadTab(ROTATION_RECOVERY_MS + 6_000);
      expect(outcome).toBe('terminal');
      expect(network).not.toHaveBeenCalled();
      expect(tokens.read()).toBeNull();
      // The dead tab's attempt may have gone through: whoever holds the successor can't go on.
      expect(revoke).toHaveBeenCalledWith('refresh-1');
    });

    it('recovers promptly on its own after an unanswered refresh, keeping the first deadline', async () => {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      const timers = manualTimers(clock);
      const network = vi
        .fn<(refreshToken: string, requestId: string) => Promise<TdTokenSet>>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce({ status: 503 })
        .mockResolvedValueOnce(tokenSet('access-2', 'refresh-2'));
      const tab = openTab(origin, { requestRefresh: network, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      await timers.advance(1_000);
      expect(network).toHaveBeenCalledTimes(2);
      expect(tab.tokens.read()).toMatchObject({ refreshPendingSince: 1_000_000 });

      await timers.advance(3_000);
      expect(network.mock.calls.map(([token]) => token)).toEqual(['refresh-1', 'refresh-1', 'refresh-1']);
      expect(new Set(network.mock.calls.map(([, requestId]) => requestId)).size).toBe(1);
      expect(tab.tokens.read()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2', refreshPendingSince: null });
    });

    it('stops retrying at the deadline and then ends the session without spending the token', async () => {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      const timers = manualTimers(clock);
      const network = vi.fn().mockRejectedValue({ status: 503 });
      const tab = openTab(origin, { requestRefresh: network, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      await tab.coordinator.refresh();
      for (let i = 0; i < 10; i += 1) await timers.advance(5_000);
      const attempts = network.mock.calls.length;
      expect(attempts).toBeGreaterThan(2);
      expect(timers.pending()).toBe(0);

      await expect(tab.coordinator.refresh()).resolves.toBe('terminal');
      expect(network).toHaveBeenCalledTimes(attempts);
      expect(tab.tokens.read()).toBeNull();
    });

    it('keeps recovering through an outage and retries as soon as the connection is back', async () => {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      const timers = manualTimers(clock);
      let online = true;
      let backOnline: () => void = () => {};
      const network = vi
        .fn<(refreshToken: string, requestId: string) => Promise<TdTokenSet>>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(tokenSet('access-2', 'refresh-2'));
      const tab = openTab(origin, {
        requestRefresh: network,
        now: () => clock.now,
        isOnline: () => online,
        onOnline: (callback) => {
          backOnline = callback;
          return () => {};
        },
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
      });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      online = false;
      await timers.advance(1_000);
      expect(network).toHaveBeenCalledTimes(1);
      expect(timers.pending()).toBe(1);

      clock.now += 1_000;
      online = true;
      backOnline();
      await sleep(10);

      expect(network).toHaveBeenCalledTimes(2);
      expect(network).toHaveBeenLastCalledWith('refresh-1', network.mock.calls[0]![1]);
      expect(tab.tokens.read()).toMatchObject({ accessToken: 'access-2', refreshPendingSince: null });
      expect(timers.pending()).toBe(0);
    });

    it('makes its last attempt at the deadline itself', async () => {
      const origin = createOrigin();
      const clock = { now: 1_000_000 };
      const timers = manualTimers(clock);
      const network = vi.fn().mockRejectedValue({ status: 503 });
      const tab = openTab(origin, { requestRefresh: network, now: () => clock.now, setTimer: timers.setTimer, clearTimer: timers.clearTimer });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      await tab.coordinator.refresh();
      const sentAt: number[] = [];
      network.mockImplementation(async () => {
        sentAt.push(clock.now - 1_000_000);
        throw { status: 503 };
      });
      for (let i = 0; i < 30; i += 1) await timers.advance(1_000);

      expect(sentAt).toEqual([1_000, 4_000, 10_000, 20_000, ROTATION_RECOVERY_MS]);
    });

    it('does not start the window while offline', async () => {
      const origin = createOrigin();
      const network = vi.fn();
      const tab = openTab(origin, { requestRefresh: network, isOnline: () => false });
      await put(tab.tokens, session('gen-a', 'access-1', 'refresh-1'));

      await expect(tab.coordinator.refresh()).resolves.toBe('transient');
      expect(network).not.toHaveBeenCalled();
      expect(tab.tokens.read()).toMatchObject({ refreshPendingSince: null });
    });
  });

  it('never refreshes without a refresh lock', async () => {
    const origin = createOrigin();
    const tokens = origin.store();
    const network = vi.fn();
    const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => null, requestRefresh: network });
    await put(tokens, session('gen-a', 'access-1', 'refresh-1'));

    await expect(coordinator.refresh()).resolves.toBe('transient');
    expect(network).not.toHaveBeenCalled();
  });
});
