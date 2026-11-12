'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHqEvents, useHqMembers, useHqTasks } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_STATUS_LABELS, HQ_TIMEZONE, formatRelative, formatTbilisi } from '@/lib/hq-board';
import type { HqEvent, HqTaskStatus } from '@/types';
import { EmptyState, HQ_LABEL, HQ_PAGE, LoadErrorState, MemberAvatar, PageHeader, Panel, RefreshErrorBanner, Section, useTaskSheet } from '../hq-ui';

const ALL = '__all__';

const EVENT_LABELS: Record<string, string> = {
  standup: 'standup',
  proposal: 'new idea',
  proposal_accepted: 'idea accepted',
  proposal_declined: 'idea declined',
  provider_down: 'AI provider down',
  provider_up: 'AI provider back',
  task_reconciled: 'stuck task re-queued',
  schedule_coalesced: 'run skipped (still queued)',
  standup_expired: 'standup expired',
  director_approved: 'Director approved',
  director_declined: 'Director declined',
  director_escalated: 'sent to you',
  director_accepted: 'Director accepted',
  director_reopened: 'Director sent back',
  director_cancelled: 'Director cancelled',
  director_updated: 'Director moved',
  escalation_resolved: 'you handled it',
};

type Outcome = 'good' | 'attention' | 'bad' | 'active' | 'neutral';

// Outcome of an event, shown as a dot. Unlisted types are neutral; the event level (warn/error) overrides.
const TYPE_OUTCOME: Record<string, Outcome> = {
  provider_down: 'bad',
  provider_up: 'good',
  proposal_accepted: 'good',
  director_approved: 'good',
  director_accepted: 'good',
  run_finished: 'good',
  task_reconciled: 'attention',
  director_escalated: 'attention',
  standup_expired: 'attention',
  run_started: 'active',
  director_reopened: 'active',
  director_updated: 'active',
};

const OUTCOME_DOT: Record<Outcome, string> = {
  good: 'bg-emerald-500',
  attention: 'bg-amber-500',
  bad: 'bg-red-500',
  active: 'bg-blue-500',
  neutral: 'bg-slate-300',
};

const OUTCOME_LABEL: Record<Outcome, string> = {
  good: 'Succeeded',
  attention: 'Needs attention',
  bad: 'Failed',
  active: 'In progress',
  neutral: 'Info',
};

// Decisions (Director and idea accept/decline, escalations handled) count as outcomes whatever their tone.
const DECISION_TYPES = new Set(['proposal_accepted', 'proposal_declined', 'escalation_resolved']);

// Run start/finish events are routine when the run succeeded; only a failed or timed-out run is an outcome.
const RUN_TYPES = new Set(['run_started', 'run_finished']);

function runFailed(e: HqEvent): boolean {
  const status = e.data?.status;
  return e.level === 'error' || status === 'failed' || status === 'timeout';
}

// A task moved to done (the backend logs task_status with data.to = the new status).
function taskCompleted(e: HqEvent): boolean {
  if (e.type !== 'task_status') return false;
  return e.data?.to === 'done';
}

/** "Outcomes": decisions, failures/warnings, and completed work. Everything else is routine. */
function isOutcome(e: HqEvent): boolean {
  if (RUN_TYPES.has(e.type)) return runFailed(e) || e.level === 'warn';
  if (DECISION_TYPES.has(e.type) || e.type.startsWith('director_') || taskCompleted(e)) return true;
  const outcome = outcomeOf(e);
  return outcome === 'good' || outcome === 'attention' || outcome === 'bad';
}

function outcomeOf(e: HqEvent): Outcome {
  if (e.level === 'error') return 'bad';
  if (e.level === 'warn') return 'attention';
  if (RUN_TYPES.has(e.type) && runFailed(e)) return 'bad';
  if (taskCompleted(e)) return 'good';
  // The worker logs a cancelled run at info level too ("<name> cancelled #12: …"); only "finished #12" is a success.
  if (e.type === 'run_finished') return /\bfinished #\d+/.test(e.message) ? 'good' : 'neutral';
  return TYPE_OUTCOME[e.type] ?? 'neutral';
}

// Short result shown as a badge next to the task. (EVENT_LABELS has the long wording.)
const RESULT_LABELS: Record<string, string> = {
  proposal: 'Idea',
  proposal_accepted: 'Accepted',
  proposal_declined: 'Declined',
  director_approved: 'Approved',
  director_declined: 'Declined',
  director_escalated: 'Sent to you',
  director_accepted: 'Accepted',
  director_reopened: 'Sent back',
  director_cancelled: 'Cancelled',
  director_updated: 'Moved',
  escalation_resolved: 'Handled',
  provider_down: 'Down',
  provider_up: 'Back up',
  task_reconciled: 'Re-queued',
  schedule_coalesced: 'Skipped',
  standup_expired: 'Expired',
  standup: 'Standup',
  run_started: 'Started',
};

