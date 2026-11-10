'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleDot,
  Compass,
  Loader2,
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
  useHqDirector,
  useHqDirectorChat,
  useHqSettings,
  useResolveEscalation,
  useSendDirectorChat,
  useUpdateHqMember,
} from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi } from '@/lib/hq-board';
import { founderActions, modelBadgeLabel } from '@/lib/hq-director';
import type { HqDirectorBrief, HqEvent, HqMember, HqMessage, HqSettings, HqTask } from '@/types';
import {
  EmptyState,
  LoadErrorState,
  Markdown,
  MemberAvatar,
  MemberStatusDot,
  PageHeader,
  RefreshErrorBanner,
  SectionTitle,
  TaskStatusBadge,
  errorMessage,
  useTaskSheet,
} from '../hq-ui';

const MAX_MESSAGE_LENGTH = 8000;

/** Why a queued message isn't being answered yet, in the order the worker checks. */
function queuedReason(director: HqMember, settings: HqSettings | undefined): string {
  if (director.status !== 'active') return 'The Director is switched off — he answers once you switch him on.';
  if (settings?.paused) return 'All agents are paused — he answers when you resume.';
  if (settings?.plan && settings.plan.state !== 'ok' && settings.plan.until) {
    return `Waiting for the Claude plan to reset (${formatTbilisi(settings.plan.until)}).`;
  }
  return 'Waiting for a free slot…';
}

export default function HqDirectorPage() {
  const { data, isLoading, error, refetch } = useHqDirector();
  const { openTask } = useTaskSheet();

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 pb-16">
        <PageHeader icon={<Compass className="h-6 w-6 text-slate-700" />} title="Director" description="Your Executive Director runs the team so you don’t have to." />
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <LoadErrorState error={error} fallback="Could not load the Director." onRetry={() => void refetch()} />
        )}
      </div>
    );
  }

  const { director, brief, needsYou, decisions, chat } = data;

  if (!director) {
    return (
      <div className="mx-auto max-w-7xl space-y-5 pb-16">
        <PageHeader icon={<Compass className="h-6 w-6 text-slate-700" />} title="Director" description="Your Executive Director runs the team so you don’t have to." />
        <EmptyState>No director yet</EmptyState>
      </div>
    );
  }

  const working = chat.running || !!director.stats?.currentTask;

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-16">
      <PageHeader
        icon={<span aria-hidden>{director.avatar || '🧭'}</span>}
        eyebrow="Executive Director"
        title={director.name}
        description={director.title}
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ChatPanel director={director} />
        <div className="space-y-5">
          <TodayPlan tasks={data.plan ?? []} onOpen={openTask} />
          {/* Undecided plan items are in the panel above; a plan item that needs you again later stays here. */}
          <NeedsYou
            tasks={needsYou.filter((t) => !(t.status === 'proposed' && (data.plan ?? []).some((p) => p.id === t.id)))}
            onOpen={openTask}
          />
          <RightNow tasks={data.runningNow ?? []} onOpen={openTask} />
          <BriefPanel brief={brief} onOpen={openTask} />
          <DecisionsPanel decisions={decisions} onOpen={openTask} />
        </div>
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
    <section aria-label="Chat with the Director" className="flex h-[70vh] min-h-[480px] flex-col rounded-xl border border-slate-200 bg-white">
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

// ── Side column ──

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4">{children}</section>;
}

