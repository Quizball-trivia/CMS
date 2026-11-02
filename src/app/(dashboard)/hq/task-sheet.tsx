'use client';

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Ban, CornerDownRight, Loader2, Pencil, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useHqMembers, useHqRun, useHqTask, usePostHqMessage, useUpdateHqTask } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  HQ_PRIORITY_LABELS,
  HQ_STATUS_LABELS,
  OWN_PIPELINE_HINT,
  OWN_PIPELINE_LABEL,
  PROPOSAL_LOCKED_HINT,
  canDropInto,
  isHqRuntimeAgent,
  isOwnPipelineAgent,
  isRunnableHqAgent,
  sortAgentsForPicker,
  formatDuration,
  formatRelative,
  formatTbilisi,
  formatUsd,
} from '@/lib/hq-board';
import type { HqMember, HqMemberRef, HqMessage, HqPriority, HqRun, HqTask, HqTaskDetail, HqTaskStatus } from '@/types';
import { EmptyState, LoadErrorState, Markdown, MemberAvatar, MemberChip, RefreshErrorBanner, RunStatusBadge, TaskStatusBadge, errorMessage, useTaskSheet } from './hq-ui';
import { ApproveButton, RunAgainButton, SendBackButton, canApprove, canSendBack } from './task-actions';
import { ProposalPanel } from './proposal-card';

const ALL_STATUSES = Object.keys(HQ_STATUS_LABELS) as HqTaskStatus[];
const NONE = '__none__';

