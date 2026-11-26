'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { HarnessRunwayRow } from '@/types';
import { EmptyState, Panel, Section } from '../hq-ui';

// Runway: how many days of content each daily game has left, shortest first.
// A game stops at its last stored day or at the fixed end in its code,
// whichever comes first, so both are shown.

const URGENT = 14;
const SOON = 30;

function tone(days: number): { bar: string; chip: string; label: string } {
  if (days < URGENT) return { bar: 'bg-red-500', chip: 'bg-red-50 text-red-700', label: 'Running out' };
  if (days < SOON) return { bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800', label: 'Getting short' };
  return { bar: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700', label: 'Healthy' };
}

function needs(r: HarnessRunwayRow): string {
  if (r.storedThrough === null) return 'No days stored';
  if (r.limitedBy === 'content') return 'Needs more days';
  if (r.limitedBy === 'calendar') return 'Days are ready; its fixed end date must be lifted';
  return 'Needs more days and its fixed end date lifted';
}

export function Runway({ rows }: { rows: HarnessRunwayRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const urgent = rows.filter((r) => r.daysLeft < SOON);
  const shown = showAll ? rows : urgent.length ? urgent : rows.slice(0, 4);
  return (
    <Section
      title="Runway"
      count={rows.filter((r) => r.daysLeft < URGENT).length}
      countTone="attention"
      description="Days of content each daily game has left. Under 14 days is urgent."
      actions={
        rows.length > shown.length || showAll ? (
          <button type="button" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show only the short ones' : `Show all ${rows.length}`}
          </button>
        ) : undefined
      }
    >
      <Panel className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <EmptyState className="px-4 py-3">No daily games found.</EmptyState>
        ) : (
          shown.map((r) => {
            const t = tone(r.daysLeft);
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <div className="w-40 shrink-0 font-medium text-slate-900">{r.label}</div>
                <div className="w-20 shrink-0 tabular-nums">
                  <span className="text-lg font-semibold text-slate-950">{r.daysLeft}</span> <span className="text-slate-600">days</span>
                </div>
                <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <div className={cn('h-full', t.bar)} style={{ width: `${Math.min(100, (r.daysLeft / 90) * 100)}%` }} />
                </div>
                <div className="w-full text-[12px] text-slate-600 sm:w-auto sm:min-w-[260px]">
                  {r.endsOn ? <>Last day {r.endsOn} · </> : null}
                  {needs(r)}
                </div>
                <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', t.chip)}>{t.label}</span>
              </div>
            );
          })
        )}
      </Panel>
    </Section>
  );
}
