'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHqDepartments, useHqMembers } from '@/hooks';
import { defaultDepartmentAssignee } from '@/lib/hq-board';
import { departmentForPath, departmentHref } from '@/lib/hq-departments';
import { MemberStack, type MemberActivity } from '@/app/(dashboard)/hq/hq-ui';
import { NewTaskDialog } from '@/app/(dashboard)/hq/new-task-dialog';

const BAR_REFRESH_MS = 30_000;

/**
 * Slim strip on every existing tool page tying it to its HQ department:
 * who owns it, how much open work there is, and a one-click "Give a task".
 * Rendered by the dashboard layout for admins; nothing on HQ's own pages.
 */
export function DepartmentBar({ pathname }: { pathname: string }) {
  const dept = departmentForPath(pathname);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data: departments } = useHqDepartments({ enabled: !!dept, refetchInterval: BAR_REFRESH_MS });
  const { data: members = [] } = useHqMembers(false, { enabled: !!dept, refetchInterval: BAR_REFRESH_MS });

  const live = departments?.find((d) => d.key === dept?.key);
  const statusById = useMemo(() => new Map(members.map((m) => [m.id, m.status])), [members]);
  const workingIds = useMemo(() => new Set(live?.working.map((w) => w.member.id) ?? []), [live]);

  if (!dept) return null;

  const activityOf = (id: string): MemberActivity | undefined =>
    workingIds.has(id) ? 'working' : statusById.get(id) && statusById.get(id) !== 'active' ? 'paused' : statusById.has(id) ? 'idle' : undefined;
  const defaultAssignee = live ? defaultDepartmentAssignee(live.members, members) : null;
  const open_ = live?.counts.open ?? 0;
  const approvals = live?.counts.needsApproval ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white/80 px-4 py-2 shadow-xs backdrop-blur">
      <Link href={departmentHref(dept.key)} className="flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-950">
        <span className="text-lg leading-none" aria-hidden>
          {dept.emoji}
        </span>
        {dept.name}
        <span className="font-normal text-slate-400">department</span>
      </Link>
      {live && live.members.length > 0 && <MemberStack members={live.members} activityOf={activityOf} max={5} size="xs" />}
      <span className="text-xs text-slate-500">
        {live ? (
          <>
            <span className="font-semibold text-slate-700">{open_}</span> open {open_ === 1 ? 'task' : 'tasks'}
            {approvals > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-amber-700">{approvals} waiting for you</span>
              </>
            )}
            {live.working.length > 0 && (
              <>
                {' · '}
                <span className="text-blue-700">{live.working.length} working now</span>
              </>
            )}
          </>
        ) : (
          '…'
        )}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Give a task
        </Button>
        <Link href={departmentHref(dept.key)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
          Department <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <NewTaskDialog
        open={open}
        onOpenChange={setOpen}
        members={members}
        defaultAssigneeId={defaultAssignee}
        heading={`Give ${dept.name} a task`}
        onCreated={(task) =>
          toast.success(`#${task.number} created`, {
            description: task.assignee ? `Assigned to ${task.assignee.name}.` : undefined,
            action: { label: 'Open', onClick: () => router.push(`/hq/board?task=${task.id}`) },
          })
        }
      />
    </div>
  );
}
