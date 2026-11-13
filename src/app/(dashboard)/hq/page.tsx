'use client';

// HQ: one page for the founder — what needs you, who is working on what, what shipped, and the numbers.
// (Replaces the separate Standup page; the Director page keeps Romero's chat and decision log.)

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Activity, ArrowRight, BellRing, CheckCircle2, ChevronRight, ExternalLink, Gamepad2, Loader2, MessageSquare, Pencil, PlayCircle, Plus, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqAnalytics, useHqBuilds, useHqClock, useHqDirector, useHqInbox, useHqMembers, useHqOverview, useHqPulse, useHqStandup, useHqTasks, useRunHqStandup } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { NEED_REASON_LABELS, buildForTask, firstLine, needsYouItems, outcomeLine, type NeedItem, type NeedReason } from '@/lib/hq-director';
import { tbilisiLongDate } from '@/lib/hq-pulse';
import { goalProgressLabel, goalProgressPct } from '@/lib/hq-standup';
import { stripMarkdown } from '@/lib/hq-markdown';
import { cn } from '@/lib/utils';
import type { HqAnalytics, HqBuild, HqBuildScreenshots, HqPulse, HqGoal, HqGoalHorizon, HqMember, HqStandupEntry, HqTask } from '@/types';
import { GoalDialog } from './goal-ui';
import { HqStatus } from './hq-status';
import { HQ_LABEL, HQ_PAGE, MemberAvatar, errorMessage, useTaskSheet } from './hq-ui';
import { NewTaskDialog } from './new-task-dialog';
import { BuildShots } from './build-shots';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const NONE: never[] = [];
const DONE_FETCH_LIMIT = 60;

// ── Loading and failure: a query that has not answered must never read as "nothing here" ──

type Phase = 'loading' | 'error' | 'ready';
interface Q {
  data?: unknown;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
  refetch?: () => unknown;
}

/** The running tasks that are a running build's own Builder task (shown once, as the build). */
function workingAllIds(tasks: HqTask[], runningBuilds: HqBuild[]): string[] {
  return tasks.filter((t) => !!buildForTask(t, runningBuilds)).map((t) => t.id);
}

/** One state for the queries a section depends on: any failure without data wins, then any still loading. */
function phaseOf(...qs: Q[]): Phase {
  const unanswered = qs.filter((q) => q.data === undefined);
  if (unanswered.some((q) => q.isError)) return 'error';
  // Pending covers a fetch paused offline too: unanswered is never "nothing there".
  if (unanswered.some((q) => q.isLoading || q.isPending)) return 'loading';
  return 'ready';
}

/** Refetches every failed query, including one still showing data from an earlier load. */
function retryAll(qs: Q[]) {
  for (const q of qs) if (q.isError) void q.refetch?.();
}

/** Shows a one-line skeleton or a retry line until the section's data has loaded. */
function Gate({ phase, onRetry, children }: { phase: Phase; onRetry: () => void; children: React.ReactNode }) {
  if (phase === 'loading') {
    return (
      <div role="status" aria-label="Loading" className="py-3">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-slate-700">
        <span>Couldn’t load</span>
        <button type="button" onClick={onRetry} className="font-medium text-slate-950 underline underline-offset-2 hover:text-slate-700">
          Retry
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

// What the founder reads first: a release, then blocked work, then what is his by rule, then Romero asking.
// What shows before "Show more": enough to see the day, not so much that it hides the rest of the page.
const NEEDS_FIRST = 3;
const WORK_FIRST = 3;
const LEGACY_ASK_MAX = 140;
const DONE_FIRST = 4;
const GAMES_FIRST = 4;

const HOME_ORDER: NeedReason[] = ['release', 'blocked', 'money', 'players', 'private', 'public', 'decision', 'plan'];

const TBILISI_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'short', day: 'numeric', month: 'short' });
const TBILISI_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', day: 'numeric', month: 'short' });
const TBILISI_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit', hour12: false });
const TBILISI_LONG_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });

/** A brief whose only line is a short label ("Done today") says nothing on its own: HQ just links to it. */
function briefIsLabel(result: string): boolean {
  const line = briefLine(result);
  return !line || (line.split(/\s+/).length < 4 && line === outcomeLine(result));
}

/** The brief's headline, unless that is only a short label ("Done today"); then its first line of prose. */
function briefLine(result: string): string {
  const heading = outcomeLine(result);
  const prose = firstLine(result);
  if (prose && heading && heading !== prose && heading.split(/\s+/).length < 4) return prose;
  return heading || prose;
}

