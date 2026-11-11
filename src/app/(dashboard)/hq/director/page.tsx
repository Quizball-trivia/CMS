'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowRightLeft,
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Compass,
  GitPullRequest,
  Loader2,
  MessageSquare,
  Minus,
  Power,
  RotateCcw,
  Send,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useAcceptHqProposal,
  useDeclineHqProposal,
  useHqBuilds,
  useHqDirector,
  useHqDirectorChat,
  useHqSettings,
  useResolveEscalation,
  useSendDirectorChat,
  useUpdateHqMember,
} from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_TIMEZONE, formatRelative, formatTbilisi } from '@/lib/hq-board';
import {
  NEED_REASON_LABELS,
  buildForTask,
  buildPipeline,
  doneTodayRows,
  firstLine,
  founderActions,
  modelBadgeLabel,
  needsYouItems,
  outcomeLine,
  whyLine,
  type DoneRow,
  type NeedItem,
  type NeedReason,
  type PipelineStep,
} from '@/lib/hq-director';
import type { HqBuild, HqDirectorBrief, HqEvent, HqMember, HqMessage, HqSettings, HqTask } from '@/types';
import {
  EmptyState,
  LoadErrorState,
  Markdown,
  MemberAvatar,
  MemberStatusDot,
  PageHeader,
  RefreshErrorBanner,
  SectionTitle,
  errorMessage,
  useTaskSheet,
} from '../hq-ui';

const MAX_MESSAGE_LENGTH = 8000;
/** Rows shown before "Show all": the first screen stays about decisions, not history. */
const NEEDS_YOU_VISIBLE = 6;
const DONE_VISIBLE = 8;
const ACTIVE_BUILD_STAGES = ['queued', 'building', 'reviewing', 'testing', 'rating'];

/** Why a queued message isn't being answered yet, in the order the worker checks. */
function queuedReason(director: HqMember, settings: HqSettings | undefined): string {
  if (director.status !== 'active') return 'The Director is switched off — he answers once you switch him on.';
  if (settings?.paused) return 'All agents are paused — he answers when you resume.';
  if (settings?.plan && settings.plan.state !== 'ok' && settings.plan.until) {
    return `Waiting for the Claude plan to reset (${formatTbilisi(settings.plan.until)}).`;
  }
  return 'Waiting for a free slot…';
}

const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: HQ_TIMEZONE, hour: '2-digit', minute: '2-digit' });
/** "14:05" in Tbilisi: every row on this page is from today. */
function clock(iso: string | null | undefined): string {
  return iso ? timeFormat.format(new Date(iso)) : '—';
}

function shell(children: ReactNode) {
  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-16">
      <PageHeader icon={<Compass className="h-6 w-6 text-slate-700" />} title="Director" description="Your Executive Director runs the team so you don’t have to." />
      {children}
    </div>
  );
}

