'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Target, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAcceptHqProposal, useDeclineHqProposal } from '@/hooks';
import { cn } from '@/lib/utils';
import { EFFORT_LABELS, buildProposalChange, proposalEditMode, proposalEditText } from '@/lib/hq-standup';
import type { HqGoal, HqTask } from '@/types';
import { MemberAvatar, errorMessage } from './hq-ui';

const EFFORT_STYLES = { s: 'bg-emerald-50 text-emerald-700', m: 'bg-amber-50 text-amber-800', l: 'bg-rose-50 text-rose-700' } as const;

/**
 * An agent's idea waiting for the CEO. Three big actions: Do it (the agent
 * starts), Change (edit, then do it), Not now (declined; the note reaches the
 * agent at its next standup).
 */
export function ProposalCard({ task, goal, onOpen }: { task: HqTask; goal?: HqGoal | null; onOpen?: (id: string) => void }) {
  const accept = useAcceptHqProposal();
  const decline = useDeclineHqProposal();
  const [changeOpen, setChangeOpen] = useState(false);
  const [notNowOpen, setNotNowOpen] = useState(false);
  const p = task.proposal;
  const busy = accept.isPending || decline.isPending;
  const agentName = task.assignee?.name ?? 'the team';

  const doIt = () =>
    accept.mutate(
      { id: task.id },
      {
        onSuccess: () => toast.success(`On it — ${agentName} starts “${task.title}”`),
        onError: (e) => toast.error(errorMessage(e, 'Could not start this idea')),
      }
    );

  return (
    <article className="flex flex-col rounded-3xl border-2 border-violet-200 bg-white p-6 shadow-sm transition hover:border-violet-300 hover:shadow-md">
      <header className="flex items-center gap-3">
        <MemberAvatar member={task.assignee} size="md" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold text-slate-800">{task.createdBy?.name ?? agentName}</div>
          <div className="text-xs text-slate-400">suggests</div>
        </div>
        <span className="ml-auto text-2xl" aria-hidden>
          💡
        </span>
      </header>

      <button type="button" onClick={() => onOpen?.(task.id)} className="mt-4 text-left">
        <h3 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 hover:underline">{task.title}</h3>
      </button>
      {p?.why && <p className="mt-2 line-clamp-2 text-base text-slate-600">{p.why}</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {p?.expectedImpact && (
          <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-800" title="Expected impact">
            📈 {p.expectedImpact}
          </span>
        )}
        {p?.effort && <span className={cn('rounded-full px-3 py-1 font-medium', EFFORT_STYLES[p.effort])}>⏱ {EFFORT_LABELS[p.effort]}</span>}
        {goal && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700" title="Moves this goal">
            <Target className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{goal.title}</span>
          </span>
        )}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 pt-6">
        <Button size="lg" onClick={doIt} disabled={busy} className="h-12 bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700">
          <Check className="h-5 w-5" /> Do it
        </Button>
        <Button size="lg" variant="outline" onClick={() => setChangeOpen(true)} disabled={busy} className="h-12 text-base font-semibold">
          <Pencil className="h-4 w-4" /> Change
        </Button>
        <Button size="lg" variant="ghost" onClick={() => setNotNowOpen(true)} disabled={busy} className="h-12 text-base font-semibold text-slate-500">
          <X className="h-5 w-5" /> Not now
        </Button>
      </div>

      <ChangeDialog task={task} open={changeOpen} onOpenChange={setChangeOpen} />
      <NotNowDialog task={task} open={notNowOpen} onOpenChange={setNotNowOpen} />
    </article>
  );
}

