'use client';

import { useHqClock } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HarnessOverview } from '@/types';
import { Panel, Section } from '../hq-ui';
import { georgianTime, seatState, windowLabel, type SeatState } from './plain';

// The subscriptions the agents run on, one card each: is it working, free or
// used up (and until when), and how much of its allowance is spent. So when
// the agents go quiet, the reason is on screen.

const TONE: Record<SeatState['kind'], string> = {
  working: 'bg-emerald-50 text-emerald-700',
  free: 'bg-slate-100 text-slate-700',
  'used-up': 'bg-amber-50 text-amber-800',
  login: 'bg-red-50 text-red-700',
  off: 'bg-slate-100 text-slate-500',
};
const PROVIDER: Record<string, string> = { claude: 'Claude', codex: 'Codex (ChatGPT)' };

export function Seats({ data }: { data: HarnessOverview }) {
  // Ticks every minute, so "used up until" clears on screen when the time comes.
  const now = useHqClock().getTime();
  const seats = data.accounts.filter((a) => !a.reservedForPeople);
  const usedUp = seats.filter((a) => seatState(a, now).kind === 'used-up').length;
  return (
    <Section
      title="Subscriptions"
      count={usedUp}
      countTone="attention"
      description="The agents use every subscription. When one is busy or used up, work moves to the next; a used-up one comes back by itself when its allowance resets."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {seats.map((a) => {
          const st = seatState(a, now);
          const windows = Object.entries(a.windows ?? {}).filter(([, w]) => !w.resets_at || Date.parse(w.resets_at) > now);
          return (
            <Panel key={a.id} as="article" className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">{a.label}</div>
                  <div className="text-[12px] text-slate-500">{PROVIDER[a.provider] ?? a.provider}</div>
                </div>
                <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', TONE[st.kind])}>{st.label}</span>
              </div>
              {st.kind === 'login' && <p className="text-[13px] text-red-700">Someone has to sign this subscription in again on the worker.</p>}
              {windows.map(([key, w]) => {
                const pct = typeof w.utilization === 'number' ? Math.round(w.utilization * 100) : null;
                return (
                  <div key={key} className="text-[12px] text-slate-600">
                    <div className="flex justify-between">
                      <span>{windowLabel(key)}</span>
                      <span className="tabular-nums">
                        {w.status === 'rejected' ? 'spent' : pct !== null ? `${pct}% used` : ''}
                        {w.resets_at ? ` · resets ${georgianTime(w.resets_at)}` : ''}
                      </span>
                    </div>
                    {pct !== null && (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className={cn('h-full', pct >= a.softPct ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
              <p className="text-[12px] tabular-nums text-slate-500">{a.runsToday ?? 0} runs today</p>
            </Panel>
          );
        })}
      </div>
    </Section>
  );
}
