'use client';

import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useAuctionCard } from '@/hooks';
import { cn } from '@/lib/utils';
import type { AuctionCardStatus, AuctionCardSummary } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AuctionCardEditor } from './auction-card-editor';

interface AuctionCardReviewDialogProps {
  cardId: string | null;
  cards: AuctionCardSummary[];
  open: boolean;
  totalAvailable: number;
  onOpenChange: (open: boolean) => void;
  onNavigate: (cardId: string) => void;
}

function formatLabel(value: string | null | undefined): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusClass(status: AuctionCardStatus): string {
  switch (status) {
    case 'published':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'needs_review':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'rejected':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'archived':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    case 'draft':
    default:
      return 'bg-blue-50 text-blue-700 border-blue-100';
  }
}

export function AuctionCardReviewDialog({
  cardId,
  cards,
  open,
  totalAvailable,
  onOpenChange,
  onNavigate,
}: AuctionCardReviewDialogProps) {
  const activeIndex = cardId ? cards.findIndex((card) => card.id === cardId) : -1;
  const summary = activeIndex >= 0 ? cards[activeIndex] : null;
  const { data: card, isLoading, error } = useAuctionCard(cardId ?? '', open && Boolean(cardId));

  const playerName = card?.player.name ?? summary?.player.name ?? 'Auction card';
  const clubName = card?.player.current_club ?? summary?.player.current_club ?? null;
  const status = card?.status ?? summary?.status;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < cards.length - 1;

  const navigateTo = (direction: -1 | 1) => {
    const nextCard = cards[activeIndex + direction];
    if (nextCard) onNavigate(nextCard.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[94vh] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white p-0 shadow-2xl focus:outline-none sm:max-w-[calc(100vw-2rem)] lg:max-w-[1180px] xl:max-w-[1280px]"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-12 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <DialogTitle className="truncate text-2xl font-black tracking-tight text-slate-900">
                {playerName}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                {clubName && (
                  <span className="text-sm font-semibold text-slate-500">{clubName}</span>
                )}
                {status && (
                  <Badge variant="outline" className={cn('rounded-md font-bold', statusClass(status))}>
                    {formatLabel(status)}
                  </Badge>
                )}
              </div>
            </div>

            <div className="mr-10 flex items-center gap-3">
              <span className="text-xs font-black uppercase tracking-widest text-slate-400">
                {activeIndex >= 0 ? activeIndex + 1 : '-'}
                <span className="mx-1 text-slate-200">/</span>
                {cards.length}
                {totalAvailable > cards.length && (
                  <span className="ml-1 text-slate-300">({totalAvailable})</span>
                )}
              </span>
              <div className="flex gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm"
                  disabled={!hasPrevious}
                  onClick={() => navigateTo(-1)}
                  aria-label="Previous auction card"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm"
                  disabled={!hasNext}
                  onClick={() => navigateTo(1)}
                  aria-label="Next auction card"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f9fb] p-4 sm:p-5">
          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading auction card
              </div>
            </div>
          ) : error || !card ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Auction card not found or failed to load.</AlertDescription>
            </Alert>
          ) : (
            <AuctionCardEditor key={card.id} card={card} variant="modal" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
