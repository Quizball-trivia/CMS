'use client';

import { useState } from 'react';
import { Check, Loader2, RefreshCw, Repeat } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApproveShowPack, useNewShowPack, useSwapShowQuestion } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessShow, HarnessShowPack, HarnessShowQuestion, HarnessShowText } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';

// The Monday show (ორშაბათობა): the agents prepare the question pack for the
// next show night and check every question; a person reads it, swaps what
// they don't like and approves it. Approving loads it for the hosts. This is
// the one place in the Content tab where a person approves: the questions are
// read out live.

const KIND_LABEL: Record<string, string> = {
  true_false: 'True or false',
  mcq: 'Multiple choice',
  put_in_order: 'Put in order',
  career_path: 'Career path',
  who_am_i: 'Who am I?',
};
const LINES_LABEL: Record<string, string> = { put_in_order: 'Right order', career_path: 'Clubs, in order', who_am_i: 'Clues, in order' };

/** "Monday, 4 January 2027" from a YYYY-MM-DD show date. */
export function showDay(eventDate: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${eventDate}T00:00:00Z`));
}

/** One line on where the pack stands, used on Today and at the top of the show section. */
export function showStatus(show: HarnessShow, paused: boolean): { tone: 'ok' | 'attention' | 'working' | 'idle'; text: string } {
  const p = show.pack;
  if (!p) {
    if (show.loaded) return { tone: 'ok', text: 'A pack was loaded by hand for this show.' };
    return paused ? { tone: 'idle', text: 'No pack yet. The agents are paused, so none is being prepared.' } : { tone: 'working', text: 'No pack yet. The agents are preparing one; it appears here within a few minutes.' };
  }
  if (p.status === 'approved') {
    return show.loadedIsThisPack
      ? { tone: 'ok', text: `Approved${p.approvedBy ? ` by ${p.approvedBy}` : ''} and loaded for the show.` }
      : { tone: 'attention', text: 'Approved here, but the pack stored for the show is a different one: someone loaded another by hand afterwards.' };
  }
  if (p.status === 'checking') return { tone: 'working', text: `The checker is verifying ${p.counts.checking} of ${p.counts.total} questions.` };
  if (p.status === 'flagged') return { tone: 'working', text: `The checker flagged ${p.counts.flagged} question${p.counts.flagged === 1 ? '' : 's'}; they are being swapped for new ones.` };
  const rest = [p.counts.flagged ? `${p.counts.flagged} flagged` : '', p.counts.notChecked ? `${p.counts.notChecked} not checked` : ''].filter(Boolean).join(', ');
  return { tone: 'attention', text: `Ready for you: ${p.counts.total} questions, ${p.counts.ok} checked${rest ? `, ${rest}` : ''}. Read it and approve.` };
}

const TONE: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  attention: 'border-amber-200 bg-amber-50 text-amber-900',
  working: 'border-sky-200 bg-sky-50 text-sky-900',
  idle: 'border-slate-200 bg-slate-50 text-slate-700',
};

/** The compact card on Today. */
export function ShowSummary({ show, paused, onOpen }: { show: HarnessShow; paused: boolean; onOpen: () => void }) {
  const s = showStatus(show, paused);
  return (
    <Section title="Monday show" description={`ორშაბათობა, episode ${show.episode} · ${showDay(show.eventDate)}`}>
      <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm', TONE[s.tone])}>
        <span>{s.text}</span>
        <Button size="sm" variant="outline" onClick={onOpen}>
          {show.pack?.status === 'ready' ? 'Review the pack' : 'Open'}
        </Button>
      </div>
    </Section>
  );
}

function Both({ t, big = false }: { t: HarnessShowText; big?: boolean }) {
  return (
    <span>
      <span lang="ka" className={cn(big ? 'text-[15px] font-medium text-slate-950' : 'text-slate-900')}>
        {t.ka}
      </span>
      {t.en && <span className="block text-[12px] text-slate-500">{t.en}</span>}
    </span>
  );
}

function CheckChip({ q }: { q: HarnessShowQuestion }) {
  if (q.check === 'ok')
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[12px] font-medium text-emerald-700">
        <Check className="h-3 w-3" aria-hidden /> Checked
      </span>
    );
  if (q.check === 'flagged') return <span className="rounded bg-red-50 px-1.5 py-0.5 text-[12px] font-medium text-red-700">Flagged</span>;
  if (q.check === 'skipped') return <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-800">Not checked</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[12px] font-medium text-sky-700">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Being checked
    </span>
  );
}

function Question({ q, n, canSwap, onSwap, swapping }: { q: HarnessShowQuestion; n: number; canSwap: boolean; onSwap: () => void; swapping: boolean }) {
  return (
    <article aria-label={`Question ${n}`} className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] text-slate-600">
          <span className="font-semibold text-slate-900">Question {n}</span>
          <CheckChip q={q} />
        </div>
        {canSwap && (
          <Button size="sm" variant="ghost" onClick={onSwap} disabled={swapping} aria-label={`Swap question ${n}`}>
            {swapping ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Repeat className="mr-1 h-3.5 w-3.5" />} Swap
          </Button>
        )}
      </div>
      {q.note && <p className={cn('rounded-md px-2.5 py-1.5 text-[13px]', q.check === 'flagged' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900')}>{q.note}</p>}
      {q.prompt && (
        <p>
          <Both t={q.prompt} big />
        </p>
      )}
      {q.instruction && (
        <p className="text-sm">
          <Both t={q.instruction} />
        </p>
      )}
      {q.image && (
        // eslint-disable-next-line @next/next/no-img-element -- question photos live on the game's own storage, any size
        <img src={q.image} alt="The photo shown with this question" className="max-h-48 rounded-md border border-slate-200" />
      )}
      {q.options.length > 0 && (
        <ul className="grid gap-1 sm:grid-cols-2">
          {q.options.map((o, i) => (
            <li key={i} className={cn('rounded-md border px-2.5 py-1.5 text-sm', o.correct ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200')}>
              {o.correct && <Check className="mr-1 inline h-3.5 w-3.5 text-emerald-700" aria-label="correct answer" />}
              <Both t={o.text} />
            </li>
          ))}
        </ul>
      )}
      {q.lines.length > 0 && (
        <div>
          <p className="text-[12px] font-medium text-slate-600">{LINES_LABEL[q.kind] ?? 'Lines'}</p>
          <ol className="ml-5 list-decimal space-y-1 text-sm">
            {q.lines.map((l, i) => (
              <li key={i}>
                <Both t={l} />
              </li>
            ))}
          </ol>
        </div>
      )}
      {q.answer && q.options.length === 0 && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-sm">
          <span className="mr-1 text-[12px] font-medium text-emerald-800">Answer</span>
          <Both t={q.answer} />
        </p>
      )}
    </article>
  );
}

function cutText(cut: { keep_percent?: number; keep_count?: number } | null): string | null {
  if (!cut) return null;
  return cut.keep_percent ? `After this round the top ${cut.keep_percent}% go through.` : `After this round the top ${cut.keep_count} go through.`;
}

function Pack({ pack, show }: { pack: HarnessShowPack; show: HarnessShow }) {
  const swap = useSwapShowQuestion();
  const fresh = useNewShowPack();
  const approve = useApproveShowPack();
  // The confirmation belongs to the pack as it was read: if the pack changes underneath (someone else swapped a
  // question or asked for a new pack), the dialog closes instead of approving something nobody looked at.
  const seen = `${pack.id}@${pack.updatedAt}`;
  const [asked, setAsked] = useState<{ what: 'approve' | 'new'; seen: string } | null>(null);
  const confirm = asked && asked.seen === seen ? asked.what : null;
  const setConfirm = (what: 'approve' | 'new' | null) => setAsked(what ? { what, seen } : null);
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  // One change at a time: a swap sends the whole pack back to the checker.
  const changing = swap.isPending || fresh.isPending || approve.isPending;
  const ready = pack.status === 'ready' && !changing;
  const unsure = pack.counts.flagged + pack.counts.notChecked;

  const doSwap = (index: number) => {
    setSwappingIndex(index);
    swap.mutate(
      { id: pack.id, index },
      {
        onSuccess: () => toast.success('Swapped. The new question is being checked.'),
        onError: (e) => toast.error(errorMessage(e, 'Could not swap the question')),
        onSettled: () => setSwappingIndex(null),
      }
    );
  };
  const run = () => {
    const done = { onSettled: () => setConfirm(null) };
    if (confirm === 'approve')
      approve.mutate({ id: pack.id, seen: pack.updatedAt }, { ...done, onSuccess: () => toast.success('Approved and loaded for the show.'), onError: (e) => toast.error(errorMessage(e, 'Could not approve the pack')) });
    else fresh.mutate(pack.id, { ...done, onSuccess: () => toast.success('A new pack is being prepared.'), onError: (e) => toast.error(errorMessage(e, 'Could not start a new pack')) });
  };
  const busy = approve.isPending || fresh.isPending;

  return (
    <>
      {pack.status !== 'approved' && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setConfirm('approve')} disabled={!ready}>
            Approve and load for the show
          </Button>
          <Button variant="outline" onClick={() => setConfirm('new')} disabled={changing}>
            <RefreshCw className="mr-1 h-4 w-4" /> New pack
          </Button>
          {pack.status !== 'ready' && <span className="self-center text-[13px] text-slate-600">You can approve once every question has been checked.</span>}
        </div>
      )}

      {pack.rounds.map((r, ri) => (
        <Panel key={ri} as="section" className="divide-y divide-slate-100">
          <header className="px-4 py-2.5">
            <h3 className="text-sm font-semibold text-slate-950" lang="ka">
              {r.title || KIND_LABEL[r.kind] || r.kind}
            </h3>
            <p className="text-[12px] text-slate-600">
              {KIND_LABEL[r.kind] ?? r.kind} · {r.questions.length} question{r.questions.length === 1 ? '' : 's'}
              {cutText(r.cut) ? ` · ${cutText(r.cut)}` : ''}
            </p>
          </header>
          {r.questions.map((q) => (
            // index is the question's place in the whole show, so it is also its number on screen.
            <Question key={`${q.index}-${q.prompt?.ka ?? q.answer?.ka ?? ''}`} q={q} n={q.index + 1} canSwap={ready} swapping={swappingIndex === q.index} onSwap={() => doSwap(q.index)} />
          ))}
        </Panel>
      ))}

      <Dialog open={confirm !== null} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === 'approve' ? 'Approve this pack?' : 'Throw this pack away?'}</DialogTitle>
            <DialogDescription>
              {confirm === 'approve'
                ? `These ${pack.counts.total} questions are loaded for the show on ${showDay(show.eventDate)} and the hosts read them out. ${
                    unsure ? `${unsure} question${unsure === 1 ? ' is' : 's are'} flagged or not checked: read ${unsure === 1 ? 'it' : 'them'} first. ` : ''
                  }${show.loaded ? 'A pack is already stored for this show; this one replaces it.' : ''}`
                : 'The agents build a completely new pack and check it again. That takes a few minutes.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={run} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {confirm === 'approve' ? 'Approve and load' : 'Build a new pack'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The Monday show tab. */
export function Show({ show, paused }: { show: HarnessShow; paused: boolean }) {
  const s = showStatus(show, paused);
  return (
    <Section
      title="Monday show"
      description={`ორშაბათობა, episode ${show.episode} · ${showDay(show.eventDate)}, 22:00 Georgian time. The agents prepare and check the questions. You read them, swap what you don't like and approve: only then are they loaded for the hosts.`}
    >
      <div className="space-y-3">
        <div role="status" className={cn('rounded-lg border px-4 py-3 text-sm', TONE[s.tone])}>
          {s.text}
        </div>
        {show.pack ? <Pack pack={show.pack} show={show} /> : <EmptyState>{show.loaded ? 'Nothing to review here.' : 'The pack will appear here.'}</EmptyState>}
      </div>
    </Section>
  );
}
