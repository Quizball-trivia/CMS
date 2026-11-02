'use client';

import { useState } from 'react';
import { Area, AreaChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Loader2, Plug } from 'lucide-react';
import { useHqAnalytics, useHqPosthog } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  countryFlag,
  countryName,
  countryShares,
  formatPct,
  latestD7,
  modeKeys,
  modeLabel,
  retentionCellClass,
  retentionPct,
  topModesWithOther,
} from '@/lib/hq-standup';
import type { HqAnalytics, HqPosthog } from '@/types';
import { LoadErrorState, PageHeader, RefreshErrorBanner } from '../hq-ui';

const PERIODS = [7, 30, 90] as const;
const MODE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2', '#94a3b8'];

const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
const n = (v: number) => Math.round(v).toLocaleString('en-US');

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const { data, isLoading, error, refetch, isFetching } = useHqAnalytics(days);

  return (
    <div className="mx-auto max-w-7xl space-y-10 pb-16">
      <PageHeader
        icon="📊"
        title={<span className="text-4xl">Analytics</span>}
        description="How many players we have, where they come from, what they play, and whether they come back."
        actions={
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-xs" role="radiogroup" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={days === p}
                onClick={() => setDays(p)}
                className={cn('rounded-full px-5 py-2 text-sm font-bold transition', days === p ? 'bg-slate-950 text-white' : 'text-slate-500 hover:text-slate-900')}
              >
                {p} days
              </button>
            ))}
          </div>
        }
      />

      {isLoading && !data ? (
        <div className="flex items-center gap-2 text-lg text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Crunching the numbers…
        </div>
      ) : !data ? (
        <LoadErrorState error={error} fallback="Could not load analytics." onRetry={() => void refetch()} />
      ) : (
        <div className={cn('space-y-10 transition-opacity', isFetching && 'opacity-70')}>
          {error && <RefreshErrorBanner />}
          <div className="grid gap-6 lg:grid-cols-2">
            <GrowthCard data={data} />
            <ActivityCard data={data} />
          </div>
          <RetentionCard data={data} />
          <div className="grid gap-6 lg:grid-cols-2">
            <CountriesCard data={data} />
            <ModesCard data={data} />
          </div>
          <PosthogSection days={days} />
        </div>
      )}
    </div>
  );
}

// ── Building blocks ──

function Card({ title, emoji, children, className }: { title: string; emoji: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl border border-slate-200 bg-white p-7 shadow-xs', className)}>
      <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-slate-900">
        <span aria-hidden>{emoji}</span> {title}
      </h2>
      {children}
    </section>
  );
}

function BigNumber({ value, label, tone = 'text-slate-900' }: { value: string; label: string; tone?: string }) {
  return (
    <div>
      <div className={cn('text-5xl font-extrabold tracking-tight', tone)}>{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-500">{label}</div>
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: '#94a3b8' } } as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ stroke: '#cbd5e1' }}
      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
      labelFormatter={(label) => (typeof label === 'string' ? shortDate(label) : String(label))}
    />
  );
}

// ── Growth ──

