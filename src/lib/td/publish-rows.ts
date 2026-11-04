/**
 * Publish as in the Quizball CMS: one person picks drafts and publishes them.
 * The API keeps its steps (draft → ready → approved, then a release), so this
 * takes each row through them; the release is started by the caller.
 */
import type { TdContentRow, TdContentType } from './admin-api';
import { TdApiError } from './api-client';
import { tdErrorText } from './errors';
import { tdAdmin } from './client';
import { t } from './i18n';
import { moveImagesAlong } from './images';
import { retryConflicts, runEach, type TdEachResult, type TdOperation } from './operation';

const CATEGORY_OF: Partial<Record<TdContentType, 'card-categories' | 'box-categories'>> = { cards: 'card-categories', 'box-questions': 'box-categories' };

export const publishable = (row: Pick<TdContentRow, 'status'>) => row.status === 'draft' || row.status === 'ready';
/** An approved row passes through as it is (its release failed, or an answer was lost): only the release is left to do. */
const taken = (row: Pick<TdContentRow, 'status'>) => publishable(row) || row.status === 'approved';

// The API takes 240 content writes a minute from a member (two a question here): a step refused as too many waits and goes again.
export const TD_RATE_RETRY_MS = 10_000;
const RATE_RETRIES = 12;

async function paced<R>(step: () => Promise<R>): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await step();
    } catch (caught) {
      if (!(caught instanceof TdApiError && caught.status === 429) || attempt >= RATE_RETRIES) throw caught;
      await new Promise((resolve) => setTimeout(resolve, TD_RATE_RETRY_MS));
    }
  }
}

interface SessionReader {
  read(): { generation: string } | null;
}

/** A category that could not go live with its rows (they are approved, but players get them only with it). */
export interface TdCategoryRefusal {
  key: string;
  error: unknown;
}

export interface TdPublishOutcome {
  results: TdEachResult<TdContentRow, TdContentRow>[];
  categories: TdCategoryRefusal[];
}

/**
 * Each row is marked ready (a draft) and approved, its never-approved images
 * with it. A card or Round III question whose category was never approved
 * takes the category along once its rows are in: the API approves a category
 * only when every live row of it is approved.
 */
export async function approveForPublish(
  tokens: SessionReader,
  type: TdContentType,
  rows: readonly TdContentRow[],
  operation: TdOperation,
  onEach?: (done: number, failed: number) => void,
): Promise<TdPublishOutcome> {
  const api = tdAdmin.content(type);
  // Where each row got to: a retried row goes on from there, never repeats a step it took.
  const reached = new Map<string, TdContentRow>();
  const settled = new Set<string>();
  let failed = 0;
  // A step whose answer was lost may have gone through: the row, read again, says whether it did (at this content).
  const tookEffect = async (row: TdContentRow, status: 'ready' | 'approved', caught: unknown): Promise<TdContentRow> => {
    const now = await api.get(row.id, operation).catch(() => null);
    const done = now && now.status === status && now.contentVersion === row.contentVersion && (status === 'ready' || now.approvedVersion === row.contentVersion);
    if (!done) throw caught;
    return now as TdContentRow;
  };
  const results = await runEach(tokens, operation, rows.filter(taken), async (row) => {
    try {
      let current = reached.get(row.id) ?? row;
      if (current.status === 'approved') return current;
      // Its images are readied whatever its own status: a question marked ready earlier may show a draft image.
      await moveImagesAlong(type, [current], 'ready', operation);
      if (current.status === 'draft') {
        const draft = current;
        current = await paced(() => retryConflicts(() => api.ready(draft.id, draft.version, operation))).catch((caught) => tookEffect(draft, 'ready', caught));
        reached.set(row.id, current);
      }
      await moveImagesAlong(type, [current], 'approve', operation);
      const ready = current;
      const approved = await paced(() => retryConflicts(() => api.approve(ready.id, ready.version, undefined, operation))).catch((caught) => tookEffect(ready, 'approved', caught));
      reached.set(row.id, approved);
      return approved;
    } catch (caught) {
      if (!settled.has(row.id)) failed++;
      throw caught;
    } finally {
      settled.add(row.id);
      onEach?.(settled.size, failed);
    }
  });

  const categories: TdCategoryRefusal[] = [];
  const categoryType = CATEGORY_OF[type];
  if (categoryType) {
    const keys = [...new Set(results.flatMap((r) => (r.ok ? [String((r.value.data as { categoryKey?: string }).categoryKey ?? '')] : [])))].filter(Boolean);
    const categoryApi = tdAdmin.content(categoryType);
    for (const key of keys) {
      try {
        const found = await findByKey(categoryType, key, operation);
        // Its rows are approved, but a release leaves out a category that is archived (or gone), and its rows with it.
        if (!found) throw new TdApiError(404, 'category_missing', t('Its category does not exist.'));
        if (found.status === 'archived') throw new TdApiError(409, 'category_archived', t('Its category is archived: restore it first.'));
        // A category approved before goes on as it is: a pending edit of it is published from its own page.
        if (found.approvedVersion !== null) continue;
        let category = found;
        if (category.status === 'draft') category = await paced(() => retryConflicts(() => categoryApi.ready(category.id, category.version, operation)));
        await paced(() => retryConflicts(() => categoryApi.approve(category.id, category.version, [], operation)));
      } catch (caught) {
        categories.push({ key, error: caught });
      }
    }
  }
  return { results, categories };
}

async function findByKey(type: 'card-categories' | 'box-categories', key: string, operation: TdOperation): Promise<TdContentRow | null> {
  let cursor: string | undefined;
  for (let page = 0; page < 25; page++) {
    const out = await tdAdmin.content(type).list({ q: key, limit: 200, cursor, status: 'draft,ready,approved,archived' }, operation);
    const found = out.items.find((row) => (row.data as { key: string }).key === key);
    if (found) return found as TdContentRow;
    if (!out.nextCursor) return null;
    cursor = out.nextCursor;
  }
  return null;
}

/** Why a category did not go live with its questions, for a Georgian editor:
 *  how many of its questions still wait (a category goes live with all of
 *  them, never with some), or the refusal itself. */
export function categoryHeldText(error: unknown, alone: boolean): string {
  const waiting = blockingKeys(error).length;
  if (waiting) return t('The category goes live once all its questions are published: {count} more still to publish. Select them in the list and publish them together.', { count: waiting });
  return alone ? t('The category could not go live with it: {reason}', { reason: tdErrorText(error) }) : t('The category could not go live with them: {reason}', { reason: tdErrorText(error) });
}

/** The keys of the rows that hold a category up (a 409 dependency_unapproved names them). */
export function blockingKeys(error: unknown): string[] {
  if (!(error instanceof TdApiError) || error.code !== 'dependency_unapproved') return [];
  const refs = (error.details as { refs?: Array<{ key?: string; id?: string }> } | undefined)?.refs ?? [];
  return refs.map((ref) => ref.key ?? ref.id ?? '').filter(Boolean);
}
