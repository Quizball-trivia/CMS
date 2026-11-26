'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApplyHarnessAsk, useCreateHarnessAsk, useDismissHarnessAsk } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { cn } from '@/lib/utils';
import type { HarnessAsk } from '@/types';
import { errorMessage, Panel } from '../hq-ui';

// Ask HQ: the team writes in plain words; the HQ Assistant answers with
// proposals made of the tab's own controls. Nothing changes until a person
// ticks the proposals and applies them.

const EXAMPLES = ['Focus on Spanish clubs this week', 'El Clásico is on Dec 14, prepare questions', 'Fewer transfer-fee questions everywhere'];

function AskAnswer({ ask }: { ask: HarnessAsk }) {
  const valid = ask.actions.map((a, i) => (a.valid ? i : -1)).filter((i) => i >= 0);
  const [picked, setPicked] = useState<Set<number>>(() => new Set(valid));
  const apply = useApplyHarnessAsk();
  const dismiss = useDismissHarnessAsk();
  const appliedOk = new Set(ask.applied.filter((r) => r.ok).map((r) => r.index));
  const appliedErr = new Map(ask.applied.filter((r) => !r.ok).map((r) => [r.index, r.error ?? 'failed']));
  const open = ask.status === 'answered';
  const toggle = (i: number) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-slate-900">
          {ask.askedBy ?? 'Someone'}: <span className="font-normal text-slate-800">{ask.message}</span>
        </span>
        <span className="shrink-0 text-[12px] text-slate-500">{formatRelative(ask.createdAt)}</span>
      </div>

      {ask.status === 'thinking' && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> The HQ Assistant is thinking…
        </div>
      )}
      {ask.status === 'failed' && <div className="text-sm text-red-700">The HQ Assistant could not answer: {ask.error ?? 'unknown error'}. Try again.</div>}

      {ask.reply && (
        <div className="flex gap-2 rounded-md bg-violet-50 px-3 py-2 text-sm text-violet-950">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <span>{ask.reply}</span>
        </div>
      )}

      {ask.actions.length > 0 && (
        <ul className="space-y-1">
          {ask.actions.map((a, i) => (
            <li key={i} className={cn('flex items-start gap-2 text-sm', !a.valid && 'text-slate-400 line-through')}>
              {open && a.valid ? (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={picked.has(i)}
                  onChange={() => toggle(i)}
                  aria-label={a.summary}
                />
              ) : appliedOk.has(i) ? (
                <Check className="mt-0.5 h-4 w-4 text-emerald-600" aria-label="applied" />
              ) : (
                <span className="mt-0.5 h-4 w-4" />
              )}
              <span className="text-slate-800">
                {a.summary}
                {appliedErr.has(i) && <span className="ml-1 text-red-700">({appliedErr.get(i)})</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="flex flex-wrap gap-2 pt-1">
          {valid.length > 0 && (
            <Button
              size="sm"
              disabled={picked.size === 0 || apply.isPending}
              onClick={() =>
                apply.mutate(
                  { id: ask.id, indexes: [...picked] },
                  {
                    onSuccess: (r) => {
                      const bad = r.results.filter((x) => !x.ok).length;
                      if (bad) toast.error(`${r.results.length - bad} applied, ${bad} could not be applied`);
                      else toast.success('Applied: the agents use it from their next batch');
                    },
                    onError: (e) => toast.error(errorMessage(e, 'Could not apply')),
                  }
                )
              }
            >
              {apply.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              Apply {picked.size === valid.length ? 'all' : `${picked.size} selected`}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(ask.id, { onError: (e) => toast.error(errorMessage(e, 'Could not dismiss')) })}>
            <X className="mr-1.5 h-4 w-4" /> {valid.length ? 'Dismiss' : 'OK'}
          </Button>
        </div>
      )}
      {ask.status === 'applied' && <div className="text-[12px] text-slate-500">Applied by {ask.appliedBy ?? 'the team'}.</div>}
    </div>
  );
}

export function AskHq({ asks, paused }: { asks: HarnessAsk[]; paused: boolean }) {
  const [message, setMessage] = useState('');
  const create = useCreateHarnessAsk();
  // Only the conversation that still matters stays open: answered, thinking, or from the last day.
  const [showOld, setShowOld] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const fresh = asks.filter((a) => a.status === 'answered' || a.status === 'thinking' || (a.createdAt && now - Date.parse(a.createdAt) < 86_400_000));
  const shown = showOld ? asks : fresh;
  const send = () => {
    const m = message.trim();
    // One message at a time: the keyboard shortcut must not resend while one is on its way.
    if (m.length < 2 || create.isPending) return;
    create.mutate(m, {
      // Clear only what was sent: a draft typed meanwhile stays.
      onSuccess: () => setMessage((cur) => (cur.trim() === m ? '' : cur)),
      onError: (e) => toast.error(errorMessage(e, 'Could not send')),
    });
  };

  return (
    <Panel className="divide-y divide-slate-100">
      <div className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <span className="text-[15px] font-semibold text-slate-950">Ask HQ</span>
          <span className="text-sm text-slate-600">Tell the agents what you want in your own words. You see what will change before anything does.</span>
        </div>
        <div className="flex gap-2">
          <Textarea
            rows={2}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder={EXAMPLES[0]}
            aria-label="Ask HQ"
            className="min-h-[60px]"
          />
          <Button className="self-end" disabled={message.trim().length < 2 || create.isPending} onClick={send} aria-label="Send">
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setMessage(ex)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] text-slate-700 hover:bg-slate-200">
              {ex}
            </button>
          ))}
        </div>
        {paused && <div className="text-[12px] text-amber-700">Agents are paused: questions wait until they are switched on.</div>}
      </div>
      {shown.map((a) => (
        // Remounts when the answer arrives, so its proposals start ticked.
        <AskAnswer key={`${a.id}-${a.status}`} ask={a} />
      ))}
      {asks.length > fresh.length && (
        <button type="button" className="w-full px-4 py-2 text-left text-sm font-medium text-slate-600 hover:underline" onClick={() => setShowOld((v) => !v)}>
          {showOld ? 'Hide older' : `Show ${asks.length - fresh.length} older`}
        </button>
      )}
    </Panel>
  );
}
