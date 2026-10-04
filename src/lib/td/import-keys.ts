/**
 * Batch keys by payload hash, per member, so a retry of the same items (a lost answer, a reload) is the same import.
 * `sent` marks a key whose import went out without a final answer.
 */
export interface SavedKey {
  key: string;
  sent: boolean;
}

const keysStorage = (staffId: string) => `td_import_keys:${staffId}`;

function readKeys(staffId: string): Record<string, SavedKey> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(keysStorage(staffId)) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, Partial<SavedKey>>).flatMap(([hash, saved]) => (typeof saved?.key === 'string' ? [[hash, { key: saved.key, sent: saved.sent === true }]] : [])),
    );
  } catch {
    return {};
  }
}

function writeKeys(staffId: string, keys: Record<string, SavedKey>) {
  try {
    sessionStorage.setItem(keysStorage(staffId), JSON.stringify(keys));
  } catch {
    // Unavailable storage: the key lives in this view only, and the API still answers a resent key with its batch.
  }
}

export function batchKeyFor(staffId: string, hash: string): SavedKey {
  const known = readKeys(staffId);
  if (known[hash]) return known[hash];
  const made = { key: `cms:${hash.slice(0, 24)}:${crypto.randomUUID().slice(0, 8)}`, sent: false };
  writeKeys(staffId, { ...known, [hash]: made });
  return made;
}

export function markSent(staffId: string, hash: string, sent: boolean) {
  const known = readKeys(staffId);
  if (known[hash]) writeKeys(staffId, { ...known, [hash]: { ...known[hash], sent } });
}

/** A batch key is spent once its batch is undone: the same items then make a new import. */
export function retireBatchKey(staffId: string, batchKey: string) {
  writeKeys(staffId, Object.fromEntries(Object.entries(readKeys(staffId)).filter(([, saved]) => saved.key !== batchKey)));
}
