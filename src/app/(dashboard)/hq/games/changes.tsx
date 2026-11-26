'use client';

import { useState } from 'react';
import { Loader2, PencilLine, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCancelGameChange, useCreateGameChange, useReplanGameChange } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessGame, HarnessGameChange, HarnessGameChangeStatus } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';

// Changes to a game: someone writes what they want changed, the Game Planner
// turns it into a plan in plain words, and from there it is built, played and
// approved. This file is the asking and the reading; building connects next.

const STATUS: Record<HarnessGameChangeStatus, { label: string; tone: string }> = {
  suggested: { label: 'Suggested by an agent', tone: 'bg-violet-50 text-violet-700' },
  planning: { label: 'Being planned', tone: 'bg-sky-50 text-sky-700' },
  planned: { label: 'Plan ready', tone: 'bg-amber-50 text-amber-800' },
  building: { label: 'Being built', tone: 'bg-sky-50 text-sky-700' },
  ready: { label: 'Ready to play', tone: 'bg-emerald-50 text-emerald-700' },
  merged: { label: 'Done', tone: 'bg-emerald-50 text-emerald-700' },
  declined: { label: 'Declined', tone: 'bg-slate-100 text-slate-600' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-600' },
  failed: { label: 'Could not be planned', tone: 'bg-red-50 text-red-700' },
};
const OPEN: HarnessGameChangeStatus[] = ['suggested', 'planning', 'planned', 'building', 'ready', 'failed'];
const STEPS = ['Asked', 'Planned', 'Built', 'Played', 'Live'];
/** How far along a change is, as the index of the last step it has passed. */
const stepOf = (s: HarnessGameChangeStatus) => ({ suggested: -1, planning: 0, failed: 0, planned: 1, building: 1, ready: 2, merged: 4, declined: -1, cancelled: -1 })[s];
const SIZE = { small: 'Small change', medium: 'Medium change', large: 'Large change' };
const AREA = { website: 'Website', server: 'Server', both: 'Website and server' };

export const isOpenChange = (c: HarnessGameChange) => OPEN.includes(c.status);

/** The form on a game's card. */
export function AskForChange({ game, onClose }: { game: HarnessGame | null; onClose: () => void }) {
  const create = useCreateGameChange();
  const [title, setTitle] = useState('');
  const [request, setRequest] = useState('');
  const ok = title.trim().length >= 3 && request.trim().length >= 10;
  const close = () => {
    if (create.isPending) return;
    setTitle('');
    setRequest('');
    onClose();
  };
  const send = () => {
    if (!game || !ok) return;
    create.mutate(
      { gameKey: game.key, title: title.trim(), request: request.trim() },
      {
        onSuccess: (c) => {
          toast.success(`Change ${c.number} sent to the planner. Its plan appears under Changes in a few minutes.`);
          setTitle('');
          setRequest('');
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send the request')),
      }
    );
  };
  return (
    <Dialog open={!!game} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ask for a change to {game?.name}</DialogTitle>
          <DialogDescription>
            Say what should be different, in your own words. An agent reads the game&apos;s code and writes a plan for you to read first: nothing is built until you have seen it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-900">In a few words</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Four lives instead of three" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-900">What should change, and why</span>
            <Textarea
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              rows={6}
              maxLength={6000}
              placeholder="e.g. Most players are out before they finish the list. Give four lives instead of three in the daily game, and keep three when friends play in a room."
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!ok || create.isPending}>
            {create.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Send to the planner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Steps({ status }: { status: HarnessGameChangeStatus }) {
  const at = stepOf(status);
  if (at < 0) return null;
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[12px]" aria-label="How far along this change is">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn('rounded px-1.5 py-0.5 font-medium', i <= at ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500')} aria-current={i === at ? 'step' : undefined}>
            {s}
          </span>
          {i < STEPS.length - 1 && <span className={cn('h-px w-3', i < at ? 'bg-slate-900' : 'bg-slate-200')} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="ml-4 list-disc space-y-0.5 text-sm text-slate-800">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Change({ c }: { c: HarnessGameChange }) {
  const replan = useReplanGameChange();
  const cancel = useCancelGameChange();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(c.request);
  const st = STATUS[c.status];
  const busy = replan.isPending || cancel.isPending;
  const canChange = ['planning', 'planned', 'failed', 'suggested'].includes(c.status);
  // The editor opens on the request as it is now (someone else may have rewritten it since this card first drew).
  const startEditing = () => {
    setText(c.request);
    setEditing(true);
  };
  const sendAgain = () =>
    replan.mutate({ id: c.id, request: c.request }, { onSuccess: () => toast.success('Sent to the planner again.'), onError: (e) => toast.error(errorMessage(e, 'Could not send it again')) });
  const save = () =>
    replan.mutate(
      { id: c.id, request: text.trim() },
      { onSuccess: () => { setEditing(false); toast.success('Sent back to the planner.'); }, onError: (e) => toast.error(errorMessage(e, 'Could not send it back')) }
    );
  return (
    <Panel as="article" aria-label={`Change ${c.number}`} className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[12px] text-slate-500">
            Change {c.number} · {c.gameName} · {c.source === 'agent' ? 'suggested by an agent' : `asked by ${c.requestedBy ?? 'the team'}`} · {formatRelative(c.createdAt)}
          </p>
          <h3 className="font-semibold tracking-tight text-slate-950">{c.title}</h3>
        </div>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium', st.tone)}>{st.label}</span>
      </div>
      <Steps status={c.status} />
      <p className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{c.request}</p>

      {c.status === 'planning' && (
        <p className="flex items-center gap-2 text-sm text-sky-800">
          <Loader2 className="h-4 w-4 animate-spin" /> The planner is reading the game&apos;s code. A plan usually takes a few minutes.
        </p>
      )}
      {c.status === 'failed' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">The planner could not finish: {c.error ?? 'no reason given'}. </p>}

      {c.plan && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
            <span className="text-sm font-semibold text-slate-950">The plan</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-700">{SIZE[c.plan.size]}</span>
          </div>
          <p className="text-sm text-slate-900">{c.plan.summary}</p>
          {c.plan.questions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold text-amber-900">The planner needs to know</p>
              <ul className="ml-4 list-disc space-y-0.5 text-sm text-amber-900">
                {c.plan.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
              <p className="mt-1 text-[13px] text-amber-900">Answer by rewriting the request; it is planned again.</p>
            </div>
          )}
          {c.plan.changes.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">What changes</p>
              <ul className="space-y-1 text-sm text-slate-800">
                {c.plan.changes.map((x, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{AREA[x.area]}</span>
                    <span>{x.what}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <List title="What could go wrong" items={c.plan.risks} />
          <List title="How to check it by playing" items={c.plan.test} />
          {c.status === 'planned' && <p className="text-[13px] text-slate-600">Building from a plan is the next piece of HQ and is not connected yet. The plan stays here until it is.</p>}
        </div>
      )}

      {editing ? (
        <div className="space-y-2">
          <Textarea aria-label={`Rewrite the request for change ${c.number}`} value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={6000} />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || text.trim().length < 10 || text.trim() === c.request}>
              {replan.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Plan it again
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEditing(false); setText(c.request); }} disabled={busy}>
              Keep it as it was
            </Button>
          </div>
        </div>
      ) : (
        canChange && (
          <div className="flex flex-wrap gap-2">
            {c.status === 'failed' && (
              <Button size="sm" onClick={sendAgain} disabled={busy} aria-label={`Send change ${c.number} to the planner again`}>
                {replan.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Send it again
              </Button>
            )}
            {c.status !== 'suggested' && (
              <Button size="sm" variant="outline" onClick={startEditing} disabled={busy}>
                <PencilLine className="mr-1 h-3.5 w-3.5" /> Rewrite the request
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => cancel.mutate(c.id, { onSuccess: () => toast.success(`Change ${c.number} cancelled.`), onError: (e) => toast.error(errorMessage(e, 'Could not cancel it')) })}
              disabled={busy}
              aria-label={`Cancel change ${c.number}`}
            >
              {cancel.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <X className="mr-1 h-3.5 w-3.5" />} Cancel it
            </Button>
          </div>
        )
      )}
    </Panel>
  );
}

/** The list of changes on the Games page: open ones, then what ended recently. */
export function Changes({ changes, failed }: { changes: HarnessGameChange[] | undefined; failed: boolean }) {
  const [showOld, setShowOld] = useState(false);
  const open = (changes ?? []).filter(isOpenChange);
  const old = (changes ?? []).filter((c) => !isOpenChange(c));
  return (
    <Section
      title="Changes"
      count={open.filter((c) => c.status === 'planned' || c.status === 'ready' || c.status === 'failed').length}
      countTone="attention"
      description="What the team asked to change. An agent plans each one first; you read the plan before anything is built."
      actions={
        old.length > 0 ? (
          <button type="button" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowOld((v) => !v)}>
            {showOld ? 'Hide finished' : `Show ${old.length} finished`}
          </button>
        ) : undefined
      }
    >
      {!changes ? (
        <EmptyState>{failed ? 'Could not load the changes.' : 'Loading…'}</EmptyState>
      ) : open.length === 0 && !showOld ? (
        <EmptyState>No changes in progress. Press “Ask for a change” on any game below.</EmptyState>
      ) : (
        <div className="space-y-3">
          {[...open, ...(showOld ? old : [])].map((c) => (
            <Change key={c.id} c={c} />
          ))}
        </div>
      )}
    </Section>
  );
}
