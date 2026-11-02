'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Inbox,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Star,
  Sunrise,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useHqInbox,
  useHqMembers,
  useHqOverview,
  useHqPulse,
  useMarkHqInboxRead,
  useUpdateHqSettings,
} from '@/hooks';
import { useAuth } from '@/providers';
import { cn } from '@/lib/utils';
import { defaultDepartmentAssignee, formatRelative, formatTbilisi, formatUsd, sortInbox } from '@/lib/hq-board';
import { departmentHref } from '@/lib/hq-departments';
import { greeting, kpiDelta, tbilisiLongDate, type KpiDelta } from '@/lib/hq-pulse';
import type { HqDepartment, HqMember, HqOverview, HqPulse, HqSettings } from '@/types';
import {
  EmptyState,
  LoadErrorState,
  Markdown,
  MemberAvatar,
  MemberChip,
  MemberStack,
  RefreshErrorBanner,
  TaskRow,
  errorMessage,
  useTaskSheet,
  type MemberActivity,
} from './hq-ui';
import { CommandBox } from './command-box';
import { NewTaskDialog } from './new-task-dialog';
import { ApproveButton, SendBackButton } from './task-actions';

export default function CommandCenterPage() {
  const { data, isLoading, error, refetch } = useHqOverview();
  const { data: members = [] } = useHqMembers();
  const { openTask } = useTaskSheet();
  const [giveTo, setGiveTo] = useState<{ heading: string; assigneeId: string | null } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Opening HQ…
      </div>
    );
  }
  if (!data) {
    return <LoadErrorState error={error} fallback="Could not load HQ." onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-8">
      {error && <RefreshErrorBanner />}
      <CommandHeader overview={data} />
      <PulseSection />
      <CommandBox members={members} onOpenTask={openTask} />
      <NeedsYou overview={data} onOpen={openTask} />
      <DepartmentsGrid
        overview={data}
        onOpenTask={openTask}
        onGiveTask={(dept, assigneeId) => setGiveTo({ heading: `Give ${dept.name} a task`, assigneeId })}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <WorkingNow overview={data} onOpen={openTask} />
        <Briefing overview={data} onOpen={openTask} />
      </div>

      <NewTaskDialog
        open={!!giveTo}
        onOpenChange={(o) => !o && setGiveTo(null)}
        members={members}
        defaultAssigneeId={giveTo?.assigneeId ?? null}
        heading={giveTo?.heading}
      />
    </div>
  );
}

// ── Header: greeting, HQ status + pause switch, today's usage ──

function CommandHeader({ overview }: { overview: HqOverview }) {
  const { user } = useAuth();
  const [now] = useState(() => new Date());
  const name = user?.nickname || user?.email?.split('@')[0] || 'there';
  return (
    <header className="flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{tbilisiLongDate(now)} · Tbilisi</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
          {greeting(now)}, {name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">How the company is doing, what needs you, and who is working on what.</p>
      </div>
      <HqStatus settings={overview.settings} today={overview.today} />
    </header>
  );
}

function HqStatus({ settings, today }: { settings: HqSettings; today: HqOverview['today'] }) {
  const update = useUpdateHqSettings();
  const [pauseOpen, setPauseOpen] = useState(false);
  const [reason, setReason] = useState('');

  const resume = () =>
    update.mutate(
      { paused: false, pausedReason: null },
      { onSuccess: () => toast.success('Agents are back to work'), onError: (e) => toast.error(errorMessage(e, 'Could not resume')) }
    );
  const pause = () =>
    update.mutate(
      { paused: true, pausedReason: reason.trim() || null },
      {
        onSuccess: () => {
          toast.success('All agents paused');
          setPauseOpen(false);
          setReason('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not pause')),
      }
    );

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-2xl border bg-white px-4 py-3 shadow-xs',
        settings.paused ? 'border-red-200 bg-red-50/60' : 'border-slate-200'
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', settings.paused ? 'bg-red-500' : 'animate-pulse bg-emerald-500')} />
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">{settings.paused ? 'Agents paused' : 'Agents running'}</div>
          <div className="max-w-56 truncate text-[11px] text-slate-500">
            {settings.paused ? settings.pausedReason || 'Nothing new starts until you resume' : `Up to ${settings.maxConcurrentRuns} at a time`}
          </div>
        </div>
      </div>
      <div className="h-8 w-px bg-slate-200" />
      <MiniMeter label="Runs today" value={today.runs} max={settings.dailyRunLimit} format={String} />
      <MiniMeter label="Est. cost" value={today.costCents} max={settings.dailyLimitCents} format={formatUsd} />
      {settings.paused ? (
        <Button size="sm" onClick={resume} disabled={update.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Play className="h-4 w-4" /> Resume
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)} className="border-red-200 text-red-700 hover:bg-red-50">
          <Pause className="h-4 w-4" /> Pause all
        </Button>
      )}

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause all agents?</DialogTitle>
            <DialogDescription>Runs in progress finish. No new runs start, and automations wait until you resume.</DialogDescription>
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
    </div>
  );
}

