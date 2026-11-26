'use client';

import { useState } from 'react';
import { Check, Flag, Loader2, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useHarnessItemAction } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { cn } from '@/lib/utils';
import type { HarnessItemAction, HarnessLiveItem, HarnessNeedsYouItem, HarnessQuestion } from '@/types';
import { EmptyState, errorMessage, Panel, Section } from '../hq-ui';
import { LANGUAGES } from './plain';

// The questions the team looks at: the ones stuck after several tries (Needs
// you) and the newest ones in ranked (Just went live). Every button goes
// through the same compare-and-set step the agents use.

const DIFFICULTY_TONE: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-sky-50 text-sky-700',
  hard: 'bg-violet-50 text-violet-700',
};

function QuestionBody({ q, lang }: { q: HarnessQuestion; lang: string }) {
  const t = (m: Record<string, string>) => m[lang] || m.en || '';
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-medium text-slate-950">{t(q.prompt)}</p>
      <ul className="grid gap-1 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <li
            key={i}
            className={cn('rounded-md border px-2.5 py-1.5 text-sm', o.correct ? 'border-emerald-300 bg-emerald-50 font-medium text-emerald-900' : 'border-slate-200 text-slate-700')}
          >
            {o.correct && <Check className="mr-1 inline h-3.5 w-3.5" aria-label="correct answer" />}
            {t(o.text)}
          </li>
        ))}
      </ul>
      {t(q.explanation) && <p className="text-[13px] text-slate-600">{t(q.explanation)}</p>}
    </div>
  );
}

function LanguagePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          title={l.label}
          aria-pressed={value === l.code}
          onClick={() => onChange(l.code)}
          className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase', value === l.code ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
        >
          {l.code}
        </button>
      ))}
    </div>
  );
}

const NOTE_ACTIONS: Record<'flag' | 'send_back', { title: string; description: string; button: string; placeholder: string }> = {
  flag: {
    title: 'Take this question out of ranked',
    description: 'It leaves the game right away. Say what is wrong: the Question Maker learns from it for this category.',
    button: 'Take it out',
    placeholder: 'e.g. two answers are correct / the year is wrong / too easy to guess',
  },
  send_back: {
    title: 'Send back to the writer',
    description: 'The Question Maker rewrites it with your note, then it goes through all the checks again.',
    button: 'Send back',
    placeholder: 'e.g. make the wrong answers more believable',
  },
};

