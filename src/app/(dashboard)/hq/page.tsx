'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Loader2, MessageCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqMembers, useHqOverview, useHqStandup, useRunHqStandup } from '@/hooks';
import { useAuth } from '@/providers';
import { cn } from '@/lib/utils';
import { departmentInfo } from '@/lib/hq-departments';
import { greeting, tbilisiLongDate } from '@/lib/hq-pulse';
import { orderStandupEntries, standupStatusSentence } from '@/lib/hq-standup';
import type { HqGoal, HqGoalHorizon, HqMemberRef, HqStandup, HqStandupEntry } from '@/types';
import { CommandBox } from './command-box';
import { AddGoalCard, GoalCard, GoalDialog, NorthStarCard } from './goal-ui';
import { HqStatus } from './hq-status';
import { LoadErrorState, MemberAvatar, RefreshErrorBanner, errorMessage, useTaskSheet } from './hq-ui';
import { NewTaskDialog } from './new-task-dialog';
import { ProposalCard } from './proposal-card';
import { PulseTiles } from './pulse-tiles';

const GOALS_PER_BAND = 3;

export default function StandupPage() {
  const { data: standup, isLoading, error, refetch } = useHqStandup();
  const { data: overview } = useHqOverview();
  const { data: members = [] } = useHqMembers();
  const { openTask } = useTaskSheet();
  const [now] = useState(() => new Date());
  const [goalDialog, setGoalDialog] = useState<{ goal: HqGoal | null; horizon: HqGoalHorizon } | null>(null);
  const [askTo, setAskTo] = useState<HqMemberRef | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-24 text-lg text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" /> Getting the standup ready…
      </div>
    );
  }
  if (!standup) {
    return <LoadErrorState error={error} fallback="Could not load today’s standup." onRetry={() => void refetch()} />;
  }

  const allGoals = [standup.goals.northStar, ...standup.goals.week, ...standup.goals.day].filter((g): g is HqGoal => !!g);
  const goalById = new Map(allGoals.map((g) => [g.id, g]));
  const editGoal = (goal: HqGoal) => setGoalDialog({ goal, horizon: goal.horizon });
  const newGoal = (horizon: HqGoalHorizon) => setGoalDialog({ goal: null, horizon });

  return (
    <div className="mx-auto max-w-7xl space-y-14 pb-16">
      {error && <RefreshErrorBanner />}

      <Hero standup={standup} overview={overview} now={now} />

      {/* Goals */}
      <section className="space-y-6">
        <NorthStarCard goal={standup.goals.northStar} onEdit={editGoal} onCreate={() => newGoal('north_star')} now={now} />
        <div className="grid gap-8 lg:grid-cols-2">
          <GoalBand title="📅 This week" goals={standup.goals.week} horizon="week" onEdit={editGoal} onAdd={newGoal} now={now} />
          <GoalBand title="☀️ Today" goals={standup.goals.day} horizon="day" onEdit={editGoal} onAdd={newGoal} now={now} />
        </div>
      </section>

      {/* Ideas */}
      <section>
        <BigHeading
          title="💡 Ideas waiting for you"
          subtitle={
            standup.proposals.length === 0
              ? 'No new ideas yet — agents suggest them during the morning standup.'
              : 'Your agents suggest these to move the goals. Nothing happens until you say “Do it”.'
          }
          count={standup.proposals.length}
        />
        {standup.proposals.length === 0 ? (
          <SoftEmpty emoji="🌱">Ideas show up here after each agent’s standup.</SoftEmpty>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {standup.proposals.map((t) => (
              <ProposalCard key={t.id} task={t} goal={t.goalId ? goalById.get(t.goalId) : null} onOpen={openTask} />
            ))}
          </div>
        )}
      </section>

      {/* Agent updates */}
      <section>
        <BigHeading title="🗣️ Agent updates" subtitle="What each agent did yesterday, what it’s doing today, and what’s in its way." />
        <AgentUpdates standup={standup} onOpenTask={openTask} onAsk={setAskTo} />
      </section>

      <PulseTiles />

      <CommandBox members={members} onOpenTask={openTask} />

      <GoalDialog
        open={!!goalDialog}
        onOpenChange={(o) => !o && setGoalDialog(null)}
        goal={goalDialog?.goal}
        defaultHorizon={goalDialog?.horizon}
      />
      <NewTaskDialog
        open={!!askTo}
        onOpenChange={(o) => !o && setAskTo(null)}
        members={members}
        defaultAssigneeId={askTo?.id ?? null}
        heading={askTo ? `Ask ${askTo.name}` : undefined}
      />
    </div>
  );
}

// ── Hero ──

