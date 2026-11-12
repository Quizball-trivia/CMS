'use client';

import { useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronRight, Loader2, Plug } from 'lucide-react';
import { useHqAnalytics, useHqPosthog } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatTbilisi } from '@/lib/hq-board';
import {
  countryFlag,
  countryName,
  countryShares,
  formatPct,
  latestD7,
  retentionPct,
  topModesWithOther,
} from '@/lib/hq-standup';
import type { HqAnalytics, HqPosthog } from '@/types';
import { HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';

const PERIODS = [7, 30, 90] as const;
const TABS = [
  { key: 'players', label: 'Players' },
  { key: 'website', label: 'Website' },
] as const;
type AnalyticsTab = (typeof TABS)[number]['key'];
const RETENTION_ROWS_SHOWN = 8;
/** A cohort smaller than this is too small to read a percentage from. */
const SMALL_SAMPLE = 20;
/** Colours for the named game modes, in rank order. "Other" always gets OTHER_MODE_COLOR. */
const MODE_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#db2777', '#0891b2'];
const OTHER_MODE_COLOR = '#94a3b8';
const COUNTRIES_SHOWN = 6;

const shortDate = (ymd: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${ymd}T00:00:00Z`));
const n = (v: number) => Math.round(v).toLocaleString('en-US');

/** A share as a label: whole percent from 1%, one decimal below it, so small countries don't all read "0%". */
function shareLabel(share: number): string {
  if (share <= 0) return '0%';
  if (share < 0.001) return '<0.1%';
  return formatPct(share, share >= 0.01 ? 0 : 1);
}

export default function AnalyticsPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [tab, setTab] = useState<AnalyticsTab>('players');
  const { data, isLoading, error, refetch, isFetching } = useHqAnalytics(days);

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Analytics"
        description="How many players we have, where they come from, what they play, and whether they come back."
        actions={
          <>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="tablist" aria-label="Analytics view">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn('rounded px-3 py-1.5 text-sm font-medium transition', tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2" title="Sets the window for new players, the charts, countries, game modes and the website numbers. Active today, 7 days and 30 days, registered players and retention do not change.">
            <span id="trend-period-label" className={HQ_LABEL}>
              Trend period
            </span>
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5" role="radiogroup" aria-labelledby="trend-period-label">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={days === p}
                  onClick={() => setDays(p)}
                  className={cn('rounded px-3 py-1.5 text-sm font-medium tabular-nums transition', days === p ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}
                >
                  {p} days
                </button>
              ))}
            </div>
            </div>
          </>
        }
      />

      {tab === 'website' ? (
        <div role="tabpanel" aria-label="Website">
          <PosthogSection days={days} />
        </div>
      ) : isLoading && !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
        </div>
      ) : !data ? (
        <LoadErrorState error={error} fallback="Could not load analytics." onRetry={() => void refetch()} />
      ) : (
        <div role="tabpanel" aria-label="Players" className={cn('space-y-8 transition-opacity', isFetching && 'opacity-70')}>
          {error && <RefreshErrorBanner />}
          <SummaryStrip data={data} />
          <div className="grid gap-8 lg:grid-cols-2">
            <GrowthSection data={data} />
            <ActivitySection data={data} />
          </div>
          <RetentionSection data={data} />
          <div className="grid gap-8 lg:grid-cols-2">
            <CountriesSection data={data} />
            <ModesSection data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Building blocks ──

/** Like `Stat`, but the hint wraps and `detail` sits next to the number (e.g. the cohort size behind a percentage). */
function Metric({ label, value, detail, hint }: { label: string; value: string; detail?: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className={HQ_LABEL}>{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-950">{value}</span>
        {detail && <span className="text-sm font-medium tabular-nums text-slate-700">{detail}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[13px] leading-snug text-slate-600">{hint}</div>}
    </div>
  );
}

/** The long version of how a number is counted, folded away so the section stays short. */
function HowCounted({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900"
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition', open && 'rotate-90')} /> How this is counted
      </button>
      {open && <div className="mt-1.5 max-w-3xl space-y-1.5 text-[13px] leading-relaxed text-slate-600">{children}</div>}
    </div>
  );
}

const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: '#475569' } } as const;

function ChartTooltip() {
  return (
    <Tooltip
      cursor={{ stroke: '#cbd5e1' }}
      contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }}
      labelFormatter={(label) => (typeof label === 'string' ? shortDate(label) : String(label))}
    />
  );
}

// ── Summary ──

/** Week-2 retention as a label: "<1%" for a real but tiny share, so "0%" only ever means nobody came back. */
function retentionLabel(pct: number): string {
  if (pct <= 0) return '0%';
  if (pct < 1) return '<1%';
  return `${pct < 10 ? Math.round(pct * 10) / 10 : Math.round(pct)}%`;
}

/** The latest signup week with a Week-2 result, with how many of its players that is. */
function retentionHeadline(data: HqAnalytics) {
  const d7 = latestD7(data.retention);
  if (!d7) return null;
  const size = data.retention.find((r) => r.cohortStart === d7.cohortStart)?.size;
  return { ...d7, label: retentionLabel(d7.pct), size, back: size === undefined ? undefined : Math.round((d7.pct / 100) * size), approx: size !== undefined && size >= EXACT_COUNT_LIMIT };
}

/** The one KPI strip of the Players tab. Everything below it is trends and breakdowns. */
function SummaryStrip({ data }: { data: HqAnalytics }) {
  const newInPeriod = data.series.reduce((sum, d) => sum + d.newUsers, 0);
  const d7 = retentionHeadline(data);
  const small = d7?.size !== undefined && d7.size < SMALL_SAMPLE;
  return (
    <Section title="Summary" description={`QuizBall database · as of ${formatTbilisi(data.generatedAt)}, Tbilisi time. Only New players follows the trend period; the other figures use fixed windows.`}>
      <Panel className="grid grid-cols-2 gap-px overflow-hidden bg-slate-200 lg:grid-cols-3 2xl:grid-cols-6 [&>*]:bg-white">
        <Metric label="Active today" value={n(data.actives.dau)} hint="DAU · incl. guests, Tbilisi day" />
        <Metric label="Active 7 days" value={n(data.actives.wau)} hint="WAU · incl. guests and today" />
        <Metric label="Active 30 days" value={n(data.actives.mau)} hint="MAU · incl. guests and today" />
        <Metric label="New players" value={n(newInPeriod)} hint={`registered, last ${data.days} days`} />
        <Metric label="Registered players" value={n(data.totals.registeredUsers)} hint="all accounts, no guests" />
        <Metric
          label="Week-2 retention"
          value={d7 ? d7.label : '—'}
          detail={d7 && d7.back !== undefined && d7.size !== undefined ? `${d7.approx ? '≈' : ''}${d7.back} of ${n(d7.size)} players` : undefined}
          hint={
            d7 ? (
              <>
                {small && <span className="font-medium text-amber-700">Small sample. </span>}
                Played on days 7–13 after signup. Signup week of {shortDate(d7.cohortStart)}
              </>
            ) : (
              'not enough data yet'
            )
          }
        />
      </Panel>
    </Section>
  );
}

// ── Growth ──

function GrowthSection({ data }: { data: HqAnalytics }) {
  return (
    <Section title="Growth" description={`QuizBall database · new registered players per day, last ${data.days} days.`}>
      <Panel>
        <div className="h-48 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
              <YAxis width={36} allowDecimals={false} {...axisProps} />
              <ChartTooltip />
              <Bar dataKey="newUsers" name="New players" fill="#2563eb" radius={[2, 2, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5">
          <HowCounted>
            <p>New registered accounts per Tbilisi day. Guests, bots and deleted accounts are not counted.</p>
          </HowCounted>
        </div>
      </Panel>
    </Section>
  );
}

// ── Activity ──

function ActivitySection({ data }: { data: HqAnalytics }) {
  return (
    <Section title="Activity" description={`QuizBall database · players per day (green) and all games played (grey), last ${data.days} days.`}>
      <Panel>
        <div className="h-48 p-4 pb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
              <YAxis width={36} allowDecimals={false} {...axisProps} />
              <ChartTooltip />
              <Line type="monotone" dataKey="activePlayers" name="Active players" stroke="#059669" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="matches" name="All games played" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5">
          <HowCounted>
            <p>Active players are those who played at least one game in any mode, guests included. The Active today, 7 days and 30 days figures in the summary count the same way, and the 7 and 30 day windows include today (Tbilisi time).</p>
            <p>All games played counts every play surface and game mode, guests included, so it is higher than the Online matches on the Standup (ranked, friendly and auction only).</p>
          </HowCounted>
        </div>
      </Panel>
    </Section>
  );
}

// ── Retention ──

const RETENTION_COLUMNS = [
  { label: 'Next day', days: 'day 1' },
  { label: 'Week 2', days: 'days 7–13' },
  { label: 'Month 2', days: 'days 30–59' },
] as const;

const EXACT_COUNT_LIMIT = 500;

/** Neutral grey for 0%, an emerald scale above it, and no fill at all when there is nothing to measure yet. */
function retentionCell(pct: number | null, size: number): { className: string; label: string; detail: string } {
  if (size === 0) return { className: 'text-slate-400', label: '—', detail: 'no players joined that week' };
  if (pct === null) return { className: 'text-slate-400', label: '—', detail: 'not enough time has passed to measure this yet' };
  const back = Math.round((pct / 100) * size);
  // The backend sends the share rounded to 3 decimals, so the count is exact only below 500 players.
  const detail = `${size >= EXACT_COUNT_LIMIT ? '≈' : ''}${back} of ${size} ${size === 1 ? 'player' : 'players'} came back (${pct.toFixed(1)}%)`;
  if (pct === 0) return { className: 'bg-slate-100 text-slate-600', label: size < SMALL_SAMPLE ? `0% (0/${size})` : '0%', detail };
  const className =
    pct >= 40 ? 'bg-emerald-500 text-white' : pct >= 25 ? 'bg-emerald-300 text-emerald-950' : pct >= 15 ? 'bg-emerald-200 text-emerald-900' : pct >= 5 ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-50 text-emerald-700';
  // A small cohort shows the head count with the percentage, so 1 of 3 doesn't read as a trend.
  const label = size < SMALL_SAMPLE ? `${retentionLabel(pct)} (${back}/${size})` : retentionLabel(pct);
  return { className, label, detail };
}

function RetentionSection({ data }: { data: HqAnalytics }) {
  // The cell whose exact count is shown under the table: set by tap, click or keyboard focus.
  const [selected, setSelected] = useState<{ cohortStart: string; col: number } | null>(null);
  const [showOlder, setShowOlder] = useState(false);
  const rows = [...data.retention].sort((a, b) => b.cohortStart.localeCompare(a.cohortStart));
  const shown = showOlder ? rows : rows.slice(0, RETENTION_ROWS_SHOWN);
  const olderCount = rows.length - RETENTION_ROWS_SHOWN;
  const selectedRow = selected ? shown.find((r) => r.cohortStart === selected.cohortStart) : undefined;
  const selectedDetail = selected && selectedRow ? retentionCell(retentionPct([selectedRow.d1, selectedRow.d7, selectedRow.d30][selected.col]), selectedRow.size).detail : null;
  return (
    <Section title="Do players come back?" description="QuizBall database · registered players, grouped by the week they signed up. Week 2 is the headline figure.">
      <Panel>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">Cohorts appear once players have signed up for a few weeks.</p>
        ) : (
          <div className="min-w-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className={cn(HQ_LABEL, 'border-b border-slate-200 text-left')}>
                    <th className="px-3 py-2 font-semibold">Joined week of</th>
                    <th className="px-3 py-2 text-right font-semibold">Players</th>
                    {RETENTION_COLUMNS.map((c) => (
                      <th key={c.label} className="px-3 py-2 text-center font-semibold">
                        {c.label}
                        <span className="block text-[11px] font-normal normal-case tracking-normal text-slate-600">{c.days} after signup</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((r) => (
                    <tr key={r.cohortStart}>
                      <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-700">{shortDate(r.cohortStart)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">{n(r.size)}</td>
                      {[r.d1, r.d7, r.d30].map((v, i) => {
                        const cell = retentionCell(retentionPct(v), r.size);
                        const isSelected = selected?.cohortStart === r.cohortStart && selected.col === i;
                        const pick = () => setSelected({ cohortStart: r.cohortStart, col: i });
                        return (
                          <td key={i} className="px-3 py-1.5 text-center">
                            <button
                              type="button"
                              title={cell.detail}
                              aria-label={`${shortDate(r.cohortStart)}, ${RETENTION_COLUMNS[i].label}: ${cell.detail}`}
                              aria-pressed={isSelected}
                              onClick={pick}
                              onFocus={pick}
                              className={cn(
                                'inline-block min-w-[3.25rem] cursor-pointer whitespace-nowrap rounded px-2 py-0.5 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-900',
                                cell.className,
                                isSelected && 'ring-2 ring-slate-900'
                              )}
                            >
                              {cell.label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {olderCount > 0 && (
              <div className="border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowOlder((v) => !v)}
                  aria-expanded={showOlder}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
                >
                  {showOlder ? `Show latest ${RETENTION_ROWS_SHOWN} only` : `Show older (${olderCount})`}
                </button>
              </div>
            )}
            <div className="space-y-1 border-t border-slate-100 px-3 py-2 text-[13px] text-slate-600">
              <p role="status" aria-live="polite" className="min-h-4 font-medium tabular-nums text-slate-800">
                {selected && selectedRow && selectedDetail ? `${shortDate(selected.cohortStart)} · ${RETENTION_COLUMNS[selected.col].label}: ${selectedDetail}` : 'Tap or focus a cell to see how many players came back.'}
              </p>
              <p>“—” means not enough time has passed. “0%” means nobody came back. “&lt;1%” means some did, but fewer than 1 in 100. Cohorts under {SMALL_SAMPLE} players swing widely, so they also show the head count, for example 33% (1/3).</p>
              <HowCounted>
                <p>Registered players only, grouped by the week they signed up (Tbilisi weeks).</p>
                <p>Next day: played the day after signing up. Week 2: played on any of days 7 to 13 after signing up. Month 2: played on any of days 30 to 59 after signing up.</p>
                <p>A cell stays “—” until every player in that signup week has passed the end of the window.</p>
              </HowCounted>
            </div>
          </div>
        )}
      </Panel>
    </Section>
  );
}

// ── Countries ──

function CountriesSection({ data }: { data: HqAnalytics }) {
  const [showAll, setShowAll] = useState(false);
  const rows = countryShares(data.countries, data.countries.length, data.countriesTotalPlayers);
  const ofTopOnly = rows[0]?.basis === 'top';
  const max = Math.max(1, ...rows.map((r) => r.players));
  const shown = showAll ? rows : rows.slice(0, COUNTRIES_SHOWN);
  // The denominator of every share below: registered accounts that played in the window, not the guest-inclusive MAU.
  const denominator = ofTopOnly ? rows.reduce((sum, r) => sum + r.players, 0) : data.countriesTotalPlayers;
  return (
    <Section
      title="Where players are"
      description={`QuizBall database · share of the ${n(denominator)} registered players${ofTopOnly ? ' in the top countries' : ''} who played in the last ${data.days} days, by account country.`}
    >
      <Panel>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No country data for this period.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {shown.map((r) => (
                <li
                  key={r.country}
                  title={`${r.name}: ${n(r.players)} registered players, ${(r.share * 100).toFixed(2)}%`}
                  className="flex items-center gap-3 px-4 py-2 text-sm tabular-nums"
                >
                  <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
                    {r.flag}
                  </span>
                  <span className="w-28 shrink-0 text-slate-800 sm:w-36">{r.name}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-slate-100">
                    <span className="block h-full rounded bg-blue-500" style={{ width: `${(r.players / max) * 100}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right text-slate-600">{n(r.players)}</span>
                  <span className="w-12 shrink-0 text-right font-medium text-slate-900">{shareLabel(r.share)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-2 border-t border-slate-100 px-4 py-2.5">
              {rows.length > COUNTRIES_SHOWN && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  className="block text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
                >
                  {showAll ? `Show top ${COUNTRIES_SHOWN}` : `Show all ${rows.length}`}
                </button>
              )}
              <HowCounted>
                <p>
                  Registered accounts only, counted if they played at any point in the last {data.days} days including today. The country is the one set on the account; “unknown” means none is set.
                </p>
                <p>Guests have no account country, so they are not counted here. That is why this total is lower than the Active numbers in the summary, which include guests.</p>
              </HowCounted>
            </div>
          </>
        )}
      </Panel>
    </Section>
  );
}

