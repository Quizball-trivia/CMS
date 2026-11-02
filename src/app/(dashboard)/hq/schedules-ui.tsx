'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqSchedule, useDeleteHqSchedule, useRunHqScheduleNow, useUpdateHqSchedule } from '@/hooks';
import { HQ_TIMEZONE, changedScheduleFields, describeCron, formatRelative, formatTbilisi } from '@/lib/hq-board';
import type { HqMember, HqSchedule } from '@/types';
import { EmptyState, MemberChip, errorMessage, useTaskSheet } from './hq-ui';

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
          <Field label={`When (cron) — ${describeCron(cron)}`}>
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
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
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

export function SchedulesTable({
  schedules,
  members,
  showMember = true,
  fixedMemberId,
  canCreate = true,
}: {
  schedules: HqSchedule[];
  members: HqMember[];
  showMember?: boolean;
  fixedMemberId?: string;
  /** False for an archived member: schedules can only run active/paused HQ agents. */
  canCreate?: boolean;
}) {
  const update = useUpdateHqSchedule();
  const remove = useDeleteHqSchedule();
  const runNow = useRunHqScheduleNow();
  const { openTask } = useTaskSheet();
  const [editing, setEditing] = useState<HqSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  // Schedules can only run active/paused HQ agents (the backend 422s otherwise).
  // `members` excludes archived members, so an owner missing from a loaded list
  // (or the profile of an archived member) can't be run.
  const ownerArchived = (s: HqSchedule) =>
    (fixedMemberId === s.member.id && !canCreate) || (members.length > 0 && !members.some((m) => m.id === s.member.id));

  return (
    <div className="space-y-2">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New automation
          </Button>
        </div>
      )}
      {schedules.length === 0 ? (
        <EmptyState>No automations yet. Add one to have an agent do this work on a schedule.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-semibold">On</th>
                {showMember && <th className="px-3 py-2 font-semibold">Agent</th>}
                <th className="px-3 py-2 font-semibold">Automation</th>
                <th className="px-3 py-2 font-semibold">When</th>
                <th className="px-3 py-2 font-semibold">Next run</th>
                <th className="px-3 py-2 font-semibold">Last run</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedules.map((s) => (
                <tr key={s.id} className={s.enabled ? '' : 'text-slate-400'}>
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={s.enabled}
                      aria-label={s.enabled ? 'Disable schedule' : 'Enable schedule'}
                      onCheckedChange={(v) =>
                        update.mutate(
                          { id: s.id, data: { enabled: v === true } },
                          { onError: (e) => toast.error(errorMessage(e, 'Could not update')) }
                        )
                      }
                    />
                  </td>
                  {showMember && (
                    <td className="px-3 py-2">
                      <MemberChip member={s.member} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 font-semibold text-slate-800">
                      {s.name}
                      {s.taskKind === 'standup' && (
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">🌅 Standup</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-slate-500">→ {s.taskTitle}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{describeCron(s.cron)}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {s.cron} · {s.timezone}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {s.enabled && s.nextRunAt ? (
                      <>
                        {/* In the schedule's own zone, labelled when it isn't Tbilisi. */}
                        <div>
                          {formatTbilisi(s.nextRunAt, s.timezone)}
                          {s.timezone !== HQ_TIMEZONE && <span className="ml-1 text-xs text-slate-400">({s.timezone})</span>}
                        </div>
                        <div className="text-xs text-slate-400">{formatRelative(s.nextRunAt)}</div>
                      </>
                    ) : s.enabled ? (
                      <span className="text-xs text-slate-400">computing…</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {s.lastRunAt ? (
                      <button
                        type="button"
                        disabled={!s.lastTaskId}
                        onClick={() => s.lastTaskId && openTask(s.lastTaskId)}
                        className="text-left hover:underline disabled:no-underline"
                      >
                        {formatRelative(s.lastRunAt)}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title={ownerArchived(s) ? 'Restore this agent to run its automations' : 'Run now'}
                        disabled={runNow.isPending || ownerArchived(s)}
                        onClick={() =>
                          runNow.mutate(s.id, {
                            onSuccess: (task) => {
                              toast.success(`Created #${task.number} for ${s.member.name}`);
                              openTask(task.id);
                            },
                            onError: (e) => toast.error(errorMessage(e, 'Could not run')),
                          })
                        }
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" title="Edit" onClick={() => setEditing(s)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        title="Delete"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (!window.confirm(`Delete automation "${s.name}"?`)) return;
                          remove.mutate(s.id, {
                            onSuccess: () => toast.success('Automation deleted'),
                            onError: (e) => toast.error(errorMessage(e, 'Could not delete')),
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleDialog open={creating} onOpenChange={setCreating} members={members} fixedMemberId={fixedMemberId} />
      <ScheduleDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} schedule={editing} members={members} />
    </div>
  );
}
