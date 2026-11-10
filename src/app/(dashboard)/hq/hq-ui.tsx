'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { HQ_PRIORITY_LABELS, HQ_STATUS_LABELS, formatRelative } from '@/lib/hq-board';
import { stripMarkdown } from '@/lib/hq-markdown';
import type { HqMemberRef, HqMemberStatus, HqPriority, HqRunStatus, HqTask, HqTaskStatus } from '@/types';

// ── Page header ──

/** Consistent header for every HQ page: what it is, and what it's for. */
/** A member's profile: people under /hq/people, agents under /hq/team (the Agents page). */
export function memberHref(m: { id: string; kind: 'human' | 'agent' }): string {
  return m.kind === 'human' ? `/hq/people/${m.id}` : `/hq/team/${m.id}`;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start gap-4 pb-1">
      {icon && <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-slate-200">{icon}</div>}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

// ── Member stack (avatars with status) ──

export type MemberActivity = 'working' | 'idle' | 'paused';

/** Overlapping avatars with a working (blue) / idle (green) / paused (grey) dot each. */
export function MemberStack({
  members,
  activityOf,
  max = 6,
  size = 'sm',
}: {
  members: HqMemberRef[];
  activityOf: (id: string) => MemberActivity | undefined;
  max?: number;
  size?: 'xs' | 'sm';
}) {
  const shown = members.slice(0, max);
  const extra = members.length - shown.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((m) => {
          const activity = activityOf(m.id);
          return (
            <span key={m.id} className="relative" title={`${m.name}${activity ? ` · ${activity}` : ''}`}>
              <MemberAvatar member={m} size={size} className="ring-2 ring-white" />
              {activity && m.kind === 'agent' && (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white',
                    activity === 'working' ? 'animate-pulse bg-blue-500' : activity === 'paused' ? 'bg-slate-300' : 'bg-emerald-500'
                  )}
                />
              )}
            </span>
          );
        })}
      </div>
      {extra > 0 && <span className="ml-1.5 text-xs font-medium text-slate-400">+{extra}</span>}
    </div>
  );
}

// ── Opening the task sheet from anywhere (?task=<id>) ──

export function useTaskSheet() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get('task');

  const setTask = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('task', id);
      else params.delete('task');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { openTaskId, openTask: setTask, closeTask: () => setTask(null) };
}

// ── Badges ──

const TASK_STATUS_STYLES: Record<HqTaskStatus, string> = {
  backlog: 'border-slate-200 bg-slate-50 text-slate-500',
  todo: 'border-slate-200 bg-slate-100 text-slate-700',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-700',
  needs_approval: 'border-amber-200 bg-amber-50 text-amber-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-400 line-through',
  proposed: 'border-violet-200 bg-violet-50 text-violet-700',
};

