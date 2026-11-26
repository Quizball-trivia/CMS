'use client';

import { Suspense, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HqAnalyticsPage from '@/app/(dashboard)/hq/analytics/page';
import HqContentGapsPage from '@/app/(dashboard)/hq/content-gaps/page';
import HqContentPage from '@/app/(dashboard)/hq/content/page';
import HqGamesPage from '@/app/(dashboard)/hq/games/page';
import HqHomePage from '@/app/(dashboard)/hq/page';
import { Header, Sidebar } from '@/components/layout';
import { contentGapsApi } from '@/lib/content-gaps-api';
import { harnessApi } from '@/lib/harness-api';
import { hqApi } from '@/lib/hq-api';
import { AuthContext } from '@/providers/auth-provider';
import type { HarnessGames, HarnessOverview, HqAnalytics } from '@/types';

export interface HqSnapshot {
  takenAt: string;
  overview: HarnessOverview;
  games: HarnessGames;
  analytics: HqAnalytics;
}

type Api = Record<string, (...args: unknown[]) => Promise<unknown>>;
const offline = () => Promise.reject(new Error('Not in the preview snapshot'));

/** Points every HQ API call at the snapshot, so the real pages render it and nothing reaches a backend. Returns the undo. */
function installSnapshot(snapshot: HqSnapshot): () => void {
  const undo: Array<() => void> = [];
  const patch = (api: unknown, over: Api) => {
    const target = api as Api;
    const original = { ...target };
    for (const key of Object.keys(target)) target[key] = offline;
    Object.assign(target, over);
    undo.push(() => Object.assign(target, original));
  };
  patch(harnessApi, { overview: async () => structuredClone(snapshot.overview), games: async () => structuredClone(snapshot.games) });
  patch(hqApi, { analytics: async () => structuredClone(snapshot.analytics), posthog: async () => ({ connected: false }) });
  patch(contentGapsApi, { listFixes: async () => ({ items: [] }), listGaps: async () => ({ items: [] }) });
  return () => undo.forEach((f) => f());
}

const PAGES = { home: HqHomePage, content: HqContentPage, games: HqGamesPage, analytics: HqAnalyticsPage, 'content-gaps': HqContentGapsPage } as const;
const ADMIN = { id: 'preview', email: 'preview@quizball.io', role: 'admin', nickname: 'Preview' };

function Frame() {
  const page = useSearchParams().get('page') ?? 'home';
  const Page = PAGES[page as keyof typeof PAGES] ?? HqHomePage;
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-[1800px] space-y-6">
            <Page />
          </div>
        </main>
      </div>
    </div>
  );
}

export function HqPreview({ snapshot }: { snapshot: HqSnapshot }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } }));
  // Browser only: the snapshot replaces the API objects of this tab before any page asks for data.
  const ready = useSyncExternalStore(() => () => undefined, () => true, () => false);
  // Installed once for the life of the tab (this page is nothing but the preview), never undone: in development React
  // mounts twice, and undoing on the first unmount would send the second mount to the real backend.
  useState(() => (typeof window === 'undefined' ? null : installSnapshot(snapshot)));
  if (!ready) return null;
  return (
    <AuthContext.Provider value={{ user: ADMIN as never, isLoading: false, isAuthenticated: true, login: async () => undefined, logout: async () => undefined }}>
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <Frame />
        </Suspense>
      </QueryClientProvider>
    </AuthContext.Provider>
  );
}