export default function HqPage() {
  const now = useHqClock();
  const { openTask } = useTaskSheet();
  const directorQ = useHqDirector();
  const membersQ = useHqMembers();
  const [newTask, setNewTask] = useState(false);
  const [allNeeds, setAllNeeds] = useState(false);
  const [allWork, setAllWork] = useState(false);
  const [allDone, setAllDone] = useState(false);
  // "N done today" in the status line shows just today's completions here, until "Show the whole week".
  const [onlyToday, setOnlyToday] = useState(false);
  const [goalDialog, setGoalDialog] = useState<{ goal: HqGoal | null; horizon: HqGoalHorizon } | null>(null);
  const buildsQ = useHqBuilds();
  const overviewQ = useHqOverview();
  const inboxQ = useHqInbox();
  const standupQ = useHqStandup();
  const pulseQ = useHqPulse();
  const analyticsQ = useHqAnalytics(30);
  // Finished work for the "Shipped" feed: fetched rarely, never polled.
  const doneQ = useHqTasks({ status: ['done'], limit: DONE_FETCH_LIMIT }, { refetchInterval: 60_000, staleTime: 30_000 });

  const director = directorQ.data;
  const members = membersQ.data ?? NONE;
  const builds = buildsQ.data ?? NONE;
  const overview = overviewQ.data;
  const inbox = inboxQ.data ?? NONE;
  const standup = standupQ.data;
  const pulse = pulseQ.data;
  const analytics = analyticsQ.data;
  const done = doneQ.data ?? NONE;

  // With a Director, his list is the one queue. Without one: approvals, blocked work and ideas, in that order.
  const needs = useMemo((): NeedItem[] => {
    let items: NeedItem[];
    if (director?.director) items = needsYouItems(director.needsYou, director.plan ?? [], builds);
    else {
      const fallback = [...(overview?.needsApproval ?? []), ...(overview?.blocked ?? []), ...(standup?.proposals ?? [])];
      items = fallback.map((task) => ({ task, reason: task.status === 'blocked' ? 'blocked' : 'decision', build: null }));
    }
    // The three shown first must be the most important: priority, then due date, then the kind of need, then the
    // longest waiting.
    const since = (i: NeedItem) => i.task.director?.escalatedAt ?? i.task.updatedAt;
    return [...items].sort(
      (a, b) =>
        a.task.priority - b.task.priority ||
        (a.task.dueAt ?? '9999').localeCompare(b.task.dueAt ?? '9999') ||
        HOME_ORDER.indexOf(a.reason) - HOME_ORDER.indexOf(b.reason) ||
        since(a).localeCompare(since(b))
    );
  }, [director, builds, overview, standup]);
  const unread = inbox.filter((m) => !m.readAt);
  // The headline counts exactly what the list shows: the unread messages are one line.
  const needsCount = needs.length + (unread.length ? 1 : 0);
  const workingAll = director?.runningNow ?? overview?.inProgress ?? NONE;
  const runningBuilds = builds.filter((b) => b.job && ['building', 'reviewing', 'testing', 'rating'].includes(b.job.stage));
  const queuedBuilds = builds.filter((b) => b.job?.stage === 'queued');
  // A running build's own Builder task is the same work: shown once, as the build.
  // (An older backend has no job.taskId: buildForTask falls back to the "Build #n" title.)
  const buildTasks = new Set(workingAllIds(director?.runningNow ?? overview?.inProgress ?? NONE, runningBuilds));
  const working = workingAll.filter((t) => !buildTasks.has(t.id));
  const shipped = useMemo(() => shippedFeed(done, builds, now), [done, builds, now]);
  // Agents that reported today but aren't running anything: their headline says what they are on.
  // Who is working, from the same data as the Working-now list: agents on running tasks, and the Builder (once)
  // while a build runs.
  const busy = new Set<string | undefined>([
    ...workingAll.filter((t) => t.assignee?.kind === 'agent').map((t) => t.assignee!.id),
    ...(runningBuilds.length ? members.filter((m) => m.slug === 'builder' || (m.runtime as string) === 'hq_code').map((m) => m.id) : []),
  ]);
  // Every agent that reported today, working or not: a busy agent's report can still carry a blocker.
  const reports = (standup?.entries ?? []).filter((e) => e.standup);
  const todayStart = tbilisiDayStart(now);
  // A build still waiting on the founder is not done: its agent reviews show on its Needs-you row, not in Completed.
  const awaitingReview = new Set(needs.filter((n) => n.reason === 'release' && n.build).map((n) => n.build!.id));
  // "Decision on build request #N" names the request; "Code review for build #N" names the Builder's job.
  const reviewOf = (i: Shipped): string | null => buildOfItem(i, builds)?.id ?? null;
  const feedItems = shipped.items.filter((i) => !awaitingReview.has(reviewOf(i) ?? ''));
  const feedTotal = shipped.total - (shipped.items.length - feedItems.length);
  const agentReview = new Map<string, string>();
  for (const i of [...shipped.items].sort((a, b) => b.at.localeCompare(a.at))) {
    const id = reviewOf(i);
    const verdict = i.verdict ?? null;
    if (id && awaitingReview.has(id) && verdict && !agentReview.has(id)) agentReview.set(id, verdict);
  }
  const shippedToday = feedItems.filter((i) => Date.parse(i.at) >= todayStart);
  // Counted from the Completed feed once it is loaded, so the link opens exactly the items it counts.
  const doneToday = phaseOf(doneQ, buildsQ) === 'ready' ? shippedToday.length : director ? (director.doneToday?.length ?? overview?.today.tasksDone) : overview?.today.tasksDone;
  const counted = agentStatusCounts(members, busy);
  // A build runs but no Builder member is loaded (older data): still one agent at work, matching Working now.
  const builderMissing = runningBuilds.length > 0 && !members.some((m) => m.slug === 'builder' || (m.runtime as string) === 'hq_code');
  const allCounts = counted && builderMissing ? { ...counted, running: counted.running + 1 } : counted;

  // Which queries each section waits on. With a Director his list needs the builds; without one, the fallback
  // reads the overview and the standup. Either way the unread messages count.
  const needsSources: Q[] = director?.director ? [directorQ, buildsQ, inboxQ] : director ? [directorQ, overviewQ, standupQ, inboxQ] : [directorQ, inboxQ];
  const workSources: Q[] = [directorQ, buildsQ, ...(director && !director.runningNow ? [overviewQ] : [])];
  // Data shown from an earlier load while its refresh fails: said once, at the top, with one Retry.
  const allQueries: Q[] = [directorQ, membersQ, buildsQ, overviewQ, inboxQ, standupQ, pulseQ, analyticsQ, doneQ];
  const stale = allQueries.some((q) => q.isError && q.data !== undefined);
  const needsPhase = phaseOf(...needsSources);
  const workPhase = phaseOf(...workSources);
  const shippedPhase = phaseOf(doneQ, buildsQ);
  const pulsePhase = phaseOf(pulseQ);
  const gamesPhase = phaseOf(analyticsQ);
  // Who is working comes from the work queries: until they answer, the counts are unknown, not "0 working, all idle".
  const agentCounts = workPhase === 'ready' ? allCounts : null;

  // People-sized: how many agents are at work (the Builder once, however many builds it runs).
  // Only agents count as "at work" (a person's or an unassigned task in progress is work, not an agent).
  const atWork = agentCounts?.running ?? new Set([...working.filter((t) => t.assignee?.kind === 'agent').map((t) => t.assignee!.id), ...(runningBuilds.length ? ['builder'] : [])]).size;
  const lead =
    needsPhase === 'loading'
      ? 'Checking what needs you…'
      : needsPhase === 'error'
        ? 'Can’t load what needs you'
        : needsCount === 0
          ? 'Nothing needs you'
          : unread.length === 0
            ? `${needs.length} ${needs.length === 1 ? 'thing needs' : 'things need'} you`
            : needs.length === 0
              ? `${unread.length} ${unread.length === 1 ? 'message' : 'messages'} for you`
              : `${needs.length} ${needs.length === 1 ? 'item' : 'items'} and ${unread.length} ${unread.length === 1 ? 'message' : 'messages'} need you`;
  const briefAt = director?.brief?.completedAt ? new Date(director.brief.completedAt) : null;
  // Today → "today 15:26"; this week → "Tuesday 15:26"; older → "3 Nov".
  const briefTime = !briefAt
    ? null
    : briefAt.getTime() >= tbilisiDayStart(now)
      ? `today ${TBILISI_TIME.format(briefAt)}`
      : now.getTime() - briefAt.getTime() < 6 * DAY
        ? TBILISI_LONG_TIME.format(briefAt)
        : TBILISI_DATE.format(briefAt);

  const headerActions = (
    <>
      <Button variant="ghost" size="sm" className="h-11 text-slate-600 sm:h-8" onClick={() => setNewTask(true)}>
        <Plus className="h-4 w-4" /> New task
      </Button>
      <Button asChild variant="ghost" size="sm" className="h-11 text-slate-950 sm:h-8">
        <Link href="/hq/director">
          Ask Romero <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </>
  );

  return (
    <div className={cn(HQ_PAGE, 'max-w-6xl space-y-5 sm:space-y-8')}>
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className={HQ_LABEL}>
            <span className="sm:hidden">{TBILISI_DAY.format(now)}</span>
            <span className="hidden sm:inline">{tbilisiLongDate(now)}</span>
          </span>
          <div className="hidden shrink-0 items-center gap-1 sm:flex">{headerActions}</div>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{lead}</h1>
        {/* What agents said: Romero's brief and today's reports, side by side; open reports take their own line. */}
        <div className="flex flex-wrap items-center gap-x-5">
        {director?.brief && (
          <button type="button" onClick={() => openTask(director.brief!.taskId)} className="block min-h-11 max-w-3xl text-left text-sm text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-950 sm:min-h-0">
            {briefIsLabel(director.brief.result) ? `Romero’s brief${briefTime ? `, ${briefTime}` : ''}` : `Romero’s brief${briefTime ? `, ${briefTime}` : ''}: ${briefLine(director.brief.result)}`}
          </button>
        )}
        {standup && <Reports reports={reports} waiting={standup.waitingOn.length} />}
        </div>
        <StatTiles
          doneToday={doneToday}
          doneTodayMore={phaseOf(doneQ, buildsQ) === 'ready' && done.length >= DONE_FETCH_LIMIT && done.every((t) => !!t.completedAt && Date.parse(t.completedAt) >= todayStart)}
          counts={agentCounts}
          onDoneToday={() => setOnlyToday(true)}
        />
        <div>
          {overview ? (
            <HqStatus
              settings={overview.settings}
              today={overview.today}
              compact
              hideSummary
              trailing={<span className="flex items-center sm:hidden [&>*]:px-2">{headerActions}</span>}
            />
          ) : (
            <Gate phase={phaseOf(overviewQ)} onRetry={() => retryAll([overviewQ])}>
              {null}
            </Gate>
          )}
        </div>
        {stale && (
          <p role="status" className="text-[13px] text-amber-800">
            Some numbers couldn’t refresh; you may be seeing older data.{' '}
            <button type="button" onClick={() => retryAll(allQueries)} className="font-medium underline underline-offset-2">
              Retry
            </button>
          </p>
        )}
        {!overview && <div className="flex items-center gap-1 sm:hidden">{headerActions}</div>}
      </header>

      <div className="flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-10">
        {/* Phones: the wrappers dissolve (contents) and `order` reads needs → numbers → completed → games. Desks: two columns that flow on their own. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-10">
          <div className="order-1 min-w-0 space-y-7 lg:space-y-10">
            <Block id="needs" title="Needs your attention" icon={BellRing} tone={needsCount > 0 ? 'attention' : undefined} count={needsPhase === 'ready' ? needs.length + unread.length : undefined}>
              <Gate phase={needsPhase} onRetry={() => retryAll(needsSources)}>
                {needsCount === 0 ? (
                  <Quiet>Nothing is waiting on you.</Quiet>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {(allNeeds ? needs : needs.slice(0, NEEDS_FIRST)).map((n) => (
                      <NeedLine key={n.task.id} item={n} onOpen={openTask} agentReview={n.build ? agentReview.get(n.build.id) : undefined} />
                    ))}
                    {needs.length > NEEDS_FIRST && (
                      <li className="py-2">
                        <button type="button" onClick={() => setAllNeeds((v) => !v)} className="-mx-1 min-h-11 px-1 text-[13px] font-medium text-slate-700 hover:text-slate-950">
                          {allNeeds ? 'Show less' : `Show all ${needs.length}`}
                        </button>
                      </li>
                    )}
                    {unread.length > 0 && (
                      <li className="flex items-center gap-3 py-3">
                        <MessageSquare className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1 text-sm text-slate-800">
                          {unread.length} {unread.length === 1 ? 'message' : 'messages'} from the team · latest from {unread[0].author?.name ?? 'HQ'}: “{firstLine(unread[0].body).slice(0, 90)}”
                        </span>
                        <Link href="/hq/inbox?tab=messages" className="shrink-0 text-[13px] font-medium text-slate-700 hover:text-slate-950">
                          Read
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </Gate>
            </Block>

            <Block
              id="working"
              title="Working now"
              icon={Activity}
              count={workPhase === 'ready' && atWork > 0 ? atWork : undefined}
              action={
                <Link href="/hq/team" className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-950 sm:min-h-0">
                  Team <ArrowRight className="inline h-3.5 w-3.5" />
                </Link>
              }
            >
              <Gate phase={workPhase} onRetry={() => retryAll(workSources)}>
                {working.length + runningBuilds.length === 0 ? (
                  !queuedBuilds.length && (
                    <Quiet>
                      No agent is working right now.
                      {agentCounts ? ` ${agentCounts.idle} idle, ${agentCounts.paused} paused.` : ''}
                    </Quiet>
                  )
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {runningBuilds.slice(0, allWork ? undefined : WORK_FIRST).map((b) => (
                      <li key={b.id}>
                        <Link href="/hq/builds" className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 hover:bg-slate-50 sm:flex-nowrap">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-[11px] font-semibold text-blue-700">B</span>
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-medium text-slate-950">Builder</span> <span className="text-slate-600">· build #{b.number}</span> {b.title}
                        </span>
                        <span className="basis-full pl-10 text-[13px] text-blue-700 sm:basis-auto sm:shrink-0 sm:pl-0">{b.job?.stage}{b.job?.startedAt ? ` · started ${formatRelative(b.job.startedAt)}` : ''}</span>
                        </Link>
                      </li>
                    ))}
                    {working.slice(0, allWork ? undefined : Math.max(0, WORK_FIRST - runningBuilds.length)).map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => openTask(t.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 py-2.5 text-left hover:bg-slate-50 sm:flex-nowrap">
                          <MemberAvatar member={t.assignee} size="sm" />
                          <span className="min-w-0 flex-1 text-sm">
                            <span className="font-medium text-slate-950">{t.assignee?.name ?? 'Unassigned'}</span> <span className="text-slate-600">· #{t.number}</span> {t.title}
                          </span>
                          <span className="basis-full pl-10 text-[13px] text-slate-500 sm:basis-auto sm:shrink-0 sm:pl-0">updated {formatRelative(t.updatedAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {working.length + runningBuilds.length > WORK_FIRST && (
                  <button type="button" onClick={() => setAllWork((v) => !v)} className="-mx-1 min-h-11 px-1 text-[13px] font-medium text-slate-700 hover:text-slate-950">
                    {allWork ? 'Show less' : `Show all ${working.length + runningBuilds.length}`}
                  </button>
                )}
                {queuedBuilds.length > 0 && (
                  <details className="group text-[13px] text-slate-600">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center hover:text-slate-950 sm:min-h-8">
                      <ChevronRight className="mr-1 h-3.5 w-3.5 transition group-open:rotate-90" aria-hidden />
                      {queuedBuilds.length} {queuedBuilds.length === 1 ? 'build' : 'builds'} queued
                    </summary>
                    <ul className="space-y-1 pb-1 pl-5">
                      {queuedBuilds.map((b) => (
                        <li key={b.id}>build #{b.number} {b.title}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </Gate>
            </Block>
          </div>
          <div className="order-3 min-w-0">
            <Block
              id="completed"
              icon={CheckCircle2}
              title={onlyToday ? 'Completed today' : 'Completed'}
              note={shippedPhase !== 'ready' ? 'last 7 days' : onlyToday ? `${shippedToday.length} ${shippedToday.length === 1 ? 'item' : 'items'}` : `${feedTotal}${shipped.totalIsLowerBound ? '+' : ''} ${feedTotal === 1 ? 'item' : 'items'} in the last 7 days`}
            >
              <Gate phase={shippedPhase} onRetry={() => retryAll([doneQ, buildsQ])}>
                {feedItems.length === 0 && !onlyToday ? (
                  <Quiet>Nothing finished in the last 7 days.</Quiet>
                ) : (
                  (() => {
                    const lines = feedLines(onlyToday ? shippedToday : feedItems, builds);
                    const shown = allDone ? lines : lines.slice(0, DONE_FIRST);
                    return (
                      <>
                        {onlyToday && (
                          <p className="text-[13px] text-slate-600">
                            Today only.{' '}
                            <button type="button" onClick={() => setOnlyToday(false)} className="min-h-11 font-medium text-slate-800 underline underline-offset-2 sm:min-h-0">
                              Show the whole week
                            </button>
                          </p>
                        )}
                        {onlyToday && lines.length === 0 && <Quiet>Nothing finished yet today.</Quiet>}
                        <ul className="divide-y divide-slate-100">
                          {shown.map((line) => (
                            <CompletedLine key={line.key} line={line} analytics={analytics} onOpen={openTask} />
                          ))}
                        </ul>
                        {lines.length > DONE_FIRST && (
                          <button type="button" onClick={() => setAllDone((v) => !v)} className="-mx-1 min-h-11 px-1 text-[13px] font-medium text-slate-700 hover:text-slate-950">
                            {allDone ? 'Show less' : 'Show more'}
                          </button>
                        )}
                        {(allDone || lines.length <= DONE_FIRST) && shipped.totalIsLowerBound && (
                          <p className="text-[13px] text-slate-600">
                            Showing the latest {feedItems.length} ·{' '}
                            <Link href="/hq/board" className="font-medium text-slate-800 underline underline-offset-2 hover:text-slate-950">
                              View all in Work
                            </Link>
                          </p>
                        )}
                      </>
                    );
                  })()
                )}
              </Gate>
            </Block>
          </div>
        </div>
        <div className="contents lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:gap-10">
          <div className="order-2 min-w-0">
            {(standup || pulse || standupQ.isError) && (
              <PulsePanel
                northStar={standup?.goals.northStar ?? null}
                week={standup?.goals.week ?? []}
                day={standup?.goals.day ?? []}
                pulse={pulse}
                pulsePhase={pulsePhase}
                goalsPhase={phaseOf(standupQ)}
                onRetry={() => retryAll([pulseQ])}
                onRetryGoals={() => retryAll([standupQ])}
                onEdit={(goal) => setGoalDialog({ goal, horizon: goal.horizon })}
                onAdd={(horizon) => setGoalDialog({ goal: null, horizon })}
              />
            )}
          </div>
          <div className="order-4 min-w-0">
            {gamesPhase !== 'ready' ? (
              <Block title="Game plays" icon={Gamepad2}>
                <Gate phase={gamesPhase} onRetry={() => retryAll([analyticsQ])}>
                  {null}
                </Gate>
              </Block>
            ) : (
              analytics && <GamesBlock analytics={analytics} />
            )}
          </div>
        </div>
      </div>

      <NewTaskDialog open={newTask} onOpenChange={setNewTask} members={members} />
      <GoalDialog open={!!goalDialog} onOpenChange={(o) => !o && setGoalDialog(null)} goal={goalDialog?.goal} defaultHorizon={goalDialog?.horizon} />
    </div>
  );
}

/** Agents by what they are doing now: running a task, on and idle, or paused. Archived and human members are left out. */
function agentStatusCounts(members: HqMember[], busy: Set<string | undefined>): { running: number; idle: number; paused: number } | null {
  const agents = members.filter((m) => m.kind === 'agent' && m.status !== 'archived');
  if (agents.length === 0) return null;
  const active = agents.filter((m) => m.status === 'active');
  const running = active.filter((m) => busy.has(m.id)).length;
  return { running, idle: active.length - running, paused: agents.length - active.length };
}

// ── Pieces ──

function Block({ id, title, icon: Icon, count, tone, note, action, children }: {
  id?: string; title: string; icon?: LucideIcon; count?: number; tone?: 'attention'; note?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 overflow-hidden rounded-lg border bg-white', tone === 'attention' ? 'border-amber-300 shadow-sm' : 'border-slate-200')}>
      <div className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b px-4 py-2.5', tone === 'attention' ? 'border-amber-200 bg-amber-50' : 'border-slate-100')}>
        {Icon && (
          <span className={cn('grid h-6 w-6 place-items-center rounded-md', tone === 'attention' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600')}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-950">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className={cn('rounded-full px-2 text-[12px] font-semibold tabular-nums', tone === 'attention' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-700')}>{count}</span>
        )}
        {note && <span className="text-[13px] text-slate-500">· {note}</span>}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="px-4 py-2">{children}</div>
    </section>
  );
}

/** Today at a glance: four numbers, each a way in (today's completions, the team). */
function StatTiles({ doneToday, doneTodayMore = false, counts, onDoneToday }: {
  doneToday: number | undefined;
  /** Every loaded completion is from today and more were not loaded: the number is a floor ("60+"). */
  doneTodayMore?: boolean; counts: { running: number; idle: number; paused: number } | null | undefined; onDoneToday: () => void;
}) {
  const tile = 'flex min-h-14 min-w-0 flex-col justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-2 transition hover:border-slate-300 hover:shadow-sm sm:min-h-16 sm:px-4 sm:py-2.5';
  const num = 'text-xl font-semibold tabular-nums tracking-tight text-slate-950 sm:text-2xl';
  const label = 'truncate text-[11px] font-medium text-slate-500 sm:text-[12px]';
  return (
    <div className="grid grid-cols-4 gap-2 pt-1 sm:gap-3">
      <a href="#completed" onClick={onDoneToday} className={tile}>
        <span className={num}>{doneToday === undefined ? '–' : `${doneToday}${doneTodayMore ? '+' : ''}`}</span>
        <span className={label}>Done today</span>
      </a>
      <Link href="/hq/team" className={tile}>
        <span className={cn(num, 'flex items-center gap-2')}>
          {counts?.running ?? '–'}
          {!!counts?.running && <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
        </span>
        <span className={label}>Working</span>
      </Link>
      <Link href="/hq/team" className={tile}>
        <span className={num}>{counts?.idle ?? '–'}</span>
        <span className={label}>Idle</span>
      </Link>
      <Link href="/hq/team" className={tile}>
        <span className={cn(num, counts?.paused ? 'text-slate-500' : '')}>{counts?.paused ?? '–'}</span>
        <span className={label}>Paused</span>
      </Link>
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-slate-500">{children}</p>;
}

/** The ask a row actually shows: a stated request, or an older explanation short enough to show whole. */
function shownAsk(item: NeedItem): { lead: string; text: string } | null {
  const ask = needAsk(item);
  return ask && (ask.lead === 'Needs' || ask.text.length <= LEGACY_ASK_MAX) ? ask : null;
}

function needAction(item: NeedItem): string {
  if (item.reason === 'release') return item.build?.job?.stage === 'published' ? 'Review PR' : 'Review build';
  // "Unblock" only when the row says what is in the way; otherwise just open it.
  if (item.reason === 'blocked') return shownAsk(item) ? 'Unblock' : 'Open';
  if (item.reason === 'plan') return 'Review plan';
  return 'Open';
}

const NEED_BADGE = {
  red: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  slate: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
} as const;
function badgeTone(item: NeedItem): keyof typeof NEED_BADGE {
  if (item.reason === 'blocked') return 'red';
  if (item.reason === 'release') return 'amber';
  if (item.reason === 'plan') return 'blue';
  return 'slate';
}

function needReasonLabel(item: NeedItem): string {
  // A build that is ready but has no PR yet is not "a PR to merge".
  if (item.reason === 'release' && item.build?.job?.stage === 'ready_to_publish') return 'Your review';
  // Only labels that are facts. "Costs money", "Players", "Public"… are guessed from keywords, so they say "Needs input".
  if (item.reason === 'release' || item.reason === 'blocked' || item.reason === 'plan') return NEED_REASON_LABELS[item.reason];
  return 'Needs input';
}

/**
 * What the row asks of the founder, in one sentence he can read without opening it: for blocked work the blocker
 * (the agent's result says why it stopped), otherwise Romero's note, otherwise the task's own first line.
 */
/** The "Need from you: …" line agents and Romero open blocked work and escalations with (see the worker's prompts). */
const NEED_LINE = /^\s*(?:[*_]{0,2})need from you\s*:?\s*(?:[*_]{0,2})\s*(.+)$/im;
function needLine(md: string | null | undefined): string | null {
  const m = md ? NEED_LINE.exec(md) : null;
  const text = m ? stripMarkdown(m[1]).trim() : '';
  return text || null;
}

function needAsk(item: NeedItem): { lead: string; text: string } | null {
  const { task, reason } = item;
  // A build to review: its spec is background, not the decision.
  if (reason === 'release') return null;
  // The concrete request first, when the agent or Romero wrote one.
  const need = needLine(task.director?.note) ?? (task.status === 'blocked' ? needLine(task.result) : null) ?? needLine(task.body);
  if (need) return { lead: 'Needs', text: need };
  if (reason === 'blocked' || task.status === 'blocked') {
    const why = firstLine(task.result).replace(/^could not do this:\s*/i, '');
    if (why) return { lead: 'Blocked by', text: why };
  }
  const note = task.director?.note ? stripMarkdown(task.director.note).trim() : '';
  if (note) return { lead: 'Romero', text: note };
  const body = firstLine(task.body).replace(/^(goal|why|context|problem|task)\s*:\s*/i, '');
  // A description that only repeats the title adds nothing.
  const plain = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return body && !plain(body).startsWith(plain(task.title).slice(0, 40)) ? { lead: 'Asks', text: body } : null;
}

function NeedLine({ item, onOpen, agentReview }: { item: NeedItem; onOpen: (id: string) => void; agentReview?: string }) {
  const { task, reason } = item;
  const ask = needAsk(item);
  const since = task.director?.escalatedAt ?? task.updatedAt;
  return (
    <li className="py-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(task.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(task.id);
          }
        }}
        className="group flex cursor-pointer flex-col gap-2 rounded-md px-2 py-1 -mx-2 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:flex-row sm:items-center sm:gap-4"
      >
        <MemberAvatar member={task.assignee ?? null} size="sm" className="mt-0.5 hidden shrink-0 sm:flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide', NEED_BADGE[badgeTone(item)])}>{needReasonLabel(item)}</span>
            <span className="text-[13px] text-slate-500">
              {task.assignee?.name ?? 'Unassigned'} · {formatRelative(since)}
            </span>
          </div>
          {ask?.lead === 'Needs' ? (
            // The agent stated the request: it is the sentence to read; the task's title is context.
            <>
              <div className="mt-1.5 text-[15px] font-semibold text-slate-950">{ask.text}</div>
              <div className="mt-0.5 line-clamp-1 text-[13px] text-slate-600">{task.title}</div>
            </>
          ) : (
            <>
              <div className="mt-1.5 text-[15px] font-semibold text-slate-950">{task.title}</div>
              {ask && ask.text.length <= LEGACY_ASK_MAX ? (
                <p className="mt-0.5 text-[13px] text-slate-600">
                  <span className="text-slate-800">{ask.lead}:</span> {ask.text}
                </p>
              ) : reason === 'blocked' ? (
                <p className="mt-0.5 text-[13px] text-slate-500">{ask ? 'The reason is in the task.' : 'No reason recorded.'}</p>
              ) : null}
            </>
          )}
          {agentReview && <p className="mt-0.5 text-[13px] text-slate-600">Agent check: {agentReview.replace(/^agent /, '')}</p>}
        </div>
        <span className="inline-flex h-9 shrink-0 items-center gap-1 self-start rounded-md border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-900 group-hover:border-slate-400 sm:self-center">
          {needAction(item)} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </li>
  );
}

function Reports({ reports, waiting }: { reports: HqStandupEntry[]; waiting: number }) {
  const run = useRunHqStandup();
  const start = () =>
    run.mutate(undefined, {
      onSuccess: ({ created }) => toast.success(created > 0 ? `Standup started: ${created} ${created === 1 ? 'agent is' : 'agents are'} preparing an update` : 'Everyone is already on it'),
      onError: (e) => toast.error(errorMessage(e, 'Could not start the standup')),
    });
  return (
    <details className="group text-[13px] open:basis-full">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-slate-600 hover:text-slate-950 sm:min-h-0 sm:py-1">
        <span>
          <ChevronRight className="mr-1 inline h-3.5 w-3.5 transition group-open:rotate-90" />
          Today’s reports{reports.length ? ` (${reports.length})` : ''}
          {reports.some((r) => r.standup?.blockers.trim()) && <span className="ml-1 text-red-700">· a blocker</span>}
        </span>
        {waiting > 0 && <span className="text-slate-500">{waiting} not reported</span>}
      </summary>
      {/* Its own button inside the open reports, never nested in the toggle. */}
      {waiting > 0 && (
        <button type="button" onClick={start} disabled={run.isPending} className="ml-5 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-slate-950 disabled:opacity-50 sm:min-h-8">
          {run.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Ask the {waiting} to report now
        </button>
      )}
      {reports.length === 0 ? (
        <p className="mt-1 pl-5 text-slate-500">No reports yet today.</p>
      ) : (
        <ul className="mt-1 space-y-1 pl-5">
          {reports.map((entry) => (
            <ReportLine key={entry.member.id} entry={entry} />
          ))}
        </ul>
      )}
    </details>
  );
}

/** One agent's report: headline (and blocker) in one line, the full yesterday / today / blocker on demand. */
function ReportLine({ entry }: { entry: HqStandupEntry }) {
  const [open, setOpen] = useState(false);
  const { member, standup } = entry;
  if (!standup) return null;
  const blocker = standup.blockers.trim();
  return (
    <li className="text-[13px] text-slate-700">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-11 w-full py-2 text-left hover:text-slate-950 sm:min-h-0 sm:py-0.5">
        <span className="font-medium text-slate-950">{member.name}:</span> {standup.headline}
        {blocker && <span className="text-red-700"> · blocked: {firstLine(blocker)}</span>}
        <span className="ml-1 text-slate-500 underline underline-offset-2">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <dl className="mt-1 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 pl-3">
          {standup.yesterday.trim() && (
            <>
              <dt className={HQ_LABEL}>Yesterday</dt>
              <dd className="whitespace-pre-wrap">{standup.yesterday}</dd>
            </>
          )}
          {standup.today.trim() && (
            <>
              <dt className={HQ_LABEL}>Today</dt>
              <dd className="whitespace-pre-wrap">{standup.today}</dd>
            </>
          )}
          {blocker && (
            <>
              <dt className={cn(HQ_LABEL, 'text-red-700')}>Blocked</dt>
              <dd className="whitespace-pre-wrap text-red-800">{blocker}</dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}

// ── Completed: one newest-first feed ──

interface FeedLine {
  key: string;
  /** Newest item first. */
  items: Shipped[];
  at: string;
  who: string;
  /** "Published quiz page" when several items share that label. */
  label: string | null;
  build: Shipped | null;
}

/**
 * Builds and finished work in one list, newest first. Several items from one agent that share a title label
 * ("Published quiz page: …") become one line; everything else is a line of its own.
 */
/** Midnight today in Tbilisi, as a timestamp (HQ counts days in Tbilisi time). */
function tbilisiDayStart(now: Date): number {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return Date.parse(`${day}T00:00:00+04:00`);
}

/**
 * The build a finished task is about: "Decision on build request #N" names the request, "Code review for build #N"
 * names the Builder's job. Without the builds loaded, the number alone (request and job numbers then may differ).
 */
function buildOfItem(item: Shipped, builds: HqBuild[]): { id: string; number: number } | null {
  const m = item.isBuild ? null : /\bbuild (request )?#(\d+)/i.exec(item.title);
  if (!m) return null;
  const n = Number(m[2]);
  const b = m[1] ? builds.find((x) => x.number === n) : builds.find((x) => x.job?.number === n);
  return b ? { id: b.id, number: b.number } : { id: `n${n}`, number: n };
}

function feedLines(items: Shipped[], builds: HqBuild[] = []): FeedLine[] {
  const lines: FeedLine[] = [];
  const byLabel = new Map<string, FeedLine>();
  for (const item of [...items].sort((a, b) => b.at.localeCompare(a.at))) {
    if (item.isBuild) {
      lines.push({ key: item.key, items: [item], at: item.at, who: item.who, label: null, build: item });
      continue;
    }
    const i = item.title.indexOf(': ');
    const build = buildOfItem(item, builds);
    // The very same title from one agent first (×N), then work about one build (its reviews and decision), then a
    // shared label from one agent ("Published quiz page: …").
    const same = byLabel.get(`${item.who}\u0000=${item.title}`);
    if (same) {
      same.items.push(item);
      continue;
    }
    const label = build ? `Build #${build.number}` : i > 0 && i < 50 ? item.title.slice(0, i) : null;
    const groupKey = build ? `build\u0000${build.id}` : label ? `${item.who}\u0000${label}` : `${item.who}\u0000=${item.title}`;
    const existing = byLabel.get(groupKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const line: FeedLine = { key: item.key, items: [item], at: item.at, who: item.who, label, build: null };
    lines.push(line);
    byLabel.set(groupKey, line);
    byLabel.set(`${item.who}\u0000=${item.title}`, line);
  }
  return lines;
}

/** A review's verdict in plain words ("review passed"), when the agent's result says so; the exact text stays in Details. */
function plainResult(outcome: string | null | undefined): string | null {
  if (!outcome) return null;
  // The last explicit verdict wins (a long review can mention an earlier one before its conclusion).
  const last = [...outcome.matchAll(/verdict:\s*(ship|fix)\b/gi)].at(-1)?.[1]?.toLowerCase();
  if (last) return last === 'ship' ? 'agent review passed' : 'agent review asked for fixes';
  // Only an explicit verdict counts as a pass ("no P0" alone could still report a P1).
  if (/\bno (confirmed )?p0\s*\/\s*p1\s*\/\s*p2\b/i.test(outcome)) return 'agent review passed';
  // A finding counts only when it is stated, not denied ("No P0 or P1 issues found" is not one).
  const found = outcome
    .split(/[\n.;,]|\b(?:but|while|however|and)\b/i)
    .some((c) => /\bp[01]\b.*\bfound\b/i.test(c) && !/\b(no|zero|0|none|without)\b.*\bp[01]\b/i.test(c));
  if (found) return 'agent review asked for fixes';
  if (/^i approved\b/i.test(outcome)) return 'approved by Romero';
  return null;
}

function lineText(line: FeedLine): string {
  const [first, ...rest] = line.items;
  if (rest.length && rest.every((i) => i.title === first.title)) return `${first.title} ×${line.items.length}`;
  if (line.label?.startsWith('Build #') && rest.length) {
    // Lead with where it ended: the newest review's result (or title); who reviewed it is in the details.
    return `${line.label}: ${first.verdict ?? plainResult(first.outcome) ?? (first.outcome && first.outcome.length > 12 ? first.outcome : first.title)}`;
  }
  if (line.label && rest.length) {
    // The count leads; the names are in the expansion.
    return `${line.label} ×${line.items.length}`;
  }
  return rest.length ? `${first.title} ×${line.items.length}` : first.title;
}

/** A result worth a line: a review verdict, or one short plain sentence; long explanations stay in the task. */
function shortResult(item: Shipped, minLength = 26): string | null {
  if (!item.outcome) return null;
  const plain = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const first = firstLine(stripMarkdown(item.outcome)).trim();
  return (
    item.verdict ??
    plainResult(item.outcome) ??
    (first.length >= minLength && first.length <= 90 && !/^verdict\b/i.test(first) && !plain(first).startsWith(plain(item.title).slice(0, 30)) ? first : null)
  );
}

function CompletedLine({ line, analytics, onOpen }: { line: FeedLine; analytics: HqAnalytics | undefined; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  // One plain task opens straight away; groups and builds expand in place.
  const single = !line.build && line.items.length === 1 ? line.items[0] : null;
  // A result line earns its place only when it adds something: not a repeat of the title, not a two-word label.
  const outcome = single ? shortResult(single) : null;
  return (
    <li className="py-2">
      <button
        type="button"
        onClick={() => (single?.taskId ? onOpen(single.taskId) : setOpen((v) => !v))}
        aria-expanded={single ? undefined : open}
        className="flex min-h-11 w-full items-start gap-3 rounded-md text-left hover:bg-slate-50"
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-medium text-slate-950">
            {line.build && <span className="mr-1.5 font-normal text-emerald-700">On staging ·</span>}
            {lineText(line)}
          </span>
          {outcome && <span className="mt-0.5 line-clamp-2 text-[13px] text-slate-700">{outcome}</span>}
          <span className="mt-0.5 block text-[13px] text-slate-500">
            {/* A build's line already names who reviewed it. */}
            {line.label?.startsWith('Build #') && line.items.length > 1 ? formatRelative(line.at) : `${line.who} · ${formatRelative(line.at)}`}
          </span>
        </span>
        <span className="shrink-0 py-1 text-[13px] text-slate-700">
          {single ? 'Open' : <ChevronRight aria-label={open ? 'Hide' : 'Details'} className={cn('h-4 w-4 transition', open && 'rotate-90')} />}
        </span>
      </button>
      {open &&
        (line.build ? (
          <div className="mt-2">
            <ShippedItem item={line.build} analytics={analytics} onOpen={onOpen} />
          </div>
        ) : (
          <ul className="mt-2 space-y-1.5 pl-3">
            {line.items.map((i) => (
              <li key={i.key} className="text-[13px]">
                <button type="button" disabled={!i.taskId} onClick={() => i.taskId && onOpen(i.taskId)} className="min-h-11 text-left font-medium text-slate-900 enabled:hover:underline sm:min-h-0">
                  {i.title}
                </button>
                <span className="text-slate-500">
                  {' '}
                  · {i.who} · {formatRelative(i.at)}
                </span>
                {shortResult(i, 4) && <span className="text-slate-600"> — {shortResult(i, 4)}</span>}
                {i.screenshot && (
                  <a href={i.screenshot} target="_blank" rel="noreferrer noopener" className="ml-1 text-slate-700 underline">
                    screenshot
                  </a>
                )}
              </li>
            ))}
          </ul>
        ))}
    </li>
  );
}

// ── The numbers: North Star, goals and yesterday in one place ──

function PulsePanel({ northStar, week, day, pulse, pulsePhase, goalsPhase, onRetry, onRetryGoals, onEdit, onAdd }: {
  northStar: HqGoal | null; week: HqGoal[]; day: HqGoal[]; pulse: HqPulse | undefined; pulsePhase: Phase; goalsPhase: Phase;
  onRetry: () => void; onRetryGoals: () => void;
  onEdit: (g: HqGoal) => void; onAdd: (h: HqGoalHorizon) => void;
}) {
  const goals = [...week, ...day];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {/* The target first, then yesterday's numbers in one aligned list (one way to read every number). */}
      {goalsPhase !== 'ready' ? (
        <Gate phase={goalsPhase} onRetry={onRetryGoals}>
          {null}
        </Gate>
      ) : northStar ? (
        <button type="button" onClick={() => onEdit(northStar)} className="group block w-full text-left" aria-label={`Edit the North Star: ${northStar.title}`}>
          <div className={cn(HQ_LABEL, 'flex items-center justify-between')}>
            North Star
            {/* Visible on touch screens; on a desk it shows on hover or focus. */}
            <Pencil className="h-3.5 w-3.5 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100" aria-hidden />
          </div>
          <div className="mt-1 text-[15px] font-medium text-slate-950">{northStar.title}</div>
          <div className="mt-0.5 text-[13px] text-slate-500">by {formatGoalEnd(northStar.periodEnd)}</div>
        </button>
      ) : (
        <button type="button" onClick={() => onAdd('north_star')} className="min-h-11 text-sm font-medium text-slate-700 hover:text-slate-950">
          Set the North Star
        </button>
      )}

      {pulse && <Trend points={pulse.series.slice(0, -1).map((p) => p.activePlayers)} />}

      <div className="mt-4">
        <div className={cn(HQ_LABEL, 'flex justify-between')}>
          <span>Yesterday</span>
          <span className="text-[12px] normal-case tracking-normal">vs prior day</span>
        </div>
        <Gate phase={pulsePhase} onRetry={onRetry}>
          {pulse && (
            <dl className="mt-1 divide-y divide-slate-100 text-sm">
              <NumberRow label="Active players" now={pulse.yesterday.activePlayers} before={pulse.series.at(-3)?.activePlayers} />
              <NumberRow label="New players" now={pulse.yesterday.newUsers} before={pulse.series.at(-3)?.newUsers} />
              <NumberRow label="Online matches" now={pulse.yesterday.matches} before={pulse.series.at(-3)?.matches} />
            </dl>
          )}
        </Gate>
      </div>

      {goalsPhase === 'ready' && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-[13px]">
          {goals.map((g) => {
            const p = goalProgressPct(g);
            return (
              <button key={g.id} type="button" onClick={() => onEdit(g)} className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-slate-700 hover:text-slate-950 sm:min-h-9">
                <span className="min-w-0">
                  <span className="text-slate-500">{g.horizon === 'day' ? 'Today' : 'This week'}:</span> {g.title}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">{p === null ? goalProgressLabel(g) : `${p}%`}</span>
              </button>
            );
          })}
          <Link href="/hq/goals" className="inline-flex min-h-11 items-center text-slate-600 hover:text-slate-950">
            {goals.length ? 'All goals' : 'Set this week’s and today’s goals'} <ArrowRight className="ml-1 h-3.5 w-3.5 self-center" />
          </Link>
        </div>
      )}
    </section>
  );
}

/** Active players per day (oldest → yesterday): a small line so the direction shows before the numbers. */
function Trend({ points }: { points: number[] }) {
  const last = points.slice(-14);
  if (last.length < 2) return null;
  const max = Math.max(...last, 1);
  const w = 100;
  const h = 32;
  const xy = last.map((v, i) => [(i / (last.length - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-10 w-full" role="img" aria-label={`Active players, last ${last.length} days`}>
        <polygon points={`0,${h} ${line} ${w},${h}`} className="fill-emerald-500/10" />
        <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" className="stroke-emerald-600" strokeWidth={1.75} strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[11px] text-slate-500">
        <span>Active players, {last.length} days</span>
        <span className="tabular-nums">peak {max.toLocaleString()}</span>
      </figcaption>
    </figure>
  );
}

const GOAL_END = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function formatGoalEnd(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : GOAL_END.format(d);
}

function NumberRow({ label, now, before }: { label: string; now: number; before: number | undefined }) {
  const diff = before === undefined ? null : now - before;
  return (
    <div className="grid grid-cols-[1fr_auto_4.5rem] items-baseline gap-3 py-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="contents tabular-nums">
        <span className="text-right font-semibold text-slate-950">{now.toLocaleString()}</span>
        {diff === null ? <span /> : (
          <span className={cn('text-right text-[13px]', diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-red-700' : 'text-slate-500')}>
            {diff === 0 ? 'same' : `${diff > 0 ? '+' : ''}${diff.toLocaleString()}`}
          </span>
        )}
      </dd>
    </div>
  );
}

// ── Games: plays this week against last week ──

function weekSums(analytics: HqAnalytics): Array<{ mode: string; label: string; thisWeek: number; lastWeek: number | null }> {
  const days = [...analytics.modesByDay].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  // By calendar date, counting back from the newest day: a missing day is a gap, never the other week's day.
  const lastDay = windowEnd(days.map((r) => String(r.date).slice(0, 10)), new Date());
  const ageOf = (r: (typeof days)[number]) => Math.round((lastDay - Date.parse(`${String(r.date).slice(0, 10)}T00:00:00Z`)) / DAY);
  const curr = days.filter((r) => ageOf(r) >= 0 && ageOf(r) < 7);
  const prev = days.filter((r) => ageOf(r) >= 7 && ageOf(r) < 14);
  // The earlier week is shown only when every one of its days is there.
  const prevComplete = new Set(prev.map(ageOf)).size === 7;
  const modes = Object.keys(analytics.modeLabels ?? {}).length ? Object.keys(analytics.modeLabels) : analytics.modes.map((m) => m.mode);
  const sum = (rows: typeof days, m: string) => rows.reduce((n, r) => n + (Number(r[m]) || 0), 0);
  return modes
    .map((m) => ({ mode: m, label: analytics.modeLabels?.[m] ?? m, thisWeek: sum(curr, m), lastWeek: prevComplete ? sum(prev, m) : null }))
    .filter((g) => g.thisWeek + (g.lastWeek ?? 0) > 0)
    // Named games first; the "Other" bucket last.
    .sort((a, b) => Number(a.label === 'Other') - Number(b.label === 'Other') || b.thisWeek - a.thisWeek);
}

/** "Football Draft (room)" → "Football Draft", unless another listed mode of the same game needs the distinction. */
function shortGameLabel(label: string, all: string[]): string {
  const base = label.replace(/\s*\((room|duel|daily|friends room)\)$/i, '');
  return all.filter((l) => l !== label && l.startsWith(base)).length ? label : base;
}

const TBILISI_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * How many days of the "last 7" window (counted back from the newest day, as weekSums does) the analytics hold;
 * a window ending before yesterday (Tbilisi) is stale, so its missing recent days count as missing too.
 */
function recordedDays(analytics: HqAnalytics, now: Date): number {
  const keys = analytics.modesByDay.map((r) => String(r.date).slice(0, 10));
  const end = windowEnd(keys, now);
  return new Set(keys.map((k) => Math.round((end - Date.parse(`${k}T00:00:00Z`)) / DAY)).filter((a) => a >= 0 && a < 7)).size;
}

/** The last day of the "last 7 days": yesterday in Tbilisi, or today once today's plays are in. Never older. */
function windowEnd(keys: string[], now: Date): number {
  const yesterday = Date.parse(`${TBILISI_KEY.format(new Date(now.getTime() - DAY))}T00:00:00Z`);
  const newest = keys.length ? Math.max(...keys.map((k) => Date.parse(`${k}T00:00:00Z`))) : yesterday;
  return Math.max(newest, yesterday);
}

function GamesBlock({ analytics }: { analytics: HqAnalytics }) {
  const games = weekSums(analytics);
  const recorded = recordedDays(analytics, new Date());
  return (
    <Block title="Game plays" icon={Gamepad2}>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[12px] text-slate-500">
            <th className="pb-1 text-left font-normal"><span className="sr-only">Game</span></th>
            <th className="whitespace-nowrap pb-1 pl-3 text-right font-normal">Last 7 days</th>
            <th className="whitespace-nowrap pb-1 pl-3 text-right font-normal">Previous 7 days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {games.slice(0, GAMES_FIRST).map((g) => {
            return (
              <tr key={g.mode} title={`${g.thisWeek} plays in the last 7 days, ${g.lastWeek === null ? 'not every day of the 7 before is recorded' : `${g.lastWeek} in the 7 before`}`}>
                <td className="py-1.5 pr-2 text-slate-700">{g.mode === 'daily' ? 'All daily games' : shortGameLabel(g.label, games.map((x) => x.label))}</td>
                <td className="py-1.5 text-right text-slate-950">{g.thisWeek}</td>
                {/* Counts, not percentages: small bases make +383% look bigger than it is. */}
                <td className="py-1.5 pl-3 text-right text-[13px] text-slate-500">
                  {g.lastWeek ?? '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {recorded < 7 && <p className="mt-1 text-[12px] text-amber-800">Only {recorded} of the last 7 days are recorded: the totals are partial.</p>}
      <Link href="/hq/analytics" className="mt-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-950">
        View game analytics <ArrowRight className="inline h-3.5 w-3.5" />
      </Link>
    </Block>
  );
}

// ── Shipped feed ──

interface Shipped {
  key: string;
  isBuild: boolean;
  at: string;
  title: string;
  kind: string;
  who: string;
  outcome: string;
  prs: Array<{ repo: string; url: string }>;
  screenshot: string | null;
  taskId: string | null;
  /** Builds: the game named on the request, and the play-test screenshots. */
  game?: string | null;
  shots?: HqBuildScreenshots | null;
  /** A review's verdict in plain words, read from the whole result (the verdict is often its last line). */
  verdict?: string | null;
}

const IMG = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/;

interface ShippedFeed {
  /** Newest first, capped. */
  items: Shipped[];
  /** Everything that qualified before the cap. */
  total: number;
  /** The finished-tasks query hit its own limit, so `total` may be higher. */
  totalIsLowerBound: boolean;
}

/**
 * What finished in the last 7 days. A build counts only once it is merged to staging (stage `done`); a build with a
 * draft PR is not shipped, it is waiting for the founder and lives under Needs you.
 */
function shippedFeed(done: HqTask[], builds: HqBuild[], now: Date): ShippedFeed {
  const since = now.getTime() - WEEK;
  const buildTaskIds = new Set(done.filter((t) => buildForTask(t, builds)).map((t) => t.id));
  const fromBuilds: Shipped[] = builds
    .filter((b) => b.job?.stage === 'done' && b.job.finishedAt && Date.parse(b.job.finishedAt) >= since)
    .map((b) => ({
      key: `b-${b.id}`,
      isBuild: true,
      at: b.job!.finishedAt!,
      title: b.title,
      kind: b.kind === 'bug_fix' ? 'Fix' : b.kind === 'feature' ? 'Feature' : 'Build',
      who: 'Builder',
      outcome: '',
      prs: (b.job!.prs ?? []).filter((p) => /^https?:\/\//.test(p.url)),
      screenshot: null,
      taskId: b.job!.taskId ?? null,
      game: b.game ?? null,
      shots: b.job!.screenshots ?? null,
    }));
  const fromTasks: Shipped[] = done
    .filter((t) => t.completedAt && Date.parse(t.completedAt) >= since && !buildTaskIds.has(t.id) && (t.kind === 'task' || t.kind === 'proposal'))
    .map((t) => ({
      key: `t-${t.id}`,
      isBuild: false,
      at: t.completedAt!,
      title: t.title,
      kind: t.kind === 'proposal' ? 'Idea done' : 'Task',
      who: t.assignee?.name ?? 'Team',
      outcome: outcomeLine(t.result),
      verdict: plainResult(t.result),
      prs: [],
      screenshot: t.result?.match(IMG)?.[1] ?? null,
      taskId: t.id,
    }));
  const all = [...fromBuilds, ...fromTasks].sort((a, b) => b.at.localeCompare(a.at));
  return { items: all, total: all.length, totalIsLowerBound: done.length >= DONE_FETCH_LIMIT };
}


/**
 * The game a build is about: the one named on the request (its mode id, plus any daily/room/duel variants of it), or,
 * for an older request, a game whose full name is in the title.
 */
function gameModes(item: Shipped, analytics: HqAnalytics): { label: string; modes: string[] } | null {
  const labels = analytics.modeLabels ?? {};
  if (item.game) {
    // The picker offers analytics' own ids, so the game is matched exactly.
    const modes = Object.keys(labels).filter((m) => m === item.game);
    return modes.length ? { label: labels[item.game] ?? labels[modes[0]] ?? item.game, modes } : null;
  }
  const title = ` ${item.title.toLowerCase()} `;
  const found = Object.entries(labels).find(([, label]) => label.length > 3 && new RegExp(`\\b${label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(title));
  return found ? { label: found[1], modes: [found[0]] } : null;
}

/**
 * The game's plays per day over the 7 days before the build reached staging. Only a baseline: the numbers are live
 * players, and a build on staging isn't live yet, so an "after" would credit it with changes it didn't cause.
 */
function gameBaseline(item: Shipped, analytics: HqAnalytics | undefined) {
  if (!analytics || !item.isBuild) return null;
  const game = gameModes(item, analytics);
  if (!game) return null;
  const day = TBILISI_KEY.format(new Date(item.at));
  const rows = analytics.modesByDay.filter((r) => String(r.date) < day).slice(-7);
  if (!rows.length) return null;
  // The daily series keeps only the top games (the rest is "Other"): a game it doesn't carry has no baseline, not 0.
  if (!rows.some((r) => game.modes.some((m) => m in r))) return null;
  const total = rows.reduce((sum, r) => sum + game.modes.reduce((n, m) => n + (Number(r[m]) || 0), 0), 0);
  return { label: game.label, perDay: total / rows.length, days: rows.length };
}

function ShippedItem({ item, analytics, onOpen }: { item: Shipped; analytics: HqAnalytics | undefined; onOpen: (id: string) => void }) {
  const baseline = gameBaseline(item, analytics);
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700">{item.kind}</span>
        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 text-[13px] font-medium text-emerald-700">On staging</span>
        <button type="button" disabled={!item.taskId} onClick={() => item.taskId && onOpen(item.taskId)} className="min-w-0 text-left text-sm font-semibold text-slate-950 enabled:hover:underline">
          {item.title}
        </button>
        <span className="ml-auto text-[13px] text-slate-500">
          {item.who} · reached staging {formatRelative(item.at)}
        </span>
      </div>
      {item.outcome && <p className="mt-1.5 line-clamp-2 text-sm text-slate-700">{item.outcome}</p>}

      {item.shots && (
        <div className="mt-3">
          <BuildShots shots={item.shots} compact />
        </div>
      )}

      {(baseline || item.screenshot || item.prs.length > 0) && (
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {baseline && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-[13px]">
              <div className={HQ_LABEL}>{baseline.label} · plays per day</div>
              <div className="mt-1 text-slate-700">
                Before: <b className="tabular-nums text-slate-950">{baseline.perDay.toFixed(1)}</b>
                <span className="text-slate-600"> ({baseline.days}-day average) · after: once it is live</span>
              </div>
            </div>
          )}
          {item.screenshot && (
            <a href={item.screenshot} target="_blank" rel="noreferrer noopener" className="block w-48 overflow-hidden rounded-md border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.screenshot} alt={`Screenshot: ${item.title}`} className="block h-auto w-full" />
            </a>
          )}
          {item.prs.map((p) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-slate-950">
              {p.repo} PR <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      )}
    </article>
  );
}
