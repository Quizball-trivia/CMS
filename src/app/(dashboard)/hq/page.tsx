'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, Pause, Play, Power, Sunrise } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useHqInbox, useHqOverview, useMarkHqInboxRead, useUpdateHqSettings } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi, formatUsd, sortInbox } from '@/lib/hq-board';
import type { HqMember, HqOverview, HqSettings } from '@/types';
import {
  EmptyState,
  Markdown,
  MemberAvatar,
  MemberChip,
  MemberStatusDot,
  SectionTitle,
  TaskRow,
  LoadErrorState,
  RefreshErrorBanner,
  errorMessage,
  useTaskSheet,
} from './hq-ui';
import { ApproveButton, SendBackButton } from './task-actions';

export default function HqOverviewPage() {
  const { data, isLoading, error, refetch } = useHqOverview();
  const { openTask } = useTaskSheet();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading HQ…
      </div>
    );
  }
  if (!data) {
    // Only when nothing is cached; a failed background refetch keeps the page mounted.
    return <LoadErrorState error={error} fallback="Could not load HQ." onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      {error && <RefreshErrorBanner />}
      <KillSwitch settings={data.settings} today={data.today} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <NeedsApproval overview={data} onOpen={openTask} />
          <Briefing overview={data} onOpen={openTask} />
          <section>
            <SectionTitle count={data.recentResults.length}>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Finished in the last 24h
            </SectionTitle>
            {data.recentResults.length === 0 ? (
              <EmptyState>Nothing finished yet today.</EmptyState>
            ) : (
              <div className="space-y-2">
                {data.recentResults.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} showResultPreview />
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <TeamStrip team={data.team} />
          <RunningNow overview={data} onOpen={openTask} />
          <section>
            <SectionTitle count={data.blocked.length}>
              <AlertTriangle className="h-4 w-4 text-red-500" /> Blocked
            </SectionTitle>
            {data.blocked.length === 0 ? (
              <EmptyState>Nothing is stuck.</EmptyState>
            ) : (
              <div className="space-y-2">
                {data.blocked.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} />
                ))}
              </div>
            )}
          </section>
          <InboxCard unread={data.inboxUnread} onOpen={openTask} />
          <StatusCounts counts={data.countsByStatus} />
        </div>
      </div>
    </div>
  );
}

// ── Kill switch + today's usage ──

