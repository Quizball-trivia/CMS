'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqDepartments, useHqMembers, useHqSchedules, useHqTasks } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_STATUS_LABELS, compareTasks, defaultDepartmentAssignee, formatRelative } from '@/lib/hq-board';
import { departmentInfo, type HqDepartmentInfo } from '@/lib/hq-departments';
import type { HqDepartment, HqMember, HqTask, HqTaskStatus } from '@/types';
import {
  EmptyState,
  LoadErrorState,
  MemberAvatar,
  PageHeader,
  RefreshErrorBanner,
  TaskRow,
  TaskStatusBadge,
  useTaskSheet,
} from '../../hq-ui';
import { NewTaskDialog } from '../../new-task-dialog';
import { SchedulesTable } from '../../schedules-ui';

// Open work, in the order a CEO reads it: what needs them first.
const OPEN_ORDER: HqTaskStatus[] = ['needs_approval', 'blocked', 'in_progress', 'todo', 'backlog'];

export default function DepartmentPage() {
  const params = useParams<{ key: string }>();
  const info = departmentInfo(params?.key);
  if (!info) {
    return (
      <div className="space-y-3">
        <Link href="/hq" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Command Center
        </Link>
        <EmptyState>There&apos;s no department called “{params?.key}”.</EmptyState>
      </div>
    );
  }
  return <Department info={info} />;
}

