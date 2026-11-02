'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Play, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useApproveHqTask, useRejectHqTask, useRunHqTask } from '@/hooks';
import type { HqTask } from '@/types';
import { errorMessage } from './hq-ui';

export function canApprove(task: Pick<HqTask, 'status'>) {
  return task.status === 'needs_approval';
}

export function canSendBack(task: Pick<HqTask, 'status' | 'assignee'>) {
  return !!task.assignee && ['needs_approval', 'done', 'blocked'].includes(task.status);
}

export function ApproveButton({ task, size = 'sm' }: { task: HqTask; size?: 'sm' | 'default' }) {
  const approve = useApproveHqTask();
  return (
    <Button
      size={size}
      className="bg-emerald-600 text-white hover:bg-emerald-700"
      disabled={approve.isPending}
      onClick={() =>
        approve.mutate(
          { id: task.id },
          {
            onSuccess: () => toast.success(`#${task.number} approved`),
            onError: (e) => toast.error(errorMessage(e, 'Could not approve')),
          }
        )
      }
    >
      <Check className="h-4 w-4" />
      Approve
    </Button>
  );
}

export function SendBackButton({ task, size = 'sm' }: { task: HqTask; size?: 'sm' | 'default' }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const reject = useRejectHqTask();

  const submit = () => {
    const trimmed = note.trim();
    if (!trimmed) {
      toast.error('Tell them what to change');
      return;
    }
    reject.mutate(
      { id: task.id, note: trimmed },
      {
        onSuccess: () => {
          toast.success(`#${task.number} sent back to ${task.assignee?.name ?? 'the assignee'}`);
          setOpen(false);
          setNote('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send back')),
      }
    );
  };

  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)}>
        <Undo2 className="h-4 w-4" />
        Send back
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send #{task.number} back</DialogTitle>
            <DialogDescription>
              {task.assignee?.name ?? 'The assignee'} gets your note and works on the task again.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What should change? Be specific — e.g. 'Use last week's numbers, and write it in Georgian.'"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={reject.isPending}>
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RunAgainButton({ task, size = 'sm', label = 'Run again' }: { task: HqTask; size?: 'sm' | 'default'; label?: string }) {
  const run = useRunHqTask();
  return (
    <Button
      size={size}
      variant="outline"
      disabled={run.isPending}
      onClick={() =>
        run.mutate(task.id, {
          onSuccess: () => toast.success(`#${task.number} queued for ${task.assignee?.name ?? 'the agent'}`),
          onError: (e) => toast.error(errorMessage(e, 'Could not queue the task')),
        })
      }
    >
      <Play className="h-4 w-4" />
      {label}
    </Button>
  );
}
