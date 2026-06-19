'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useAuctionCards } from '@/hooks';
import { cn } from '@/lib/utils';
import type {
  AuctionCardStatus,
  AuctionCardType,
  AuctionDifficulty,
  AuctionPositionGroup,
  AuctionVerificationStatus,
  ListAuctionCardsParams,
} from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuctionCardReviewDialog } from './auction-card-review-dialog';

const STATUS_OPTIONS: Array<{ value: AuctionCardStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'needs_review', label: 'Needs Review' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
  { value: 'rejected', label: 'Rejected' },
];

const CARD_TYPE_OPTIONS: Array<{ value: AuctionCardType; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'safe_star', label: 'Safe Star' },
  { value: 'bargain', label: 'Bargain' },
  { value: 'trap', label: 'Trap' },
  { value: 'obscure_gem', label: 'Obscure Gem' },
  { value: 'lookalike_story', label: 'Lookalike Story' },
  { value: 'legend', label: 'Legend' },
];

const DIFFICULTY_OPTIONS: Array<{ value: AuctionDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
  { value: 'expert', label: 'Expert' },
];

const POSITION_OPTIONS: Array<{ value: AuctionPositionGroup; label: string }> = [
  { value: 'GK', label: 'GK' },
  { value: 'DEF', label: 'DEF' },
  { value: 'MID', label: 'MID' },
  { value: 'FWD', label: 'FWD' },
];

const VERIFICATION_OPTIONS: Array<{ value: AuctionVerificationStatus; label: string }> = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'needs_review', label: 'Needs Review' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    notation: value >= 100_000_000 ? 'compact' : 'standard',
  }).format(value);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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

function verificationClass(status: AuctionVerificationStatus): string {
  switch (status) {
    case 'passed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'failed':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'needs_review':
    default:
      return 'bg-amber-50 text-amber-700 border-amber-100';
  }
}

