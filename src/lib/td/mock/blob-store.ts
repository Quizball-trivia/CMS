/**
 * Where the mock API keeps uploaded image bytes: IndexedDB in a browser, so
 * every tab and a reload see the same files (localStorage holds too little
 * for 2 MB images); memory elsewhere (tests).
 */
export interface MockBlobStore {
  put(id: string, bytes: ArrayBuffer, contentType: string): Promise<void>;
  get(id: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null>;
  delete(id: string): Promise<void>;
}

export function memoryBlobStore(): MockBlobStore {
  const files = new Map<string, { bytes: ArrayBuffer; contentType: string }>();
  return {
    put: async (id, bytes, contentType) => void files.set(id, { bytes, contentType }),
    get: async (id) => files.get(id) ?? null,
    delete: async (id) => void files.delete(id),
  };
}

const DB = 'td_mock_uploads';
const STORE = 'files';

async function request<T>(pending: Promise<IDBRequest<T>>): Promise<T> {
  const req = await pending;
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function indexedDbBlobStore(factory: IDBFactory): MockBlobStore {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const req = factory.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  const store = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode).objectStore(STORE);
  return {
    put: async (id, bytes, contentType) => void (await request(store('readwrite').then((s) => s.put({ bytes, contentType }, id)))),
    get: async (id) =>
      ((await request(store('readonly').then((s) => s.get(id)))) as { bytes: ArrayBuffer; contentType: string } | undefined) ?? null,
    delete: async (id) => void (await request(store('readwrite').then((s) => s.delete(id)))),
  };
}

export function defaultBlobStore(): MockBlobStore {
  return typeof indexedDB === 'undefined' ? memoryBlobStore() : indexedDbBlobStore(indexedDB);
}
