'use client';

import { useQuery } from '@tanstack/react-query';
import { tdKeys } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import { t } from '@/lib/td/i18n';
import { writerToReviewTotal } from './writer-modes';

const BADGE_POLL_MS = 60_000;

/** The sidebar's count of AI drafts waiting for a member (the writer page reads the same overview). */
export function TdWriterBadge() {
  const overview = useQuery({
    queryKey: tdKeys.writer,
    queryFn: ({ signal }) => tdAdmin.writer.overview({ signal }),
    refetchInterval: BADGE_POLL_MS,
    staleTime: 30_000,
  });
  const total = overview.data ? writerToReviewTotal(overview.data) : 0;
  if (total === 0) return null;
  const label = t('{n} to review', { n: total });
  return (
    <>
      <span className="absolute right-1 top-1 size-2 rounded-full bg-amber-500 lg:hidden" aria-hidden />
      <span className="hidden shrink-0 rounded-full bg-amber-100 px-1.5 text-[10px] font-bold tabular-nums text-amber-800 lg:inline" title={label} aria-label={label}>
        {total}
      </span>
    </>
  );
}
