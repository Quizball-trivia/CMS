'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqTask } from '@/hooks';
import { HQ_PRIORITY_LABELS, isRunnableHqAgent } from '@/lib/hq-board';
import type { HqMember, HqPriority, HqTask } from '@/types';
import { errorMessage, useTaskSheet } from './hq-ui';
import { AssigneeSelect } from './task-sheet';

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: HqMember[];
  defaultAssigneeId?: string | null;
  /** Dialog heading, e.g. "Give Growth a task". */
  heading?: string;
  /**
   * Called with the new task instead of opening it in the task sheet — for
   * pages outside HQ, where the sheet isn't mounted.
   */
  onCreated?: (task: HqTask) => void;
}

export function NewTaskDialog({ open, onOpenChange, ...rest }: NewTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Remounted per open so defaults (e.g. the assignee) apply every time. */}
        {open && <NewTaskForm {...rest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewTaskForm({
  members,
  defaultAssigneeId = null,
  heading = 'New task',
  onCreated,
  onClose,
}: Omit<NewTaskDialogProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const create = useCreateHqTask();
  const { openTask } = useTaskSheet();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);
  const [priority, setPriority] = useState<HqPriority>(2);
  const [status, setStatus] = useState<'todo' | 'backlog'>('todo');

  const assignable = members.filter((m) => m.status !== 'archived');
  const assignee = assignable.find((m) => m.id === assigneeId);

  const submit = () => {
    if (!title.trim()) {
      toast.error('Give the task a title');
      return;
    }
    create.mutate(
      { title: title.trim(), body, assigneeId, priority, status },
      {
        onSuccess: (task) => {
          onClose();
          if (onCreated) {
            onCreated(task);
            return;
          }
          toast.success(
            assignee && isRunnableHqAgent(assignee) && status === 'todo'
              ? `#${task.number} created — ${assignee.name} will pick it up`
              : `#${task.number} created`
          );
          openTask(task.id);
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not create the task')),
      }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{heading}</DialogTitle>
        <DialogDescription>Assign it to an agent and it starts on its own, or to a teammate.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Draft 3 push notifications for the derby" maxLength={200} />
        <Textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details, links, what a great result looks like… (Markdown supported)"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Assignee</span>
            <AssigneeSelect members={assignable} value={assigneeId} onChange={setAssigneeId} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Priority</span>
            <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v) as HqPriority)}>
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
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Column</span>
            <Select value={status} onValueChange={(v) => setStatus(v as 'todo' | 'backlog')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">To do (start now)</SelectItem>
                <SelectItem value="backlog">Backlog (later)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={create.isPending}>
          Create task
        </Button>
      </DialogFooter>
    </>
  );
}