/** Mounted once in the HQ layout; opens whenever the URL has ?task=<id>. */
export function TaskSheetHost() {
  const { openTaskId, closeTask } = useTaskSheet();
  return (
    <Sheet open={!!openTaskId} onOpenChange={(open) => !open && closeTask()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
        {openTaskId ? <TaskDetailBody key={openTaskId} taskId={openTaskId} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({ taskId }: { taskId: string }) {
  const { data: task, isLoading, error } = useHqTask(taskId);
  const { data: members = [] } = useHqMembers();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
        <SheetTitle className="sr-only">Loading task</SheetTitle>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading task…
      </div>
    );
  }
  if (!task) {
    return (
      <div className="p-6">
        <SheetTitle>Task not found</SheetTitle>
        <p className="mt-2 text-sm text-slate-500">{errorMessage(error, 'It may have been deleted.')}</p>
      </div>
    );
  }
  // Keyed by id: following a parent/child link to a cached task must not
  // carry over the previous task's edit draft, composer text or dialogs.
  return (
    <>
      {/* A failed background refetch must not unmount the editor (and lose drafts). */}
      {error && <RefreshErrorBanner className="mx-4 mt-3 mr-12" />}
      <TaskDetail key={task.id} task={task} members={members} />
    </>
  );
}

function TaskDetail({ task, members }: { task: HqTaskDetail; members: HqMember[] }) {
  const update = useUpdateHqTask();
  const { openTask } = useTaskSheet();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [runId, setRunId] = useState<string | null>(null);

  const startEditing = () => {
    setTitle(task.title);
    setBody(task.body);
    setEditing(true);
  };

  // Runtimes come from every member, archived included, so an archived agent's
  // task isn't mistaken for a person's. Until they load the map is undefined and
  // ownership-sensitive moves stay disabled (canDropInto treats it as unknown).
  const { data: everyone } = useHqMembers(true);
  const runtimeById = useMemo(() => (everyone ? new Map(everyone.map((m) => [m.id, m.runtime])) : undefined), [everyone]);
  const assigneeMember = (everyone ?? members).find((m) => m.id === task.assignee?.id);
  // Unknown runtime: lock like an HQ agent until we know better.
  const assigneeRuntimeUnknown = !!task.assignee && task.assignee.kind === 'agent' && !assigneeMember;
  // The worker owns a claimed task even if its agent was paused since, so the
  // lock uses the runtime; re-running needs an agent that will actually run.
  const assigneeIsHqAgent = isHqRuntimeAgent(assigneeMember) || assigneeRuntimeUnknown;
  const assigneeRunnable = isRunnableHqAgent(assigneeMember);
  const activeMembers = members.filter((m) => m.status !== 'archived');
  // The HQ worker owns a claimed task: people may only cancel, block or finish it.
  const agentWorking = task.status === 'in_progress' && assigneeIsHqAgent;
  // An agent's idea only moves through Do it / Change / Not now (the panel below).
  const isProposal = task.status === 'proposed';
  // A standup is its agent's daily report; the API refuses to reassign it.
  const isStandup = (task.kind ?? 'task') === 'standup';

  const patch = (data: Parameters<typeof update.mutate>[0]['data'], success?: string) =>
    update.mutate(
      { id: task.id, data },
      {
        onSuccess: () => success && toast.success(success),
        onError: (e) => toast.error(errorMessage(e, 'Could not update the task')),
      }
    );

  const changeStatus = (status: HqTaskStatus) => {
    const check = canDropInto(task, status, runtimeById);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    patch({ status }, `Moved to ${HQ_STATUS_LABELS[status]}`);
  };

  // The backend refuses to reassign an in-progress task without a new status:
  // hand it over as a fresh "To do" for the new assignee.
  const reassign = (assigneeId: string | null) => {
    if (task.status === 'in_progress') {
      patch({ assigneeId, status: 'todo' }, 'Reassigned and moved to To do');
    } else {
      patch({ assigneeId }, 'Reassigned');
    }
  };

  const saveEdits = () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    update.mutate(
      { id: task.id, data: { title: title.trim(), body } },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Saved');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not save')),
      }
    );
  };

  return (
    <>
      <SheetHeader className="border-b border-slate-100 pr-12">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono">#{task.number}</span>
          <TaskStatusBadge status={task.status} />
          {task.scheduleId && <span className="rounded bg-slate-100 px-1.5 py-0.5">scheduled</span>}
          <span>created {formatRelative(task.createdAt)} by {task.createdBy?.name ?? 'someone'}</span>
        </div>
        {editing ? (
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-base font-semibold" maxLength={200} />
        ) : (
          <SheetTitle className="text-lg leading-snug text-slate-900">{task.title}</SheetTitle>
        )}
        <SheetDescription className="sr-only">Task details</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-4">
        {/* Controls */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <Select value={task.status} onValueChange={(v) => changeStatus(v as HqTaskStatus)} disabled={isProposal}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} disabled={!canDropInto(task, s, runtimeById).ok}>
                    {HQ_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Assignee">
            <AssigneeSelect
              members={activeMembers}
              value={task.assignee?.id ?? null}
              current={task.assignee}
              disabled={agentWorking || isProposal || isStandup}
              onChange={reassign}
            />
            {isStandup && <span className="block text-xs text-slate-500">A standup belongs to its agent</span>}
            {agentWorking && <span className="block text-xs text-blue-700">The agent is working on this</span>}
            {isProposal && <span className="block text-xs text-violet-700">{PROPOSAL_LOCKED_HINT}</span>}
          </Field>
          <Field label="Priority">
            <Select value={String(task.priority)} onValueChange={(v) => patch({ priority: Number(v) as HqPriority })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HQ_PRIORITY_LABELS.map((label, i) => (
                  <SelectItem key={label} value={String(i)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canApprove(task) && <ApproveButton task={task} />}
          {canSendBack(task) && <SendBackButton task={task} />}
          {assigneeRunnable && !isProposal && task.status !== 'in_progress' && task.status !== 'todo' && <RunAgainButton task={task} />}
          {!editing && (
            <Button size="sm" variant="outline" onClick={startEditing}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
          {task.status !== 'cancelled' && task.status !== 'done' && !isProposal && (
            <Button
              size="sm"
              variant={agentWorking ? 'outline' : 'ghost'}
              className={agentWorking ? 'border-red-200 text-red-700 hover:bg-red-50' : 'text-slate-500'}
              onClick={() => changeStatus('cancelled')}
            >
              <Ban className="h-4 w-4" />
              Cancel task
            </Button>
          )}
        </div>

        {task.status === 'proposed' && <ProposalPanel task={task} />}

        {/* Description */}
        <section>
          <Label>Description</Label>
          {editing ? (
            <div className="space-y-2">
              <Textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What needs to happen? Add links, context, acceptance criteria." />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveEdits} disabled={update.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : task.body.trim() ? (
            <Markdown>{task.body}</Markdown>
          ) : (
            <p className="text-sm text-slate-400">No description.</p>
          )}
        </section>

        {/* Result */}
        {task.result && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
            <Label>Result {task.completedAt ? `· ${formatTbilisi(task.completedAt)}` : ''}</Label>
            <Markdown>{task.result}</Markdown>
          </section>
        )}

        {/* Related */}
        {(task.parent || task.children.length > 0) && (
          <section className="space-y-2">
            <Label>Related tasks</Label>
            {task.parent && (
              <RelatedTask label="Parent" task={task.parent} onOpen={openTask} />
            )}
            {task.children.map((child) => (
              <RelatedTask key={child.id} label="Follow-up" task={child} onOpen={openTask} />
            ))}
          </section>
        )}

        {/* Thread */}
        <section>
          <Label>Conversation</Label>
          <Thread messages={task.messages} />
          <Composer task={task} members={activeMembers} />
        </section>

        {/* Runs */}
        <section>
          <Label>Agent runs</Label>
          {task.runs.length === 0 ? (
            <p className="text-sm text-slate-400">No runs yet.</p>
          ) : (
            <RunsTable runs={task.runs} onOpen={setRunId} />
          )}
        </section>
      </div>

      <RunDetailDialog runId={runId} onClose={() => setRunId(null)} />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</h3>;
}

export function AssigneeSelect({
  members,
  value,
  onChange,
  disabled,
  allowNone = true,
  current,
}: {
  members: HqMember[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  /** The task's current assignee, shown (disabled) even when it isn't assignable any more (e.g. archived). */
  current?: HqMemberRef | null;
}) {
  const agents = sortAgentsForPicker(members.filter((m) => m.kind === 'agent'));
  const people = members.filter((m) => m.kind === 'human');
  const selected = members.find((m) => m.id === value);
  const orphan = value && !selected && current && current.id === value ? current : null;
  return (
    <>
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>Unassigned</SelectItem>}
        {orphan && (
          <SelectItem value={orphan.id} disabled>
            {orphan.avatar} {orphan.name} (archived)
          </SelectItem>
        )}
        {agents.length > 0 && (
          <SelectGroup>
            <SelectLabel>Agents</SelectLabel>
            {agents.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {agentOptionLabel(m)}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {people.length > 0 && (
          <SelectGroup>
            <SelectLabel>People</SelectLabel>
            {people.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
    {isOwnPipelineAgent(selected) && <OwnPipelineHint />}
    </>
  );
}

/** "🤖 Name (paused)" / "🛠️ Bug Fixer (own pipeline — won't run from HQ)". */
export function agentOptionLabel(m: HqMember): string {
  const note = isOwnPipelineAgent(m) ? ` ${OWN_PIPELINE_LABEL}` : m.status !== 'active' ? ` (${m.status})` : '';
  return `${m.avatar} ${m.name}${note}`;
}

export function OwnPipelineHint({ className }: { className?: string }) {
  return <p className={cn('mt-1 text-xs text-amber-700', className)}>{OWN_PIPELINE_HINT}</p>;
}

function RelatedTask({ label, task, onOpen }: { label: string; task: HqTask; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
    >
      <CornerDownRight className="h-4 w-4 text-slate-400" />
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-xs text-slate-400">#{task.number}</span>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{task.title}</span>
      <MemberAvatar member={task.assignee} size="xs" />
      <TaskStatusBadge status={task.status} />
    </button>
  );
}

const MESSAGE_KIND_STYLES: Record<HqMessage['kind'], string> = {
  comment: 'border-slate-200 bg-white',
  handoff: 'border-violet-200 bg-violet-50/60',
  system: 'border-slate-100 bg-slate-50 text-slate-500',
  result: 'border-emerald-200 bg-emerald-50/50',
};

function Thread({ messages }: { messages: HqMessage[] }) {
  if (messages.length === 0) return <p className="mb-3 text-sm text-slate-400">No messages yet.</p>;
  return (
    <ol className="mb-3 space-y-2">
      {messages.map((m) => (
        <li key={m.id} className={cn('rounded-lg border px-3 py-2', MESSAGE_KIND_STYLES[m.kind])}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <MemberChip member={m.author} />
            {m.recipient && (
              <>
                <span>→</span>
                <MemberChip member={m.recipient} />
              </>
            )}
            {m.kind !== 'comment' && <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase">{m.kind}</span>}
            <span className="ml-auto" title={formatTbilisi(m.createdAt)}>
              {formatRelative(m.createdAt)}
            </span>
          </div>
          <Markdown className="text-[13px]">{m.body}</Markdown>
        </li>
      ))}
    </ol>
  );
}

function Composer({ task, members }: { task: HqTask; members: HqMember[] }) {
  const [body, setBodyState] = useState('');
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const post = usePostHqMessage();
  // Refs, not state: a second ⌘↵ in the same tick must see the first send.
  const bodyRef = useRef('');
  const sendingRef = useRef(false);

  const setBody = (value: string) => {
    bodyRef.current = value;
    setBodyState(value);
  };

  const send = () => {
    const trimmed = body.trim();
    if (!trimmed || post.isPending || sendingRef.current) return;
    sendingRef.current = true;
    // Clear right away; if the send fails, put the draft back unless the
    // person has started typing something new in the meantime.
    const draft = { body, recipientId };
    setBody('');
    setRecipientId(null);
    post.mutate(
      { taskId: task.id, data: { body: trimmed, recipientId: draft.recipientId } },
      {
        onError: (e) => {
          toast.error(errorMessage(e, 'Could not send'));
          if (!bodyRef.current.trim()) {
            setBody(draft.body);
            setRecipientId(draft.recipientId);
          }
        },
        onSettled: () => {
          sendingRef.current = false;
        },
      }
    );
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
        }}
        placeholder="Write a comment… (⌘↵ to send)"
        className="bg-white"
      />
      <div className="flex items-center gap-2">
        <div className="w-56">
          <Select value={recipientId ?? NONE} onValueChange={(v) => setRecipientId(v === NONE ? null : v)}>
            <SelectTrigger size="sm" className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Everyone on the task</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  @{m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="ml-auto" onClick={send} disabled={post.isPending || !body.trim()}>
          <Send className="h-4 w-4" />
          Send
        </Button>
      </div>
    </div>
  );
}

export function RunsTable({ runs, onOpen, showMember = false, showTask = false }: { runs: HqRun[]; onOpen: (id: string) => void; showMember?: boolean; showTask?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 font-semibold">Started</th>
            {showMember && <th className="px-3 py-2 font-semibold">Agent</th>}
            {showTask && <th className="px-3 py-2 font-semibold">Task</th>}
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 font-semibold">Duration</th>
            <th className="px-3 py-2 font-semibold">Turns</th>
            <th className="px-3 py-2 font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {runs.map((r) => (
            <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpen(r.id)}>
              <td className="px-3 py-2 whitespace-nowrap" title={formatTbilisi(r.startedAt)}>
                {/* A real button so the row is reachable and openable by keyboard. */}
                <button
                  type="button"
                  aria-label={`Open run details (${r.status}, started ${formatRelative(r.startedAt)})`}
                  className="rounded text-left font-medium text-slate-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r.id);
                  }}
                >
                  {formatRelative(r.startedAt)}
                </button>
              </td>
              {showMember && (
                <td className="px-3 py-2">
                  <MemberChip member={r.member} href={false} />
                </td>
              )}
              {showTask && (
                <td className="max-w-[16rem] truncate px-3 py-2 text-slate-600">
                  {r.taskNumber ? `#${r.taskNumber} ` : ''}
                  {r.taskTitle ?? '—'}
                </td>
              )}
              <td className="px-3 py-2">
                <RunStatusBadge status={r.status} />
              </td>
              <td className="px-3 py-2 text-slate-600">{r.status === 'running' ? 'running…' : formatDuration(r.durationSeconds)}</td>
              <td className="px-3 py-2 text-slate-600">{r.turns ?? '—'}</td>
              <td className="px-3 py-2 text-slate-600">{formatUsd(r.costCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunDetailDialog({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const { data: run, isLoading, error, refetch } = useHqRun(runId);
  return (
    <Dialog open={!!runId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Run details {run && <RunStatusBadge status={run.status} />}
          </DialogTitle>
        </DialogHeader>
        {!run && error && !isLoading ? (
          <LoadErrorState error={error} fallback="Couldn't load this run." onRetry={() => void refetch()} />
        ) : !run ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
              <Stat label="Agent" value={run.member.name} />
              <Stat label="Model" value={run.model ?? 'default'} />
              <Stat label="Started" value={formatTbilisi(run.startedAt)} />
              <Stat label="Duration" value={run.status === 'running' ? 'running…' : formatDuration(run.durationSeconds)} />
              <Stat label="Turns" value={String(run.turns ?? '—')} />
              <Stat label="Tokens in/out" value={`${run.tokensIn ?? '—'} / ${run.tokensOut ?? '—'}`} />
              <Stat label="Est. cost" value={formatUsd(run.costCents)} />
              <Stat label="Task" value={run.taskNumber ? `#${run.taskNumber}` : '—'} />
            </dl>
            {run.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                <div className="mb-1 text-xs font-bold uppercase">Error</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">{run.error}</pre>
              </div>
            )}
            {run.summary && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Summary</div>
                <Markdown>{run.summary}</Markdown>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-bold uppercase text-slate-500">Tool calls ({run.log.length})</div>
              {run.log.length === 0 ? (
                <EmptyState>No tool calls recorded.</EmptyState>
              ) : (
                <ol className="space-y-1.5">
                  {run.log.map((entry, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={cn('h-2 w-2 rounded-full', entry.ok ? 'bg-emerald-500' : 'bg-red-500')} />
                        <span className="font-mono font-semibold text-slate-800">{entry.tool}</span>
                        <span className="ml-auto text-slate-400">{formatTbilisi(entry.ts)}</span>
                      </div>
                      {entry.input !== undefined && entry.input !== null && (
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
                          {typeof entry.input === 'string' ? entry.input : JSON.stringify(entry.input, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            {run.sdkSessionId && <p className="text-xs text-slate-400">SDK session {run.sdkSessionId}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-800">{value}</dd>
    </div>
  );
}