function Hero({ standup, overview, now }: { standup: HqStandup; overview: ReturnType<typeof useHqOverview>['data']; now: Date }) {
  const { user } = useAuth();
  const run = useRunHqStandup();
  const name = user?.nickname || user?.email?.split('@')[0] || 'there';
  const waiting = standup.waitingOn.length;
  const approvals = overview?.countsByStatus?.needs_approval ?? 0;
  const blocked = overview?.countsByStatus?.blocked ?? 0;

  const startStandup = () =>
    run.mutate(undefined, {
      onSuccess: ({ created }) =>
        toast.success(created > 0 ? `Standup started — ${created} ${created === 1 ? 'agent is' : 'agents are'} preparing an update` : 'Everyone is already on it'),
      onError: (e) => toast.error(errorMessage(e, 'Could not start the standup')),
    });

  return (
    <header className="flex flex-wrap items-end gap-6 pt-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold uppercase tracking-widest text-slate-400">🌅 Daily standup · {tbilisiLongDate(now)}</div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {greeting(now)}, {name}
        </h1>
        <p className="mt-3 text-xl text-slate-600">{standupStatusSentence(standup)}</p>
        {(approvals > 0 || blocked > 0) && (
          <Link href="/hq/inbox" className="mt-2 inline-flex items-center gap-1 text-base font-medium text-amber-700 hover:underline">
            Also waiting: {approvals > 0 && `${approvals} to approve`}
            {approvals > 0 && blocked > 0 && ' · '}
            {blocked > 0 && `${blocked} blocked`} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      <div className="flex flex-col items-end gap-3">
        {waiting > 0 && (
          <Button size="lg" onClick={startStandup} disabled={run.isPending} className="h-12 rounded-full px-6 text-base font-bold">
            {run.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
            Start standup now
          </Button>
        )}
        {overview && <HqStatus settings={overview.settings} today={overview.today} />}
      </div>
    </header>
  );
}

// ── Goals ──

function GoalBand({
  title,
  goals,
  horizon,
  onEdit,
  onAdd,
  now,
}: {
  title: string;
  goals: HqGoal[];
  horizon: HqGoalHorizon;
  onEdit: (g: HqGoal) => void;
  onAdd: (h: HqGoalHorizon) => void;
  now: Date;
}) {
  const shown = goals.slice(0, GOALS_PER_BAND);
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        {goals.length > GOALS_PER_BAND ? (
          <Link href="/hq/goals" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            +{goals.length - GOALS_PER_BAND} more
          </Link>
        ) : (
          <Link href="/hq/goals" className="text-sm font-medium text-slate-400 hover:text-slate-900">
            All goals
          </Link>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {shown.map((g) => (
          <GoalCard key={g.id} goal={g} onEdit={onEdit} now={now} />
        ))}
        {shown.length < GOALS_PER_BAND && (
          <AddGoalCard label={shown.length === 0 ? `Set ${horizon === 'week' ? 'this week’s' : 'today’s'} goal` : 'Add a goal'} onClick={() => onAdd(horizon)} />
        )}
      </div>
    </div>
  );
}

// ── Agent updates ──

function AgentUpdates({ standup, onOpenTask, onAsk }: { standup: HqStandup; onOpenTask: (id: string) => void; onAsk: (m: HqMemberRef) => void }) {
  const entries = useMemo(() => orderStandupEntries(standup.entries), [standup.entries]);
  // Agents that haven't reported but aren't in `entries` still get a placeholder.
  const listed = new Set(entries.map((e) => e.member.id));
  const extraWaiting = standup.waitingOn.filter((m) => !listed.has(m.id));

  if (entries.length === 0 && extraWaiting.length === 0) {
    return (
      <SoftEmpty emoji="🤖">
        No active agents yet.{' '}
        <Link href="/hq/team" className="underline">
          Hire one
        </Link>{' '}
        and it joins tomorrow’s standup.
      </SoftEmpty>
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((e) => (
        <AgentUpdateCard key={e.member.id} entry={e} onOpenTask={onOpenTask} onAsk={onAsk} />
      ))}
      {extraWaiting.map((m) => (
        <WaitingCard key={m.id} member={m} />
      ))}
    </div>
  );
}

const DEPT_ACCENT: Record<string, string> = {
  leadership: 'border-t-slate-700',
  growth: 'border-t-emerald-500',
  content: 'border-t-violet-500',
  competitions: 'border-t-amber-500',
  engineering: 'border-t-blue-500',
  partners: 'border-t-pink-500',
};

function AgentUpdateCard({ entry, onOpenTask, onAsk }: { entry: HqStandupEntry; onOpenTask: (id: string) => void; onAsk: (m: HqMemberRef) => void }) {
  const { member, standup, working } = entry;
  const [expanded, setExpanded] = useState(false);
  // Which clamped rows actually overflow (measured), so every cut-off row can be expanded.
  const [overflowing, setOverflowing] = useState<Record<string, boolean>>({});
  const reportOverflow = useCallback((key: string, value: boolean) => {
    setOverflowing((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const canExpand = expanded || Object.values(overflowing).some(Boolean);
  if (!standup) return <WaitingCard member={member} title={member.title} working={working} onOpenTask={onOpenTask} />;
  const dept = departmentInfo(member.department);
  const blocked = !!standup.blockers.trim();

  return (
    <article
      className={cn(
        'flex flex-col rounded-3xl border border-t-4 bg-white p-6 shadow-xs',
        blocked ? 'border-red-200 border-t-red-500' : cn('border-slate-200', DEPT_ACCENT[member.department] ?? 'border-t-slate-300')
      )}
    >
      <header className="flex items-center gap-3">
        <MemberAvatar member={member} size="md" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-base font-bold text-slate-900">{member.name}</div>
          <div className="truncate text-xs text-slate-400">
            {dept ? `${dept.emoji} ${dept.name}` : member.title}
          </div>
        </div>
      </header>

      <p className="mt-4 text-xl font-bold leading-snug text-slate-900">{standup.headline}</p>

      <dl className="mt-4 space-y-2 text-sm">
        <UpdateRow icon="⏪" label="Yesterday" text={standup.yesterday} clamp={!expanded} onOverflow={reportOverflow} />
        <UpdateRow icon="▶️" label="Today" text={standup.today} clamp={!expanded} onOverflow={reportOverflow} />
        {/* Blockers need the CEO: always shown in full. */}
        {blocked && <UpdateRow icon="🚧" label="Blocked" text={standup.blockers} danger clamp={false} />}
      </dl>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 self-start text-sm font-semibold text-slate-500 hover:text-slate-900"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-2 pt-5">
        {working && (
          <button
            type="button"
            onClick={() => onOpenTask(working.id)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">#{working.number} {working.title}</span>
          </button>
        )}
        <Button size="sm" variant="outline" className="ml-auto rounded-full" onClick={() => onAsk(member)}>
          <MessageCircle className="h-4 w-4" /> Ask {firstName(member.name)}
        </Button>
      </footer>
    </article>
  );
}

function UpdateRow({
  icon,
  label,
  text,
  danger,
  clamp = true,
  onOverflow,
}: {
  icon: string;
  label: string;
  text: string;
  danger?: boolean;
  clamp?: boolean;
  onOverflow?: (key: string, overflowing: boolean) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  // Measure whether the clamped text is cut off (and re-measure on resize).
  useEffect(() => {
    const el = ref.current;
    if (!el || !onOverflow || !clamp) return;
    const measure = () => onOverflow(label, el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [label, text, clamp, onOverflow]);

  if (!text.trim()) return null;
  return (
    <div className={cn('flex gap-2 rounded-xl px-3 py-2', danger ? 'bg-red-50 text-red-800' : 'bg-slate-50 text-slate-700')}>
      <dt className="shrink-0" title={label} aria-label={label}>
        {icon}
      </dt>
      <dd ref={ref} className={cn('min-w-0 whitespace-pre-wrap break-words', clamp && 'line-clamp-2')}>
        {text}
      </dd>
    </div>
  );
}

function WaitingCard({
  member,
  title,
  working,
  onOpenTask,
}: {
  member: HqMemberRef;
  title?: string;
  working?: HqStandupEntry['working'];
  onOpenTask?: (id: string) => void;
}) {
  return (
    <article className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
      <MemberAvatar member={member} size="lg" className="opacity-60 grayscale" />
      <div>
        <div className="text-base font-bold text-slate-600">{member.name}</div>
        {title && <div className="text-xs text-slate-400">{title}</div>}
      </div>
      <div className="text-sm text-slate-400">⏳ Not reported yet</div>
      {working && onOpenTask && (
        <button type="button" onClick={() => onOpenTask(working.id)} className="text-xs font-medium text-blue-700 hover:underline">
          Working on #{working.number}
        </button>
      )}
    </article>
  );
}

// ── Shared ──

function BigHeading({ title, subtitle, count }: { title: string; subtitle?: string; count?: number }) {
  return (
    <div className="mb-6">
      <h2 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-slate-900">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-violet-600 px-3 py-0.5 text-lg font-bold text-white">{count}</span>
        )}
      </h2>
      {subtitle && <p className="mt-1 text-lg text-slate-500">{subtitle}</p>}
    </div>
  );
}

function SoftEmpty({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl border-2 border-dashed border-slate-200 p-8 text-lg text-slate-500">
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <span>{children}</span>
    </div>
  );
}

function firstName(name: string): string {
  return name.split(/\s+/)[0] || name;
}
