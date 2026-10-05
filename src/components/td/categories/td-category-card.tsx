'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Edit2, FileQuestion, Layers, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TD_STATUS_LABELS } from '@/components/td/content/td-status';
import { useTdWrite } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdCategoryDeleteModal } from './td-category-delete-modal';
import { categoryName, categoryTypeOf, countLabel, TD_STATUS_ICONS, type TdCategoryRow } from './td-category-data';

export interface TdCategoryCardProps {
  category: TdCategoryRow;
  /** null while the numbers load. */
  count: number | null;
  /** Where Quizball shows a category's description: the round, for the archived categories of both rounds. */
  description?: string;
  onEdit: (category: TdCategoryRow) => void;
}

/** A category as one compact row: Table Derby categories have no image, so Quizball's picture card would be
 *  empty space. The status colours are the Questions list's. */
const STATUS_PILL: Record<TdCategoryRow['status'], string> = {
  draft: 'bg-slate-100 text-slate-400',
  ready: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-slate-100 text-slate-300',
};

export function TdCategoryCard({ category, count, description, onEdit }: TdCategoryCardProps) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const type = categoryTypeOf(category);
  const name = categoryName(category);
  const archived = category.status === 'archived';
  const publisher = user ? isTdPublisher(user.role) : false;
  // An editor deletes only a draft of their own that was never approved; the confirmation reads the history for the rest.
  const canDelete = publisher || (category.approvedVersion === null && category.lastEditor.id === user?.id);
  const StatusIcon = TD_STATUS_ICONS[category.status];
  const CountIcon = type === 'card-categories' ? Layers : FileQuestion;

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await write((operation) => tdAdmin.content(type).restore(category.id, category.version, operation));
      toast.success(t('Category restored'));
    } catch (error) {
      toast.error(tdErrorText(error));
    } finally {
      setRestoring(false);
    }
  };

  const actionButton = 'h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900 transition-all';

  return (
    <>
      <div
        data-slot="card"
        role="button"
        tabIndex={0}
        aria-label={name}
        onClick={() => onEdit(category)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          onEdit(category);
        }}
        className="group/card relative flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-gray-200/70 bg-white px-4 py-3 shadow-sm transition-all hover:shadow-md"
      >
        {/* Approved or not, as the Quizball card's dot */}
        <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', category.status === 'approved' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : category.status === 'ready' ? 'bg-amber-400' : 'border-2 border-gray-200')} />
        <div className="min-w-0 flex-1">
          <h3 title={name} className="truncate text-sm font-bold text-slate-900">
            {name}
          </h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs font-medium text-slate-400">
            <span className="flex shrink-0 items-center gap-1.5">
              <CountIcon className="h-3.5 w-3.5 text-slate-300" />
              {countLabel(type, count)}
            </span>
            <span className={cn('flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide', STATUS_PILL[category.status])}>
              <StatusIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{TD_STATUS_LABELS[category.status]}</span>
            </span>
            {description && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{description}</span>
              </>
            )}
          </div>
        </div>
        {/* Over the row's end on hover, so the name keeps the whole width */}
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-xl bg-white/95 p-1 opacity-0 shadow-sm transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100" onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="icon" aria-label={t('Edit the category')} title={t('Edit the category')} className={actionButton} onClick={() => onEdit(category)}>
            <Edit2 className="h-4 w-4" />
          </Button>
          {archived ? (
            publisher && (
              <Button variant="ghost" size="icon" aria-label={t('Restore the category')} title={t('Restore the category')} disabled={restoring} className={actionButton} onClick={() => void handleRestore()}>
                {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveRestore className="h-4 w-4" />}
              </Button>
            )
          ) : (
            canDelete && (
              <Button variant="ghost" size="icon" aria-label={t('Delete the category')} title={t('Delete the category')} className={cn(actionButton, 'hover:bg-red-50 hover:text-red-600')} onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )
          )}
        </div>
      </div>

      <TdCategoryDeleteModal category={category} open={showDeleteModal} onOpenChange={setShowDeleteModal} />
    </>
  );
}
