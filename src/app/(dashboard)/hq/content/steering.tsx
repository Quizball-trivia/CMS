'use client';

import { useMemo, useState } from 'react';
import { Loader2, MessageSquareText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCancelHarnessRequest, useCreateHarnessRequest, useSetHarnessDirection, useSetHarnessSteering } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessCategoryHealth, HarnessPriority, HarnessRequest } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';
import { fillEstimate } from './plain';

// How the team steers the agents: which categories go first, what each one
// should be about, and orders for specific questions. Everything here is read
// by the agents on their next batch.

const PRIORITIES: Array<{ value: HarnessPriority; label: string; title: string }> = [
  { value: 'boost', label: 'Boost', title: 'Goes first and gets an extra batch at a time' },
  { value: 'normal', label: 'Normal', title: 'Filled in order of how short it is' },
  { value: 'hold', label: 'Hold', title: 'No new questions until you switch it back' },
];

function PriorityToggle({ c }: { c: HarnessCategoryHealth }) {
  const steer = useSetHarnessSteering();
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5" role="group" aria-label={`Priority for ${c.name}`}>
      {PRIORITIES.map((p) => (
        <button
          key={p.value}
          type="button"
          title={p.title}
          aria-pressed={c.priority === p.value}
          disabled={steer.isPending}
          onClick={() =>
            c.priority !== p.value &&
            steer.mutate(
              { categoryId: c.categoryId, priority: p.value },
              { onSuccess: () => toast.success(`${c.name}: ${p.label.toLowerCase()}`), onError: (e) => toast.error(errorMessage(e, 'Could not change the priority')) }
            )
          }
          className={cn(
            'rounded px-2 py-0.5 text-[12px] font-medium',
            c.priority === p.value
              ? p.value === 'boost'
                ? 'bg-violet-600 text-white'
                : p.value === 'hold'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-200 text-slate-900'
              : 'text-slate-600 hover:bg-slate-100'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function FillBar({ c }: { c: HarnessCategoryHealth }) {
  const target = Math.max(c.needed, 1);
  const live = Math.min(100, (c.pool / target) * 100);
  const coming = Math.min(100 - live, (c.inPipeline / target) * 100);
  return (
    <div className="min-w-[140px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="bg-emerald-500" style={{ width: `${live}%` }} />
        <div className="bg-emerald-200" style={{ width: `${coming}%` }} />
      </div>
      <div className="mt-1 text-[12px] tabular-nums text-slate-600">
        {c.pool} of {c.needed} live{c.inPipeline > 0 && <span className="text-emerald-700"> · {c.inPipeline} on the way</span>}
      </div>
    </div>
  );
}

function DirectionDialog({ target, onClose }: { target: { categoryId: string | null; name: string; text: string } | null; onClose: () => void }) {
  const [text, setText] = useState(target?.text ?? '');
  const steer = useSetHarnessSteering();
  const global = useSetHarnessDirection();
  const pending = steer.isPending || global.isPending;
  const save = () => {
    const done = { onSuccess: () => (toast.success('Direction saved: the agents use it from their next batch'), onClose()), onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save')) };
    if (target?.categoryId) steer.mutate({ categoryId: target.categoryId, direction: text.trim() }, done);
    else global.mutate(text.trim(), done);
  };
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{target?.categoryId ? `Direction for ${target.name}` : 'Direction for every category'}</DialogTitle>
          <DialogDescription>
            Tell the agents what you want more or less of. The Planner and the Question Maker read this on every batch. Leave it empty to remove it.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={4}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Direction"
          placeholder={target?.categoryId ? 'e.g. more about the 90s and the Ferguson era, fewer transfer-fee questions' : 'e.g. keep questions about current players under 20%; no questions about injuries'}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CategoryOption = { id: string; name: string };

export function OrderDialog({ open, onClose, categories, initialCategory }: { open: boolean; onClose: () => void; categories: CategoryOption[]; initialCategory?: string }) {
  const [categoryId, setCategoryId] = useState(initialCategory ?? '');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(10);
  const [topic, setTopic] = useState('');
  const [deadline, setDeadline] = useState('');
  const create = useCreateHarnessRequest();
  const sorted = useMemo(() => [...categories].sort((a, b) => a.name.localeCompare(b.name)), [categories]);
  // One batch is at most 20 questions; place several orders for more.
  const valid = categoryId && topic.trim().length >= 3 && count >= 1 && count <= 20;
  const submit = () =>
    create.mutate(
      { categoryId, difficulty, count, topic: topic.trim(), deadline: deadline || null },
      {
        onSuccess: () => {
          toast.success('Ordered: the Planner picks it up next');
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not place the order')),
      }
    );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Order questions</DialogTitle>
          <DialogDescription>Ask the agents for questions on a topic: an upcoming match, an anniversary, a theme. They go through all the same checks.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="order-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="order-category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {sorted.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="order-topic">Topic</Label>
            <Input id="order-topic" maxLength={300} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. El Clásico history before the Dec 14 match" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="order-difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                <SelectTrigger id="order-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-count">How many</Label>
              <Input id="order-count" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="order-deadline">Needed by (optional)</Label>
              <Input id="order-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Order {count} questions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TH = 'px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500';
const TD = 'px-4 py-2.5 align-middle';

export function CategoryBoard({ categories, direction }: { categories: HarnessCategoryHealth[]; direction: string }) {
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<{ categoryId: string | null; name: string; text: string } | null>(null);
  const rows = useMemo(() => {
    const rank = (c: HarnessCategoryHealth) => (c.priority === 'boost' ? 0 : c.priority === 'hold' ? 2 : 1);
    return [...categories].sort((a, b) => rank(a) - rank(b) || b.shortage - a.shortage || b.views30d - a.views30d);
  }, [categories]);
  // Short, boosted or steered categories always show; the full list is one click away.
  const shown = showAll ? rows : rows.filter((c, i) => i < 12 || c.priority !== 'normal' || c.direction);
  return (
    <Section
      title="Categories"
      description="How full each ranked category is, and how you steer it. Boost puts a category first; Hold stops new questions for it."
      actions={
        <Button size="sm" variant="outline" onClick={() => setEditing({ categoryId: null, name: 'every category', text: direction })}>
          <MessageSquareText className="mr-1.5 h-4 w-4" /> Direction for all
        </Button>
      }
    >
      {direction && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-950">
          <b>Direction for all categories:</b> {direction}
        </div>
      )}
      <Panel className="overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState className="px-4 py-3">No ranked play in the last 30 days.</EmptyState>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-slate-200">
              <tr>
                <th className={TH}>Category</th>
                <th className={TH}>Questions</th>
                <th className={cn(TH, 'text-right')}>Short</th>
                <th className={TH}>Full in</th>
                <th className={TH}>Priority</th>
                <th className={TH}>Direction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((c) => (
                <tr key={c.categoryId} className={cn(c.priority === 'hold' && 'opacity-60')}>
                  <td className={TD}>
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-[12px] text-slate-500">{c.views30d.toLocaleString()} ranked showings / 30 days</div>
                  </td>
                  <td className={TD}>
                    <FillBar c={c} />
                  </td>
                  <td className={cn(TD, 'text-right font-semibold tabular-nums', c.shortage > 0 ? 'text-amber-600' : 'text-emerald-600')}>{c.shortage > 0 ? c.shortage : '✓'}</td>
                  <td className={cn(TD, 'whitespace-nowrap text-slate-700')}>{fillEstimate(c)}</td>
                  <td className={TD}>
                    <PriorityToggle c={c} />
                  </td>
                  <td className={cn(TD, 'max-w-[260px]')}>
                    <button
                      type="button"
                      onClick={() => setEditing({ categoryId: c.categoryId, name: c.name, text: c.direction })}
                      className={cn('block w-full truncate text-left text-[13px] hover:underline', c.direction ? 'text-violet-800' : 'text-slate-400')}
                      title={c.direction || 'Add a direction for this category'}
                    >
                      {c.direction || '+ Add direction'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {rows.length > shown.length || showAll ? (
        <button type="button" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${rows.length} categories`}
        </button>
      ) : null}
      <DirectionDialog key={editing ? `${editing.categoryId}` : 'closed'} target={editing} onClose={() => setEditing(null)} />
    </Section>
  );
}

export function Orders({ requests, categories }: { requests: HarnessRequest[]; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelHarnessRequest();
  return (
    <Section
      title="Orders"
      count={requests.filter((r) => r.status === 'open').length}
      description="Questions the team asked for on a specific topic. Orders with a deadline go before everything else."
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Order questions
        </Button>
      }
    >
      <Panel className="divide-y divide-slate-100">
        {requests.length === 0 ? (
          <EmptyState className="px-4 py-3">No orders yet. Use “Order questions” for a match, an anniversary or a theme.</EmptyState>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{r.topic}</div>
                <div className="text-[12px] text-slate-600">
                  {r.category ?? 'No category'} · {r.count} {r.difficulty}
                  {r.deadline && <> · needed by {r.deadline}</>}
                  {r.requestedBy && <> · by {r.requestedBy}</>}
                </div>
              </div>
              <div className="text-[13px] tabular-nums text-slate-700">
                <span className="font-semibold text-emerald-700">{r.live}</span> live
                {r.working > 0 && <> · {r.working} in progress</>}
                {r.dropped > 0 && <span className="text-slate-500"> · {r.dropped} dropped</span>}
              </div>
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[12px] font-medium',
                  r.status === 'open' ? 'bg-sky-50 text-sky-700' : r.status === 'done' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                )}
              >
                {r.status === 'open' ? 'In progress' : r.status === 'done' ? 'Written' : 'Cancelled'}
              </span>
              {r.status === 'open' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-slate-600"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(r.id, { onSuccess: () => toast.success('Order cancelled'), onError: (e) => toast.error(errorMessage(e, 'Could not cancel')) })}
                >
                  Cancel
                </Button>
              )}
            </div>
          ))
        )}
      </Panel>
      {open && <OrderDialog open onClose={() => setOpen(false)} categories={categories} />}
    </Section>
  );
}
