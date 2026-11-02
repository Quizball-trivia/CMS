'use client';

import { Suspense, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { useHqOverview } from '@/hooks';
import { HqNav } from './hq-ui';
import { TaskSheetHost } from './task-sheet';

export default function HqLayout({ children }: { children: ReactNode }) {
  const { data: overview } = useHqOverview();
  const paused = overview?.settings.paused;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">
          <Building2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">QuizBall HQ</h1>
          <p className="text-sm text-slate-500">Your team of people and AI agents, and everything they&apos;re working on.</p>
        </div>
        {paused && (
          <span className="ml-auto rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
            Agents paused
          </span>
        )}
      </div>
      <HqNav inboxUnread={overview?.inboxUnread} />
      {/* useSearchParams (task sheet) needs a Suspense boundary for static rendering. */}
      <Suspense fallback={null}>
        {children}
        <TaskSheetHost />
      </Suspense>
    </div>
  );
}
