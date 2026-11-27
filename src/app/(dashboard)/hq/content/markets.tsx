'use client';

import { Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HarnessMarket } from '@/types';

// Markets: who a piece of content is made for. The whole Content page can be
// narrowed to one market ("Working on"). This steers the work in HQ only: the
// game does not filter by country yet, so players everywhere still see
// everything. The page says so wherever a market is picked.

export const MARKETS: Array<{ key: HarnessMarket; name: string; short: string }> = [
  { key: 'all', name: 'All markets', short: 'Everyone' },
  { key: 'ge', name: 'Georgia', short: 'Georgia' },
  { key: 'tr', name: 'Turkey', short: 'Turkey' },
  { key: 'ar', name: 'Argentina', short: 'Argentina' },
  { key: 'uk', name: 'UK', short: 'UK' },
  { key: 'es', name: 'Spain', short: 'Spain' },
];

export const isMarket = (v: string | null | undefined): v is HarnessMarket => MARKETS.some((m) => m.key === v);
export const marketName = (m: HarnessMarket | undefined) => MARKETS.find((x) => x.key === (m ?? 'all'))?.name ?? 'All markets';

/** What the page is narrowed to: a market, and whether content made for everyone shows beside it. */
export interface MarketScope {
  market: HarnessMarket;
  withEveryone: boolean;
}

/** Pure: whether something made for `made` shows under the scope. No market picked shows everything. */
export function inScope(scope: MarketScope, made: HarnessMarket | undefined): boolean {
  const m = made ?? 'all';
  if (scope.market === 'all') return true;
  return m === scope.market || (scope.withEveryone && m === 'all');
}

/** Who something is made for: a market in its colour, or a quiet "Everyone". */
export function MarketChip({ market, className }: { market: HarnessMarket | undefined; className?: string }) {
  const m = market ?? 'all';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        m === 'all' ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200',
        className
      )}
    >
      {m === 'all' ? 'Everyone' : `For ${marketName(m)}`}
    </span>
  );
}

export function MarketSwitcher({ scope, onChange, counts }: { scope: MarketScope; onChange: (next: MarketScope) => void; counts?: Partial<Record<HarnessMarket, number>> }) {
  return (
    <div className="hq-card flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2.5">
      <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        <Globe2 className="h-3.5 w-3.5" aria-hidden /> Working on
      </span>
      <div role="group" aria-label="Market" className="flex flex-wrap gap-1">
        {MARKETS.map((m) => {
          const on = scope.market === m.key;
          // Under "All markets": every idea waiting, whoever it is for.
          const n = m.key === 'all' ? Object.values(counts ?? {}).reduce((sum, x) => sum + (x ?? 0), 0) : (counts?.[m.key] ?? 0);
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ ...scope, market: m.key })}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors',
                on
                  ? m.key === 'all'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                    : 'border-orange-500 bg-orange-50 text-orange-900'
                  : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              {m.name}
              {n > 0 && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800" title={`${n} idea${n === 1 ? '' : 's'} waiting`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {scope.market !== 'all' && (
        <label className="ml-auto inline-flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={scope.withEveryone} onChange={(e) => onChange({ ...scope, withEveryone: e.target.checked })} />
          Also show what is for everyone
        </label>
      )}
    </div>
  );
}

/** The truth about markets, shown whenever one is picked. */
export function MarketNote({ market }: { market: HarnessMarket }) {
  if (market === 'all') return null;
  return (
    <p className="text-[13px] text-slate-600">
      You are looking at what is made for <b className="text-slate-900">{marketName(market)}</b>. Players everywhere still see it: the game cannot show content to one country only yet.
    </p>
  );
}