export default function HqDirectorPage() {
  const { data, isLoading, error, refetch } = useHqDirector();
  const { data: builds } = useHqBuilds();
  const { openTask } = useTaskSheet();

  const view = useMemo(() => {
    if (!data) return null;
    const allBuilds = builds ?? [];
    const needs = needsYouItems(data.needsYou, data.plan ?? [], allBuilds);
    // A Builder task that is running is shown as its build, with the build's pipeline.
    const activeBuilds = allBuilds.filter((b) => b.status === 'submitted' || (b.status === 'approved' && b.job && ACTIVE_BUILD_STAGES.includes(b.job.stage)));
    const running = (data.runningNow ?? []).filter((t) => !buildForTask(t, allBuilds));
    const done = data.doneToday ?? [];
    return { needs, activeBuilds, running, done, doneRows: doneTodayRows(done) };
  }, [data, builds]);

  if (!data || !view) {
    return shell(
      isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <LoadErrorState error={error} fallback="Could not load the Director." onRetry={() => void refetch()} />
      )
    );
  }

  const { director, brief, decisions, chat } = data;
  if (!director) return shell(<EmptyState>No director yet</EmptyState>);

  const working = chat.running || !!director.stats?.currentTask;
  const releases = view.needs.filter((n) => n.reason === 'release');
  const others = view.needs.filter((n) => n.reason !== 'release');

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-16">
      <PageHeader
        icon={<span aria-hidden>{director.avatar || '🧭'}</span>}
        eyebrow="Executive Director"
        title={director.name}
        actions={
          <>
            <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700" title="Model and thinking effort">
              {modelBadgeLabel(director.model, director.effort)}
            </Badge>
            <Badge variant="outline" className="gap-1.5 border-slate-200 bg-white text-slate-600">
              <MemberStatusDot status={director.status} busy={working} />
              {director.status === 'active' ? (working ? 'Working' : 'Idle') : director.status === 'paused' ? 'Switched off' : 'Archived'}
            </Badge>
          </>
        }
      />

      {!!error && <RefreshErrorBanner />}
      {director.status === 'paused' && <SwitchedOffBanner director={director} />}

      <GlanceBand
        director={director}
        answering={chat.running}
        running={data.runningNow ?? []}
        needs={view.needs}
        workingCount={view.activeBuilds.length + view.running.length}
        done={view.done}
        releases={releases.length}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <NeedsYouSection name={director.name} releases={releases} others={others} onOpen={openTask} />
          <InProgressSection name={director.name} builds={view.activeBuilds} tasks={view.running} onOpen={openTask} />
          <DoneTodaySection rows={view.doneRows} total={view.done.length} onOpen={openTask} />
          <BriefPanel brief={brief} onOpen={openTask} />
          <DecisionsPanel name={director.name} decisions={decisions} onOpen={openTask} />
        </div>
        <ChatPanel director={director} />
      </div>
    </div>
  );
}

function SwitchedOffBanner({ director }: { director: HqMember }) {
  const update = useUpdateHqMember();
  const switchOn = () =>
    update.mutate(
      { id: director.id, data: { status: 'active' } },
      {
        onSuccess: () => toast.success(`${director.name} is back on`),
        onError: (e) => toast.error(errorMessage(e, 'Could not switch him on')),
      }
    );
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
      <Power className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">The Director is switched off</div>
        <div className="text-xs text-amber-800">He won’t answer messages or decide on ideas until you switch him on.</div>
      </div>
      <Button size="sm" onClick={switchOn} disabled={update.isPending}>
        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Switch on
      </Button>
    </div>
  );
}

// ── Chat ──

function ChatPanel({ director }: { director: HqMember }) {
  const chatQuery = useHqDirectorChat();
  const { data: settings } = useHqSettings();
  const { messages, chat, hasEarlier, loadEarlier, loadingEarlier, earlierError } = chatQuery;
  const send = useSendDirectorChat();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  // Follow the conversation when a message arrives or the Director starts thinking; "Load earlier"
  // changes neither, so it never yanks the reader to the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId, chat.running, chat.queued]);

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, {
      onSuccess: () => setDraft(''),
      onError: (e) => toast.error(errorMessage(e, 'Could not send your message')),
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  };

  return (
    <section
      id="chat"
      aria-label="Chat with the Director"
      className="flex h-[70vh] min-h-[420px] scroll-mt-20 flex-col rounded-xl border border-slate-200 bg-white xl:h-[calc(100vh-11rem)] xl:min-h-[560px]"
    >
      <div ref={listRef} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4">
        {!chatQuery.data && chatQuery.isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the conversation…
          </div>
        )}
        {!chatQuery.data && !chatQuery.isLoading && (
          <LoadErrorState error={chatQuery.error} fallback="Could not load the conversation." onRetry={() => void chatQuery.refetch()} />
        )}
        {!!chatQuery.error && !!chatQuery.data && <RefreshErrorBanner />}

        {hasEarlier && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void loadEarlier()} disabled={loadingEarlier}>
              {loadingEarlier && <Loader2 className="h-4 w-4 animate-spin" />} Load earlier
            </Button>
          </div>
        )}
        {!!earlierError && <p className="text-center text-xs text-red-600">{errorMessage(earlierError, 'Could not load earlier messages.')}</p>}

        {chatQuery.data && messages.length === 0 && (
          <EmptyState>Ask {director.name} anything: priorities, ideas, what the team is up to.</EmptyState>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} director={director} />
        ))}

        {chat.running ? (
          <ThinkingBubble director={director} />
        ) : (
          chat.queued && <p className="text-xs italic text-slate-400">{queuedReason(director, settings)}</p>
        )}
      </div>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={send.isPending}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            aria-label={`Message ${director.name}`}
            placeholder={`Message ${director.name}…`}
            className="max-h-40 min-h-[60px] resize-none bg-white"
          />
          <Button onClick={submit} disabled={send.isPending || !draft.trim()} aria-label="Send message">
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
      </div>
    </section>
  );
}

