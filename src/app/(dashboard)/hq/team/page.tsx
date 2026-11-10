'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bot, Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers } from '@/hooks';
import { EmptyState, LoadErrorState, PageHeader, RefreshErrorBanner } from '../hq-ui';
import { HQ_DEPARTMENTS, departmentHref } from '@/lib/hq-departments';
import { HireAgentDialog } from './hire-agent-dialog';
import { MemberCard } from './member-card';

// The AI agents, by department. People have their own page (/hq/people).
export default function HqAgentsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const agents = (data ?? []).filter((m) => m.kind === 'agent');
  const [hireOpen, setHireOpen] = useState(false);
  const router = useRouter();

  const byDepartment = HQ_DEPARTMENTS.map((d) => ({
    dept: d,
    members: agents.filter((m) => m.department === d.key).sort((x, y) => x.name.localeCompare(y.name)),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-10 pb-16">
      <PageHeader
        icon={<Bot className="h-6 w-6 text-slate-700" />}
        title="Agents"
        description={`${agents.length} AI ${agents.length === 1 ? 'agent' : 'agents'}, organised by department.`}
        actions={
          <Button onClick={() => setHireOpen(true)}>
            <UserPlus className="h-4 w-4" /> Hire agent
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the agents." onRetry={() => void refetch()} />}
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
              <EmptyState>No agents in {dept.name} yet. Hire one and pick this department.</EmptyState>
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
