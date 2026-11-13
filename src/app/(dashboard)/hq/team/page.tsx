'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useHqMembers } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_PAGE, LoadErrorState, PageHeader, RefreshErrorBanner, Section } from '../hq-ui';
import { HQ_DEPARTMENTS, departmentHref } from '@/lib/hq-departments';
import { AgentRoster } from './agent-roster';
import { HireAgentDialog } from './hire-agent-dialog';
import { MemberCard } from './member-card';
import { TeamTabs } from './team-tabs';

type AgentsView = 'roster' | 'cards';
const VIEWS: Array<{ key: AgentsView; label: string }> = [
  { key: 'roster', label: 'Roster' },
  { key: 'cards', label: 'Cards' },
];
const VIEW_STORAGE_KEY = 'hq.agents.view';
const VIEW_EVENT = 'hq-agents-view';

// The chosen view is remembered per browser. Storage can be blocked, so the choice also lives in memory.
let memoryView: AgentsView | null = null;
const subscribeView = (onChange: () => void) => {
  // Another tab chose a view (or cleared storage): its choice replaces this tab's in-memory one.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== VIEW_STORAGE_KEY) return;
    // Events arrive late: what is stored now wins over the value the event carries.
    let stored: string | null = e.newValue;
    try {
      stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    } catch {
      // storage unreadable: the event's value is the best we have
    }
    memoryView = stored === 'roster' || stored === 'cards' ? stored : null;
    onChange();
  };
  window.addEventListener(VIEW_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(VIEW_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
};
const readView = (): AgentsView => {
  if (memoryView) return memoryView;
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'cards' ? 'cards' : 'roster';
  } catch {
    return 'roster';
  }
};
const chooseView = (next: AgentsView) => {
  memoryView = next;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, next);
  } catch {
    // storage blocked: the choice lasts until the page is closed
  }
  window.dispatchEvent(new Event(VIEW_EVENT));
};

// The AI agents, by department. People have their own page (/hq/people).
export default function HqAgentsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  // The compact roster is the default view.
  const view = useSyncExternalStore(subscribeView, readView, () => 'roster' as AgentsView);
  const { data, isLoading, error, refetch } = useHqMembers(includeArchived);
  const agents = (data ?? []).filter((m) => m.kind === 'agent');
  const [hireOpen, setHireOpen] = useState(false);
  const router = useRouter();

  const byDepartment = HQ_DEPARTMENTS.map((d) => ({
    dept: d,
    members: agents.filter((m) => m.department === d.key).sort((x, y) => x.name.localeCompare(y.name)),
  }));

  const emptyDepartments = byDepartment.filter(({ members: list }) => list.length === 0);
  const filledDepartments = byDepartment.filter(({ members: list }) => list.length > 0);

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow={<TeamTabs active="agents" />}
        title="Agents"
        description={`${agents.length} AI ${agents.length === 1 ? 'agent' : 'agents'}, organised by department.`}
        actions={
          <Button onClick={() => setHireOpen(true)}>
            <UserPlus className="h-4 w-4" /> Hire agent
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={includeArchived} onCheckedChange={(v) => setIncludeArchived(v === true)} />
          Show archived
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
        <div className="ml-auto inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="radiogroup" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="radio"
              aria-checked={view === v.key}
              onClick={() => chooseView(v.key)}
              className={cn('rounded px-3 py-1 text-sm font-medium transition', view === v.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data && <LoadErrorState error={error} fallback="Could not load the agents." onRetry={() => void refetch()} />}
      {error && data && <RefreshErrorBanner />}

      {data && view === 'roster' && filledDepartments.length > 0 && <AgentRoster groups={filledDepartments.map(({ dept, members }) => ({ dept, members }))} />}

      {data &&
        view === 'cards' &&
        filledDepartments.map(({ dept, members: list }) => (
          <Section
            key={dept.key}
            title={
              <Link href={departmentHref(dept.key)} className="hover:underline">
                {dept.name}
              </Link>
            }
            count={list.length}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((m) => (
                <MemberCard key={m.id} member={m} />
              ))}
              </div>
          </Section>
        ))}

      {data && emptyDepartments.length > 0 && (
        <p className="text-sm text-slate-600">
          No agents yet in{' '}
          {emptyDepartments.map(({ dept }, i) => (
            <span key={dept.key}>
              {i > 0 && (i === emptyDepartments.length - 1 ? ' or ' : ', ')}
              <Link href={departmentHref(dept.key)} className="font-medium text-slate-700 hover:underline">
                {dept.name}
              </Link>
            </span>
          ))}
          . Hire one and pick the department.
        </p>
      )}

      <HireAgentDialog
        open={hireOpen}
        onOpenChange={setHireOpen}
        onHired={(member) => router.push(`/hq/team/${member.id}`)}
      />
    </div>
  );
}
