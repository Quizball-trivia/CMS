'use client';

import { useEffect, useRef, useState } from 'react';
import { Languages, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services';
import { agentKeys } from '@/hooks';

const RUN_KEY = 'qb-agent-translate-run'; // {total:number, ts:number} written by the dialog on start

// Slim always-visible progress strip for the background translation run.
// Lives on the Review page (not in the modal) — the run is server-side, so the
// editor can navigate freely and still see how far along it is.
export function TranslationProgressStrip() {
  const queryClient = useQueryClient();
  const [run, setRun] = useState<{ total: number; ts: number } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const prevRemaining = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(RUN_KEY);
        setRun(raw ? JSON.parse(raw) : null);
      } catch {
        setRun(null);
      }
    };
    read();
    // the dialog writes the key on start — storage events cover other tabs,
    // the interval covers this tab
    const iv = setInterval(read, 2000);
    window.addEventListener('storage', read);
    return () => {
      clearInterval(iv);
      window.removeEventListener('storage', read);
    };
  }, []);

  // Poll ALWAYS (not only with a localStorage run): a run started elsewhere —
  // another tab, another admin, an API call — is auto-detected when the
  // remaining count drops meaningfully from its max, and the strip appears.
  const maxSeen = useRef<number | null>(null);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const c = await questionsService.translateStatus('agents');
        if (stopped) return;
        setRemaining(c.questions);
        maxSeen.current = Math.max(maxSeen.current ?? c.questions, c.questions);
        const droppedFromMax = (maxSeen.current ?? 0) - c.questions;
        if (!run && c.questions > 0 && droppedFromMax >= 10) {
          // a background run is in progress — synthesize a run record so the
          // strip shows (total = the max we've observed this session)
          const detected = { total: maxSeen.current!, ts: Date.now() };
          try {
            localStorage.setItem(RUN_KEY, JSON.stringify(detected));
          } catch { /* private mode */ }
          setRun(detected);
        }
        if (prevRemaining.current != null && c.questions < prevRemaining.current) {
          // progress observed → refresh the review cards so ka fills in live
          queryClient.invalidateQueries({ queryKey: agentKeys.review() });
        }
        prevRemaining.current = c.questions;
        if (run && c.questions === 0) {
          setFinished(true);
          localStorage.removeItem(RUN_KEY);
          setTimeout(() => {
            setFinished(false);
            setRun(null);
          }, 10_000);
        }
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    const iv = setInterval(tick, 8000);
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, [run, queryClient]);

  if (!run && !finished) return null;

  if (finished) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
        <Check className="h-4 w-4" /> Georgian translation finished.
      </div>
    );
  }

  const total = run!.total;
  const done = remaining == null ? 0 : Math.max(0, total - remaining);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3 text-sm text-blue-800">
        <span className="flex items-center gap-2">
          <Languages className="h-4 w-4 animate-pulse" />
          Translating to Georgian — runs in the background, safe to navigate away
        </span>
        <span className="font-mono text-xs tabular-nums">
          {done.toLocaleString()}/{total.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
        <div className="h-full rounded-full bg-blue-500 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
