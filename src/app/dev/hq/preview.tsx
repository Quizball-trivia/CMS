'use client';

import { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
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
  patch(contentGapsApi, { list: async () => ({ items: [] }), summary: async () => ({ items: [] }), listFixes: async () => ({ items: [] }) });
  return () => undo.forEach((f) => f());
}

let uninstall: (() => void) | null = null;
let pendingUninstall: ReturnType<typeof setTimeout> | null = null;
function install(snapshot: HqSnapshot): void {
  if (pendingUninstall) clearTimeout(pendingUninstall);
  pendingUninstall = null;
  uninstall ??= installSnapshot(snapshot);
}
function scheduleUninstall(): void {
  pendingUninstall = setTimeout(() => {
    uninstall?.();
    uninstall = null;
    pendingUninstall = null;
  }, 0);
}

const PAGES = { home: HqHomePage, content: HqContentPage, games: HqGamesPage, analytics: HqAnalyticsPage, 'content-gaps': HqContentGapsPage } as const;
const ADMIN = { id: 'preview', email: 'preview@quizball.io', role: 'admin', nickname: 'Preview' };

function Frame() {
  // The page is in the path (/dev/hq/content), so a page's own tabs, which rewrite the query, stay on that page.
  const page = usePathname().split('/')[3] ?? 'home';
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
  // Installed before any page asks for data and taken out again when the preview is left, so the real dashboard never
  // reads the snapshot. In development React mounts twice: the undo waits a tick and is called off by the second mount.
  useState(() => (typeof window === 'undefined' ? null : install(snapshot)));
  useEffect(() => {
    install(snapshot);
    return scheduleUninstall;
  }, [snapshot]);
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
