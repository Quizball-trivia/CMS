import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRelative, formatUsd } from '@/lib/hq-board';
import type { HqMember } from '@/types';
import { MemberAvatar, MemberStatusDot, memberHref } from '../hq-ui';

const RUNTIME_LABELS: Record<HqMember['runtime'], string> = {
  hq: 'HQ agent',
  question_agents: 'Question pipeline',
  bug_triage: 'Bug triage pipeline',
  quiz_pages: 'Quiz page pipeline',
  none: 'Person',
};

export function MemberCard({ member: m }: { member: HqMember }) {
  const busy = !!m.stats.currentTask;
  return (
    <Link
      href={memberHref(m)}
      className={cn(
        'flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs transition hover:border-slate-300 hover:shadow-sm',
        m.status === 'archived' && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <MemberAvatar member={m} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MemberStatusDot status={m.status} busy={busy} />
            <span className="truncate text-lg font-bold text-slate-900">{m.name}</span>
          </div>
          <div className="truncate text-xs text-slate-500">
            {m.title || RUNTIME_LABELS[m.runtime]}
            {/* Without a title the runtime label is already shown above — don't repeat it. */}
            {m.title && m.kind === 'agent' && m.runtime !== 'hq' ? ` · ${RUNTIME_LABELS[m.runtime]}` : ''}
          </div>
        </div>
        {m.status !== 'active' && (
          <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">
            {m.status}
          </Badge>
        )}
      </div>

      {m.description && <p className="line-clamp-2 text-xs text-slate-600">{m.description}</p>}

      {m.kind === 'agent' && m.runtime === 'hq' && (
        <div className="flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className={m.autonomy === 'autonomous' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
          >
            {m.autonomy === 'autonomous' ? 'Autonomous' : 'Needs approval'}
          </Badge>
          {m.tools.map((t) => (
            <Badge key={t} variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-auto border-t border-slate-100 pt-2 text-xs text-slate-500">
        {busy ? (
          <span className="text-blue-700">
            Working on #{m.stats.currentTask!.number} {m.stats.currentTask!.title}
          </span>
        ) : (
          <span>
            {m.stats.openTasks} open · {m.stats.runsToday} runs today
            {m.stats.costTodayCents > 0 ? ` · ${formatUsd(m.stats.costTodayCents)}` : ''}
            {m.stats.lastRun ? ` · last run ${formatRelative(m.stats.lastRun.startedAt)}` : ''}
          </span>
        )}
      </div>
    </Link>
  );
}