export function TaskStatusBadge({ status, className }: { status: HqTaskStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TASK_STATUS_STYLES[status], className)}>
      {HQ_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const PRIORITY_STYLES = [
  'border-red-200 bg-red-50 text-red-700',
  'border-amber-200 bg-amber-50 text-amber-700',
  'border-slate-200 bg-white text-slate-500',
  'border-slate-200 bg-white text-slate-400',
];

export function PriorityBadge({ priority, hideNormal = false }: { priority: HqPriority; hideNormal?: boolean }) {
  if (hideNormal && priority >= 2) return null;
  return (
    <Badge variant="outline" className={cn('text-[11px]', PRIORITY_STYLES[priority])}>
      {HQ_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

const RUN_STATUS_STYLES: Record<HqRunStatus, string> = {
  running: 'border-blue-200 bg-blue-50 text-blue-700',
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  timeout: 'border-orange-200 bg-orange-50 text-orange-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

export function RunStatusBadge({ status }: { status: HqRunStatus }) {
  return (
    <Badge variant="outline" className={RUN_STATUS_STYLES[status] ?? RUN_STATUS_STYLES.cancelled}>
      {status}
    </Badge>
  );
}

export function MemberStatusDot({ status, busy }: { status: HqMemberStatus; busy?: boolean }) {
  const color = status !== 'active' ? 'bg-slate-300' : busy ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500';
  const label = status !== 'active' ? status : busy ? 'working' : 'idle';
  return <span title={label} aria-label={label} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', color)} />;
}

// ── Avatars ──

// Literal class names so Tailwind picks them up.
const AVATAR_COLORS: Record<string, string> = {
  slate: 'bg-slate-100 ring-slate-200',
  gray: 'bg-gray-100 ring-gray-200',
  red: 'bg-red-100 ring-red-200',
  orange: 'bg-orange-100 ring-orange-200',
  amber: 'bg-amber-100 ring-amber-200',
  yellow: 'bg-yellow-100 ring-yellow-200',
  lime: 'bg-lime-100 ring-lime-200',
  green: 'bg-green-100 ring-green-200',
  emerald: 'bg-emerald-100 ring-emerald-200',
  teal: 'bg-teal-100 ring-teal-200',
  cyan: 'bg-cyan-100 ring-cyan-200',
  sky: 'bg-sky-100 ring-sky-200',
  blue: 'bg-blue-100 ring-blue-200',
  indigo: 'bg-indigo-100 ring-indigo-200',
  violet: 'bg-violet-100 ring-violet-200',
  purple: 'bg-purple-100 ring-purple-200',
  pink: 'bg-pink-100 ring-pink-200',
  rose: 'bg-rose-100 ring-rose-200',
};

export const HQ_AVATAR_COLOR_NAMES = Object.keys(AVATAR_COLORS);

const AVATAR_SIZES = {
  xs: 'h-5 w-5 text-[11px]',
  sm: 'h-7 w-7 text-sm',
  md: 'h-9 w-9 text-lg',
  lg: 'h-14 w-14 text-3xl',
};

export function MemberAvatar({
  member,
  size = 'sm',
  className,
}: {
  member: Pick<HqMemberRef, 'avatar' | 'color' | 'name'> | null;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  if (!member) {
    return (
      <span
        title="Unassigned"
        className={cn(
          'inline-grid shrink-0 place-items-center rounded-full border border-dashed border-slate-300 text-slate-300',
          AVATAR_SIZES[size],
          className
        )}
      >
        ·
      </span>
    );
  }
  return (
    <span
      title={member.name}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full ring-1',
        AVATAR_COLORS[member.color] ?? AVATAR_COLORS.slate,
        AVATAR_SIZES[size],
        className
      )}
    >
      <span aria-hidden>{member.avatar || '🙂'}</span>
    </span>
  );
}

export function MemberChip({ member, href = true }: { member: HqMemberRef | null; href?: boolean }) {
  const inner = (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <MemberAvatar member={member} size="xs" />
      <span className="truncate text-xs font-medium text-slate-700">{member ? member.name : 'Unassigned'}</span>
    </span>
  );
  if (!member || !href) return inner;
  return (
    <Link href={memberHref(member)} className="min-w-0 hover:underline" onClick={(e) => e.stopPropagation()}>
      {inner}
    </Link>
  );
}

// ── Task row (lists on overview/member pages) ──

export function TaskRow({
  task,
  onOpen,
  right,
  showResultPreview = false,
}: {
  task: HqTask;
  onOpen: (id: string) => void;
  right?: ReactNode;
  showResultPreview?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        // Keys typed in children — including portaled dialogs like "Send back",
        // whose React events bubble through this row — must not open the task.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(task.id);
        }
      }}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300 hover:bg-slate-50"
    >
      <MemberAvatar member={task.assignee} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-slate-400">#{task.number}</span>
          <span className="truncate text-sm font-semibold text-slate-900">{task.title}</span>
          <PriorityBadge priority={task.priority} hideNormal />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{task.assignee?.name ?? 'Unassigned'}</span>
          <span>·</span>
          <span>{formatRelative(task.completedAt ?? task.updatedAt)}</span>
          {task.messageCount > 0 && (
            <>
              <span>·</span>
              <span>{task.messageCount} msg</span>
            </>
          )}
        </div>
        {showResultPreview && task.result && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{stripMarkdown(task.result)}</p>
        )}
      </div>
      {right ? (
        <div className="shrink-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {right}
        </div>
      ) : null}
    </div>
  );
}


// ── Markdown ──

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-slate-700 break-words', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-3 text-base font-bold text-slate-900">{children}</h3>,
          h2: ({ children }) => <h4 className="mt-3 text-sm font-bold text-slate-900">{children}</h4>,
          h3: ({ children }) => <h5 className="mt-2 text-sm font-semibold text-slate-900">{children}</h5>,
          h4: ({ children }) => <h6 className="mt-2 text-sm font-semibold text-slate-800">{children}</h6>,
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-blue-700 underline underline-offset-2">
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-300 pl-3 italic text-slate-600">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] text-slate-800">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-[12px] text-slate-100 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-slate-100">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1 align-top">{children}</td>,
          hr: () => <hr className="border-slate-200" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// ── Misc ──

/** Full error state for a query that failed with nothing cached to show. */
export function LoadErrorState({ error, fallback, onRetry }: { error: unknown; fallback: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span className="min-w-0 flex-1">{errorMessage(error, fallback)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
          Retry
        </button>
      )}
    </div>
  );
}

/** Non-destructive notice for a failed background refetch while cached data stays on screen. */
export function RefreshErrorBanner({ className }: { className?: string }) {
  return (
    <div role="status" className={cn('rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800', className)}>
      Couldn&apos;t refresh — retrying. You&apos;re seeing the last loaded version.
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{children}</p>;
}

export function SectionTitle({ children, count, right }: { children: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
        {children}
        {count !== undefined && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{count}</span>
        )}
      </h2>
      {right}
    </div>
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
    return (error as { message: string }).message || fallback;
  }
  return fallback;
}
