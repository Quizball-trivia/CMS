'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PlayerClueImportDialog } from './player-clue-import-dialog';

/** "Import Cards" action for the Auction Cards page — opens the paste/preview/
 *  commit import flow in a slide-over panel, so import and review live on one page. */
export function ImportCardsButton() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Import Cards
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>Import Clue Cards</SheetTitle>
          <SheetDescription>
            Paste clue cards, preview the parsed result, match players, then commit
            them as drafts for review.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <PlayerClueImportDialog />
        </div>
      </SheetContent>
    </Sheet>
  );
}
