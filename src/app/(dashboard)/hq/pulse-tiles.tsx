'use client';

import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { Star } from 'lucide-react';
import { useHqPulse } from '@/hooks';
import { cn } from '@/lib/utils';
import { kpiDelta, type KpiDelta } from '@/lib/hq-pulse';
import type { HqPulse } from '@/types';
import { LoadErrorState } from './hq-ui';

// ── Company pulse ──

export function PulseTiles() {
  const { data: pulse, error, isLoading, refetch } = useHqPulse();
  return (
    <section>
      <SectionHeader title="Company pulse" subtitle="Today so far, compared with yesterday and the 7-day average." />
      {!pulse ? (
        isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-52 animate-pulse rounded-3xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <LoadErrorState error={error} fallback="Could not load the company numbers." onRetry={() => void refetch()} />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="New players" metric="newUsers" pulse={pulse} color="#2563eb" />
          <KpiCard label="Matches" metric="matches" pulse={pulse} color="#7c3aed" />
          <KpiCard label="Active players" metric="activePlayers" pulse={pulse} color="#059669" />
          <RatingCard pulse={pulse} />
        </div>
      )}
    </section>
  );
}

function KpiCard({
  label,
  metric,
  pulse,
  color,
}: {
  label: string;
  metric: 'newUsers' | 'matches' | 'activePlayers';
  pulse: HqPulse;
  color: string;
}) {
  const today = pulse.today[metric];
  const vsYesterday = kpiDelta(today, pulse.yesterday[metric]);
  const vsAvg = kpiDelta(today, pulse.avg7d[metric]);
  const series = pulse.series.map((p) => ({ date: p.date, value: p[metric] }));
  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="text-base font-semibold text-slate-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tracking-tight text-slate-900">{today.toLocaleString()}</span>
        <span className="text-xs text-slate-400">today</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <DeltaText delta={vsYesterday} suffix="vs yesterday" />
        <DeltaText delta={vsAvg} suffix="vs 7-day avg" />
      </div>
      <div className="mt-4 h-16" aria-label={`${label}, last ${series.length} days`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`spark-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={[0, 'dataMax']} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#spark-${metric})`} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-[10px] text-slate-400">Last {series.length} days</div>
    </div>
  );
}

function RatingCard({ pulse }: { pulse: HqPulse }) {
  const f = pulse.feedback;
  const avg = f.avgRating7d;
  const prev = f.avgRatingPrev7d;
  const diff = avg !== null && prev !== null ? Math.round((avg - prev) * 10) / 10 : null;
  return (
    <div className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="text-base font-semibold text-slate-500">Player rating</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tracking-tight text-slate-900">{avg !== null ? avg.toFixed(1) : '—'}</span>
        <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
        <span className="text-xs text-slate-400">last 7 days</span>
      </div>
      <div className="mt-1 text-xs">
        {diff === null ? (
          <span className="text-slate-400">No earlier ratings to compare</span>
        ) : (
          <span className={cn(diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-500')}>
            {diff > 0 ? '↑' : diff < 0 ? '↓' : ''} {diff === 0 ? 'Same as' : `${Math.abs(diff).toFixed(1)} vs`} the week before
          </span>
        )}
      </div>
      <div className="mt-auto space-y-1.5 pt-3 text-xs">
        <div className="flex justify-between text-slate-500">
          <span>Ratings</span>
          <span className="font-semibold text-slate-800">
            {f.count7d} <span className="font-normal text-slate-400">(prev {f.countPrev7d})</span>
          </span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>Low ratings (1–2★)</span>
          <span className={cn('font-semibold', f.lowRatings7d > 0 ? 'text-red-600' : 'text-slate-800')}>{f.lowRatings7d}</span>
        </div>
      </div>
    </div>
  );
}

function DeltaText({ delta, suffix }: { delta: KpiDelta; suffix: string }) {
  const color = delta.direction === 'up' ? 'text-emerald-600' : delta.direction === 'down' ? 'text-red-600' : 'text-slate-400';
  return (
    <span className="whitespace-nowrap">
      <span className={cn('font-semibold', color)}>{delta.label}</span> <span className="text-slate-400">{suffix}</span>
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-base text-slate-500">{subtitle}</p>}
    </div>
  );
}
