import { describe, expect, it, vi } from 'vitest';
import { createRevoker } from '../revoker';
import { TD_STORAGE_KEYS } from '../token-store';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, v),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('revoker', () => {
  it('keeps a revocation the API did not confirm, and retries it until it does', async () => {
    const storage = memoryStorage();
    const timers: (() => void)[] = [];
    const send = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const revoker = createRevoker({ storage: () => storage, send, setTimer: (cb) => timers.push(cb) });
    revoker.revoke('refresh-1');
    await flush();
    expect(storage.getItem(TD_STORAGE_KEYS.pendingRevocations)).toBe('["refresh-1"]');
    timers.shift()!();
    await flush();
    timers.shift()!();
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(storage.getItem(TD_STORAGE_KEYS.pendingRevocations)).toBeNull();
  });

  it('picks up revocations left before a reload, and retries at once when back online', async () => {
    const storage = memoryStorage();
    storage.setItem(TD_STORAGE_KEYS.pendingRevocations, '["refresh-left"]');
    let online: () => void = () => {};
    const send = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    createRevoker({
      storage: () => storage,
      send,
      setTimer: () => 'timer',
      clearTimer: () => {},
      onOnline: (cb) => {
        online = cb;
        return () => {};
      },
    });
    await flush();
    expect(send).toHaveBeenCalledWith('refresh-left');
    online();
    await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(storage.getItem(TD_STORAGE_KEYS.pendingRevocations)).toBeNull();
  });
});
