'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqTask } from '@/hooks';
import { HQ_PRIORITY_LABELS } from '@/lib/hq-board';
import type { HqMember, HqPriority } from '@/types';
import { errorMessage, useTaskSheet } from './hq-ui';
import { AssigneeSelect } from './task-sheet';

export function NewTaskDialog({
  open,
  onOpenChange,
  members,
  defaultAssigneeId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: HqMember[];
  defaultAssigneeId?: string | null;
}) {
  const create = useCreateHqTask();
  const { openTask } = useTaskSheet();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssigneeId);
  const [priority, setPriority] = useState<HqPriority>(2);
  const [status, setStatus] = useState<'todo' | 'backlog'>('todo');

  const assignable = members.filter((m) => m.status !== 'archived');
  const assignee = assignable.find((m) => m.id === assigneeId);

  const reset = () => {
    setTitle('');
    setBody('');
    setAssigneeId(defaultAssigneeId);
    setPriority(2);
    setStatus('todo');
  };

  const submit = () => {
    if (!title.trim()) {
      toast.error('Give the task a title');
      return;
    }
    create.mutate(
      { title: title.trim(), body, assigneeId, priority, status },
      {
        onSuccess: (task) => {
          toast.success(
            assignee?.kind === 'agent' && assignee.runtime === 'hq' && status === 'todo'
              ? `#${task.number} created — ${assignee.name} will pick it up`
              : `#${task.number} created`
          );
          reset();
          onOpenChange(false);
          openTask(task.id);
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not create the task')),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