function GrowthCard({ data }: { data: HqAnalytics }) {
  const newInPeriod = data.series.reduce((sum, d) => sum + d.newUsers, 0);
  return (
    <Card title="Growth" emoji="🌱">
      <div className="flex flex-wrap gap-10">
        <BigNumber value={n(newInPeriod)} label={`new players in ${data.days} days`} tone="text-blue-700" />
        <BigNumber value={n(data.totals.registeredUsers)} label="registered players in total" />
      </div>
      <div className="mt-6 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
            <YAxis width={36} allowDecimals={false} {...axisProps} />
            <ChartTooltip />
            <Area type="monotone" dataKey="newUsers" name="New players" stroke="#2563eb" strokeWidth={2.5} fill="url(#growth-fill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ── Activity ──

function ActivityCard({ data }: { data: HqAnalytics }) {
  return (
    <Card title="Activity" emoji="⚡">
      <div className="grid grid-cols-3 gap-4">
        <BigNumber value={n(data.actives.dau)} label="today (DAU)" tone="text-emerald-700" />
        <BigNumber value={n(data.actives.wau)} label="this week (WAU)" />
        <BigNumber value={n(data.actives.mau)} label="this month (MAU)" />
      </div>
      <div className="mt-6 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
            <YAxis width={36} allowDecimals={false} {...axisProps} />
            <ChartTooltip />
            <Line type="monotone" dataKey="activePlayers" name="Active players" stroke="#059669" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="matches" name="Matches" stroke="#cbd5e1" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Green: players who played that day · grey: games played. Counts every game mode, guests included — so it’s higher than the 1v1-match numbers on the Standup.
      </p>
    </Card>
  );
}

// ── Retention ──

function RetentionCard({ data }: { data: HqAnalytics }) {
  const d7 = latestD7(data.retention);
  const rows = [...data.retention].sort((a, b) => b.cohortStart.localeCompare(a.cohortStart));
  return (
    <Card title="Do players come back?" emoji="🔁">
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="flex flex-col justify-center">
          <div className="text-6xl font-extrabold tracking-tight text-emerald-700">{d7 ? `${Math.round(d7.pct)}%` : '—'}</div>
          <div className="mt-2 text-base font-semibold text-slate-700">come back in their second week</div>
          <div className="mt-1 text-sm text-slate-400">
            {d7 ? `Day-7 retention, players who joined the week of ${shortDate(d7.cohortStart)}` : 'Not enough data yet'}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="self-center text-slate-400">Cohorts appear once players have signed up for a few weeks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-2 py-1 font-semibold">Joined week of</th>
                  <th className="px-2 py-1 text-right font-semibold">Players</th>
                  <th className="px-2 py-1 text-center font-semibold">Next day</th>
                  <th className="px-2 py-1 text-center font-semibold">Week 2</th>
                  <th className="px-2 py-1 text-center font-semibold">Month 2</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.cohortStart}>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{shortDate(r.cohortStart)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{n(r.size)}</td>
                    {[r.d1, r.d7, r.d30].map((v, i) => {
                      const pct = retentionPct(v);
                      return (
                        <td key={i} className={cn('rounded-lg px-2 py-1.5 text-center font-bold', retentionCellClass(pct))}>
                          {pct === null ? '·' : `${Math.round(pct)}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">Share of each week’s new players who played again the next day, in their second week, and in their second month. “·” = not enough time has passed.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Countries ──

function CountriesCard({ data }: { data: HqAnalytics }) {
  const rows = countryShares(data.countries, 15, data.countriesTotalPlayers);
  const ofTopOnly = rows[0]?.basis === 'top';
  const max = Math.max(1, ...rows.map((r) => r.players));
  return (
    <Card title="Where players are" emoji="🌍">
      {rows.length === 0 ? (
        <p className="text-slate-400">No country data for this period.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.country} className="grid grid-cols-[2rem_8rem_minmax(0,1fr)_4rem] items-center gap-3">
              <span className="text-2xl leading-none" aria-hidden>
                {r.flag}
              </span>
              <span className="truncate text-sm font-semibold text-slate-800">{r.name}</span>
              <span className="h-3 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-blue-500" style={{ width: `${(r.players / max) * 100}%` }} />
              </span>
              <span className="text-right text-sm text-slate-500">
                <span className="font-bold text-slate-800">{formatPct(r.share)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-slate-400">
        {ofTopOnly
          ? `Share of players active in the last ${data.days} days, of top countries.`
          : `Share of all players active in the last ${data.days} days.`}
      </p>
    </Card>
  );
}

// ── Game modes ──

function ModesCard({ data }: { data: HqAnalytics }) {
  const top = topModesWithOther(data.modes, data.modeLabels);
  const keys = modeKeys(data.modesByDay);
  const total = data.modes.reduce((sum, m) => sum + m.matches, 0);
  return (
    <Card title="What people play" emoji="🎮">
      {top.length === 0 ? (
        <p className="text-slate-400">No matches in this period.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative h-44 w-44 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={top} dataKey="matches" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                    {top.map((m, i) => (
                      <Cell key={m.mode} fill={MODE_COLORS[i % MODE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                <div>
                  <div className="text-2xl font-extrabold text-slate-900">{n(total)}</div>
                  <div className="text-xs text-slate-400">matches</div>
                </div>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {top.map((m, i) => (
                <li key={m.mode} className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: MODE_COLORS[i % MODE_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{m.label}</span>
                  <span className="font-bold text-slate-900">{formatPct(m.share)}</span>
                </li>
              ))}
            </ul>
          </div>
          {keys.length > 0 && data.modesByDay.length > 1 && (
            <div className="mt-6 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.modesByDay} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
                  <YAxis width={36} allowDecimals={false} {...axisProps} />
                  <ChartTooltip />
                  {keys.map((k, i) => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      name={modeLabel(k, data.modeLabels)}
                      stackId="modes"
                      stroke="none"
                      fill={MODE_COLORS[i % MODE_COLORS.length]}
                      fillOpacity={0.85}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── PostHog ──

function PosthogSection({ days }: { days: number }) {
  const { data, isLoading, error, refetch } = useHqPosthog(days);
  if (isLoading && !data) {
    return (
      <Card title="Website (PostHog)" emoji="🦔">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading website stats…
        </div>
      </Card>
    );
  }
  if (!data) return <LoadErrorState error={error} fallback="Could not load website stats." onRetry={() => void refetch()} />;
  if (!data.connected) return <ConnectPosthog />;
  if (data.error !== undefined) {
    // Configured, but PostHog failed this time (the backend caches for 10 min).
    return (
      <Card title="Website (PostHog)" emoji="🦔">
        <p className="text-base text-slate-600">PostHog didn’t answer this time — website numbers will be back shortly.</p>
        <button type="button" onClick={() => void refetch()} className="mt-3 text-sm font-semibold text-slate-700 underline">
          Try again
        </button>
      </Card>
    );
  }
  return <PosthogStats data={data} />;
}

function ConnectPosthog() {
  return (
    <section className="flex flex-wrap items-center gap-6 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-orange-50 text-3xl">🦔</span>
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          <Plug className="h-5 w-5" /> Connect PostHog
        </h2>
        <p className="mt-1 text-base text-slate-600">
          See website visitors, where they come from, and how many become players. Ask an engineer to set these on the backend:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 font-mono text-sm">
          {['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_API_HOST'].map((v) => (
            <li key={v} className="rounded-lg bg-slate-100 px-3 py-1 text-slate-700">
              {v}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">The host is optional (defaults to the EU cloud). The key stays on the server and is never shown here.</p>
      </div>
    </section>
  );
}

type PosthogConnected = Extract<HqPosthog, { connected: true; error?: undefined }>;

function PosthogStats({ data }: { data: PosthogConnected }) {
  const visitors = data.visitorsByDay;
  const totalVisitors = visitors.reduce((sum, d) => sum + d.visitors, 0);
  const funnel = data.funnel;
  const steps = funnelSteps(funnel);
  const top = steps[0]?.[1] ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">🦔 Website</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Visitors" emoji="👀">
          <BigNumber value={n(totalVisitors)} label="visitor-days in this period" tone="text-orange-600" />
          {visitors.length > 0 && (
            <div className="mt-6 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visitors} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
                  <YAxis width={40} allowDecimals={false} {...axisProps} />
                  <ChartTooltip />
                  <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="none" fill="#fed7aa" />
                  <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#ea580c" strokeWidth={2.5} fill="#fdba74" fillOpacity={0.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="From visitor to player" emoji="🪜">
          {steps.length === 0 ? (
            <p className="text-slate-400">No funnel data yet.</p>
          ) : (
            <ol className="space-y-4">
              {steps.map(([label, value], i) => (
                <li key={label}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-base font-semibold text-slate-800">{label}</span>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {n(value)}
                      {i > 0 && top > 0 && <span className="ml-2 text-sm font-medium text-slate-400">{formatPct(value / top, 1)}</span>}
                    </span>
                  </div>
                  <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${top > 0 ? (value / top) * 100 : 0}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <TopList
          title="Countries"
          emoji="🌍"
          rows={data.topCountries.map((c) => ({ key: c.country, label: `${countryFlag(c.country)} ${countryName(c.country)}`, value: c.visitors }))}
        />
        <TopList title="Where they come from" emoji="🔗" rows={data.topReferrers.map((r) => ({ key: r.source, label: r.source || 'Direct', value: r.visitors }))} />
        <TopList title="Top pages" emoji="📄" rows={data.topPages.map((p) => ({ key: p.path, label: p.path, value: p.views }))} />
      </div>
    </div>
  );
}

/** Funnel steps that exist (a step whose event isn't tracked is left out). */
function funnelSteps(funnel: { visitors: number; signups?: number; firstMatch?: number } | undefined): Array<[string, number]> {
  if (!funnel) return [];
  const all: Array<[string, number | undefined]> = [
    ['👀 Visited', funnel.visitors],
    ['📝 Signed up', funnel.signups],
    ['⚽ Played a match', funnel.firstMatch],
  ];
  return all.filter((step): step is [string, number] => typeof step[1] === 'number');
}

function TopList({ title, emoji, rows }: { title: string; emoji: string; rows: Array<{ key: string; label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card title={title} emoji={emoji}>
      {rows.length === 0 ? (
        <p className="text-slate-400">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 8).map((r) => (
            <li key={r.key} className="relative overflow-hidden rounded-lg px-3 py-1.5">
              <span className="absolute inset-y-0 left-0 bg-orange-50" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
              <span className="relative flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-800">{r.label}</span>
                <span className="font-bold text-slate-900">{n(r.value)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
