'use client';

import { FileQuestion, Layers } from 'lucide-react';
import { TD_STATUS_LABELS } from '@/components/td/content/td-status';
import type { TdContentStatus } from '@/lib/td/admin-api';
import { t } from '@/lib/td/i18n';
import { countLabel, roundOf, TD_STATUS_ICONS, type TdCategoryType } from './td-category-data';

interface TdCategoryPreviewProps {
  name: string;
  type: TdCategoryType;
  status: TdContentStatus;
  count: number | null;
}

/** The head of Quizball's category form: the card as it will look. A category has no image, icon or language toggle here; its figures are the real ones. */
export function TdCategoryPreview({ name, type, status, count }: TdCategoryPreviewProps) {
  const CountIcon = type === 'card-categories' ? Layers : FileQuestion;
  const StatusIcon = TD_STATUS_ICONS[status];
  return (
    <div className="relative group overflow-hidden rounded-[1.5rem] border border-white/10 min-h-[160px] w-full shadow-xl">
      {/* Background Layer */}
      <div className="absolute inset-0 bg-[#0a0a0a]">
        <div className="h-full w-full bg-gradient-to-br from-primary/20 via-primary/5 to-black" />
      </div>

      {/* Content Layer */}
      <div className="relative h-full w-full p-4 flex flex-col justify-between">
        {/* Top Row */}
        <div className="flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/40 backdrop-blur-md border border-white/10 shadow-xl">
            <span className="text-xl leading-none">✨</span>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="flex items-end justify-between gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black tracking-tight text-white truncate drop-shadow-md">{name || t('New Category')}</h3>
            <p className="mt-0.5 text-[11px] text-white/70 line-clamp-1 font-medium max-w-[90%] whitespace-normal leading-relaxed">{roundOf(type).label}</p>

            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg transition-transform hover:scale-105">
                <CountIcon className="w-3 h-3 text-white/60" />
                <span className="text-[10px] font-bold text-white tracking-tight">{countLabel(type, count)}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full shadow-lg transition-transform hover:scale-105">
                <StatusIcon className="w-3 h-3 text-white/60" />
                <span className="text-[10px] font-bold text-white tracking-tight">{TD_STATUS_LABELS[status]}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
