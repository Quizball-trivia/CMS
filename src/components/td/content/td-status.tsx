import type { TdContentStatus } from '@/lib/td/admin-api';
import { cn } from '@/lib/utils';

export const TD_STATUS_LABELS: Record<TdContentStatus, string> = {
  draft: 'Draft',
  ready: 'Ready for review',
  approved: 'Approved',
  archived: 'Archived',
};

const STYLES: Record<TdContentStatus, string> = {
  draft: 'bg-secondary text-(--td-text-2)',
  ready: 'bg-amber-400/10 text-amber-300',
  approved: 'bg-(--td-new)/15 text-(--td-new)',
  archived: 'bg-transparent text-(--td-text-3) ring-1 ring-inset ring-border',
};

export function TdStatusChip({ status, className }: { status: TdContentStatus; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold', STYLES[status], className)}>
      {TD_STATUS_LABELS[status]}
    </span>
  );
}
