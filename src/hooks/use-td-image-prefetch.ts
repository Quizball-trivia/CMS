import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cardFaceSrc } from '@/components/td/content/td-card-image';
import { releasedImage } from '@/components/td/media/td-media';
import { tdAllRowsQuery, tdUploadFileQuery } from '@/hooks/use-td-content';

const LIVE = { status: 'draft,ready,approved' };
/** A pointer that rests this long on a category means to open it; one passing over it reads nothing. */
export const PREFETCH_HOVER_MS = 150;
/** The first pictures of a category, as many as its editor shows at once; the rest load when it opens. */
export const PREFETCH_MAX_PICTURES = 24;
/** Pictures read ahead per minute across all categories: a tenth of the member's 600 reads, the rest kept for what
 *  they actually open. */
export const PREFETCH_PER_MINUTE = 60;

const spent: number[] = [];
const done = new Set<string>();

/** Takes one picture from this minute's read-ahead allowance; false when it is used up. */
function allowance(now = Date.now()) {
  while (spent.length && now - spent[0] > 60_000) spent.shift();
  if (spent.length >= PREFETCH_PER_MINUTE) return false;
  spent.push(now);
  return true;
}

/** For tests: a fresh allowance and no category read ahead yet. */
export function resetTdPrefetchBudget() {
  spent.length = 0;
  done.clear();
}

/** Starts loading a card category's pictures before its editor opens (on a resting pointer or on focus), so they
 *  are there when it does: the cards and media rows it reads, then the first cards' small copies or SoFIFA faces.
 *  Best effort, once per category, within a shared allowance (SoFIFA faces come from the CMS's own route and do
 *  not count against the API). */
export function useTdCategoryImagePrefetch(categoryKey: string) {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const now = useCallback(() => {
    // Once per category in a visit: React Query keeps what was read.
    if (done.has(categoryKey)) return;
    done.add(categoryKey);
    void (async () => {
      const [cards, media] = await Promise.all([
        queryClient.ensureQueryData(tdAllRowsQuery('cards', { ...LIVE, category: categoryKey })),
        queryClient.ensureQueryData(tdAllRowsQuery('media', {})),
      ]);
      const uploads = new Map(media.rows.map((row) => [row.data.key, releasedImage(row).uploadId]));
      for (const card of cards.rows.slice(0, PREFETCH_MAX_PICTURES)) {
        const uploadId = card.data.imageKey ? uploads.get(card.data.imageKey) : null;
        if (uploadId) {
          const query = tdUploadFileQuery(uploadId, true);
          if (queryClient.getQueryData(query.queryKey)) continue;
          if (!allowance()) break;
          void queryClient.prefetchQuery({ ...query, retry: false });
        } else if (card.data.photo) new Image().src = cardFaceSrc(card.data.photo);
      }
    })().catch(() => {});
  }, [queryClient, categoryKey]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const soon = useCallback(() => {
    cancel();
    timer.current = setTimeout(now, PREFETCH_HOVER_MS);
  }, [cancel, now]);

  useEffect(() => cancel, [cancel]);
  return { soon, now, cancel };
}