function MessageBubble({ message: m, director }: { message: HqMessage; director: HqMember }) {
  const time = (
    <time dateTime={m.createdAt} title={formatTbilisi(m.createdAt)} className="mt-1 block text-[10px] text-slate-400">
      {formatTbilisi(m.createdAt)}
    </time>
  );

  if (m.kind === 'system') {
    return (
      <div className="text-center text-xs text-slate-400">
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {time}
      </div>
    );
  }

  if (m.author?.id === director.id) {
    return (
      <div className="flex items-start gap-2">
        <MemberAvatar member={director} size="sm" className="mt-0.5" />
        <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-3.5 py-2.5">
          <Markdown>{m.body}</Markdown>
          {time}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <div className="min-w-0 max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-3.5 py-2.5 text-white">
        <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
        <time dateTime={m.createdAt} title={formatTbilisi(m.createdAt)} className="mt-1 block text-right text-[10px] text-slate-300">
          {formatTbilisi(m.createdAt)}
        </time>
      </div>
    </div>
  );
}

function ThinkingBubble({ director }: { director: HqMember }) {
  return (
    <div className="flex items-start gap-2" role="status">
      <MemberAvatar member={director} size="sm" className="mt-0.5" />
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${delay}ms` }} />
          ))}
        </span>
        {director.name} is thinking…
      </div>
    </div>
  );
}

// ── At a glance ──

function Panel({ id, label, children, className }: { id?: string; label?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-label={label} className={cn('scroll-mt-20 rounded-xl border border-slate-200 bg-white p-4', className)}>
      {children}
    </section>
  );
}

/** What Romero is doing, in one line, and the four numbers that say whether the founder is needed. */
function GlanceBand({
  director,
  answering,
  running,
  needs,
  workingCount,
  done,
  releases,
}: {
  director: HqMember;
  answering: boolean;
  running: HqTask[];
  needs: NeedItem[];
  workingCount: number;
  done: HqTask[];
  releases: number;
}) {
  const current = director.stats?.currentTask;
  const teamTask = running.find((t) => t.assignee?.id !== director.id);
  const yours = needs.filter((n) => n.reason !== 'decision' && n.reason !== 'blocked' && n.reason !== 'plan').length;
  const routine = done.filter((t) => t.scheduleId).length;

  let status: ReactNode;
  if (director.status !== 'active') status = <>is switched off.</>;
  else if (answering) status = <>is answering your message.</>;
  else if (current) status = <>is working on <span className="font-mono text-xs text-slate-400">#{current.number}</span> {current.title}</>;
  else status = <>is between tasks.</>;

  return (
    <Panel label="At a glance" className="space-y-3">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <MemberAvatar member={director} size="sm" />
        <div className="min-w-[12rem] flex-1 text-sm">
          <p className="text-slate-800">
            <span className="font-semibold">{director.name}</span> {status}
          </p>
          {teamTask && (
            <p className="mt-0.5 truncate text-xs text-slate-500" title={teamTask.title}>
              Team: {teamTask.assignee?.name ?? 'Someone'} on #{teamTask.number} {teamTask.title}
              {running.length > 1 && ` · +${running.length - 1} more`}
            </p>
          )}
        </div>
        <a href="#chat" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 xl:hidden">
          <MessageSquare className="h-3.5 w-3.5" /> Message {director.name}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile href="#needs-you" label="Needs you" value={needs.length} hint={needs.length ? `${yours} only you can decide` : 'Nothing waiting'} tone={yours ? 'amber' : 'plain'} />
        <Tile href="#in-progress" label="Working now" value={workingCount} hint="Builds and tasks" tone="plain" />
        <Tile href="#done-today" label="Done today" value={done.length} hint={routine ? `${routine} routine runs` : 'Finished work'} tone="plain" />
        <Tile href="#releases" label="Waiting for your OK" value={releases} hint={releases ? `${releases === 1 ? 'Build' : 'Builds'} to merge` : 'Nothing to merge or release'} tone={releases ? 'emerald' : 'plain'} />
      </div>
    </Panel>
  );
}

const TILE_TONES = {
  plain: 'border-slate-200 hover:border-slate-300',
  amber: 'border-amber-200 bg-amber-50/60 hover:border-amber-300',
  emerald: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300',
};

function Tile({ href, label, value, hint, tone }: { href: string; label: string; value: number; hint: string; tone: keyof typeof TILE_TONES }) {
  return (
    <a href={href} className={cn('block min-w-0 rounded-lg border px-3 py-2 transition-colors', TILE_TONES[tone])}>
      <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs leading-snug text-slate-500">{hint}</div>
    </a>
  );
}

// ── Needs you ──

const REASON_STYLES: Record<NeedReason, string> = {
  release: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  money: 'border-amber-200 bg-amber-50 text-amber-800',
  players: 'border-sky-200 bg-sky-50 text-sky-700',
  private: 'border-rose-200 bg-rose-50 text-rose-700',
  public: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
  decision: 'border-slate-200 bg-slate-50 text-slate-600',
  blocked: 'border-orange-200 bg-orange-50 text-orange-700',
  plan: 'border-slate-200 bg-white text-slate-500',
};

function ReasonChip({ reason }: { reason: NeedReason }) {
  return <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2 py-px text-[11px] font-medium', REASON_STYLES[reason])}>{NEED_REASON_LABELS[reason]}</span>;
}

function NeedsYouSection({ name, releases, others, onOpen }: { name: string; releases: NeedItem[]; others: NeedItem[]; onOpen: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? others : others.slice(0, NEEDS_YOU_VISIBLE);
  const hidden = others.length - visible.length;
  return (
    <Panel id="needs-you" label="Needs you">
      <SectionTitle count={releases.length + others.length}>Needs you</SectionTitle>
      <p className="mb-3 text-xs text-slate-500">Releases, money, players, private data and public posts are yours. {name} runs everything else up to staging.</p>

      <div id="releases" className="scroll-mt-20">
        <h3 className="mb-1 text-xs font-semibold text-slate-700">Releases and builds to merge</h3>
        {releases.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
            Nothing is waiting for your OK. A release card (what changed, why, how it was before, screenshots) shows here when one is ready.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {releases.map((n) => (
              <NeedRow key={n.task.id} item={n} name={name} onOpen={onOpen} />
            ))}
          </ul>
        )}
      </div>

      <h3 className="mb-1 mt-4 text-xs font-semibold text-slate-700">Questions from {name}</h3>
      {others.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">Nothing else needs you. {name} has it.</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
            {visible.map((n) => (
              <NeedRow key={n.task.id} item={n} name={name} onOpen={onOpen} />
            ))}
          </ul>
          {(hidden > 0 || showAll) && others.length > NEEDS_YOU_VISIBLE && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-900">
              {showAll ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

function NeedRow({ item, name, onOpen }: { item: NeedItem; name: string; onOpen: (id: string) => void }) {
  const { task, reason, build } = item;
  const [open, setOpen] = useState(false);
  const resolve = useResolveEscalation();
  const accept = useAcceptHqProposal();
  const decline = useDeclineHqProposal();
  const actions = founderActions(task);
  const busy = resolve.isPending || accept.isPending || decline.isPending;
  const prs = build?.job?.prs ?? [];
  const detailsId = `need-${task.id}`;

  const handled = () =>
    resolve.mutate(task.id, {
      onSuccess: () => toast.success('Marked as handled'),
      onError: (e) => toast.error(errorMessage(e, 'Could not mark this as handled')),
    });
  const doIt = () =>
    accept.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success(`On it — ${task.assignee?.name ?? 'the team'} starts “${task.title}”`),
        onError: (e) => toast.error(errorMessage(e, 'Could not start this idea')),
      }
    );
  const notNow = () =>
    decline.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success('Okay — not now'),
        onError: (e) => toast.error(errorMessage(e, 'Could not decline')),
      }
    );

  return (
    <li className="px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={open ? 'Hide why' : 'Why'}
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <span className="shrink-0 font-mono text-xs text-slate-400">#{task.number}</span>
        <ReasonChip reason={reason} />
        <button
          type="button"
          onClick={() => onOpen(task.id)}
          title={task.title}
          className="line-clamp-2 min-w-[10rem] flex-1 text-left text-sm font-medium text-slate-900 hover:underline sm:line-clamp-1"
        >
          {task.title}
        </button>
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
          {prs.map((pr) => (
            <a
              key={pr.url}
              href={pr.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <GitPullRequest className="h-3.5 w-3.5" /> {prLabel(pr.url, pr.repo)}
            </a>
          ))}
          {actions.doIt && (
            <Button size="sm" className="h-7 bg-emerald-600 px-2 text-xs text-white hover:bg-emerald-700" onClick={doIt} disabled={busy}>
              <Check className="h-3.5 w-3.5" /> Do it
            </Button>
          )}
          {actions.notNow && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-500" onClick={notNow} disabled={busy}>
              <X className="h-3.5 w-3.5" /> Not now
            </Button>
          )}
          {actions.handled && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handled} disabled={busy}>
              <CheckCheck className="h-3.5 w-3.5" /> {task.status === 'todo' || task.status === 'backlog' ? 'Approve' : 'Handled'}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div id={detailsId} className="mt-2 space-y-2 pb-1 pl-8 text-xs text-slate-600">
          {build && reason === 'release' ? <ReleaseCard build={build} /> : <WhyNote task={task} name={name} />}
          <button type="button" onClick={() => onOpen(task.id)} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900">
            Open task <ArrowUpRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </li>
  );
}

/** "backend #961" from a GitHub PR URL. */
function prLabel(url: string, repo: string): string {
  const n = /\/pull\/(\d+)/.exec(url)?.[1];
  return n ? `${repo} #${n}` : repo;
}

function WhyNote({ task, name }: { task: HqTask; name: string }) {
  const note = task.director?.note?.trim();
  const why = task.proposal?.why?.trim();
  if (!note && !why) return <p className="text-slate-400">No note from {name} — open the task for the details.</p>;
  return (
    <>
      {note && <p className="whitespace-pre-wrap break-words text-slate-700">{note}</p>}
      {why && (
        <p className="break-words">
          <span className="font-semibold text-slate-700">Why the idea: </span>
          {why}
        </p>
      )}
    </>
  );
}

/** What the founder accepts: what changed, why, the proof, and where the screenshots go once release cards exist. */
function ReleaseCard({ build }: { build: HqBuild }) {
  const job = build.job;
  const proof = job?.proof;
  const webChange = build.repos.includes('web');
  return (
    <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <p className="line-clamp-3">
        <span className="font-semibold text-slate-700">What changed: </span>
        {outcomeLine(job?.note) || build.title}
      </p>
      <p className="line-clamp-3">
        <span className="font-semibold text-slate-700">Why: </span>
        {whyLine(build.directorSpec ?? build.spec) || '—'}
      </p>
      {proof && (
        <p>
          <span className="font-semibold text-slate-700">Proof: </span>
          {proof.redGreen ? 'red/green test passed' : 'no red/green test'} · {proof.reviews} GPT review{proof.reviews === 1 ? '' : 's'} ·{' '}
          {proof.playtests ? `${proof.playtests} play-test round${proof.playtests === 1 ? '' : 's'}` : webChange ? 'not play-tested' : 'no play-test (no web change)'}
        </p>
      )}
      <p className="text-slate-400">
        {job?.stage === 'published' ? 'A draft PR to staging: merging it is yours.' : 'The draft PR to staging is being opened.'} Screenshots and the before/after
        come with the production release card.
      </p>
      <Pipeline steps={buildPipeline(build).steps} />
    </div>
  );
}

// ── In progress ──

const STEP_STYLES: Record<PipelineStep['state'], string> = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  current: 'border-blue-300 bg-blue-600 text-white',
  todo: 'border-slate-200 bg-white text-slate-400',
  skipped: 'border-dashed border-slate-200 bg-white text-slate-300',
};

/** The steps as small chips; on a phone only the current step keeps its label. */
function Pipeline({ steps, stoppedAs }: { steps: PipelineStep[]; stoppedAs?: string | null }) {
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Progress">
      {steps.map((s) => (
        <li
          key={s.key}
          title={`${s.label}: ${s.hint}${s.state === 'skipped' ? ' (skipped)' : ''}`}
          aria-current={s.state === 'current' ? 'step' : undefined}
          className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] font-medium', STEP_STYLES[s.state])}
        >
          {s.state === 'done' ? <Check className="h-3 w-3" /> : s.state === 'skipped' ? <Minus className="h-3 w-3" /> : s.state === 'current' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
          <span className={cn(s.state !== 'current' && 'sr-only sm:not-sr-only')}>{s.label}</span>
        </li>
      ))}
      {stoppedAs && (
        <li className="inline-flex h-5 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-1.5 text-[11px] font-medium text-red-700">
          <XCircle className="h-3 w-3" /> {stoppedAs}
        </li>
      )}
    </ol>
  );
}

