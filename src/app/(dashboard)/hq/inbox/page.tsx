'use client';

import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCheck, Inbox, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqInbox, useHqMembers, useHqTasks, useMarkHqInboxRead } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi, isRunnableHqAgent, sortInbox } from '@/lib/hq-board';
import type { HqMessage, HqTask } from '@/types';
import { EmptyState, HQ_PAGE, LoadErrorState, MemberChip, PageHeader, Panel, RefreshErrorBanner, Section, TaskRow, useTaskSheet } from '../hq-ui';
import { ApproveButton, RunAgainButton, SendBackButton } from '../task-actions';

type Tab = 'approvals' | 'blocked' | 'messages';

export default function HqInboxPage() {
  // ?tab=blocked|messages|approvals opens that queue (links from HQ).
  const tabParam = useSearchParams().get('tab');
  const linked: Tab | null = tabParam === 'approvals' || tabParam === 'blocked' || tabParam === 'messages' ? tabParam : null;
  const [picked, setTab] = useState<Tab | null>(null);
  // A new ?tab= (client navigation) wins over an earlier click.
  const [seenLinked, setSeenLinked] = useState(linked);
  if (seenLinked !== linked) {
    setSeenLinked(linked);
    setTab(null);
  }
  const approvals = useHqTasks({ status: ['needs_approval'], limit: 200 });
  const blocked = useHqTasks({ status: ['blocked'], limit: 200 });
  const inbox = useHqInbox();
  const membersQuery = useHqMembers();
  const memberById = new Map((membersQuery.data ?? []).map((m) => [m.id, m]));
  // Without the team we can't tell which agents will run, so "Try again" is hidden — say so.
  const membersFailed = !!membersQuery.error && !membersQuery.data;
  const { openTask } = useTaskSheet();

  const unread = (inbox.data ?? []).filter((m) => !m.readAt).length;
  // Messages is what this page is for; approvals and blocked work are on HQ (a link can still name their tab).
  const tab = picked ?? linked ?? 'messages';
  const tabs: Array<{ key: Tab; label: string; icon: typeof Inbox; count: number; tone: string }> = [
    { key: 'approvals', label: 'Approvals', icon: Inbox, count: approvals.data?.length ?? 0, tone: 'bg-amber-500' },
    { key: 'blocked', label: 'Blocked', icon: AlertTriangle, count: blocked.data?.length ?? 0, tone: 'bg-red-500' },
    { key: 'messages', label: 'Messages', icon: MessageSquare, count: unread, tone: 'bg-amber-500' },
  ];

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Messages"
        description="Messages from your team. Approvals and blocked work are on HQ too; the other tabs list them in full."
        actions={
          <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Inbox sections">
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
                    'flex min-h-9 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition',
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {t.count > 0 && (
                    <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-[11px] font-semibold tabular-nums text-white', active ? 'bg-white/20' : t.tone)}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === 'approvals' && (
        <TaskSection
          title="Waiting for your approval"
          description="Results from agents that need your OK."
          query={approvals}
          empty="Nothing waiting for your approval."
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
          title="Blocked tasks"
          description="Tasks an agent or teammate couldn't finish."
          notice={
            membersFailed ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <span className="min-w-0 flex-1">Couldn’t load the team, so “Try again” is hidden for now.</span>
                <button
                  type="button"
                  onClick={() => void membersQuery.refetch()}
                  className="min-h-9 rounded-md border border-amber-200 bg-white px-3 py-1 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 sm:min-h-0"
                >
                  Retry
                </button>
              </div>
            ) : null
          }
          query={blocked}
          empty="No blocked tasks."
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
  title,
  description,
  notice,
  query,
  empty,
  fallback,
  renderActions,
  onOpen,
}: {
  title: string;
  description: string;
  notice?: ReactNode;
  query: ListQuery<HqTask>;
  empty: string;
  fallback: string;
  renderActions: (t: HqTask) => ReactNode;
  onOpen: (id: string) => void;
}) {
  return (
    <Section title={title} count={query.data?.length} description={description}>
      {notice}
      {!query.data ? (
        query.isLoading ? <Loading /> : <LoadErrorState error={query.error} fallback={fallback} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-2">
          {!!query.error && <RefreshErrorBanner />}
          {query.data.length === 0 ? (
            <EmptyState>{empty}</EmptyState>
          ) : (
            query.data.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} showResultPreview right={renderActions(t)} />)
          )}
        </div>
      )}
    </Section>
  );
}

function MessagesSection({ query, onOpen }: { query: ListQuery<HqMessage>; onOpen: (id: string) => void }) {
  const markRead = useMarkHqInboxRead();
  const messages = query.data ? sortInbox(query.data) : [];
  const unread = messages.filter((m) => !m.readAt).length;

  return (
    <Section
      title="Messages to you"
      description={query.data ? `${unread > 0 ? `${unread} unread · newest first` : 'All caught up'} · from the last 7 days` : 'From the last 7 days.'}
      actions={
        query.data ? (
          <Button size="sm" variant="outline" className="shadow-none max-sm:h-9" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        ) : undefined
      }
    >
      {!query.data ? (
        query.isLoading ? <Loading /> : <LoadErrorState error={query.error} fallback="Could not load messages." onRetry={() => void query.refetch()} />
      ) : (
        <>
          {!!query.error && <RefreshErrorBanner />}
          {messages.length === 0 ? (
            <EmptyState>No messages for you in the last 7 days.</EmptyState>
          ) : (
            <Panel className="overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {messages.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!m.readAt) markRead.mutate([m.id]);
                        if (m.taskId) onOpen(m.taskId);
                      }}
                      className={cn('block w-full px-4 py-3 text-left transition', m.readAt ? 'hover:bg-slate-50' : 'bg-amber-50/60 hover:bg-amber-50')}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[13px] text-slate-600">
                        {!m.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="unread" />}
                        <MemberChip member={m.author} href={false} />
                        {m.kind !== 'comment' && <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs uppercase text-slate-600">{m.kind}</span>}
                        <span className="ml-auto shrink-0 tabular-nums" title={formatTbilisi(m.createdAt)}>
                          {formatRelative(m.createdAt)}
                        </span>
                      </div>
                      {/* Messages without a task have nowhere else to be read: show them in full. */}
                      <p className={cn('whitespace-pre-wrap break-words text-sm text-slate-700', m.taskId && 'line-clamp-3')}>{m.body}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </Section>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
