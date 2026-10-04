import type { TdContentRow, TdContentType } from './admin-api';
import { tdAdmin } from './client';
import type { TdOperation } from './operation';

/** The fields that name an uploaded image (a media row, by key). */
const IMAGE_FIELDS: Partial<Record<TdContentType, readonly string[]>> = { cards: ['imageKey'], 'practice-questions': ['imageKey'] };

export function imageKeysOf(type: TdContentType, rows: readonly TdContentRow[]): string[] {
  const fields = IMAGE_FIELDS[type] ?? [];
  const keys = rows.flatMap((row) => fields.map((field) => (row.data as Record<string, unknown>)[field]));
  return [...new Set(keys.filter((key): key is string => typeof key === 'string' && key !== ''))];
}

/** The images questions show move with them, as a category's cards move with
 *  it: marked ready with a question marked ready, approved with a question
 *  approved (there is no Media page). A step an image cannot take (no rights
 *  yet, the approver uploaded it) is left to the question's own refusal,
 *  which names the image. */
/** The image row of a key, read page by page until it is found. */
export async function findImage(key: string, options?: TdOperation): Promise<TdContentRow<'media'> | null> {
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const out = await tdAdmin.content('media').list({ q: key, limit: 200, cursor }, options);
    const found = out.items.find((row) => row.data.key === key);
    if (found) return found;
    if (!out.nextCursor) return null;
    cursor = out.nextCursor;
  }
  return null;
}

export async function moveImagesAlong(type: TdContentType, rows: readonly TdContentRow[], action: 'ready' | 'approve', operation: TdOperation, me: { id: string }): Promise<void> {
  // Approved only for questions still at the revision reviewed: an image is never approved for a question that will be refused.
  if (action === 'approve') {
    for (const row of rows) {
      const now = await tdAdmin.content(type).get(row.id, operation);
      if (now.version !== row.version || now.status !== 'ready' || now.lastEditor.id === me.id) return;
    }
  }
  for (const key of imageKeysOf(type, rows)) {
    try {
      const image = await findImage(key, operation);
      if (!image) continue;
      if (action === 'ready' && image.status === 'draft') await tdAdmin.content('media').ready(image.id, image.version, operation);
      if (action === 'approve' && image.status === 'ready' && image.lastEditor.id !== me.id) await tdAdmin.content('media').approve(image.id, image.version, undefined, operation);
    } catch {
      // The question's own step says why.
    }
  }
}