const TASK_STEPS: Array<Pick<PipelineStep, 'key' | 'label' | 'hint'>> = [
  { key: 'verified', label: 'Approved', hint: 'The Director (or you) said go' },
  { key: 'building', label: 'Working', hint: 'The agent is on it' },
  { key: 'review', label: 'Checked', hint: 'The Director reviews the result' },
  { key: 'live', label: 'Done', hint: 'Accepted' },
];

function InProgressSection({ name, builds, tasks, onOpen }: { name: string; builds: HqBuild[]; tasks: HqTask[]; onOpen: (id: string) => void }) {
  const count = builds.length + tasks.length;
  return (
    <Panel id="in-progress" label="In progress">
      <SectionTitle count={count}>In progress</SectionTitle>
      {count === 0 ? (
        <EmptyState>No build or task is running right now.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {builds.map((b) => (
            <BuildRow key={b.id} build={b} name={name} onOpen={onOpen} />
          ))}
          {tasks.map((t) => (
            <li key={t.id} className="space-y-1 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 items-center gap-2">
                <MemberAvatar member={t.assignee} size="xs" />
                <span className="shrink-0 font-mono text-xs text-slate-400">#{t.number}</span>
                <button type="button" onClick={() => onOpen(t.id)} title={t.title} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-900 hover:underline">
                  {t.title}
                </button>
              </div>
              <WhatWhy what={t.assignee?.name ? `${t.assignee.name} is on it` : null} why={t.proposal?.why || whyLine(t.body)} />
              <Pipeline steps={TASK_STEPS.map((s, i) => ({ ...s, state: i === 0 ? 'done' : i === 1 ? 'current' : 'todo' }))} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function BuildRow({ build, name, onOpen }: { build: HqBuild; name: string; onOpen: (id: string) => void }) {
  const job = build.job;
  const { steps, outcome } = buildPipeline(build);
  const taskId = job?.taskId;
  return (
    <li className="space-y-1 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[11px] font-semibold text-slate-600">Build #{build.number}</span>
        {taskId ? (
          <button type="button" onClick={() => onOpen(taskId)} title={build.title} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-900 hover:underline">
            {build.title}
          </button>
        ) : (
          <span title={build.title} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
            {build.title}
          </span>
        )}
        {job && job.stage !== 'queued' && (
          <span className="hidden shrink-0 text-xs tabular-nums text-slate-400 sm:inline" title="Builder runs used of its limit">
            {job.runsUsed}/{job.runLimit} runs
          </span>
        )}
      </div>
      <WhatWhy
        what={job ? (job.stage === 'queued' ? 'Queued — starts when the Builder is free' : firstLine(job.note) || null) : `Waiting for ${name}’s review`}
        why={whyLine(build.directorSpec ?? build.spec)}
      />
      <Pipeline steps={steps} stoppedAs={outcome === 'failed' ? 'Failed' : outcome === 'cancelled' ? 'Stopped' : null} />
    </li>
  );
}

function WhatWhy({ what, why }: { what: string | null; why: string }) {
  if (!what && !why) return null;
  return (
    <p className="truncate text-xs text-slate-500" title={[what, why].filter(Boolean).join(' — ')}>
      {what && <span className="text-slate-700">{what}</span>}
      {what && why && ' — '}
      {why && (
        <>
          <span className="font-medium text-slate-600">Why: </span>
          {why}
        </>
      )}
    </p>
  );
}

// ── Done today ──

function DoneTodaySection({ rows, total, onOpen }: { rows: DoneRow[]; total: number; onOpen: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, DONE_VISIBLE);
  return (
    <Panel id="done-today" label="Done today">
      <SectionTitle count={total}>Done today</SectionTitle>
      {rows.length === 0 ? (
        <EmptyState>Nothing finished yet today.</EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {visible.map(({ task, runs }) => {
              const outcome = outcomeLine(task.result);
              return (
                <li key={task.id} className="flex min-w-0 items-center gap-2 py-1.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  <time dateTime={task.completedAt ?? undefined} className="w-10 shrink-0 text-xs tabular-nums text-slate-400">
                    {clock(task.completedAt)}
                  </time>
                  <button type="button" onClick={() => onOpen(task.id)} title={outcome ? `${task.title} — ${outcome}` : task.title} className="min-w-0 flex-1 truncate text-left hover:underline">
                    <span className="font-medium text-slate-800">{task.title}</span>
                    {outcome && <span className="text-slate-500"> — {outcome}</span>}
                  </button>
                  {runs > 1 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500" title={`Ran ${runs} times today`}>
                      ×{runs}
                    </span>
                  )}
                  <MemberAvatar member={task.assignee} size="xs" className="hidden sm:inline-grid" />
                </li>
              );
            })}
          </ul>
          {rows.length > DONE_VISIBLE && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-slate-500 hover:text-slate-900">
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}

// ── Brief and decisions (collapsed) ──

function Collapsible({ id, title, meta, children }: { id: string; title: ReactNode; meta?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel label={typeof title === 'string' ? title : undefined} className="py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          className="flex min-w-0 items-center gap-1.5 text-left text-sm font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          {title}
        </button>
        {meta}
      </div>
      {open && (
        <div id={id} className="mt-3">
          {children}
        </div>
      )}
    </Panel>
  );
}

function BriefPanel({ brief, onOpen }: { brief: HqDirectorBrief | null; onOpen: (id: string) => void }) {
  return (
    <Collapsible
      id="director-brief"
      title="Today’s brief"
      meta={
        brief && (
          <button type="button" onClick={() => onOpen(brief.taskId)} className="shrink-0 text-xs text-slate-400 hover:text-slate-700 hover:underline">
            #{brief.taskNumber} · {formatTbilisi(brief.completedAt)}
          </button>
        )
      }
    >
      {brief ? <Markdown>{brief.result}</Markdown> : <EmptyState>No brief yet.</EmptyState>}
    </Collapsible>
  );
}

const DECISION_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  director_approved: { icon: CheckCircle2, tone: 'text-emerald-600' },
  director_declined: { icon: XCircle, tone: 'text-slate-400' },
  director_escalated: { icon: ArrowUpRight, tone: 'text-amber-600' },
  director_accepted: { icon: BadgeCheck, tone: 'text-emerald-600' },
  director_reopened: { icon: RotateCcw, tone: 'text-blue-600' },
  director_cancelled: { icon: X, tone: 'text-slate-400' },
  director_updated: { icon: ArrowRightLeft, tone: 'text-blue-600' },
  escalation_resolved: { icon: CheckCheck, tone: 'text-slate-500' },
};

function DecisionsPanel({ name, decisions, onOpen }: { name: string; decisions: HqEvent[]; onOpen: (id: string) => void }) {
  return (
    <Collapsible id="director-decisions" title={`${name}’s recent calls`} meta={<span className="text-xs text-slate-400">{decisions.length}</span>}>
      {decisions.length === 0 ? (
        <EmptyState>No decisions yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {decisions.map((e) => {
            const { icon: Icon, tone } = DECISION_ICONS[e.type] ?? { icon: CircleDot, tone: 'text-slate-400' };
            return (
              <li key={e.id} className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden />
                <div className="min-w-0 flex-1">
                  {e.taskId ? (
                    <button type="button" onClick={() => onOpen(e.taskId!)} className="text-left text-sm text-slate-700 hover:underline">
                      {e.message}
                    </button>
                  ) : (
                    <p className="text-sm text-slate-700">{e.message}</p>
                  )}
                  <time dateTime={e.ts} title={formatTbilisi(e.ts)} className="text-xs text-slate-400">
                    {formatRelative(e.ts)}
                  </time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Collapsible>
  );
}
