import type { AuctionCardStatus } from '@/types';

export function auctionStatusClass(status: AuctionCardStatus): string {
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
