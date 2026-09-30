import { useCallback, useEffect, useMemo } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { TdContentList, TdContentRow, TdContentType } from '@/lib/td/admin-api';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { ContentHistory, ContentListQuery } from '@/lib/td/contract';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { beginOperation, operationIsCurrent, retryConflicts, type TdOperation } from '@/lib/td/operation';

export type TdListQuery = Omit<ContentListQuery, 'cursor' | 'limit'>;

export const tdKeys = {
  content: ['td', 'content'] as const,
  type: (type: TdContentType) => ['td', 'content', type] as const,
  list: (type: TdContentType, query: TdListQuery) => ['td', 'content', type, 'list', query] as const,
  all: (type: TdContentType, query: TdListQuery) => ['td', 'content', type, 'all', query] as const,
  row: (type: TdContentType, id: string) => ['td', 'content', type, 'row', id] as const,
  history: (type: TdContentType, id: string) => ['td', 'content', type, 'history', id] as const,
  releases: ['td', 'releases'] as const,
  uploads: ['td', 'uploads'] as const,
  imports: ['td', 'imports'] as const,
  ops: ['td', 'ops'] as const,
  integration: ['td', 'integration'] as const,
};

const PAGE = 50;

/** A content list, a page at a time ("Load more"). */
export function useTdContentList<T extends TdContentType>(type: T, query: TdListQuery, enabled = true) {
  return useInfiniteQuery({
    queryKey: tdKeys.list(type, query),
    queryFn: ({ pageParam, signal }) => tdAdmin.content(type).list({ ...query, cursor: pageParam, limit: PAGE }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: TdContentList<T>) => last.nextCursor ?? undefined,
    enabled,
  });
}

/** Every row of a list, all pages (category children, pickers, the calendar); capped so a runaway list stays bounded. */
export function useTdAllRows<T extends TdContentType>(type: T, query: TdListQuery, enabled = true) {
  return useQuery({
    queryKey: tdKeys.all(type, query),
    enabled,
    queryFn: async ({ signal }) => {
      const rows: TdContentRow<T>[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 50; page++) {
        const out = await tdAdmin.content(type).list({ ...query, cursor, limit: 200 }, { signal });
        rows.push(...out.items);
        if (!out.nextCursor) return { rows, complete: true };
        cursor = out.nextCursor;
      }
      return { rows, complete: false };
    },
  });
}

export function useTdContentRow<T extends TdContentType>(type: T, id: string | null) {
  return useQuery({
    queryKey: tdKeys.row(type, id ?? ''),
    queryFn: ({ signal }) => tdAdmin.content(type).get(id!, { signal }),
    enabled: id !== null,
  });
}

/** A row's trail, newest first, read to its end (up to 5,000 changes; `complete` says whether that is all of it). */
export function useTdHistory(type: TdContentType, id: string | null) {
  return useQuery({
    queryKey: tdKeys.history(type, id ?? ''),
    enabled: id !== null,
    queryFn: async ({ signal }) => {
      const items: ContentHistory['items'] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 25; page++) {
        const out = await tdAdmin.content(type).history(id!, { cursor, limit: 200 }, { signal });
        items.push(...out.items);
        if (!out.nextCursor) return { items, complete: true };
        cursor = out.nextCursor;
      }
      return { items, complete: false };
    },
  });
}

const sessionChanged = () => new TdApiError(0, SESSION_CHANGED, 'The session changed; the request was cancelled');

/**
 * Runs one user action under the sign-in it started with (retrying only
 * `conflict_retry`), then refreshes what it may have changed: by default all
 * content and the release views. If the sign-in changed meanwhile it ends in
 * SESSION_CHANGED instead of a result, so nothing of the old session reaches
 * the new one's screens or cache.
 */
export function useTdWrite() {
  const queryClient = useQueryClient();
  return useCallback(
    async <R>(
      work: (operation: TdOperation) => Promise<R>,
      invalidate: readonly QueryKey[] = [tdKeys.content, tdKeys.releases],
      // An action that awaited something first passes the operation it began with, so it cannot go out under the next sign-in.
      started?: TdOperation,
    ): Promise<R> => {
      const operation = started ?? beginOperation(tdTokens);
      const result = await retryConflicts(() => work(operation));
      if (!operationIsCurrent(tdTokens, operation)) throw sessionChanged();
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (!operationIsCurrent(tdTokens, operation)) throw sessionChanged();
      return result;
    },
    [queryClient],
  );
}

/** The content version of each row in the current release (what players get now). */
export function useTdCurrentRelease() {
  const list = useQuery({
    queryKey: [...tdKeys.releases, 'list', 'first'],
    queryFn: ({ signal }) => tdAdmin.releases.list({ limit: 1 }, { signal }),
  });
  const current = list.data?.pointer.releaseId ?? null;
  const detail = useQuery({
    queryKey: [...tdKeys.releases, 'detail', current],
    queryFn: ({ signal }) => tdAdmin.releases.get(current!, { signal }),
    enabled: current !== null,
    staleTime: 5 * 60_000,
  });
  const members = useMemo(() => new Map(detail.data?.members.map((m) => [m.id, m.contentVersion]) ?? []), [detail.data]);
  return { releaseId: current, members, loaded: list.isSuccess && (current === null || detail.isSuccess) };
}

/** An uploaded image as an object URL (the file needs the bearer token, so no plain <img src>). */
export function useTdUploadUrl(uploadId: string | null | undefined) {
  const file = useQuery({
    queryKey: [...tdKeys.uploads, 'file', uploadId],
    queryFn: ({ signal }) => tdAdmin.media.file(uploadId!, { signal }),
    enabled: Boolean(uploadId),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  });
  const url = useMemo(() => (file.data ? URL.createObjectURL(file.data) : null), [file.data]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return { url, isLoading: file.isLoading, error: file.error };
}
