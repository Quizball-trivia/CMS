'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore, Edit2, FileQuestion, Layers, Loader2, Star, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
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

/** Quizball's repository card. A Table Derby category has no image or icon, so it wears the no-image gradient and the default icon; the figures are its real ones. */
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

  const actionButton = 'h-9 w-9 rounded-xl bg-white/70 backdrop-blur-md border border-gray-200 text-gray-600 hover:bg-white hover:text-gray-900 transition-all';

  return (
    <>
      <Card
        className="relative flex flex-col overflow-hidden border border-gray-200/50 bg-white rounded-[2rem] transition-all duration-300 group/card cursor-pointer h-[200px] w-full shadow-sm hover:shadow-md hover:-translate-y-0.5"
        onClick={() => onEdit(category)}
      >
        {/* Background Layer */}
        <div className="absolute inset-0 z-0">
          <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 transition-colors duration-300 group-hover/card:from-gray-200 group-hover/card:to-gray-300" />
        </div>

        <div className="relative z-10 flex h-full flex-col p-5 justify-between">
          {/* Top Row */}
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-sm group-hover/card:bg-white/20 transition-colors">
              <Star className="h-5 w-5 text-gray-400" />
            </div>

            {/* Action buttons - visible on hover or low opacity */}
            <div
              className="absolute top-5 right-5 z-30 flex items-center gap-1.5 opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 transition-opacity duration-200"
              onClick={(event) => event.stopPropagation()}
            >
              <Button variant="ghost" size="icon" aria-label={t('Edit the category')} title={t('Edit the category')} className={actionButton} onClick={() => onEdit(category)}>
                <Edit2 className="w-4 h-4" />
              </Button>

              {archived ? (
                publisher && (
                  <Button variant="ghost" size="icon" aria-label={t('Restore the category')} title={t('Restore the category')} disabled={restoring} className={actionButton} onClick={() => void handleRestore()}>
                    {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArchiveRestore className="w-4 h-4" />}
                  </Button>
                )
              ) : (
                canDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('Delete the category')}
                    title={t('Delete the category')}
                    className={cn(actionButton, 'hover:bg-red-500 hover:border-red-500 hover:text-white')}
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex-1 flex flex-col justify-end min-w-0">
            <h3 title={name} className="text-lg font-bold tracking-tight line-clamp-2 drop-shadow-sm transition-colors text-gray-900">
              {name}
            </h3>
            {description && <p className="text-xs line-clamp-2 font-medium mt-1 mb-3 transition-colors text-gray-500">{description}</p>}

            {/* Stats Row: the category's real figures */}
            <div className="flex items-center gap-1.5">
              <div title={countLabel(type, count)} className="flex shrink-0 items-center gap-1.5 px-1.5 py-1 rounded-lg transition-colors bg-gray-100 text-gray-600">
                <CountIcon className="w-3.5 h-3.5" />
                <span aria-hidden className="text-[10px] font-bold uppercase tracking-wider">{count ?? '—'}</span>
                <span className="sr-only">{countLabel(type, count)}</span>
              </div>
              <div className="flex min-w-0 items-center gap-1 px-1.5 py-1 rounded-lg transition-colors bg-gray-100 text-gray-600">
                <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                <span title={TD_STATUS_LABELS[category.status]} className="text-[10px] font-bold uppercase tracking-wide truncate">{TD_STATUS_LABELS[category.status]}</span>
              </div>
            </div>

            {/* Status Indicator: approved or not */}
            <div className={cn('absolute top-5 left-5 h-2 w-2 rounded-full', category.status === 'approved' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-gray-300')} />
          </div>
        </div>
      </Card>

      <TdCategoryDeleteModal category={category} open={showDeleteModal} onOpenChange={setShowDeleteModal} />
    </>
  );
}
