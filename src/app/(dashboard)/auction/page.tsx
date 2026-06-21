'use client';

import { Gavel } from 'lucide-react';
import { AuctionCardList } from '@/components/auction';
import { TranslateCluesDialog } from '@/components/auction/translate-clues-dialog';
import { ImportCardsButton } from '@/components/player-clue-cards/import-cards-button';

export default function AuctionPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb] py-10 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-8 px-8">
        <div className="flex items-center justify-between gap-4">
          <header className="space-y-1">
            <div className="flex items-center gap-3">
              <Gavel className="h-8 w-8 text-gray-800" />
              <h1 className="text-4xl font-black tracking-tight text-gray-900">Auction Cards</h1>
            </div>
            <p className="text-base font-medium text-gray-500">
              Import, review, edit, and publish player clue cards.
            </p>
          </header>
          <div className="flex items-center gap-2">
            <TranslateCluesDialog />
            <ImportCardsButton />
          </div>
        </div>

        <AuctionCardList />
      </div>
    </div>
  );
}
