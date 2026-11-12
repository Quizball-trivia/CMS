'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqDepartments, useHqMembers, useHqSchedules, useHqTasks } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_STATUS_LABELS, compareTasks, defaultDepartmentAssignee } from '@/lib/hq-board';
import { departmentInfo, toolsForUser, withoutHiddenRealData, type HqDepartmentInfo } from '@/lib/hq-departments';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import { useAuth } from '@/providers';
import type { HqDepartment, HqMember, HqTask, HqTaskStatus } from '@/types';
import {
  EmptyState,
  HQ_LABEL,
  HQ_PAGE,
  LoadErrorState,
  MemberAvatar,
  memberHref,
  PageHeader,
  Panel,
  RefreshErrorBanner,
  Section,
  TaskRow,
  TaskStatusBadge,
  useTaskSheet,
} from '../../hq-ui';
import { NewTaskDialog } from '../../new-task-dialog';
import { SchedulesTable } from '../../schedules-ui';
import { MemberState, lastActivityLabel } from '../../team/member-card';

// Open work, in the order a CEO reads it: what needs them first.
const OPEN_ORDER: HqTaskStatus[] = ['needs_approval', 'blocked', 'in_progress', 'todo', 'backlog'];

export default function DepartmentPage() {
  const params = useParams<{ key: string }>();
  const info = departmentInfo(params?.key);
  if (!info) {
    return (
      <div className={HQ_PAGE}>
        <div className="space-y-3">
          <Link href="/hq" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Command Center
          </Link>
          <EmptyState>There&apos;s no department called “{params?.key}”.</EmptyState>
        </div>
      </div>
    );
  }
  return <Department info={info} />;
}

function Department({ info }: { info: HqDepartmentInfo }) {
  const { openTask } = useTaskSheet();
  const { user } = useAuth();
  const tools = withoutHiddenRealData(toolsForUser(info, user?.email), useRealAnalyticsVisible());
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
    <div className={HQ_PAGE}>
      <PageHeader
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

      <Section title="People & agents" count={deptMembers.length} description="Who owns this area. Agents pick up their tasks on their own.">
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
          <Panel className="divide-y divide-slate-100">
            {deptMembers.map((m) => (
              <MemberTile key={m.id} member={m} live={live} onAssign={() => setGiveTo(m.id)} onOpenTask={openTask} />
            ))}
          </Panel>
        )}
      </Section>

      <Section title="Tools" description={`The pages ${info.name} works in.`}>
        {tools.length === 0 ? (
          <EmptyState>
            {info.name} has no tools of its own — it runs the company from the{' '}
            <Link href="/hq" className="underline">
              Command Center
            </Link>
            .
          </EmptyState>
        ) : (
          <Panel className="divide-y divide-slate-100">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-slate-900" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-950">{tool.title}</span>
                    <span className="mt-0.5 block text-[13px] text-slate-600">{tool.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-700" />
                </Link>
              );
            })}
          </Panel>
        )}
      </Section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section
          title="Open work"
          description="Tasks assigned to people and agents in this department."
          actions={
            <Link href="/hq/board" className="font-medium text-slate-600 hover:text-slate-900">
              All work →
            </Link>
          }
        >
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
        </Section>

        <Section title="Recent results" description="What this department finished lately.">
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
        </Section>
      </div>

      <Section title="Schedules" description={`Recurring work ${info.name}'s agents do on a schedule.`}>
        {!schedules.data ? (
          schedules.isLoading ? (
            <Loading />
          ) : (
            <LoadErrorState error={schedules.error} fallback="Could not load automations." onRetry={() => void schedules.refetch()} />
          )
        ) : (
          <SchedulesTable schedules={deptSchedules} members={deptMembers.length > 0 ? deptMembers : members} />
        )}
      </Section>

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
    ['Open', c.open, 'text-slate-950'],
    ['Waiting for you', c.needsApproval, 'text-amber-600'],
    ['Blocked', c.blocked, 'text-red-600'],
    ['In progress', c.inProgress, 'text-blue-600'],
    ['Done today', c.doneToday, 'text-emerald-600'],
  ];
  return (
    <Panel className="grid grid-cols-2 gap-px overflow-hidden bg-slate-200 sm:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
      {items.map(([label, value, color]) => (
        <div key={label} className="min-w-0 bg-white px-4 py-3">
          <div className={HQ_LABEL}>{label}</div>
          <div className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', value > 0 ? color : 'text-slate-300')}>{value}</div>
        </div>
      ))}
    </Panel>
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
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <MemberAvatar member={m} size="md" />
      <div className="min-w-0 flex-1">
        <Link href={memberHref(m)} className="block break-words text-[15px] font-semibold leading-snug text-slate-950 hover:underline">
          {m.name}
        </Link>
        <div className="mt-0.5 break-words text-[13px] text-slate-600">{m.title || (m.kind === 'agent' ? 'AI agent' : 'Team member')}</div>
        <div className="mt-1 empty:hidden">
          <MemberState member={m} busy={!!working} />
        </div>
        {working ? (
          <button type="button" onClick={() => onOpenTask(working.id)} className="mt-1 flex w-full items-center gap-1 text-left text-[13px] text-blue-700 hover:underline">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="min-w-0 break-words">
              #{working.number} {working.title}
            </span>
          </button>
        ) : (
          <div className="mt-1 text-[13px] tabular-nums text-slate-600">
            {m.stats.openTasks} open · {lastActivityLabel(m)}
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
    <div className="space-y-4">
      {OPEN_ORDER.map((status) => {
        const list = tasks.filter((t) => t.status === status).sort(compareTasks);
        if (list.length === 0) return null;
        return (
          <div key={status}>
            <div className="mb-2 flex items-center gap-2">
              <TaskStatusBadge status={status} />
              <span className="text-[13px] tabular-nums text-slate-600">
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

function Loading() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