export function AuctionCardList() {
  const [params, setParams] = useState<ListAuctionCardsParams>({
    page: 1,
    limit: 20,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const { data, isLoading, error } = useAuctionCards(params);
  const cards = data?.data ?? [];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextSearch = searchQuery.trim() || undefined;
      setParams((prev) => (
        prev.search === nextSearch
          ? prev
          : { ...prev, search: nextSearch, page: 1 }
      ));
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const activeFilters = useMemo(() => {
    return [
      params.status ? { key: 'status' as const, label: `Status: ${formatLabel(params.status)}` } : null,
      params.card_type ? { key: 'card_type' as const, label: `Type: ${formatLabel(params.card_type)}` } : null,
      params.difficulty ? { key: 'difficulty' as const, label: `Difficulty: ${formatLabel(params.difficulty)}` } : null,
      params.position_group ? { key: 'position_group' as const, label: `Position: ${params.position_group}` } : null,
      params.verification_status ? { key: 'verification_status' as const, label: `Verification: ${formatLabel(params.verification_status)}` } : null,
      params.search ? { key: 'search' as const, label: `Search: ${params.search}` } : null,
    ].filter(Boolean) as Array<{ key: keyof ListAuctionCardsParams; label: string }>;
  }, [params]);

  const handleFilterChange = <Key extends keyof ListAuctionCardsParams>(
    key: Key,
    value: ListAuctionCardsParams[Key] | 'all'
  ) => {
    setParams((prev) => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
      page: 1,
    }));
  };

  const clearFilter = (key: keyof ListAuctionCardsParams) => {
    if (key === 'search') {
      setSearchQuery('');
    }
    setParams((prev) => ({
      ...prev,
      [key]: undefined,
      page: 1,
    }));
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load auction cards. Please try again.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search player, club, or nationality..."
              className="h-10 rounded-xl border-transparent bg-gray-200/30 pl-10 text-sm font-medium focus:bg-white"
            />
          </div>

          <Select
            value={params.status ?? 'all'}
            onValueChange={(value) => handleFilterChange('status', value as AuctionCardStatus | 'all')}
          >
            <SelectTrigger className="h-10 w-[145px] rounded-xl bg-white text-xs font-bold">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.card_type ?? 'all'}
            onValueChange={(value) => handleFilterChange('card_type', value as AuctionCardType | 'all')}
          >
            <SelectTrigger className="h-10 w-[165px] rounded-xl bg-white text-xs font-bold">
              <SelectValue placeholder="Card Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Card Type</SelectItem>
              {CARD_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.difficulty ?? 'all'}
            onValueChange={(value) => handleFilterChange('difficulty', value as AuctionDifficulty | 'all')}
          >
            <SelectTrigger className="h-10 w-[135px] rounded-xl bg-white text-xs font-bold">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Difficulty</SelectItem>
              {DIFFICULTY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.position_group ?? 'all'}
            onValueChange={(value) => handleFilterChange('position_group', value as AuctionPositionGroup | 'all')}
          >
            <SelectTrigger className="h-10 w-[120px] rounded-xl bg-white text-xs font-bold">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Position</SelectItem>
              {POSITION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={params.verification_status ?? 'all'}
            onValueChange={(value) => handleFilterChange('verification_status', value as AuctionVerificationStatus | 'all')}
          >
            <SelectTrigger className="h-10 w-[165px] rounded-xl bg-white text-xs font-bold">
              <SelectValue placeholder="Verification" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Verification</SelectItem>
              {VERIFICATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => clearFilter(filter.key)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-slate-800"
              >
                {filter.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : data?.data.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border border-dashed border-gray-200 py-16 text-center">
            <p className="text-sm font-bold text-gray-900">No auction cards found</p>
            <p className="text-xs font-medium text-gray-500">Try adjusting filters or search terms.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50/70 hover:bg-gray-50/70">
                <TableHead className="min-w-[240px] px-5 text-xs font-black uppercase tracking-widest text-gray-400">Player</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Nationality</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Pos</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">True Value</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Start</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Type</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Difficulty</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Status</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Verify</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Model</TableHead>
                <TableHead className="text-xs font-black uppercase tracking-widest text-gray-400">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cards.map((card) => (
                <TableRow
                  key={card.id}
                  tabIndex={0}
                  aria-label={`Review ${card.player.name}`}
                  className="cursor-pointer outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300"
                  onClick={() => setOpenCardId(card.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOpenCardId(card.id);
                    }
                  }}
                >
                  <TableCell className="px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-xs font-black text-slate-400">
                        {card.player.image_url ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={card.player.image_url}
                              alt={card.player.name}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </>
                        ) : (
                          card.player.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-gray-900">{card.player.name}</p>
                        <p className="truncate text-xs font-medium text-gray-400">
                          {card.player.current_club ?? 'No club'} · {card.clue_count}/3 clues
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{card.player.nationality ?? '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-md font-black">{card.position_group}</Badge>
                  </TableCell>
                  <TableCell className="font-semibold text-gray-900">{formatMoney(card.true_value_eur)}</TableCell>
                  <TableCell className="font-semibold text-gray-700">{formatMoney(card.starting_price_eur)}</TableCell>
                  <TableCell className="text-sm text-gray-600">{formatLabel(card.card_type)}</TableCell>
                  <TableCell className="text-sm font-semibold capitalize text-gray-700">{card.difficulty}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('rounded-md font-bold', statusClass(card.status))}>
                      {formatLabel(card.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('rounded-md font-bold', verificationClass(card.verification_status))}
                    >
                      {formatLabel(card.verification_status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-xs font-medium text-gray-500">
                    {card.generator_model ?? '-'}
                  </TableCell>
                  <TableCell className="text-xs font-medium text-gray-500">
                    {formatDate(card.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AuctionCardReviewDialog
        cardId={openCardId}
        cards={cards}
        open={Boolean(openCardId)}
        totalAvailable={data?.total ?? cards.length}
        onNavigate={setOpenCardId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenCardId(null);
        }}
      />

      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">
            Showing <span className="text-foreground">{(data.page - 1) * data.limit + 1}</span> to{' '}
            <span className="text-foreground">{Math.min(data.page * data.limit, data.total)}</span> of{' '}
            <span className="text-foreground">{data.total}</span> cards
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setParams((current) => ({ ...current, page: (current.page ?? 1) - 1 }))}
              disabled={data.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center rounded-lg border bg-muted/50 px-3 py-1 text-xs font-bold">
              {data.page} / {data.total_pages}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => setParams((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
              disabled={data.page === data.total_pages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
