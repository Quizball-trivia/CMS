import type { TdContentStatus } from '@/lib/td/admin-api';
import { cn } from '@/lib/utils';

export const TD_STATUS_LABELS: Record<TdContentStatus, string> = {
  draft: 'Draft',
  ready: 'Ready for review',
  approved: 'Approved',
  archived: 'Archived',
};

const STYLES: Record<TdContentStatus, string> = {
  draft: 'bg-slate-100 text-slate-500',
  ready: 'bg-amber-50 text-amber-700',
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