function NoteDialog({ action, onClose, onSubmit, pending }: { action: 'flag' | 'send_back' | null; onClose: () => void; onSubmit: (note: string) => void; pending: boolean }) {
  const [note, setNote] = useState('');
  const cfg = action ? NOTE_ACTIONS[action] : null;
  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {cfg && (
          <>
            <DialogHeader>
              <DialogTitle>{cfg.title}</DialogTitle>
              <DialogDescription>{cfg.description}</DialogDescription>
            </DialogHeader>
            <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={cfg.placeholder} maxLength={500} aria-label="What is wrong" />
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={note.trim().length < 3 || pending} onClick={() => onSubmit(note.trim())}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {cfg.button}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const DONE: Record<HarnessItemAction, string> = {
  approve: 'Approved: it goes into ranked',
  reject: 'Rejected',
  send_back: 'Sent back to the writer',
  flag: 'Taken out of ranked',
};

function useItemDecision() {
  const act = useHarnessItemAction();
  const run = (item: { id: string; version: number }, action: HarnessItemAction, note = '', after?: () => void) =>
    act.mutate(
      { itemId: item.id, version: item.version, action, note },
      {
        onSuccess: () => {
          toast.success(DONE[action]);
          after?.();
        },
        onError: (e) => toast.error(errorMessage(e, 'That did not work')),
      }
    );
  return { run, pending: act.isPending };
}

function Meta({ category, difficulty, when }: { category: string | null; difficulty: string; when: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
      <span className="font-medium text-slate-800">{category ?? 'No category'}</span>
      <span className={cn('rounded px-1.5 py-0.5 font-medium capitalize', DIFFICULTY_TONE[difficulty])}>{difficulty}</span>
      {when && <span>{formatRelative(when)}</span>}
    </div>
  );
}

export function NeedsYou({ items, total }: { items: HarnessNeedsYouItem[]; total: number }) {
  const [lang, setLang] = useState('en');
  const [noteFor, setNoteFor] = useState<{ item: HarnessNeedsYouItem; action: 'send_back' } | null>(null);
  const { run, pending } = useItemDecision();
  return (
    <Section
      title="Needs you"
      count={Math.max(total, items.length)}
      countTone="attention"
      description={`Questions the agents could not settle after several tries. Approve, send back with a note, or reject.${total > items.length ? ` Showing the newest ${items.length} of ${total}.` : ''}`}
      actions={items.length ? <LanguagePicker value={lang} onChange={setLang} /> : undefined}
    >
      {items.length === 0 ? (
        <Panel>
          <EmptyState className="px-4 py-3">Nothing needs you right now.</EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((it) => (
            <Panel key={it.id} className="space-y-3 p-4">
              <Meta category={it.category} difficulty={it.difficulty} when={it.updatedAt} />
              <QuestionBody q={it.question} lang={lang} />
              {it.issues.length > 0 && (
                <ul className="space-y-1 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  {it.issues.map((i, n) => (
                    <li key={n}>• {i}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pending} onClick={() => run(it, 'approve')}>
                  <Check className="mr-1.5 h-4 w-4" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setNoteFor({ item: it, action: 'send_back' })}>
                  <RotateCcw className="mr-1.5 h-4 w-4" /> Send back
                </Button>
                <Button size="sm" variant="ghost" className="text-red-700 hover:text-red-800" disabled={pending} onClick={() => run(it, 'reject', 'rejected by the team')}>
                  <X className="mr-1.5 h-4 w-4" /> Reject
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <NoteDialog
        key={noteFor?.item.id ?? 'none'}
        action={noteFor?.action ?? null}
        pending={pending}
        onClose={() => setNoteFor(null)}
        onSubmit={(note) => noteFor && run(noteFor.item, 'send_back', note, () => setNoteFor(null))}
      />
    </Section>
  );
}

export function JustLive({ items }: { items: HarnessLiveItem[] }) {
  const [lang, setLang] = useState('en');
  const [flagging, setFlagging] = useState<HarnessLiveItem | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { run, pending } = useItemDecision();
  const shown = showAll ? items : items.slice(0, 6);
  return (
    <Section
      title="Just went live"
      count={items.length}
      description="The newest agent questions in ranked. Something off? Flag it: it leaves the game and the writer learns why."
      actions={items.length ? <LanguagePicker value={lang} onChange={setLang} /> : undefined}
    >
      {items.length === 0 ? (
        <Panel>
          <EmptyState className="px-4 py-3">No agent questions in ranked yet.</EmptyState>
        </Panel>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {shown.map((it) => (
              <Panel key={it.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Meta category={it.category} difficulty={it.difficulty} when={it.releasedAt} />
                  <Button size="sm" variant="ghost" className="h-7 text-slate-600 hover:text-red-700" onClick={() => setFlagging(it)} aria-label="Flag this question">
                    <Flag className="mr-1 h-3.5 w-3.5" /> Flag
                  </Button>
                </div>
                <QuestionBody q={it.question} lang={lang} />
              </Panel>
            ))}
          </div>
          {items.length > 6 && (
            <button type="button" className="mt-2 text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${items.length}`}
            </button>
          )}
        </>
      )}
      <NoteDialog
        key={flagging?.id ?? 'none'}
        action={flagging ? 'flag' : null}
        pending={pending}
        onClose={() => setFlagging(null)}
        onSubmit={(note) => flagging && run(flagging, 'flag', note, () => setFlagging(null))}
      />
    </Section>
  );
}
