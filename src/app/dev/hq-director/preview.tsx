'use client';

import { Suspense, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HqDirectorPage from '@/app/(dashboard)/hq/director/page';
import { TaskSheetHost } from '@/app/(dashboard)/hq/task-sheet';
import { formatTbilisi } from '@/lib/hq-board';
import { hqApi } from '@/lib/hq-api';
import type { HqBuild, HqDirectorChatPage, HqDirectorSummary, HqMessage, HqSettings, HqTask, HqTaskDetail } from '@/types';

export interface DirectorSnapshot {
  takenAt: string;
  summary: HqDirectorSummary;
  builds: { items: HqBuild[] };
  chat: HqDirectorChatPage;
}

type Api = Record<string, (...args: unknown[]) => Promise<unknown>>;

const offline = () => Promise.reject(new Error('Not in the preview snapshot'));

/**
 * Points every HQ API call at the snapshot, so the real page and its hooks render it and nothing reaches a backend.
 * The founder's actions change only this tab's copy. Returns the function that puts the real API back.
 */
function installSnapshot(snapshot: DirectorSnapshot): () => void {
  const summary: HqDirectorSummary = structuredClone(snapshot.summary);
  const chat: HqDirectorChatPage = structuredClone(snapshot.chat);
  const tasks = (): HqTask[] => [...summary.needsYou, ...(summary.plan ?? []), ...(summary.runningNow ?? []), ...(summary.doneToday ?? [])];
  const dropFromNeeds = (id: string) => {
    const task = tasks().find((t) => t.id === id);
    summary.needsYou = summary.needsYou.filter((t) => t.id !== id);
    summary.plan = (summary.plan ?? []).map((t) => (t.id === id ? { ...t, status: 'todo' } : t));
    return task;
  };
  const settings = { paused: false, plan: { state: 'ok', until: null, windows: [] } } as unknown as HqSettings;

  const api = hqApi as unknown as Api;
  const original = { ...api };
  for (const key of Object.keys(api)) api[key] = offline;
  Object.assign(api, {
    director: async () => structuredClone(summary),
    listBuilds: async () => structuredClone(snapshot.builds),
    directorChat: async () => structuredClone(chat),
    getSettings: async () => settings,
    listMembers: async () => ({ items: summary.director ? [summary.director] : [] }),
    getTask: async (id: unknown) => {
      const task = tasks().find((t) => t.id === id);
      if (!task) throw new Error('This task is not in the snapshot');
      return { ...task, messages: [], runs: [], children: [], parent: null } satisfies HqTaskDetail;
    },
    resolveEscalation: async (id: unknown) => dropFromNeeds(String(id)),
    acceptProposal: async (id: unknown) => dropFromNeeds(String(id)),
    declineProposal: async (id: unknown) => dropFromNeeds(String(id)),
    sendDirectorChat: async (body: unknown) => {
      const last = chat.items[chat.items.length - 1];
      const message: HqMessage = {
        id: (last?.id ?? 0) + 1, taskId: null, author: null, recipient: summary.director, kind: 'comment', body: String(body), readAt: null,
        createdAt: new Date().toISOString(),
      };
      chat.items = [...chat.items, message];
      return structuredClone(chat);
    },
  });
  return () => Object.assign(api, original);
}

/** The page inside a frame the size of the CMS sidebar, header and padding, so widths match the real thing. */
export function DirectorPreview({ snapshot }: { snapshot: DirectorSnapshot }) {
  // Its own cache, so nothing the CMS loaded live shows here, or the other way round.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  const [ready, setReady] = useState(false);
  // The page mounts only once the snapshot is installed (its queries fire on mount), and leaving the preview puts the
  // real API back for the rest of the CMS.
  useEffect(() => {
    const restore = installSnapshot(snapshot);
    // Rendering waits for this effect on purpose: the swap must happen before any query fires, and only on the client.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return () => {
      restore();
      queryClient.clear();
      setReady(false);
    };
  }, [snapshot, queryClient]);
  if (!ready) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen bg-[#f8fafc]">
        <aside className="sticky top-0 flex h-screen w-20 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:w-64">
          <div className="flex h-20 items-center border-b border-slate-100 px-3 text-xs font-semibold text-slate-400 lg:px-5">CMS menu</div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-end px-6 text-xs text-slate-500">
            Preview · production snapshot from {formatTbilisi(snapshot.takenAt)} · read-only, actions change only this tab
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-[1800px] space-y-6">
              <Suspense fallback={null}>
                <HqDirectorPage />
                <TaskSheetHost />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </QueryClientProvider>
  );
}