function resultLabel(e: HqEvent): string {
  if (e.type === 'run_finished') return runFailed(e) ? 'Failed' : 'Finished';
  if (e.type === 'task_status') {
    const to = e.data?.to;
    if (to === 'done') return 'Done';
    if (typeof to === 'string' && to in HQ_STATUS_LABELS) return `Moved to ${HQ_STATUS_LABELS[to as HqTaskStatus]}`;
  }
  return RESULT_LABELS[e.type] ?? eventLabel(e.type);
}

const OUTCOME_BADGE: Record<Outcome, string> = {
  good: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  attention: 'border-amber-200 bg-amber-50 text-amber-700',
  bad: 'border-red-200 bg-red-50 text-red-700',
  active: 'border-blue-200 bg-blue-50 text-blue-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
};

function eventLabel(type: string): string {
  const label = EVENT_LABELS[type] ?? type.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Days and times are Tbilisi time, like the rest of HQ.
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: HQ_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const DAY_NAME = new Intl.DateTimeFormat('en-GB', { timeZone: HQ_TIMEZONE, weekday: 'long', day: 'numeric', month: 'short' });
const TIME_OF_DAY = new Intl.DateTimeFormat('en-GB', { timeZone: HQ_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });

function dayLabel(ts: string, todayKey: string, yesterdayKey: string): string {
  const key = DAY_KEY.format(new Date(ts));
  const name = DAY_NAME.format(new Date(ts));
  if (key === todayKey) return `Today, ${name}`;
  if (key === yesterdayKey) return `Yesterday, ${name}`;
  return name;
}

/** Newest-first events split into consecutive Tbilisi-day groups. */
function groupByDay(events: HqEvent[]): { key: string; label: string; events: HqEvent[] }[] {
  const now = Date.now();
  const todayKey = DAY_KEY.format(new Date(now));
  const yesterdayKey = DAY_KEY.format(new Date(now - 86400000));
  const groups: { key: string; label: string; events: HqEvent[] }[] = [];
  for (const e of events) {
    const key = DAY_KEY.format(new Date(e.ts));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(e);
    else groups.push({ key, label: dayLabel(e.ts, todayKey, yesterdayKey), events: [e] });
  }
  return groups;
}

export default function HqActivityPage() {
  const [memberId, setMemberId] = useState<string>(ALL);
  const [eventType, setEventType] = useState<string>(ALL);
  const [scope, setScope] = useState<'outcomes' | 'all'>('outcomes');
  const { data: members = [] } = useHqMembers();
  const { data, isLoading, isFetching, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useHqEvents(
    memberId === ALL ? undefined : { memberId }
  );
  const { openTask } = useTaskSheet();
  const events = useMemo(() => data?.pages.flat() ?? [], [data]);
  // Events carry only a task id and number; the latest tasks give them titles. Older tasks fall back to the message.
  // Only for titles: fetched rarely, never polled (the log itself polls).
  const { data: tasks } = useHqTasks({ limit: 500 }, { refetchInterval: false, staleTime: 5 * 60_000 });
  const taskById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, { number: t.number, title: t.title }])), [tasks]);

  // Both filters are client-side, over the events loaded so far.
  const scoped = useMemo(() => (scope === 'outcomes' ? events.filter(isOutcome) : events), [events, scope]);
  const typeOptions = useMemo(() => {
    const types = new Set(scoped.map((e) => e.type));
    if (eventType !== ALL) types.add(eventType);
    return [...types].sort((a, b) => eventLabel(a).localeCompare(eventLabel(b)));
  }, [scoped, eventType]);
  const visible = useMemo(() => (eventType === ALL ? scoped : scoped.filter((e) => e.type === eventType)), [scoped, eventType]);
  const groups = groupByDay(visible);

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Activity"
        description="Everything that happens in HQ, newest first: tasks created and finished, agent runs, hand-offs and messages. Times are Tbilisi time."
      />

      <Section
        title="Events"
        description={
          events.length > 0 && (scope === 'outcomes' || eventType !== ALL)
            ? `Filters apply to the ${events.length} loaded events (${visible.length} shown). Load more to look further back.`
            : undefined
        }
        actions={isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : undefined}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Which events" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
            {([
              ['outcomes', 'Outcomes'],
              ['all', 'All events'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => setScope(value)}
                className={cn(
                  'rounded px-3 py-1 text-sm font-medium transition-colors',
                  scope === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-56">
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.avatar} {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-56">
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full bg-white" aria-label="Event type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All event types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {eventLabel(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Polling stops once older pages are loaded (a refetch reloads every page). */}
          {(data?.pages.length ?? 0) > 1 && (
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Show newest
            </Button>
          )}
        </div>

        {error && data && <RefreshErrorBanner />}
        {error && !data ? (
          <LoadErrorState error={error} fallback="Could not load activity." onRetry={() => void refetch()} />
        ) : events.length === 0 && !isLoading ? (
          <EmptyState>No activity yet.</EmptyState>
        ) : visible.length === 0 && !isLoading ? (
          <EmptyState>
            {scope === 'outcomes' ? 'No outcomes in the loaded events. Switch to All events or load more.' : 'No loaded events of this type.'}
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key} className="space-y-2">
                <h3 className={cn(HQ_LABEL, 'flex items-baseline gap-2')}>
                  {g.label}
                  <span className="font-medium normal-case tracking-normal tabular-nums">{g.events.length} {g.events.length === 1 ? 'event' : 'events'}</span>
                </h3>
                <Panel>
                  <ol className="divide-y divide-slate-100">
                    {g.events.map((e) => (
                      <EventRow key={e.id} event={e} task={e.taskId ? taskById.get(e.taskId) : undefined} onOpenTask={openTask} />
                    ))}
                  </ol>
                </Panel>
              </div>
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
              {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

/** The message without a leading "<actor name> " (the row already shows who did it). */
function messageWithoutActor(message: string, actor: string): string {
  const trimmed = message.trim();
  if (trimmed.length > actor.length && trimmed.toLowerCase().startsWith(actor.toLowerCase()) && /[\s:,\-–—]/.test(trimmed.charAt(actor.length))) {
    const rest = trimmed.slice(actor.length).replace(/^[\s:,\-–—]+/, '');
    if (rest) return rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return trimmed;
}

function EventRow({
  event: e,
  task,
  onOpenTask,
}: {
  event: HqEvent;
  task?: { number: number; title: string };
  onOpenTask: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const outcome = outcomeOf(e);
  const failed = outcome === 'bad';
  const actor = e.member?.name ?? 'System';
  const message = messageWithoutActor(e.message, actor);
  const firstLine = message.split('\n')[0];
  const number = task?.number ?? e.taskNumber;
  // Lead with the work: the task title when known, else the start of the message, else what happened.
  const lead = task?.title ?? (e.taskId && message ? firstLine : null);
  const leadIsMessage = !task && !!lead;
  const shortMessage = message.length <= 90 && !message.includes('\n');
  const hasDetails = !!message && !(leadIsMessage && shortMessage);
  // A failure shows its first line of explanation straight away; routine rows stay on one line.
  const showExplanation = failed && !!message && !leadIsMessage;
  const time = TIME_OF_DAY.format(new Date(e.ts));
  return (
    <li
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)_1.5rem] items-start gap-x-3 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_9.5rem_3rem_1.5rem]',
        failed && 'shadow-[inset_3px_0_0_0_var(--color-red-500)]'
      )}
    >
      <span title={OUTCOME_LABEL[outcome]} className="mt-2 inline-flex shrink-0">
        <span className={cn('h-2 w-2 rounded-full', OUTCOME_DOT[outcome])} />
        <span className="sr-only">{OUTCOME_LABEL[outcome]}</span>
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 md:flex-nowrap">
          {e.taskId ? (
            <button type="button" onClick={() => onOpenTask(e.taskId!)} className="inline-flex min-w-0 items-baseline gap-1.5 text-left text-sm hover:underline">
              <span className="shrink-0 font-mono text-[13px] tabular-nums text-slate-500">#{number ?? '…'}</span>
              <span className="line-clamp-1 min-w-0 break-words font-medium text-slate-950">{lead ?? eventLabel(e.type)}</span>
            </button>
          ) : (
            <span className="line-clamp-1 min-w-0 break-words text-sm font-medium text-slate-950">{eventLabel(e.type)}</span>
          )}
          {e.taskId && (
            <span className={cn('shrink-0 rounded border px-1.5 text-[13px] font-medium', OUTCOME_BADGE[outcome])}>{resultLabel(e)}</span>
          )}
          {e.level !== 'info' && (
            <span className={cn('shrink-0 text-[13px] font-semibold uppercase', e.level === 'error' ? 'text-red-700' : 'text-amber-700')}>{e.level}</span>
          )}
        </div>
        {showExplanation && <p className="mt-0.5 line-clamp-1 break-words text-sm text-slate-700">{firstLine}</p>}
        {/* Phones: actor and time go under the title; from md up they are right-aligned columns. */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-slate-600 md:hidden">
          <MemberAvatar member={e.member} size="xs" />
          <span className="min-w-0 truncate">{actor}</span>
          <span aria-hidden>·</span>
          <time dateTime={e.ts} className="tabular-nums text-slate-500">
            {time}
          </time>
        </div>
        {expanded && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-600">{message}</p>}
      </div>
      <span className="hidden min-w-0 items-center justify-end gap-1.5 text-[13px] font-medium text-slate-700 md:flex">
        <MemberAvatar member={e.member} size="xs" />
        <span className="truncate">{actor}</span>
      </span>
      <time
        dateTime={e.ts}
        title={`${formatTbilisi(e.ts)} · ${formatRelative(e.ts)}`}
        className="hidden pt-px text-right text-[13px] tabular-nums text-slate-500 md:block"
      >
        {time}
      </time>
      {/* Disclosure at the row's end; rows without details keep the cell so the columns line up. */}
      <span className="flex justify-end">
        {hasDetails && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </span>
    </li>
  );
}
