'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

/** Phones: the sidebar rail is hidden, so the full navigation opens from the top bar. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* A real trigger, so closing the drawer returns focus to this button. */}
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11 md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-72 gap-0 p-0 sm:max-w-72"
        // Close once a link is followed.
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest('a')) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        {open && <Sidebar variant="drawer" />}
      </SheetContent>
    </Sheet>
  );
}
