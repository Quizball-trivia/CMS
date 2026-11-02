'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers, useSyncHqHumans } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatUsd } from '@/lib/hq-board';
import type { HqMember } from '@/types';
import { LoadErrorState, MemberAvatar, MemberStatusDot, RefreshErrorBanner, SectionTitle, errorMessage } from '../hq-ui';
import { HireAgentDialog } from './hire-agent-dialog';

const RUNTIME_LABELS: Record<HqMember['runtime'], string> = {
  hq: 'HQ agent',
  question_agents: 'Question pipeline',
  bug_triage: 'Bug triage pipeline',
  none: 'Person',
};

export default function HqTeamPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const members = data ?? [];
  const sync = useSyncHqHumans();
  const [hireOpen, setHireOpen] = useState(false);
  const router = useRouter();

  const agents = members.filter((m) => m.kind === 'agent');
  const people = members.filter((m) => m.kind === 'human');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        <div className="ml-auto flex gap-2">
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
        </div>
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the team." onRetry={() => void refetch()} />}
      {error && data && <RefreshErrorBanner />}

      <section>
        <SectionTitle count={agents.length}>Agents</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
      </section>

      <section>
        <SectionTitle count={people.length}>People</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {people.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </div>
        {people.length === 0 && !isLoading && (
          <p className="text-sm text-slate-400">No people yet — press &quot;Sync staff&quot; to add every CMS admin.</p>
        )}
      </section>

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
        'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm',
        m.status === 'archived' && 'opacity-60'
      )}
    >
      <div className="flex items-start gap-3">
        <MemberAvatar member={m} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MemberStatusDot status={m.status} busy={busy} />
            <span className="truncate font-bold text-slate-900">{m.name}</span>
          </div>
          <div className="truncate text-xs text-slate-500">
            {m.title || RUNTIME_LABELS[m.runtime]}
            {m.kind === 'agent' && m.runtime !== 'hq' ? ` · ${RUNTIME_LABELS[m.runtime]}` : ''}
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
