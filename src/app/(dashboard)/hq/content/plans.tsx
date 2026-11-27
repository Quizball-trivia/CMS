'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Loader2, Plus, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCancelHarnessEvent, useCancelHarnessProposal, useCreateHarnessEvent, useCreateHarnessProposal, useHarnessProposalGoLive } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessMarket, HarnessContentEvent, HarnessProposal } from '@/types';
import { MarketChip, marketName } from './markets';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';

// Planning ahead: events (questions ready before a match or anniversary) and
// new categories (created hidden, filled by the agents, then put live).

type CategoryOption = { id: string; name: string };

const MAX_EVENT_CATEGORIES = 6;

function Progress({ live, working, target }: { live: number; working: number; target: number }) {
  const t = Math.max(target, 1);
  const a = Math.min(100, (live / t) * 100);
  const b = Math.min(100 - a, (working / t) * 100);
  return (
    <div className="min-w-[120px]">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <div className="bg-emerald-500" style={{ width: `${a}%` }} />
        <div className="bg-emerald-200" style={{ width: `${b}%` }} />
      </div>
      <div className="mt-1 text-[12px] tabular-nums text-slate-600">
        {live} of {target} ready{working > 0 && <span className="text-emerald-700"> · {working} on the way</span>}
      </div>
    </div>
  );
}