function ChangeDialog({ task, open, onOpenChange }: { task: HqTask; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">{open && <ChangeForm task={task} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function ChangeForm({ task, onDone }: { task: HqTask; onDone: () => void }) {
  const accept = useAcceptHqProposal();
  // Edit the plan while the body is still the generated one; otherwise the hand-edited instructions.
  const mode = proposalEditMode(task);
  const [title, setTitle] = useState(task.title);
  const [text, setText] = useState(() => proposalEditText(task));

  const submit = () => {
    if (!title.trim()) return toast.error('The idea needs a title');
    if (!text.trim()) return toast.error(mode === 'plan' ? 'The plan can’t be empty' : 'The instructions can’t be empty');
    accept.mutate(
      { id: task.id, data: buildProposalChange(task, title, text) },
      {
        onSuccess: () => {
          toast.success(`On it — ${task.assignee?.name ?? 'the agent'} starts your version`);
          onDone();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not start this idea')),
      }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl">Change the idea, then do it</DialogTitle>
        <DialogDescription>{task.assignee?.name ?? 'The agent'} works from your version.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-12 text-lg font-semibold" maxLength={200} aria-label="Idea title" />
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500">{mode === 'plan' ? 'Plan' : 'Instructions'}</span>
          <Textarea
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'plan' ? 'The plan — what exactly should happen?' : 'What the agent should do (Markdown)'}
            aria-label={mode === 'plan' ? 'Plan' : 'Instructions'}
          />
        </label>
        {mode === 'instructions' && <p className="text-xs text-slate-400">These instructions were edited by hand, so you’re editing them directly.</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={accept.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Check className="h-4 w-4" /> Do it
        </Button>
      </DialogFooter>
    </>
  );
}

function NotNowDialog({ task, open, onOpenChange }: { task: HqTask; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <NotNowForm task={task} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function NotNowForm({ task, onDone }: { task: HqTask; onDone: () => void }) {
  const decline = useDeclineHqProposal();
  const [note, setNote] = useState('');
  const submit = () =>
    decline.mutate(
      { id: task.id, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Okay — not now');
          onDone();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not decline')),
      }
    );
  return (
    <>
      <DialogHeader>
        <DialogTitle>Not now?</DialogTitle>
        <DialogDescription>Optionally tell {task.assignee?.name ?? 'the agent'} why — it reads your note at the next standup.</DialogDescription>
      </DialogHeader>
      <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Good idea, but after the derby weekend." />
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Keep it
        </Button>
        <Button onClick={submit} disabled={decline.isPending}>
          Not now
        </Button>
      </DialogFooter>
    </>
  );
}

/** Proposal details + actions inside the task sheet. */
export function ProposalPanel({ task }: { task: HqTask }) {
  const accept = useAcceptHqProposal();
  const [notNowOpen, setNotNowOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const p = task.proposal;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-violet-200 bg-violet-50/40 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-violet-700">💡 Idea from {task.createdBy?.name ?? task.assignee?.name ?? 'an agent'}</div>
      {p?.why && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Why: </span>
          {p.why}
        </p>
      )}
      {p?.plan && (
        <div className="text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Plan</div>
          <p className="whitespace-pre-wrap">{p.plan}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs">
        {p?.expectedImpact && <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-800">📈 {p.expectedImpact}</span>}
        {p?.effort && <span className={cn('rounded-full px-2.5 py-1 font-medium', EFFORT_STYLES[p.effort])}>⏱ {EFFORT_LABELS[p.effort]}</span>}
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={accept.isPending}
          onClick={() =>
            accept.mutate(
              { id: task.id },
              { onSuccess: () => toast.success('On it'), onError: (e) => toast.error(errorMessage(e, 'Could not start this idea')) }
            )
          }
        >
          <Check className="h-4 w-4" /> Do it
        </Button>
        <Button size="sm" variant="outline" onClick={() => setChangeOpen(true)}>
          <Pencil className="h-4 w-4" /> Change
        </Button>
        <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => setNotNowOpen(true)}>
          <X className="h-4 w-4" /> Not now
        </Button>
      </div>
      <ChangeDialog task={task} open={changeOpen} onOpenChange={setChangeOpen} />
      <NotNowDialog task={task} open={notNowOpen} onOpenChange={setNotNowOpen} />
    </section>
  );
}