function MiniMeter({ label, value, max, format }: { label: string; value: number; max: number; format: (v: number) => string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-28">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800">{format(value)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">{max > 0 ? `of ${format(max)}` : 'no limit'}</div>
    </div>
  );
}

// ── Company pulse ──

function PulseSection() {
  const { data: pulse, error, isLoading, refetch } = useHqPulse();
  return (
    <section>
      <SectionHeader title="Company pulse" subtitle="Today so far, compared with yesterday and the 7-day average." />
      {!pulse ? (
        isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <LoadErrorState error={error} fallback="Could not load the company numbers." onRetry={() => void refetch()} />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="New players" metric="newUsers" pulse={pulse} color="#2563eb" />
          <KpiCard label="Matches" metric="matches" pulse={pulse} color="#7c3aed" />
          <KpiCard label="Active players" metric="activePlayers" pulse={pulse} color="#059669" />
          <RatingCard pulse={pulse} />
        </div>
      )}
    </section>
  );
}

function KpiCard({
  label,
  metric,
  pulse,
  color,
}: {
  label: string;
  metric: 'newUsers' | 'matches' | 'activePlayers';
  pulse: HqPulse;
  color: string;
}) {
  const today = pulse.today[metric];
  const vsYesterday = kpiDelta(today, pulse.yesterday[metric]);
  const vsAvg = kpiDelta(today, pulse.avg7d[metric]);
  const series = pulse.series.map((p) => ({ date: p.date, value: p[metric] }));
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900">{today.toLocaleString()}</span>
        <span className="text-xs text-slate-400">today</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <DeltaText delta={vsYesterday} suffix="vs yesterday" />
        <DeltaText delta={vsAvg} suffix="vs 7-day avg" />
      </div>
      <div className="mt-3 h-12" aria-label={`${label}, last ${series.length} days`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`spark-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 'dataMax']} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${metric})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-[10px] text-slate-400">Last {series.length} days</div>
    </div>
  );
}

function RatingCard({ pulse }: { pulse: HqPulse }) {
  const f = pulse.feedback;
  const avg = f.avgRating7d;
  const prev = f.avgRatingPrev7d;
  const diff = avg !== null && prev !== null ? Math.round((avg - prev) * 10) / 10 : null;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="text-sm font-medium text-slate-500">Player rating</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-slate-900">{avg !== null ? avg.toFixed(1) : '—'}</span>
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        <span className="text-xs text-slate-400">last 7 days</span>
      </div>
      <div className="mt-1 text-xs">
        {diff === null ? (
          <span className="text-slate-400">No earlier ratings to compare</span>
        ) : (
          <span className={cn(diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-500')}>
            {diff > 0 ? '↑' : diff < 0 ? '↓' : ''} {diff === 0 ? 'Same as' : `${Math.abs(diff).toFixed(1)} vs`} the week before
          </span>
        )}
      </div>
      <div className="mt-auto space-y-1.5 pt-3 text-xs">
        <div className="flex justify-between text-slate-500">
          <span>Ratings</span>
          <span className="font-semibold text-slate-800">
            {f.count7d} <span className="font-normal text-slate-400">(prev {f.countPrev7d})</span>
          </span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Low ratings (1–2★)</span>
          <span className={cn('font-semibold', f.lowRatings7d > 0 ? 'text-red-600' : 'text-slate-800')}>{f.lowRatings7d}</span>
        </div>
      </div>
    </div>
  );
}

function DeltaText({ delta, suffix }: { delta: KpiDelta; suffix: string }) {
  const color = delta.direction === 'up' ? 'text-emerald-600' : delta.direction === 'down' ? 'text-red-600' : 'text-slate-400';
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-semibold', color)}>{delta.label}</span> <span className="text-slate-400">{suffix}</span>
    </span>
  );
}

// ── Needs you ──

const NEEDS_YOU_LIMIT = 5;

function NeedsYou({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const { data: inbox = [] } = useHqInbox();
  const markRead = useMarkHqInboxRead();
  const unread = sortInbox(inbox).filter((m) => !m.readAt);
  const approvals = overview.needsApproval;
  const blocked = overview.blocked;
  const total = (overview.countsByStatus?.needs_approval ?? approvals.length) + (overview.countsByStatus?.blocked ?? blocked.length) + overview.inboxUnread;

  return (
    <section>
      <SectionHeader
        title="Needs you"
        subtitle={total === 0 ? 'Nothing is waiting on you right now.' : `${total} ${total === 1 ? 'thing is' : 'things are'} waiting on you.`}
        right={
          <Link href="/hq/inbox" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
            Open inbox <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <NeedsColumn
          icon={<Inbox className="h-4 w-4 text-amber-600" />}
          title="Approvals"
          count={overview.countsByStatus?.needs_approval ?? approvals.length}
          empty="No results waiting for your OK."
        >
          {approvals.slice(0, NEEDS_YOU_LIMIT).map((t) => (
            <div key={t.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
              <TaskRow task={t} onOpen={onOpen} showResultPreview />
              <div className="flex justify-end gap-2">
                <SendBackButton task={t} />
                <ApproveButton task={t} />
              </div>
            </div>
          ))}
        </NeedsColumn>
        <NeedsColumn
          icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          title="Blocked"
          count={overview.countsByStatus?.blocked ?? blocked.length}
          empty="Nothing is stuck."
        >
          {blocked.slice(0, NEEDS_YOU_LIMIT).map((t) => (
            <TaskRow key={t.id} task={t} onOpen={onOpen} />
          ))}
        </NeedsColumn>
        <NeedsColumn
          icon={<MessageSquare className="h-4 w-4 text-sky-600" />}
          title="Messages"
          count={overview.inboxUnread}
          empty="No unread messages."
        >
          {unread.slice(0, NEEDS_YOU_LIMIT).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                markRead.mutate([m.id]);
                if (m.taskId) onOpen(m.taskId);
              }}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-left hover:bg-amber-50"
            >
              <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500">
                <MemberChip member={m.author} href={false} />
                <span className="ml-auto">{formatRelative(m.createdAt)}</span>
              </div>
              <p className="line-clamp-2 text-sm text-slate-700">{m.body}</p>
            </button>
          ))}
        </NeedsColumn>
      </div>
    </section>
  );
}

function NeedsColumn({
  icon,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  const hasItems = count > 0;
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center gap-2 px-1">
        {icon}
        <span className="text-sm font-bold text-slate-800">{title}</span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-bold',
            hasItems ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
          )}
        >
          {count}
        </span>
        {count > NEEDS_YOU_LIMIT && (
          <Link href="/hq/inbox" className="ml-auto text-xs text-slate-500 hover:underline">
            +{count - NEEDS_YOU_LIMIT} more
          </Link>
        )}
      </div>
      <div className="space-y-2">{hasItems ? children : <EmptyState>{empty}</EmptyState>}</div>
    </div>
  );
}

// ── Departments ──

function DepartmentsGrid({
  overview,
  onOpenTask,
  onGiveTask,
}: {
  overview: HqOverview;
  onOpenTask: (id: string) => void;
  onGiveTask: (dept: HqDepartment, assigneeId: string | null) => void;
}) {
  const statusById = useMemo(() => new Map(overview.team.map((m) => [m.id, m.status])), [overview.team]);
  const departments = overview.departments ?? [];
  return (
    <section>
      <SectionHeader title="Departments" subtitle="Each area of the company, who owns it, and how its work is going." />
      {departments.length === 0 ? (
        <EmptyState>Departments will appear here once the backend reports them.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <DepartmentCard key={d.key} dept={d} team={overview.team} statusById={statusById} onOpenTask={onOpenTask} onGiveTask={onGiveTask} />
          ))}
        </div>
      )}
    </section>
  );
}

function DepartmentCard({
  dept,
  team,
  statusById,
  onOpenTask,
  onGiveTask,
}: {
  dept: HqDepartment;
  team: HqMember[];
  statusById: Map<string, HqMember['status']>;
  onOpenTask: (id: string) => void;
  onGiveTask: (dept: HqDepartment, assigneeId: string | null) => void;
}) {
  const workingIds = new Set(dept.working.map((w) => w.member.id));
  const activityOf = (id: string): MemberActivity =>
    workingIds.has(id) ? 'working' : statusById.get(id) && statusById.get(id) !== 'active' ? 'paused' : 'idle';
  const defaultAssignee = defaultDepartmentAssignee(dept.members, team);
  const c = dept.counts;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-xl ring-1 ring-slate-100" aria-hidden>
          {dept.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <Link href={departmentHref(dept.key)} className="text-base font-bold text-slate-900 hover:underline">
            {dept.name}
          </Link>
          <div className="mt-1">
            {dept.members.length > 0 ? (
              <MemberStack members={dept.members} activityOf={activityOf} />
            ) : (
              <span className="text-xs text-slate-400">No one assigned yet</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        <CountPill label="open" value={c.open} tone="slate" />
        <CountPill label="waiting for you" value={c.needsApproval} tone="amber" />
        <CountPill label="blocked" value={c.blocked} tone="red" />
        <CountPill label="done today" value={c.doneToday} tone="emerald" />
      </div>

      <div className="mt-3 min-h-[2.5rem] text-xs">
        {dept.working.length > 0 ? (
          <div className="flex items-center gap-1.5 text-blue-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="truncate">
              {dept.working[0].member.name} · #{dept.working[0].task.number} {dept.working[0].task.title}
            </span>
          </div>
        ) : dept.lastResult ? (
          <button type="button" onClick={() => onOpenTask(dept.lastResult!.id)} className="block w-full text-left text-slate-500 hover:text-slate-900">
            <span className="text-slate-400">Latest: </span>
            <span className="font-medium text-slate-700">{dept.lastResult.title}</span>
            <span className="text-slate-400"> · {formatRelative(dept.lastResult.completedAt ?? dept.lastResult.updatedAt)}</span>
          </button>
        ) : (
          <span className="text-slate-400">No finished work yet.</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
        <Button size="sm" variant="outline" onClick={() => onGiveTask(dept, defaultAssignee)}>
          <Plus className="h-4 w-4" /> Give a task
        </Button>
        <Link href={departmentHref(dept.key)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function CountPill({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'amber' | 'red' | 'emerald' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5', value > 0 ? tones[tone] : 'bg-slate-50 text-slate-400')}>
      <span className="font-bold">{value}</span> {label}
    </span>
  );
}

// ── Working now + briefing ──

function WorkingNow({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const runs = overview.runningRuns;
  return (
    <section>
      <SectionHeader title="Working now" subtitle={runs.length ? `${runs.length} ${runs.length === 1 ? 'agent is' : 'agents are'} on a task.` : 'Every agent is idle.'} />
      {runs.length === 0 ? (
        <EmptyState>When an agent picks up a task, you&apos;ll see it here live.</EmptyState>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={!r.taskId}
              onClick={() => r.taskId && onOpen(r.taskId)}
              className="flex w-full items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-left hover:bg-blue-50"
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
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Briefing({ overview, onOpen }: { overview: HqOverview; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const briefing = overview.latestBriefing;
  return (
    <section>
      <SectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Sunrise className="h-5 w-5 text-amber-500" /> Today&apos;s briefing
          </span>
        }
        subtitle={briefing ? `From the Ops Reporter · ${formatTbilisi(briefing.completedAt ?? briefing.updatedAt)}` : 'Written by the Ops Reporter every morning.'}
        right={
          briefing ? (
            <button type="button" onClick={() => onOpen(briefing.id)} className="text-xs font-medium text-slate-500 hover:text-slate-900">
              Open #{briefing.number}
            </button>
          ) : null
        }
      />
      {briefing?.result ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className={cn('relative overflow-hidden', !expanded && 'max-h-64')}>
            <Markdown>{briefing.result}</Markdown>
            {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            aria-expanded={expanded}
          >
            <ChevronDown className={cn('h-4 w-4 transition', expanded && 'rotate-180')} />
            {expanded ? 'Show less' : 'Read the full briefing'}
          </button>
        </div>
      ) : (
        <EmptyState>
          No briefing yet. It arrives every morning — or run it now from{' '}
          <Link href="/hq/schedules" className="underline">
            Automations
          </Link>
          .
        </EmptyState>
      )}
    </section>
  );
}

// ── Shared ──

function SectionHeader({ title, subtitle, right }: { title: React.ReactNode; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
