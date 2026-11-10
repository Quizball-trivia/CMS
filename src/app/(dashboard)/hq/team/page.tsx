'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers, useSyncHqHumans } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatUsd } from '@/lib/hq-board';
import type { HqMember } from '@/types';
import { EmptyState, LoadErrorState, MemberAvatar, MemberStatusDot, PageHeader, RefreshErrorBanner, errorMessage } from '../hq-ui';
import { HQ_DEPARTMENTS, departmentHref } from '@/lib/hq-departments';
import { HireAgentDialog } from './hire-agent-dialog';

const RUNTIME_LABELS: Record<HqMember['runtime'], string> = {
  hq: 'HQ agent',
  question_agents: 'Question pipeline',
  bug_triage: 'Bug triage pipeline',
  quiz_pages: 'Quiz page pipeline',
  none: 'Person',
};

export default function HqTeamPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const members = data ?? [];
  const sync = useSyncHqHumans();
  const [hireOpen, setHireOpen] = useState(false);
  const router = useRouter();

  const byDepartment = HQ_DEPARTMENTS.map((d) => ({
    dept: d,
    // Agents first, then people — the same order as everywhere else in HQ.
    members: members
      .filter((m) => m.department === d.key)
      .sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === 'agent' ? -1 : 1)),
  }));
  const agentCount = members.filter((m) => m.kind === 'agent').length;
  const peopleCount = members.length - agentCount;

  return (
    <div className="mx-auto max-w-7xl space-y-10 pb-16">
      <PageHeader
        icon={<Users className="h-6 w-6 text-slate-700" />}
        title="Team"
        description={`Everyone who works at QuizBall — ${agentCount} AI ${agentCount === 1 ? 'agent' : 'agents'} and ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} — organised by department.`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  onSuccess: (res) => toast.success(`Staff synced — ${res.items.length} people`),
                  onError: (e) => toast.error(errorMessage(e, 'Could not sync staff')),
                })
              }
            >
              <RefreshCw className={cn('h-4 w-4', sync.isPending && 'animate-spin')} /> Sync staff
            </Button>
            <Button onClick={() => setHireOpen(true)}>
              <UserPlus className="h-4 w-4" /> Hire agent
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the team." onRetry={() => void refetch()} />}
      {error && data && <RefreshErrorBanner />}

      {data &&
        byDepartment.map(({ dept, members: list }) => (
          <section key={dept.key}>
            <div className="mb-4 flex items-center gap-3">
              <span className="text-3xl leading-none" aria-hidden>
                {dept.emoji}
              </span>
              <Link href={departmentHref(dept.key)} className="text-2xl font-extrabold tracking-tight text-slate-900 hover:underline">
                {dept.name}
              </Link>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-bold text-slate-600">{list.length}</span>
            </div>
            {list.length === 0 ? (
              <EmptyState>No one in {dept.name} yet. Hire an agent and pick this department.</EmptyState>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((m) => (
                  <MemberCard key={m.id} member={m} />
                ))}
              </div>
            )}
          </section>
        ))}

      <HireAgentDialog
        open={hireOpen}
        onOpenChange={setHireOpen}
        onHired={(member) => router.push(`/hq/team/${member.id}`)}
      />
    </div>
  );
}

function MemberCard({ member: m }: { member: HqMember }) {
  const busy = !!m.stats.currentTask;
  return (
    <Link
      href={`/hq/team/${m.id}`}
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
