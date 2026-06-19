'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuctionCard } from '@/hooks';
import { AuctionCardEditor } from '@/components/auction';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface AuctionCardPageProps {
  params: Promise<{ id: string }>;
}

export default function AuctionCardPage({ params }: AuctionCardPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { data: card, isLoading, error } = useAuctionCard(resolvedParams.id);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] py-10 text-foreground">
        <div className="mx-auto max-w-[1500px] space-y-8 px-8">
          <div className="h-10 w-64 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-96 animate-pulse rounded-3xl bg-gray-100" />
        </div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] py-10 text-foreground">
        <div className="mx-auto max-w-[1500px] space-y-6 px-8">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>Auction card not found or failed to load.</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] py-10 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-8 px-8">
        <div className="flex items-center gap-4 py-2">
          <Button
            variant="ghost"
            type="button"
            onClick={() => router.back()}
            className="group flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:scale-110" />
            Back
          </Button>
          <div className="min-w-0 space-y-0.5">
            <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900">
              {card.player.name}
            </h1>
            <p className="text-sm font-medium text-gray-400">
              Edit Auction card review details
            </p>
          </div>
        </div>

        <AuctionCardEditor key={card.id} card={card} />
      </div>
    </div>
  );
}
