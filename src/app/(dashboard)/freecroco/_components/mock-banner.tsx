'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { isFreecrocoMock } from '@/services';
import { getFreecrocoMock } from '@/lib/freecroco/mock';

export function MockBanner() {
  if (!isFreecrocoMock()) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <span>Mock data: nothing here reaches the backend, and a reload resets it.</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          getFreecrocoMock().simulateOtherEditor();
          toast.info('Another editor saved. Your next save will hit a stale version.');
        }}
      >
        Simulate another editor saving
      </Button>
    </div>
  );
}