/** This morning's plan: each item starts only after the founder says Do it. */
function TodayPlan({ tasks, onOpen }: { tasks: HqTask[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) return null;
  const waiting = tasks.filter((t) => t.status === 'proposed').length;
  return (
    <Panel>
      <SectionTitle count={waiting}>Today’s plan</SectionTitle>
      <p className="mb-2 text-xs text-slate-500">
        {waiting ? 'Approve what he should do today; the rest stays parked.' : 'All items are decided — anything that needs you again shows under Needs you.'}
      </p>
      <ul className="space-y-2">
        {tasks.map((t) =>
          t.status === 'proposed' ? (
            <NeedsYouItem key={t.id} task={t} onOpen={onOpen} />
          ) : (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <TaskStatusBadge status={t.status} />
              <button type="button" onClick={() => onOpen(t.id)} className="truncate text-left text-slate-700 hover:underline">
                <span className="mr-1.5 font-mono text-xs text-slate-400">#{t.number}</span>
                {t.title}
              </button>
            </li>
          )
        )}
      </ul>
    </Panel>
  );
}

/** What every agent is doing at this moment. */
function RightNow({ tasks, onOpen }: { tasks: HqTask[]; onOpen: (id: string) => void }) {
  return (
    <Panel>
      <SectionTitle count={tasks.length}>Right now</SectionTitle>
      {tasks.length === 0 ? (
        <EmptyState>No agent is working at the moment.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <MemberAvatar member={t.assignee} size="xs" />
              <span className="shrink-0 font-medium text-slate-800">{t.assignee?.name ?? 'Someone'}</span>
              <button type="button" onClick={() => onOpen(t.id)} className="min-w-0 truncate text-left text-slate-600 hover:underline">
                {t.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NeedsYou({ tasks, onOpen }: { tasks: HqTask[]; onOpen: (id: string) => void }) {
  return (
    <Panel>
      <SectionTitle count={tasks.length}>Needs you</SectionTitle>
      {tasks.length === 0 ? (
        <EmptyState>Nothing needs you right now.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <NeedsYouItem key={t.id} task={t} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NeedsYouItem({ task, onOpen }: { task: HqTask; onOpen: (id: string) => void }) {
  const resolve = useResolveEscalation();
  const accept = useAcceptHqProposal();
  const decline = useDeclineHqProposal();
  const actions = founderActions(task);
  const busy = resolve.isPending || accept.isPending || decline.isPending;
  const note = task.director?.note;

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
    <li className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        <MemberAvatar member={task.assignee} size="xs" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onOpen(task.id)} className="block max-w-full text-left text-sm font-semibold text-slate-900 hover:underline">
            <span className="mr-1.5 font-mono text-xs font-normal text-slate-400">#{task.number}</span>
            {task.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <TaskStatusBadge status={task.status} />
            {task.assignee && <span className="text-xs text-slate-500">{task.assignee.name}</span>}
          </div>
        </div>
      </div>
      {note && <p className="whitespace-pre-wrap break-words rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">{note}</p>}
      {(actions.handled || actions.doIt || actions.notNow) && (
        <div className="flex flex-wrap gap-2">
          {actions.doIt && (
            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={doIt} disabled={busy}>
              <Check className="h-4 w-4" /> Do it
            </Button>
          )}
          {actions.notNow && (
            <Button size="sm" variant="ghost" className="text-slate-500" onClick={notNow} disabled={busy}>
              <X className="h-4 w-4" /> Not now
            </Button>
          )}
          {actions.handled && (
            <Button size="sm" variant="outline" onClick={handled} disabled={busy}>
              <CheckCheck className="h-4 w-4" /> {task.status === 'todo' || task.status === 'backlog' ? 'Approve' : 'Handled'}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function BriefPanel({ brief, onOpen }: { brief: HqDirectorBrief | null; onOpen: (id: string) => void }) {
  return (
    <Panel>
      <SectionTitle
        right={
          brief && (
            <button type="button" onClick={() => onOpen(brief.taskId)} className="text-xs text-slate-400 hover:text-slate-700 hover:underline">
              #{brief.taskNumber} · {formatTbilisi(brief.completedAt)}
            </button>
          )
        }
      >
        Today’s brief
      </SectionTitle>
      {brief ? (
        <div className="max-h-96 overflow-y-auto pr-1">
          <Markdown>{brief.result}</Markdown>
        </div>
      ) : (
        <EmptyState>No brief yet.</EmptyState>
      )}
    </Panel>
  );
}

const DECISION_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  director_approved: { icon: CheckCircle2, tone: 'text-emerald-600' },
  director_declined: { icon: XCircle, tone: 'text-slate-400' },
  director_escalated: { icon: ArrowUpRight, tone: 'text-amber-600' },
  director_accepted: { icon: BadgeCheck, tone: 'text-emerald-600' },
  director_reopened: { icon: RotateCcw, tone: 'text-blue-600' },
  director_cancelled: { icon: X, tone: 'text-slate-400' },
  escalation_resolved: { icon: CheckCheck, tone: 'text-slate-500' },
};

function DecisionsPanel({ decisions, onOpen }: { decisions: HqEvent[]; onOpen: (id: string) => void }) {
  return (
    <Panel>
      <SectionTitle count={decisions.length}>Decisions</SectionTitle>
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
    </Panel>
  );
}
