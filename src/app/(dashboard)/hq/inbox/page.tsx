'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCheck, Inbox, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqInbox, useHqMembers, useHqTasks, useMarkHqInboxRead } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi, isRunnableHqAgent, sortInbox } from '@/lib/hq-board';
import type { HqMessage, HqTask } from '@/types';
import { EmptyState, LoadErrorState, MemberChip, PageHeader, RefreshErrorBanner, TaskRow, useTaskSheet } from '../hq-ui';
import { ApproveButton, RunAgainButton, SendBackButton } from '../task-actions';

type Tab = 'approvals' | 'blocked' | 'messages';

export default function HqInboxPage() {
  const [tab, setTab] = useState<Tab>('approvals');
  const approvals = useHqTasks({ status: ['needs_approval'], limit: 200 });
  const blocked = useHqTasks({ status: ['blocked'], limit: 200 });
  const inbox = useHqInbox();
  const { data: members = [] } = useHqMembers();
  const memberById = new Map(members.map((m) => [m.id, m]));
  const { openTask } = useTaskSheet();

  const unread = (inbox.data ?? []).filter((m) => !m.readAt).length;
  const tabs: Array<{ key: Tab; label: string; icon: typeof Inbox; count: number; tone: string }> = [
    { key: 'approvals', label: 'Approvals', icon: Inbox, count: approvals.data?.length ?? 0, tone: 'bg-amber-500' },
    { key: 'blocked', label: 'Blocked', icon: AlertTriangle, count: blocked.data?.length ?? 0, tone: 'bg-red-500' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, count: unread, tone: 'bg-sky-500' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Inbox className="h-6 w-6 text-slate-700" />}
        title="Inbox"
        description="Everything waiting on you: results to approve, work that's stuck, and messages from your team."
      />

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs" role="tablist" aria-label="Inbox sections">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.count > 0 && (
                <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white', active ? 'bg-white/20' : t.tone)}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'approvals' && (
        <TaskSection
          query={approvals}
          empty="Nothing to approve. When an agent that needs your OK finishes, its result lands here."
          fallback="Could not load approvals."
          renderActions={(t) => (
            <div className="flex gap-2">
              <SendBackButton task={t} />
              <ApproveButton task={t} />
            </div>
          )}
          onOpen={openTask}
        />
      )}
      {tab === 'blocked' && (
        <TaskSection
          query={blocked}
          empty="Nothing is stuck. Blocked tasks — ones an agent or teammate couldn't finish — show up here."
          fallback="Could not load blocked tasks."
          // Only agents the HQ worker will actually run can "try again".
          renderActions={(t) => (t.assignee && isRunnableHqAgent(memberById.get(t.assignee.id)) ? <RunAgainButton task={t} label="Try again" /> : null)}
          onOpen={openTask}
        />
      )}
      {tab === 'messages' && <MessagesSection query={inbox} onOpen={openTask} />}
    </div>
  );
}

interface ListQuery<T> {
  data: T[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
}

function TaskSection({
  query,
  empty,
  fallback,
  renderActions,
  onOpen,
}: {
  query: ListQuery<HqTask>;
  empty: string;
  fallback: string;
  renderActions: (t: HqTask) => React.ReactNode;
  onOpen: (id: string) => void;
}) {
  if (!query.data) {
    return query.isLoading ? <Loading /> : <LoadErrorState error={query.error} fallback={fallback} onRetry={() => void query.refetch()} />;
  }
  return (
    <div className="space-y-2">
      {!!query.error && <RefreshErrorBanner />}
      {query.data.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        query.data.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} showResultPreview right={renderActions(t)} />)
      )}
    </div>
  );
}

function MessagesSection({ query, onOpen }: { query: ListQuery<HqMessage>; onOpen: (id: string) => void }) {
  const markRead = useMarkHqInboxRead();
  if (!query.data) {
    return query.isLoading ? <Loading /> : <LoadErrorState error={query.error} fallback="Could not load messages." onRetry={() => void query.refetch()} />;
  }
  const messages = sortInbox(query.data);
  const unread = messages.filter((m) => !m.readAt).length;

  return (
    <div className="space-y-3">
      {!!query.error && <RefreshErrorBanner />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {unread > 0 ? `${unread} unread · newest first` : 'All caught up'} · messages from the last 7 days
        </p>
        <Button size="sm" variant="outline" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
          <CheckCheck className="h-4 w-4" /> Mark all read
        </Button>
      </div>
      {messages.length === 0 ? (
        <EmptyState>No messages. When an agent or teammate @mentions you, it shows up here.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  if (!m.readAt) markRead.mutate([m.id]);
                  if (m.taskId) onOpen(m.taskId);
                }}
                className={cn(
                  'w-full rounded-xl border px-4 py-3 text-left transition hover:shadow-xs',
                  m.readAt ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/60'
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  {!m.readAt && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="unread" />}
                  <MemberChip member={m.author} href={false} />
                  {m.kind !== 'comment' && <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] uppercase">{m.kind}</span>}
                  <span className="ml-auto" title={formatTbilisi(m.createdAt)}>
                    {formatRelative(m.createdAt)}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-slate-700">{m.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
