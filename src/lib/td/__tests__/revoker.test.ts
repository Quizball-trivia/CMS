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
const pending = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, i) => storage.key(i)!)
    .filter((k) => k.startsWith(`${TD_STORAGE_KEYS.pendingRevocations}:`))
    .map((k) => storage.getItem(k));

describe('revoker', () => {
  it('keeps a revocation the API did not confirm, and retries it until it does', async () => {
    const storage = memoryStorage();
    const timers: (() => void)[] = [];
    const send = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
    const revoker = createRevoker({ storage: () => storage, send, setTimer: (cb) => timers.push(cb) });
    revoker.revoke('refresh-1');
    await flush();
    expect(pending(storage)).toEqual(['refresh-1']);
    timers.shift()!();
    await flush();
    timers.shift()!();
    await flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(pending(storage)).toEqual([]);
  });

  it('picks up revocations left before a reload, and retries at once when back online', async () => {
    const storage = memoryStorage();
    storage.setItem(`${TD_STORAGE_KEYS.pendingRevocations}:refresh-left`, 'refresh-left');
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
    expect(pending(storage)).toEqual([]);
  });

  it('keeps a token remembered before a first attempt, so a new page retries it', async () => {
    const storage = memoryStorage();
    const first = createRevoker({ storage: () => storage, send: vi.fn(), setTimer: () => 'timer' });
    first.remember('mid-request');
    // The page closed before the attempt settled; the next page takes it over.
    const send = vi.fn().mockResolvedValue(true);
    createRevoker({ storage: () => storage, send, setTimer: () => 'timer' });
    await flush();
    expect(send).toHaveBeenCalledWith('mid-request');
    expect(pending(storage)).toEqual([]);
  });

  it('sends a token queued while another is on its way in the same drain', async () => {
    const storage = memoryStorage();
    let release: (v: boolean) => void = () => {};
    const send = vi.fn((token: string) => (token === 'first' ? new Promise<boolean>((r) => (release = r)) : Promise.resolve(true)));
    const revoker = createRevoker({ storage: () => storage, send, setTimer: () => 'timer' });
    revoker.revoke('first');
    revoker.revoke('second');
    release(true);
    await flush();
    await flush();
    expect(send.mock.calls.map(([t]) => t)).toEqual(['first', 'second']);
    expect(pending(storage)).toEqual([]);
  });
});
