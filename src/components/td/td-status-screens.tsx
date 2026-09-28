'use client';

import Link from 'next/link';
import { Globe, Loader2, ShieldOff, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TD_ROOT } from '@/lib/workspace-guard';
import { TdWordmark } from './td-wordmark';

export function TdFullScreenLoader({ label = 'Loading Table Derby CMS…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <TdWordmark size="lg" />
      <p className="flex items-center gap-2 text-sm text-(--td-text-3)">
        <Loader2 className="size-4 animate-spin text-primary" />
        {label}
      </p>
    </div>
  );
}

export function TdUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <TdWordmark size="lg" />
      <div className="flex max-w-sm flex-col items-center gap-2">
        <WifiOff className="size-6 text-(--td-text-3)" />
        <p className="font-semibold">The Table Derby API is not responding</p>
        <p className="text-sm text-(--td-text-3)">You are still signed in. Try again in a moment.</p>
      </div>
      <Button onClick={onRetry} className="h-11 rounded-lg px-6">
        Try again
      </Button>
    </div>
  );
}

export function TdAccessDenied() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
      <ShieldOff className="size-7 text-(--td-text-3)" />
      <p className="text-lg font-semibold">You do not have access to this section</p>
      <p className="max-w-md text-sm text-(--td-text-3)">Your role cannot open this tab. Ask a Betsson admin if you need it.</p>
      <Button asChild variant="secondary" className="mt-2 rounded-lg">
        <Link href={TD_ROOT}>Back to the dashboard</Link>
      </Button>
    </div>
  );
}

export function TdUnsupportedBrowser() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-6 text-center">
      <TdWordmark size="lg" />
      <div className="flex max-w-md flex-col items-center gap-2">
        <Globe className="size-6 text-(--td-text-3)" />
        <p className="font-semibold">This browser is not supported</p>
        <p className="text-sm text-(--td-text-3)">
          The Table Derby CMS needs a current version of Chrome, Edge, Safari or Firefox. Update your browser, then open this page again.
        </p>
      </div>
    </div>
  );
}
