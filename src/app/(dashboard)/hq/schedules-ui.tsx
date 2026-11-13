'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronDown, ChevronRight, MoreHorizontal, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqSchedule, useDeleteHqSchedule, useRunHqScheduleNow, useUpdateHqSchedule } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_TIMEZONE, changedScheduleFields, describeCron, formatRelative, formatTbilisi } from '@/lib/hq-board';
import type { HqMember, HqSchedule } from '@/types';
import { EmptyState, HQ_LABEL, MemberChip, Panel, Section, errorMessage, memberHref, useTaskSheet } from './hq-ui';

const CRON_PRESETS = [
  { label: 'Every day at 08:00', cron: '0 8 * * *' },
  { label: 'Every night at 03:00', cron: '0 3 * * *' },
  { label: 'Weekdays at 09:00', cron: '0 9 * * 1-5' },
  { label: 'Every Monday at 10:00', cron: '0 10 * * 1' },
  { label: 'Every hour', cron: '0 * * * *' },
];

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  members,
  fixedMemberId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set. */
  schedule?: HqSchedule | null;
  /** HQ agents that can own a schedule (create mode without fixedMemberId). */
  members: HqMember[];
  fixedMemberId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Remount per open/schedule so the form state starts from the props. */}
        {open && (
          <ScheduleForm
            key={schedule?.id ?? 'new'}
            schedule={schedule ?? null}
            members={members}
            fixedMemberId={fixedMemberId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  schedule,
  members,
  fixedMemberId,
  onDone,
}: {
  schedule: HqSchedule | null;
  members: HqMember[];
  fixedMemberId?: string;
  onDone: () => void;
}) {
  const create = useCreateHqSchedule();
  const update = useUpdateHqSchedule();
  const [memberId, setMemberId] = useState<string>(schedule?.member.id ?? fixedMemberId ?? '');
  const [name, setName] = useState(schedule?.name ?? '');
  const [cron, setCron] = useState(schedule?.cron ?? '0 8 * * *');
  const [timezone, setTimezone] = useState(schedule?.timezone ?? HQ_TIMEZONE);
  const [taskTitle, setTaskTitle] = useState(schedule?.taskTitle ?? '');
  const [taskBody, setTaskBody] = useState(schedule?.taskBody ?? '');
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);

  const pending = create.isPending || update.isPending;
  const agents = members.filter((m) => m.kind === 'agent' && m.runtime === 'hq' && m.status !== 'archived');

  const submit = () => {
    if (!schedule && !memberId) return toast.error('Pick an agent');
    if (!name.trim() || !taskTitle.trim() || !cron.trim()) return toast.error('Name, schedule and task title are required');
    const done = {
      onSuccess: () => {
        toast.success(schedule ? 'Automation saved' : 'Automation created');
        onDone();
      },
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save the automation')),
    };
    const data = { name: name.trim(), cron: cron.trim(), timezone: timezone.trim() || HQ_TIMEZONE, taskTitle: taskTitle.trim(), taskBody, enabled };
    if (schedule) {
      // Edit: send only what changed here, never stale copies of other fields.
      const changed = changedScheduleFields(
        { name: schedule.name, cron: schedule.cron, timezone: schedule.timezone, taskTitle: schedule.taskTitle, taskBody: schedule.taskBody, enabled: schedule.enabled },
        data
      );
      if (Object.keys(changed).length === 0) {
        onDone();
        return;
      }
      update.mutate({ id: schedule.id, data: changed }, done);
    } else {
      create.mutate({ memberId, ...data }, done);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{schedule ? 'Edit automation' : 'New automation'}</DialogTitle>
        <DialogDescription>On each tick, a task is created and assigned to the agent.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        {!schedule && !fixedMemberId && (
          <Field label="Agent">
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick an agent" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.avatar} {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning briefing" maxLength={120} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field label={`When (cron) — ${scheduleLabel(cron)}`}>
            <Input value={cron} onChange={(e) => setCron(e.target.value)} className="font-mono" placeholder="0 8 * * *" />
          </Field>
          <Field label="Timezone">
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1">
          {CRON_PRESETS.map((p) => (
            <button
              key={p.cron}
              type="button"
              onClick={() => setCron(p.cron)}
              className="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Field label="Task title">
          <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Daily briefing" maxLength={200} />
        </Field>
        <Field label="Task instructions">
          <Textarea rows={4} value={taskBody} onChange={(e) => setTaskBody(e.target.value)} placeholder="What should the agent do on each run?" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} /> Enabled
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending}>
          {schedule ? 'Save' : 'Create'}
        </Button>
      </DialogFooter>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// A due time this far in the past means the scheduler did not pick the automation up.
const OVERDUE_AFTER_MS = 5 * 60_000;
// A just-saved automation may not have a next run yet; after this long it is a problem.
const SCHEDULING_GRACE_MS = 5 * 60_000;

/** The one effective status of a row, in priority order. */
type ScheduleStatus = 'off' | 'paused' | 'archived' | 'overdue' | 'unscheduled' | 'scheduling' | 'ok';

function statusOf(s: HqSchedule, agent: HqMember['status']): ScheduleStatus {
  if (!s.enabled) return 'off';
  if (agent === 'paused') return 'paused';
  if (agent === 'archived') return 'archived';
  const now = Date.now();
  if (!s.nextRunAt) return now - new Date(s.updatedAt).getTime() < SCHEDULING_GRACE_MS ? 'scheduling' : 'unscheduled';
  return new Date(s.nextRunAt).getTime() < now - OVERDUE_AFTER_MS ? 'overdue' : 'ok';
}

/** Human label for a cron; "Custom schedule" when the humanizer can't describe it (never the raw string). */
function scheduleLabel(cron: string): string {
  const described = describeCron(cron);
  return described === cron ? 'Custom schedule' : described;
}

// Literal class names so Tailwind picks them up.
const COLS = {
  plain: 'lg:grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,0.8fr)_10.5rem]',
  agent: 'lg:grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,2.2fr)_minmax(0,0.8fr)_10.5rem]',
};

export function SchedulesTable({
  schedules,
  members,
  showMember = true,
  fixedMemberId,
  fixedMemberStatus,
  canCreate = true,
}: {
  schedules: HqSchedule[];
  members: HqMember[];
  showMember?: boolean;
  fixedMemberId?: string;
  /** The profile's own status (loaded with the profile): its schedules never depend on the member list loading. */
  fixedMemberStatus?: HqMember['status'];
  /** False for an archived member: schedules can only run active/paused HQ agents. */
  canCreate?: boolean;
}) {
  const update = useUpdateHqSchedule();
  const remove = useDeleteHqSchedule();
  const runNow = useRunHqScheduleNow();
  const { openTask } = useTaskSheet();
  const [editing, setEditing] = useState<HqSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);
  const [showOff, setShowOff] = useState(false);
  // Schedules can only run active/paused HQ agents (the backend 422s otherwise).
  // `members` excludes archived members, so an owner missing from a loaded list
  // (or the profile of an archived member) can't be run.
  const agentStatusOf = (s: HqSchedule): HqMember['status'] => {
    if (fixedMemberId === s.member.id) return fixedMemberStatus ?? (canCreate ? 'active' : 'archived');
    return members.find((m) => m.id === s.member.id)?.status ?? 'archived';
  };
  const ownerArchived = (s: HqSchedule) => agentStatusOf(s) === 'archived';

  const entries = schedules.map((s) => ({ s, status: statusOf(s, agentStatusOf(s)) }));
  const attention = entries.filter((x) => x.status === 'overdue' || x.status === 'unscheduled');
  const blocked = entries.filter((x) => x.status === 'paused' || x.status === 'archived');
  const on = entries.filter((x) => x.status === 'ok' || x.status === 'scheduling');
  const off = entries.filter((x) => x.status === 'off');

  const newButton = canCreate ? (
    <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" /> New automation
    </Button>
  ) : undefined;
  // The button lives in the first group that is shown.
  const newButtonIn = attention.length > 0 ? 'attention' : on.length > 0 ? 'on' : blocked.length > 0 ? 'blocked' : 'off';

  const run = (s: HqSchedule) =>
    runNow.mutate(s.id, {
      onSuccess: (task) => {
        toast.success(`Created #${task.number} for ${s.member.name}`);
        openTask(task.id);
      },
      onError: (e) => toast.error(errorMessage(e, 'Could not run')),
    });

  /** The row's one effective status, in plain words. */
  const renderStatus = (s: HqSchedule, status: ScheduleStatus) => {
    // In the schedule's own zone, labelled when it isn't Tbilisi.
    const when = `${formatTbilisi(s.nextRunAt, s.timezone)}${s.timezone !== HQ_TIMEZONE ? ` (${s.timezone})` : ''}`;
    switch (status) {
      case 'off':
        return <span className="text-sm text-slate-500">Off</span>;
      case 'scheduling':
        return <span className="text-sm text-slate-500">On — scheduling…</span>;
      case 'ok':
        return (
          <div>
            <div className="text-sm tabular-nums text-slate-900">
              <span className="font-medium text-emerald-700">On</span> — next {when}
            </div>
            <div className="text-[13px] tabular-nums text-slate-500">{formatRelative(s.nextRunAt)}</div>
          </div>
        );
      case 'paused':
      case 'archived':
        return (
          <div>
            <div className="flex items-center gap-1 text-sm font-medium text-amber-700">
              <AlertTriangle className="size-3.5 shrink-0" /> {status === 'paused' ? 'Agent paused' : 'Agent archived'}
            </div>
            <div className="text-[13px] text-slate-500">
              {status === 'paused' ? `Won't run until ${s.member.name} is switched on.` : `Won't run until ${s.member.name} is restored.`}
            </div>
          </div>
        );
      case 'overdue':
        return (
          <div title={`Was due ${when}`}>
            <div className="flex items-center gap-1 text-sm font-medium text-red-700">
              <AlertTriangle className="size-3.5 shrink-0" /> Overdue
            </div>
            <div className="text-[13px] text-slate-500">Was due {formatRelative(s.nextRunAt)}; the HQ worker may be down.</div>
          </div>
        );
      case 'unscheduled':
        return (
          <div>
            <div className="flex items-center gap-1 text-sm font-medium text-amber-700">
              <AlertTriangle className="size-3.5 shrink-0" /> Not scheduled
            </div>
            <div className="text-[13px] text-slate-500">No next run is scheduled.</div>
          </div>
        );
    }
  };

  /** The one labelled action for a row: the fix for its status, or Edit. */
  const renderPrimary = (s: HqSchedule, status: ScheduleStatus) => {
    if (status === 'paused' || status === 'archived') {
      return (
        <Button asChild size="sm" variant="outline">
          <Link href={memberHref(s.member)}>Open agent</Link>
        </Button>
      );
    }
    if (status === 'overdue') {
      return (
        <Button asChild size="sm" variant="outline">
          <Link href="/hq/activity">Check activity</Link>
        </Button>
      );
    }
    if (status === 'unscheduled') {
      // Re-sending its own timing clears the next run, so the scheduler places it again; no field has to change.
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(
              { id: s.id, data: { cron: s.cron, timezone: s.timezone } },
              {
                onSuccess: () => toast.success(`“${s.name}” will be scheduled again`),
                onError: (e) => toast.error(errorMessage(e, 'Could not reschedule')),
              }
            )
          }
        >
          Reschedule
        </Button>
      );
    }
    return (
      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
        Edit
      </Button>
    );
  };

  const renderList = (items: typeof entries) => {
    const cols = showMember ? COLS.agent : COLS.plain;
    return (
      <Panel className="overflow-hidden">
        <div className={cn('hidden gap-x-3 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:grid', cols)}>
          <span className={HQ_LABEL}>On</span>
          <span className={HQ_LABEL}>Automation</span>
          {showMember && <span className={HQ_LABEL}>Agent</span>}
          <span className={HQ_LABEL}>When</span>
          <span className={HQ_LABEL}>Status</span>
          <span className={HQ_LABEL}>Last run</span>
          <span />
        </div>
        <ul className="divide-y divide-slate-100">
          {items.map(({ s, status }) => (
            <li
              key={s.id}
              className={cn('grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-3 py-2.5', cols)}
            >
              <button
                type="button"
                role="switch"
                aria-checked={s.enabled}
                aria-label={`${s.name}: ${s.enabled ? 'on' : 'off'}`}
                title={s.enabled ? 'Switch off' : 'Switch on'}
                onClick={() =>
                  update.mutate(
                    { id: s.id, data: { enabled: !s.enabled } },
                    { onError: (e) => toast.error(errorMessage(e, 'Could not update')) }
                  )
                }
                className={cn(
                  'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500',
                  s.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                )}
              >
                <span className={cn('inline-block size-4 rounded-full bg-white transition-transform', s.enabled ? 'translate-x-[18px]' : 'translate-x-0.5')} />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className={cn('text-sm font-semibold', s.enabled ? 'text-slate-950' : 'text-slate-500')}>{s.name}</span>
                  {s.taskKind === 'standup' && (
                    <span className="rounded border border-slate-200 px-1.5 text-[11px] font-medium text-slate-600">Standup</span>
                  )}
                </div>
                <div className="truncate text-[13px] text-slate-500">→ {s.taskTitle}</div>
              </div>
              <div className="flex items-center justify-end gap-1 lg:order-last">
                {renderPrimary(s, status)}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${s.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={runNow.isPending || ownerArchived(s)}
                      title={ownerArchived(s) ? 'Restore this agent to run its automations' : undefined}
                      onSelect={() => run(s)}
                    >
                      <Play /> Run now
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setEditing(s)}>
                      <Pencil /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        if (!window.confirm(`Delete automation "${s.name}"?`)) return;
                        remove.mutate(s.id, {
                          onSuccess: () => toast.success('Automation deleted'),
                          onError: (e) => toast.error(errorMessage(e, 'Could not delete')),
                        });
                      }}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {/* Below lg these sit in one wrapping row under the name; at lg they become grid columns. */}
              <div className="col-span-2 col-start-2 flex flex-wrap gap-x-6 gap-y-2 lg:contents">
                {showMember && (
                  <div className="min-w-0">
                    <MemberChip member={s.member} />
                  </div>
                )}
                {/* The raw cron expression is in the tooltip (and shown when the schedule is custom). */}
                <div className="min-w-0" title={`${s.cron} · ${s.timezone}`}>
                  <div className="text-sm text-slate-700">{scheduleLabel(s.cron)}</div>
                  <div className={cn('text-[13px] text-slate-500', describeCron(s.cron) === s.cron && 'font-mono')}>
                    {describeCron(s.cron) === s.cron ? `${s.cron} · ${s.timezone}` : s.timezone}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className={cn(HQ_LABEL, 'lg:hidden')}>Status</div>
                  {renderStatus(s, status)}
                </div>
                <div className="min-w-0 text-sm">
                  <div className={cn(HQ_LABEL, 'lg:hidden')}>Last run</div>
                  {s.lastRunAt ? (
                    <button
                      type="button"
                      disabled={!s.lastTaskId}
                      onClick={() => s.lastTaskId && openTask(s.lastTaskId)}
                      className="text-left tabular-nums text-slate-700 hover:underline disabled:no-underline"
                    >
                      {formatRelative(s.lastRunAt)}
                    </button>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    );
  };

  /** A group hidden behind a "Show N …" toggle. */
  const renderCollapsed = (id: 'blocked' | 'off', items: typeof entries, label: string, open: boolean, setOpen: (v: boolean) => void) => (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {open ? 'Hide' : 'Show'} {items.length} {label}
        </button>
        {newButtonIn === id && newButton}
      </div>
      {open && renderList(items)}
    </div>
  );

  return (
    <div className="space-y-8">
      {schedules.length === 0 && (
        <div className="space-y-3">
          {newButton && <div className="flex justify-end">{newButton}</div>}
          <EmptyState>No automations yet. Add one to have an agent do this work on a schedule.</EmptyState>
        </div>
      )}

      {attention.length > 0 && (
        <Section
          title="Needs attention"
          count={attention.length}
          countTone="attention"
          description="Switched on with an active agent, but not running when expected."
          actions={newButtonIn === 'attention' ? newButton : undefined}
        >
          {renderList(attention)}
        </Section>
      )}

      {on.length > 0 &&
        // Only label the group when there is another group to tell it apart from.
        (attention.length > 0 || blocked.length > 0 || off.length > 0 ? (
          <Section title="On" count={on.length} description="Switched on and scheduled." actions={newButtonIn === 'on' ? newButton : undefined}>
            {renderList(on)}
          </Section>
        ) : (
          <div className="space-y-3">
            {newButtonIn === 'on' && newButton && <div className="flex justify-end">{newButton}</div>}
            {renderList(on)}
          </div>
        ))}

      {blocked.length > 0 &&
        renderCollapsed(
          'blocked',
          blocked,
          blocked.some((x) => x.status === 'archived') ? 'waiting on a paused or archived agent' : 'waiting on a paused agent',
          showBlocked,
          setShowBlocked
        )}

      {off.length > 0 && renderCollapsed('off', off, 'off', showOff, setShowOff)}

      <ScheduleDialog open={creating} onOpenChange={setCreating} members={members} fixedMemberId={fixedMemberId} />
      <ScheduleDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} schedule={editing} members={members} />
    </div>
  );
}
