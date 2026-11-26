'use client';

import { Suspense, useState, useSyncExternalStore } from 'react';
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

/** Points every HQ API call at the snapshot, so the real pages render it and nothing reaches a backend. */
function installSnapshot(snapshot: HqSnapshot): true {
  const patch = (api: unknown, over: Api) => {
    const target = api as Api;
    for (const key of Object.keys(target)) target[key] = offline;
    Object.assign(target, over);
  };
  patch(harnessApi, { overview: async () => structuredClone(snapshot.overview), games: async () => structuredClone(snapshot.games) });
  patch(hqApi, { analytics: async () => structuredClone(snapshot.analytics), posthog: async () => ({ connected: false }) });
  patch(contentGapsApi, { list: async () => ({ items: [] }), summary: async () => ({ items: [] }), listFixes: async () => ({ items: [] }) });
  return true;
}

/** HQ pages the preview can show, by the path they have in the real dashboard. */
const PREVIEW_PATH = /^\/hq(?:\/(content-gaps|content|games|analytics))?\/?(\?.*)?$/;

/**
 * Every link out of a preview page is a full page load: an HQ page opens as its preview (/hq/games → /dev/hq/games),
 * anything else as itself. The snapshot stands in for the API for the life of the document only, so leaving always
 * goes through a fresh document and the real dashboard can never read preview data.
 */
function leaveByFullLoad(event: React.MouseEvent): void {
  const link = (event.target as HTMLElement).closest('a[href]');
  const href = link?.getAttribute('href');
  if (!href || !href.startsWith('/') || link?.getAttribute('target') === '_blank' || event.metaKey || event.ctrlKey) return;
  event.preventDefault();
  const hq = PREVIEW_PATH.exec(href);
  window.location.assign(hq ? `/dev/hq${hq[1] ? `/${hq[1]}` : ''}${hq[2] ?? ''}` : href);
}

const PAGES = { home: HqHomePage, content: HqContentPage, games: HqGamesPage, analytics: HqAnalyticsPage, 'content-gaps': HqContentGapsPage } as const;
const ADMIN = { id: 'preview', email: 'preview@quizball.io', role: 'admin', nickname: 'Preview' };

function Frame() {
  // The page is in the path (/dev/hq/content), so a page's own tabs, which rewrite the query, stay on that page.
  const page = usePathname().split('/')[3] ?? 'home';
  const Page = PAGES[page as keyof typeof PAGES] ?? HqHomePage;
  return (
    <div className="flex min-h-screen" onClickCapture={leaveByFullLoad}>
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
  // Installed once, before any page asks for data, for the life of this document (see leaveByFullLoad). The snapshot
  // comes from the server with the document, so it cannot change underneath.
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
