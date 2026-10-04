'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TD_STATUS_WORDS } from '@/components/td/content/td-status';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus } from '@/lib/td/admin-api';
import { t, tn } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';
import { roundOf, type TdCategoryType } from './td-category-data';

const BADGES: Record<TdContentStatus, string> = {
  draft: 'bg-gray-100 text-gray-400',
  ready: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-gray-100 text-gray-400',
};

type ChildRow = TdContentRow<'cards'> | TdContentRow<'box-questions'>;

const LIVE = { status: 'draft,ready,approved' };

const heading = (type: TdCategoryType, count: number) => (type === 'card-categories' ? t('Cards ({n})', { n: count }) : t('Questions ({n})', { n: count }));

/** The dots of Quizball's difficulty marker, for the 1 to 3 points of a card. */
const PointDots = ({ points }: { points: number }) => (
  <div className="flex items-center gap-0.5">
    {[1, 2, 3].map((dot) => (
      <div key={dot} className={cn('w-1 h-1 rounded-full transition-colors', dot <= points ? 'bg-gray-400' : 'bg-gray-200')} />
    ))}
  </div>
);

/** What Quizball's category form lists under its fields: the questions of the category, each opening for a look (and its arrows to step through them). */
export function TdCategoryQuestions({ type, categoryKey }: { type: TdCategoryType; categoryKey: string }) {
  const childType = roundOf(type).child;
  const { data, isLoading } = useTdAllRows(childType, { ...LIVE, category: categoryKey });
  const [opened, setOpened] = useState<ChildRow | null>(null);

  const rows = (data?.rows ?? []) as ChildRow[];
  const openIndex = opened ? rows.findIndex((row) => row.id === opened.id) : -1;

  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">{heading(type, 0)}</div>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">{heading(type, 0)}</div>
        <Alert className="rounded-xl bg-gray-50 border-gray-100">
          <AlertDescription className="text-xs text-gray-500">{type === 'card-categories' ? t('No cards in this category yet.') : t('No questions in this category yet.')}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1">{heading(type, rows.length)}</div>

      <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {rows.map((row) => {
          return (
            <div
              key={row.id}
              onClick={() => setOpened(row)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  if (event.key === ' ') {
                    event.preventDefault();
                  }
                  setOpened(row);
                }
              }}
              role="button"
              tabIndex={0}
              aria-pressed={opened?.id === row.id}
              className="group flex items-center gap-2 px-2.5 py-2 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 hover:border-gray-200 transition-all cursor-pointer"
            >
              {/* Status Dot */}
              <div className={cn('w-1 h-1 rounded-full shrink-0', row.status === 'approved' ? 'bg-emerald-400' : 'bg-gray-300')} />

              {/* Question Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{'q' in row.data ? row.data.q : row.data.display}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {'value' in row.data ? (
                    <div className="flex items-center gap-0.5">
                      <PointDots points={row.data.value} />
                      <span className="text-[8px] font-bold uppercase text-gray-400">{tn(row.data.value, '{count} point', '{count} points')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 min-w-0">
                      <FileText className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                      <span className="text-[8px] font-medium text-gray-400 uppercase truncate">{row.data.display}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Badge */}
              <div className={cn('px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0', BADGES[row.status])}>{TD_STATUS_WORDS[row.status]}</div>
            </div>
          );
        })}
      </div>

      <TdContentEditorDialog
        target={opened ? ({ type: childType, row: opened } as TdEditorTarget) : null}
        onClose={() => setOpened(null)}
        startOn="preview"
        nav={openIndex >= 0 ? { index: openIndex, total: rows.length, more: false, onGo: (index) => rows[index] && setOpened(rows[index]) } : null}
      />
    </div>
  );
}
