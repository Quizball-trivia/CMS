import { useCallback } from 'react';
import { useTdCurrentRelease } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus } from '@/lib/td/admin-api';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';

// Publishing is one step (draft → live): a ready row, left by the old two-step flow, reads as the draft it is to an editor.
export const TD_STATUS_LABELS: Record<TdContentStatus, string> = {
  draft: t('Draft'),
  ready: t('Draft'),
  approved: t('Approved'),
  archived: t('Archived'),
};

/** The status as one short word, where a filter pill or a history line names it. */
export const TD_STATUS_WORDS: Record<TdContentStatus, string> = {
  draft: t('draft'),
  ready: t('draft'),
  approved: t('approved'),
  archived: t('archived'),
};

const STYLES: Record<TdContentStatus, string> = {
  draft: 'bg-slate-100 text-slate-500',
  ready: 'bg-slate-100 text-slate-500',
  approved: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-transparent text-slate-400 ring-1 ring-inset ring-slate-200',
};

export function TdStatusChip({ status, className }: { status: TdContentStatus; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold', STYLES[status], className)}>
      {TD_STATUS_LABELS[status]}
    </span>
  );
}

/** As a row stands for players: `live` approved and in the current release, `waiting` approved but not in it yet. */
export type TdShownStatus = TdContentStatus | 'live' | 'waiting';

export const TD_SHOWN_WORDS: Record<TdShownStatus, string> = { ...TD_STATUS_WORDS, live: t('published'), waiting: t('waiting to publish') };

/** An approved row is "published" only once the current release has its approved version. Until the release is read
 *  (or when it keeps no list of rows, as the first deploy's), it stays "approved". */
export function useTdShownStatus() {
  const { loaded, members } = useTdCurrentRelease();
  return useCallback(
    (row: Pick<TdContentRow, 'id' | 'status' | 'approvedVersion'>): TdShownStatus => {
      if (row.status !== 'approved' || !loaded || members.size === 0) return row.status;
      return members.get(row.id) === row.approvedVersion ? 'live' : 'waiting';
    },
    [loaded, members],
  );
}