function KillSwitch({ settings, today }: { settings: HqSettings; today: HqOverview['today'] }) {
  const update = useUpdateHqSettings();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [reason, setReason] = useState('');

  const resume = () =>
    update.mutate(
      { paused: false, pausedReason: null },
      {
        onSuccess: () => toast.success('Agents resumed'),
        onError: (e) => toast.error(errorMessage(e, 'Could not resume')),
      }
    );

  const pause = () =>
    update.mutate(
      { paused: true, pausedReason: reason.trim() || null },
      {
        onSuccess: () => {
          toast.success('All HQ agents paused');
          setPauseOpen(false);
          setReason('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not pause')),
      }
    );

  return (
    <Card className={cn('gap-0 py-0', settings.paused && 'border-red-200 bg-red-50/40')}>
      <CardContent className="flex flex-wrap items-center gap-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full',
              settings.paused ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
            )}
          >
            <Power className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">{settings.paused ? 'Agents are paused' : 'Agents are working'}</div>
            <div className="text-xs text-slate-500">
              {settings.paused
                ? settings.pausedReason || 'No new runs will start until you resume.'
                : `Up to ${settings.maxConcurrentRuns} at a time`}
            </div>
          </div>
        </div>

        <Meter label="Runs today" value={today.runs} max={settings.dailyRunLimit} format={(v) => String(v)} />
        <Meter label="Est. cost today" value={today.costCents} max={settings.dailyLimitCents} format={formatUsd} />
        <div className="text-xs text-slate-500">
          <div>
            <span className="font-bold text-slate-900">{today.tasksDone}</span> done ·{' '}
            <span className="font-bold text-slate-900">{today.tasksCreated}</span> created
          </div>
          {today.failedRuns > 0 && <div className="text-red-600">{today.failedRuns} failed runs</div>}
        </div>

        <div className="ml-auto">
          {settings.paused ? (
            <Button onClick={resume} disabled={update.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
              <Play className="h-4 w-4" /> Resume agents
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setPauseOpen(true)} className="border-red-200 text-red-700 hover:bg-red-50">
              <Pause className="h-4 w-4" /> Pause all agents
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause all HQ agents?</DialogTitle>
            <DialogDescription>
              Runs in progress finish, but no new runs start and schedules wait until you resume.
            </DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={pause} disabled={update.isPending} className="bg-red-600 text-white hover:bg-red-700">
              Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Meter({ label, value, max, format }: { label: string; value: number; max: number; format: (v: number) => string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-44">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-900">
          {/* The worker treats a cap of 0 as "no cap". */}
          {format(value)} <span className="font-normal text-slate-400">/ {max > 0 ? format(max) : 'no limit'}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Approvals ──

function NeedsApproval({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const items = overview.needsApproval;
  return (
    <section>
      <SectionTitle count={items.length}>
        <Inbox className="h-4 w-4 text-amber-600" /> Needs your approval
      </SectionTitle>
      {items.length === 0 ? (
        <EmptyState>You&apos;re all caught up.</EmptyState>
      ) : (
        <div className="space-y-2">
          {items.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={onOpen}
              showResultPreview
              right={
                <div className="flex gap-2">
                  <SendBackButton task={t} />
                  <ApproveButton task={t} />
                </div>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Briefing ──

function Briefing({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const briefing = overview.latestBriefing;
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sunrise className="h-5 w-5 text-amber-500" /> Daily briefing
        </CardTitle>
        {briefing && (
          <button type="button" onClick={() => onOpen(briefing.id)} className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
            #{briefing.number} · {formatTbilisi(briefing.completedAt ?? briefing.updatedAt)}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {briefing?.result ? (
          <Markdown>{briefing.result}</Markdown>
        ) : (
          <EmptyState>
            No briefing yet. The Ops Reporter writes one every morning — or run its schedule now from{' '}
            <Link href="/hq/schedules" className="underline">
              Schedules
            </Link>
            .
          </EmptyState>
        )}
      </CardContent>
    </Card>
  );
}

// ── Right column ──

function TeamStrip({ team }: { team: HqMember[] }) {
  return (
    <section>
      <SectionTitle
        count={team.length}
        right={
          <Link href="/hq/team" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
            Manage
          </Link>
        }
      >
        Team
      </SectionTitle>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {team.map((m) => (
          <Link key={m.id} href={`/hq/team/${m.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
            <MemberAvatar member={m} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <MemberStatusDot status={m.status} busy={!!m.stats.currentTask} />
                <span className="truncate text-sm font-semibold text-slate-900">{m.name}</span>
              </div>
              <div className="truncate text-xs text-slate-500">
                {m.stats.currentTask
                  ? `Working on #${m.stats.currentTask.number} ${m.stats.currentTask.title}`
                  : m.kind === 'human'
                    ? `${m.stats.openTasks} open tasks`
                    : m.runtime !== 'hq'
                      ? 'Runs on its own pipeline'
                      : m.stats.lastRun
                        ? `Last run ${formatRelative(m.stats.lastRun.startedAt)}`
                        : 'Idle'}
              </div>
            </div>
            {m.stats.runsToday > 0 && <span className="text-xs text-slate-400">{m.stats.runsToday} runs</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

function RunningNow({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const runs = overview.runningRuns;
  return (
    <section>
      <SectionTitle count={runs.length}>
        <Loader2 className={cn('h-4 w-4 text-blue-600', runs.length > 0 && 'animate-spin')} /> Running now
      </SectionTitle>
      {runs.length === 0 ? (
        <EmptyState>No agent is running right now.</EmptyState>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!r.taskId}
              onClick={() => r.taskId && onOpen(r.taskId)}
              className="flex w-full items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-left hover:bg-blue-50"
            >
              <MemberAvatar member={r.member} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {r.taskNumber ? `#${r.taskNumber} ` : ''}
                  {r.taskTitle ?? 'Untitled'}
                </div>
                <div className="text-xs text-slate-500">
                  {r.member.name} · started {formatRelative(r.startedAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

const INBOX_PREVIEW = 6;

function InboxCard({ unread, onOpen }: { unread: number; onOpen: (id: string) => void }) {
  const { data = [] } = useHqInbox();
  const markRead = useMarkHqInboxRead();
  const [showAll, setShowAll] = useState(false);
  const messages = sortInbox(data);
  const visible = showAll ? messages : messages.slice(0, INBOX_PREVIEW);
  return (
    <section>
      <SectionTitle
        count={unread}
        right={
          unread > 0 ? (
            <button type="button" className="text-xs text-slate-500 hover:text-slate-800 hover:underline" onClick={() => markRead.mutate(undefined)}>
              Mark all read
            </button>
          ) : null
        }
      >
        Messages to you
      </SectionTitle>
      {visible.length === 0 ? (
        <EmptyState>No messages.</EmptyState>
      ) : (
        <>
        <ul className="space-y-2">
          {visible.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  if (!m.readAt) markRead.mutate([m.id]);
                  if (m.taskId) onOpen(m.taskId);
                }}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left hover:bg-slate-50',
                  m.readAt ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50/50'
                )}
              >
                <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <MemberChip member={m.author} href={false} />
                  <span className="ml-auto">{formatRelative(m.createdAt)}</span>
                </div>
                <p className="line-clamp-2 text-sm text-slate-700">{m.body}</p>
              </button>
            </li>
          ))}
        </ul>
        {messages.length > INBOX_PREVIEW && (
          <button
            type="button"
            className="mt-2 w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Show fewer' : `Show all ${messages.length} messages`}
          </button>
        )}
        </>
      )}
    </section>
  );
}

function StatusCounts({ counts }: { counts: HqOverview['countsByStatus'] }) {
  const rows: Array<[keyof typeof counts, string, string]> = [
    ['todo', 'To do', 'text-slate-700'],
    ['in_progress', 'In progress', 'text-blue-700'],
    ['needs_approval', 'Needs approval', 'text-amber-700'],
    ['blocked', 'Blocked', 'text-red-700'],
    ['backlog', 'Backlog', 'text-slate-500'],
  ];
  return (
    <Link href="/hq/board" className="block rounded-xl border border-slate-200 bg-white p-3 hover:border-slate-300">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Board</div>
      <div className="grid grid-cols-5 gap-2 text-center">
        {rows.map(([key, label, color]) => (
          <div key={key}>
            <div className={cn('text-lg font-bold', color)}>{counts[key] ?? 0}</div>
            <div className="text-[10px] leading-tight text-slate-400">{label}</div>
          </div>
        ))}
      </div>
    </Link>
  );
}