function EventDialog({ onClose, categories, market }: { onClose: () => void; categories: CategoryOption[]; market: HarnessMarket }) {
  const [title, setTitle] = useState('');
  const [happensOn, setHappensOn] = useState('');
  const [notes, setNotes] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [perCategory, setPerCategory] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const create = useCreateHarnessEvent();
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter((c) => !picked.includes(c.id) && (!q || c.name.toLowerCase().includes(q))).slice(0, 8);
  }, [categories, picked, search]);
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? id;
  const valid = title.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(happensOn) && picked.length > 0 && Number.isInteger(perCategory) && perCategory >= 1 && perCategory <= 20;
  const submit = () =>
    create.mutate(
      { title: title.trim(), happensOn, notes: notes.trim(), categoryIds: picked, perCategory, difficulty, market },
      {
        onSuccess: () => {
          toast.success('Event added: its questions are made first');
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not add the event')),
      }
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an event</DialogTitle>
          <DialogDescription>
            A match, a final, an anniversary. The agents make questions about it ahead of the date, ready the day before.
            {market !== 'all' && <> This one is marked as made for {marketName(market)}.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="event-title">Event</Label>
            <Input id="event-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. El Clásico" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" type="date" value={happensOn} onChange={(e) => setHappensOn(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="event-count">Per category</Label>
              <Input id="event-count" type="number" min={1} max={20} value={perCategory} onChange={(e) => setPerCategory(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="event-difficulty">Difficulty</Label>
              <Select value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
                <SelectTrigger id="event-difficulty">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mixed">Mixed</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-categories">Categories (up to {MAX_EVENT_CATEGORIES})</Label>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {picked.map((id) => (
                  <button key={id} type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[12px] font-medium text-violet-900 hover:bg-violet-200" aria-label={`Remove ${nameOf(id)}`}>
                    {nameOf(id)} ×
                  </button>
                ))}
              </div>
            )}
            {picked.length < MAX_EVENT_CATEGORIES && (
              <>
                <Input id="event-categories" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories" />
                {search.trim() && (
                  <div className="flex flex-wrap gap-1.5">
                    {matches.length === 0 ? (
                      <span className="text-[12px] text-slate-500">No match</span>
                    ) : (
                      matches.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setPicked((p) => [...p, c.id]);
                            setSearch('');
                          }}
                          className="rounded-full border border-slate-200 px-2.5 py-0.5 text-[12px] text-slate-700 hover:bg-slate-100"
                        >
                          + {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="event-notes">What should the questions be about? (optional)</Label>
            <Textarea id="event-notes" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. the history of the fixture, famous goals, players who played for both" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Events({ events, categories, market = 'all' }: { events: HarnessContentEvent[]; categories: CategoryOption[]; market?: HarnessMarket }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelHarnessEvent();
  return (
    <Section
      title="Events"
      count={events.filter((e) => e.status === 'open').length}
      description="Matches and moments coming up. Their questions are made first and ready the day before."
      actions={
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <CalendarDays className="mr-1.5 h-4 w-4" /> Add event
        </Button>
      }
    >
      <Panel className="divide-y divide-slate-100">
        {events.length === 0 ? (
          <EmptyState className="px-4 py-3">{market === 'all' ? 'No events planned. Add one for the next big match.' : `No events for ${marketName(market)} yet. Add one for its next big match.`}</EmptyState>
        ) : (
          events.map((e) => (
            <div key={e.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm', e.status === 'cancelled' && 'opacity-50')}>
              <div className="w-24 shrink-0 font-semibold tabular-nums text-slate-900">{e.happensOn}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {e.title}
                  {e.market && e.market !== 'all' && <MarketChip market={e.market} />}
                </div>
                <div className="text-[12px] text-slate-600">
                  {e.categories.join(', ')} · {e.perCategory} each{e.createdBy && <> · by {e.createdBy}</>}
                </div>
              </div>
              <Progress live={e.live} working={e.working} target={e.perCategory * e.categories.length} />
              {e.status === 'open' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-slate-600"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(e.id, { onSuccess: () => toast.success('Event cancelled'), onError: (err) => toast.error(errorMessage(err, 'Could not cancel')) })}
                >
                  Cancel
                </Button>
              ) : (
                <span className="text-[12px] text-slate-500">Cancelled</span>
              )}
            </div>
          ))
        )}
      </Panel>
      {open && <EventDialog onClose={() => setOpen(false)} categories={categories} market={market} />}
    </Section>
  );
}

function ProposalDialog({ onClose, market }: { onClose: () => void; market: HarnessMarket }) {
  const [name, setName] = useState('');
  const [why, setWhy] = useState('');
  const [target, setTarget] = useState(30);
  const create = useCreateHarnessProposal();
  const valid = name.trim().length >= 2 && Number.isInteger(target) && target >= 10 && target <= 100;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suggest a new category</DialogTitle>
          <DialogDescription>
            It is created hidden from players. The agents fill it with a starter set; you put it live when it looks good.
            {market !== 'all' && <> This one is marked as made for {marketName(market)}.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-name">Name</Label>
            <Input id="proposal-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inter Miami" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-why">What should it cover? (becomes its direction)</Label>
            <Textarea id="proposal-why" rows={3} maxLength={1000} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. the club since 2020, Messi's arrival, MLS Cup runs, the stadium" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="proposal-target">Starter set (questions)</Label>
            <Input id="proposal-target" type="number" min={10} max={100} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate(
                { name: name.trim(), why: why.trim(), target, market },
                {
                  onSuccess: () => {
                    toast.success('Category created (hidden): the agents are filling it');
                    onClose();
                  },
                  onError: (e) => toast.error(errorMessage(e, 'Could not create the category')),
                }
              )
            }
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create and fill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NewCategories({ proposals, market = 'all' }: { proposals: HarnessProposal[]; market?: HarnessMarket }) {
  const [open, setOpen] = useState(false);
  const goLive = useHarnessProposalGoLive();
  const cancel = useCancelHarnessProposal();
  return (
    <Section
      title="New categories"
      count={proposals.filter((p) => p.status === 'filling').length}
      description="Categories the team suggested. Hidden from players until you put them live."
      actions={
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Suggest a category
        </Button>
      }
    >
      <Panel className="divide-y divide-slate-100">
        {proposals.length === 0 ? (
          <EmptyState className="px-4 py-3">{market === 'all' ? 'No new categories yet.' : `No new categories for ${marketName(market)} yet. Suggest the first one.`}</EmptyState>
        ) : (
          proposals.map((p) => {
            const full = p.live >= p.target;
            // Ranked only picks a category that also has one put-in-order and one clue-chain question.
            const missing = p.specialsRequired
              ? ([p.putInOrder < 1 && 'a put-in-order question', p.clueChain < 1 && 'a clue-chain question'].filter(Boolean) as string[])
              : [];
            return (
              <div key={p.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm', p.status === 'cancelled' && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {p.name}
                    {p.market && p.market !== 'all' && <MarketChip market={p.market} />}
                  </div>
                  <div className="truncate text-[12px] text-slate-600" title={p.why}>
                    {p.why || 'No direction given'}
                    {p.proposedBy && <> · by {p.proposedBy}</>}
                  </div>
                  {p.status === 'filling' && missing.length > 0 && (
                    <div className="text-[12px] text-amber-700">Before it can go live, add {missing.join(' and ')} under Questions.</div>
                  )}
                </div>
                <Progress live={p.live} working={p.working} target={p.target} />
                {p.status === 'filling' && (
                  <>
                    <Button
                      size="sm"
                      variant={full ? 'default' : 'outline'}
                      disabled={goLive.isPending || p.live === 0 || missing.length > 0}
                      title={missing.length ? `Needs ${missing.join(' and ')} first` : full ? 'Put it in the game' : `Only ${p.live} of ${p.target} ready: players would see repeats`}
                      onClick={() =>
                        goLive.mutate(p.id, { onSuccess: () => toast.success(`${p.name} is live in the game`), onError: (e) => toast.error(errorMessage(e, 'Could not put it live')) })
                      }
                    >
                      <Rocket className="mr-1.5 h-4 w-4" /> Go live
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-slate-600"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(p.id, { onSuccess: () => toast.success('Dropped: it stays hidden'), onError: (e) => toast.error(errorMessage(e, 'Could not drop it')) })}
                    >
                      Drop
                    </Button>
                  </>
                )}
                {p.status === 'live' && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[12px] font-medium text-emerald-700">Live in the game</span>}
                {p.status === 'cancelled' && <span className="text-[12px] text-slate-500">Dropped</span>}
              </div>
            );
          })
        )}
      </Panel>
      {open && <ProposalDialog onClose={() => setOpen(false)} market={market} />}
    </Section>
  );
}
