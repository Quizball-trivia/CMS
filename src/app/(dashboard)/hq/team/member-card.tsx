import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/hq-board';
import type { HqMember } from '@/types';
import { MemberAvatar, memberHref } from '../hq-ui';

export const RUNTIME_LABELS: Record<HqMember['runtime'], string> = {
  hq: 'HQ agent',
  question_agents: 'Question pipeline',
  bug_triage: 'Bug triage pipeline',
  quiz_pages: 'Quiz page pipeline',
  none: 'Person',
};

/**
 * Agents are on, working or paused. People show a status only when their account isn't active
 * (e.g. archived), so it never reads like a second "last active" signal.
 */
export function MemberState({ member: m, busy }: { member: Pick<HqMember, 'kind' | 'status'>; busy: boolean }) {
  if (m.kind === 'human' && m.status === 'active') return null;
  const word = m.status !== 'active' ? m.status : busy ? 'working' : 'on';
  const dot = m.status !== 'active' ? 'bg-slate-300' : busy ? 'animate-pulse bg-blue-500' : 'bg-emerald-500';
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-slate-600">
      <span aria-hidden className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
      {word}
    </span>
  );
}

/** When the member last did something: an agent's last run, a person's last visit to HQ. */
export function lastActivityLabel(m: Pick<HqMember, 'kind' | 'lastActiveAt' | 'stats'>): string {
  if (m.kind === 'agent') return m.stats.lastRun ? `last run ${formatRelative(m.stats.lastRun.startedAt)}` : 'no runs yet';
  return m.lastActiveAt ? `last seen ${formatRelative(m.lastActiveAt)}` : 'never signed in to HQ';
}

// Tools, autonomy and the other settings live on the member's profile, not on the roster card.
export function MemberCard({ member: m }: { member: HqMember }) {
  const busy = !!m.stats.currentTask;
  return (
    <Link
      href={memberHref(m)}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50',
        m.status === 'archived' && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <MemberAvatar member={m} size="md" />
        <div className="min-w-0 flex-1">
          <div className="break-words text-[15px] font-semibold leading-snug text-slate-950">{m.name}</div>
          <div className="mt-0.5 break-words text-[13px] text-slate-600">
            {m.title || RUNTIME_LABELS[m.runtime]}
            {/* Without a title the runtime label is already shown above — don't repeat it. */}
            {m.title && m.kind === 'agent' && m.runtime !== 'hq' && RUNTIME_LABELS[m.runtime] ? ` · ${RUNTIME_LABELS[m.runtime]}` : ''}
          </div>
        </div>
        <span className="mt-0.5">
          <MemberState member={m} busy={busy} />
        </span>
      </div>

      {/* Two lines, full text on hover; agent cards keep the space so a row of cards lines up. */}
      {(m.description || m.kind === 'agent') && (
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-slate-700" title={m.description || undefined}>
          {m.description}
        </p>
      )}

      <div className="mt-auto space-y-1 border-t border-slate-100 pt-2 text-[13px] tabular-nums text-slate-600">
        {busy && (
          <div className="truncate text-blue-700">
            Working on #{m.stats.currentTask!.number} {m.stats.currentTask!.title}
          </div>
        )}
        <div>
          {m.stats.openTasks} open · {m.kind === 'agent' ? `${m.stats.runsToday} runs today · ` : ''}
          {lastActivityLabel(m)}
        </div>
      </div>
    </Link>
  );
}