function Department({ info }: { info: HqDepartmentInfo }) {
  const { openTask } = useTaskSheet();
  const departments = useHqDepartments();
  const membersQuery = useHqMembers();
  const openTasks = useHqTasks({ department: info.key, status: OPEN_ORDER, limit: 200 });
  const doneTasks = useHqTasks({ department: info.key, status: ['done'], limit: 10 });
  const schedules = useHqSchedules();
  const [giveTo, setGiveTo] = useState<string | null | undefined>(undefined); // undefined = closed

  const live = departments.data?.find((d) => d.key === info.key);
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const deptMembers = useMemo(
    () =>
      members
        .filter((m) => m.department === info.key && m.status !== 'archived')
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'agent' ? -1 : 1)),
    [members, info.key]
  );
  const memberIds = new Set(deptMembers.map((m) => m.id));
  const deptSchedules = (schedules.data ?? []).filter((s) => memberIds.has(s.member.id));
  const defaultAssignee = defaultDepartmentAssignee(deptMembers, members);
  const refreshFailed = [departments, membersQuery, openTasks, doneTasks].some((q) => q.error && q.data);

  return (
    <div className="space-y-8">
      <PageHeader
        icon={info.emoji}
        eyebrow="Department"
        title={info.name}
        description={info.mission}
        actions={
          <Button onClick={() => setGiveTo(defaultAssignee)}>
            <Plus className="h-4 w-4" /> Give {info.name} a task
          </Button>
        }
      />
      {refreshFailed && <RefreshErrorBanner />}
      {live && <CountsStrip dept={live} />}

      <section>
        <SectionHeader title="People & agents" subtitle="Who owns this area. Agents pick up their tasks on their own." />
        {membersQuery.isLoading && !membersQuery.data ? (
          <Loading />
        ) : !membersQuery.data ? (
          <LoadErrorState error={membersQuery.error} fallback="Could not load the team." onRetry={() => void membersQuery.refetch()} />
        ) : deptMembers.length === 0 ? (
          <EmptyState>
            No one in {info.name} yet.{' '}
            <Link href="/hq/team" className="underline">
              Hire an agent
            </Link>{' '}
            and put it in this department.
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {deptMembers.map((m) => (
              <MemberTile key={m.id} member={m} live={live} onAssign={() => setGiveTo(m.id)} onOpenTask={openTask} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Tools" subtitle={`The pages ${info.name} works in.`} />
        {info.tools.length === 0 ? (
          <EmptyState>
            {info.name} has no tools of its own — it runs the company from the{' '}
            <Link href="/hq" className="underline">
              Command Center
            </Link>
            .
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {info.tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-100 group-hover:text-slate-900">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                      {tool.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" />
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{tool.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <SectionHeader
            title="Open work"
            subtitle="Tasks assigned to people and agents in this department."
            right={
              <Link href="/hq/board" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                All work →
              </Link>
            }
          />
          {!openTasks.data ? (
            openTasks.isLoading ? (
              <Loading />
            ) : (
              <LoadErrorState error={openTasks.error} fallback="Could not load open work." onRetry={() => void openTasks.refetch()} />
            )
          ) : openTasks.data.length === 0 ? (
            <EmptyState>Nothing open. Give {info.name} a task to get things moving.</EmptyState>
          ) : (
            <OpenWork tasks={openTasks.data} onOpen={openTask} />
          )}
        </section>

        <section>
          <SectionHeader title="Recent results" subtitle="What this department finished lately." />
          {!doneTasks.data ? (
            doneTasks.isLoading ? (
              <Loading />
            ) : (
              <LoadErrorState error={doneTasks.error} fallback="Could not load results." onRetry={() => void doneTasks.refetch()} />
            )
          ) : doneTasks.data.length === 0 ? (
            <EmptyState>No finished work yet.</EmptyState>
          ) : (
            <div className="space-y-2">
              {[...doneTasks.data]
                .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt))
                .map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} showResultPreview />
                ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionHeader title="Automations" subtitle={`Recurring work ${info.name}'s agents do on a schedule.`} />
        {!schedules.data ? (
          schedules.isLoading ? (
            <Loading />
          ) : (
            <LoadErrorState error={schedules.error} fallback="Could not load automations." onRetry={() => void schedules.refetch()} />
          )
        ) : (
          <SchedulesTable schedules={deptSchedules} members={deptMembers.length > 0 ? deptMembers : members} />
        )}
      </section>

      <NewTaskDialog
        open={giveTo !== undefined}
        onOpenChange={(o) => !o && setGiveTo(undefined)}
        members={members}
        defaultAssigneeId={giveTo ?? null}
        heading={`Give ${info.name} a task`}
      />
    </div>
  );
}

function CountsStrip({ dept }: { dept: HqDepartment }) {
  const c = dept.counts;
  const items: Array<[string, number, string]> = [
    ['Open', c.open, 'text-slate-900'],
    ['Waiting for you', c.needsApproval, 'text-amber-700'],
    ['Blocked', c.blocked, 'text-red-700'],
    ['In progress', c.inProgress, 'text-blue-700'],
    ['Done today', c.doneToday, 'text-emerald-700'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map(([label, value, color]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
          <div className={cn('text-2xl font-bold', value > 0 ? color : 'text-slate-300')}>{value}</div>
          <div className="text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

function MemberTile({
  member: m,
  live,
  onAssign,
  onOpenTask,
}: {
  member: HqMember;
  live: HqDepartment | undefined;
  onAssign: () => void;
  onOpenTask: (id: string) => void;
}) {
  const working = live?.working.find((w) => w.member.id === m.id)?.task ?? m.stats.currentTask;
  const state = m.status !== 'active' ? m.status : working ? 'working' : m.kind === 'agent' ? 'idle' : null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <MemberAvatar member={m} size="md" />
      <div className="min-w-0 flex-1">
        <Link href={`/hq/team/${m.id}`} className="block truncate text-sm font-bold text-slate-900 hover:underline">
          {m.name}
        </Link>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="truncate">{m.title || (m.kind === 'agent' ? 'AI agent' : 'Team member')}</span>
          {state && (
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                state === 'working' ? 'bg-blue-50 text-blue-700' : state === 'idle' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
              )}
            >
              {state}
            </span>
          )}
        </div>
        {working ? (
          <button type="button" onClick={() => onOpenTask(working.id)} className="mt-1 flex w-full items-center gap-1 text-left text-xs text-blue-700 hover:underline">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">
              #{working.number} {working.title}
            </span>
          </button>
        ) : (
          <div className="mt-1 text-xs text-slate-400">
            {m.stats.openTasks} open · {m.kind === 'agent' && m.stats.lastRun ? `last run ${formatRelative(m.stats.lastRun.startedAt)}` : 'no runs yet'}
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onAssign} aria-label={`Assign a task to ${m.name}`}>
        Assign
      </Button>
    </div>
  );
}

function OpenWork({ tasks, onOpen }: { tasks: HqTask[]; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-5">
      {OPEN_ORDER.map((status) => {
        const list = tasks.filter((t) => t.status === status).sort(compareTasks);
        if (list.length === 0) return null;
        return (
          <div key={status}>
            <div className="mb-2 flex items-center gap-2">
              <TaskStatusBadge status={status} />
              <span className="text-xs text-slate-400">
                {list.length} {HQ_STATUS_LABELS[status].toLowerCase()}
              </span>
            </div>
            <div className="space-y-2">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={onOpen} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