// ── Game modes ──

function ModesSection({ data }: { data: HqAnalytics }) {
  const top = topModesWithOther(data.modes, data.modeLabels);
  const total = data.modes.reduce((sum, m) => sum + m.matches, 0);
  // One colour per category, shared by the donut, its legend and the daily chart.
  const colorOf = (mode: string, rank: number) => (mode === 'other' ? OTHER_MODE_COLOR : MODE_COLORS[rank % MODE_COLORS.length]);
  // The daily chart uses exactly the donut's categories: the named modes, with everything else folded into Other.
  const named = new Set(top.filter((m) => m.mode !== 'other').map((m) => m.mode));
  const daily = data.modesByDay.map((day) => {
    const row: Record<string, number | string> = { date: day.date };
    let other = 0;
    for (const [key, value] of Object.entries(day)) {
      if (key === 'date' || typeof value !== 'number') continue;
      if (named.has(key)) row[key] = value;
      else other += value;
    }
    for (const mode of named) row[mode] ??= 0;
    if (top.some((m) => m.mode === 'other')) row.other = other;
    return row;
  });
  return (
    <Section title="What people play" description={`Share of all games played by mode, last ${data.days} days. Small modes are grouped as Other.`}>
      <Panel className="p-4">
        {top.length === 0 ? (
          <p className="text-sm text-slate-600">No games in this period.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-6">
              <div className="relative h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={top} dataKey="matches" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
                      {top.map((m, i) => (
                        <Cell key={m.mode} fill={colorOf(m.mode, i)} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                  <div>
                    <div className="text-2xl font-semibold tabular-nums text-slate-950">{n(total)}</div>
                    <div className="text-xs text-slate-600">games</div>
                  </div>
                </div>
              </div>
              <ul className="min-w-[12rem] flex-1 space-y-1.5">
                {top.map((m, i) => (
                  <li key={m.mode} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(m.mode, i) }} />
                    <span className="min-w-0 flex-1 text-slate-800">{m.label}</span>
                    <span className="tabular-nums text-slate-600">{n(m.matches)}</span>
                    <span className="w-10 text-right font-medium tabular-nums text-slate-900">{formatPct(m.share)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {daily.length > 1 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-2 text-[13px] text-slate-600">All games played per day, by the same modes and colours as above.</p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
                      <YAxis width={36} allowDecimals={false} {...axisProps} />
                      <ChartTooltip />
                      {top.map((m, i) => (
                        <Area key={m.mode} type="monotone" dataKey={m.mode} name={m.label} stackId="modes" stroke="none" fill={colorOf(m.mode, i)} fillOpacity={0.9} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </Section>
  );
}

// ── PostHog ──

function PosthogSection({ days }: { days: number }) {
  const { data, isLoading, error, refetch } = useHqPosthog(days);
  if (isLoading && !data) {
    return (
      <Section title="Website (PostHog)">
        <Panel className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading website stats…
        </Panel>
      </Section>
    );
  }
  if (!data) return <LoadErrorState error={error} fallback="Could not load website stats." onRetry={() => void refetch()} />;
  if (!data.connected) return <ConnectPosthog />;
  if (data.error !== undefined) {
    // Configured, but PostHog failed this time (the backend caches for 10 min).
    return (
      <Section title="Website (PostHog)">
        <Panel className="p-4">
          <p className="text-sm text-slate-600">PostHog didn’t answer this time. Website numbers will be back shortly.</p>
          <button type="button" onClick={() => void refetch()} className="mt-2 text-sm font-medium text-slate-700 underline">
            Try again
          </button>
        </Panel>
      </Section>
    );
  }
  return <PosthogStats data={data} days={days} />;
}

function ConnectPosthog() {
  return (
    <Section title="Website (PostHog)">
      <Panel className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Plug className="h-4 w-4 text-slate-500" /> Connect PostHog
        </h3>
        <p className="text-sm text-slate-700">See website visitors, where they come from, and how many become players. Ask an engineer to set these on the backend:</p>
        <ul className="flex flex-wrap gap-2 font-mono text-xs">
          {['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_API_HOST'].map((v) => (
            <li key={v} className="rounded bg-slate-100 px-2 py-1 text-slate-700">
              {v}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-600">The host is optional (defaults to the EU cloud). The key stays on the server and is never shown here.</p>
      </Panel>
    </Section>
  );
}

type PosthogConnected = Extract<HqPosthog, { connected: true; error?: undefined }>;

function PosthogStats({ data, days }: { data: PosthogConnected; days: number }) {
  const visitors = data.visitorsByDay;
  const totalVisitors = visitors.reduce((sum, d) => sum + d.visitors, 0);
  const funnel = data.funnel;
  const steps = funnelSteps(funnel);
  const top = steps[0]?.[1] ?? 0;

  return (
    <div className="space-y-8">
      <Section
        title="Summary"
        description={`PostHog events from the website, last ${days} days. Not the same as the Players tab, which counts accounts in the QuizBall database.`}
      >
        <Panel className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {steps.length > 0 ? (
            steps.map(([label, value], i) => (
              <Metric
                key={label}
                label={label}
                value={n(value)}
                hint={i === 0 ? 'website visitors' : top > 0 ? `${formatPct(value / top, 1)} of visitors` : undefined}
              />
            ))
          ) : (
            <Metric label="Visitor-days" value={n(totalVisitors)} hint="daily visitors added up" />
          )}
        </Panel>
      </Section>
      {visitors.length > 0 && (
        <Section title="Website visitors" description={`PostHog · visitors (blue) and pageviews (grey) per day, last ${days} days.`}>
          <Panel className="h-44 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={visitors} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axisProps} />
                <YAxis width={48} allowDecimals={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} {...axisProps} />
                <ChartTooltip />
                <Area type="monotone" dataKey="pageviews" name="Pageviews" stroke="none" fill="#e2e8f0" />
                <Area type="monotone" dataKey="visitors" name="Visitors" stroke="#2563eb" strokeWidth={2} fill="#2563eb" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </Section>
      )}
      <div className="grid gap-8 lg:grid-cols-3">
        <TopList
          title="Visitor countries"
          rows={data.topCountries.map((c) => ({ key: c.country, label: `${countryFlag(c.country)} ${countryName(c.country)}`, value: c.visitors }))}
        />
        <TopList title="Where they come from" rows={data.topReferrers.map((r) => ({ key: r.source, label: r.source || 'Direct', value: r.visitors }))} />
        <TopList title="Top pages" rows={data.topPages.map((p) => ({ key: p.path, label: p.path, value: p.views }))} />
      </div>
    </div>
  );
}

/** Funnel steps that exist (a step whose event isn't tracked is left out). */
function funnelSteps(funnel: { visitors: number; signups?: number; firstMatch?: number } | undefined): Array<[string, number]> {
  if (!funnel) return [];
  const all: Array<[string, number | undefined]> = [
    ['Visited', funnel.visitors],
    ['Signed up', funnel.signups],
    ['Played a match', funnel.firstMatch],
  ];
  return all.filter((step): step is [string, number] => typeof step[1] === 'number');
}

function TopList({ title, rows }: { title: string; rows: Array<{ key: string; label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Section title={title}>
      <Panel className="p-2">
        {rows.length === 0 ? (
          <p className="px-2 py-2 text-sm text-slate-500">No data yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {rows.slice(0, 8).map((r) => (
              <li key={r.key} title={`${r.label}: ${n(r.value)}`} className="relative overflow-hidden rounded px-2 py-1.5">
                <span className="absolute inset-y-0 left-0 bg-slate-100" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
                <span className="relative flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 break-words text-slate-800">{r.label}</span>
                  <span className="font-medium tabular-nums text-slate-900">{n(r.value)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Section>
  );
}
