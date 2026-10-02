'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BarChart3, CalendarDays, ChevronDown, Dumbbell, Gamepad2, TriangleAlert, Trophy, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { tdKeys } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { Dashboard } from '@/lib/td/contract';
import { addDays, formatDate, formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tn } from '@/lib/td/i18n';
import { canAccessTab, getTab } from '@/lib/td/navigation';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdErrorPanel } from './td-error-panel';

type Day = Dashboard['today'];
type Period = NonNullable<Dashboard['last7Days']>;
type Point = Dashboard['days'][number];

const GAMES = ['footballLogic', 'putInOrder', 'careerPath'] as const;
const dailies = (of: Day | Period, what: 'attempts' | 'completed') => GAMES.reduce((n, game) => n + of.dailies[game][what], 0);

/** One line of the overview: what it counts over a day or a longer period, and the smaller line under the figure. */
const METRICS: Array<{ key: string; label: string; icon: typeof Users; value: (of: Day | Period) => number; sub?: (of: Day | Period) => string }> = [
  { key: 'players', label: t('Players'), icon: Users, value: (of) => of.players.active, sub: (of) => t('{n} new', { n: of.players.new }) },
  { key: 'matches', label: t('Matches'), icon: Gamepad2, value: (of) => of.matches.settled, sub: (of) => (of.matches.voided > 0 ? t('{started} started · {voided} voided', { started: of.matches.created, voided: of.matches.voided }) : t('{n} started', { n: of.matches.created })) },
  { key: 'dailies', label: t('Dailies played'), icon: CalendarDays, value: (of) => dailies(of, 'attempts'), sub: (of) => t('{n} completed', { n: dailies(of, 'completed') }) },
  { key: 'practice', label: t('Practice runs'), icon: Dumbbell, value: (of) => of.practice.runs },
];

/** What the chart can draw, a bar a day. */
const SERIES: Array<{ key: string; label: string; value: (point: Point) => number }> = [
  { key: 'players', label: t('Players'), value: (point) => point.activePlayers },
  { key: 'new', label: t('New players'), value: (point) => point.newPlayers },
  { key: 'matches', label: t('Matches'), value: (point) => point.matchesSettled },
  { key: 'dailies', label: t('Dailies completed'), value: (point) => point.dailiesCompleted },
  { key: 'practice', label: t('Practice runs'), value: (point) => point.practiceRuns },
];

const CHART_DAYS = 30;

/** The last 30 days, a bar a day, of the figure chosen above it. */
function DayByDay({ days, today }: { days: Point[]; today: string }) {
  const [chosen, setChosen] = useState(SERIES[0]!.key);
  const [pointed, setPointed] = useState<string | null>(null);
  const series = SERIES.find((s) => s.key === chosen)!;
  const byDate = new Map(days.map((point) => [point.date, point]));
  // Every day of the 30 has its place; one the API has no figure for yet stays empty.
  const dates = Array.from({ length: CHART_DAYS }, (_, i) => addDays(today, i + 1 - CHART_DAYS));
  const most = Math.max(1, ...days.map(series.value));
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <BarChart3 className="size-4 text-slate-400" />
            {t('Day by day')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{pointed ?? t('The last 30 days, a bar a day. The most in one day: {n}.', { n: Math.max(0, ...days.map(series.value)) })}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1" role="group" aria-label={t('What the chart shows')}>
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={s.key === chosen}
              onClick={() => setChosen(s.key)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-colors', s.key === chosen ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-5 flex h-40 items-end gap-1 border-b border-slate-200" aria-label={series.label}>
        {dates.map((date) => {
          const point = byDate.get(date);
          const value = point ? series.value(point) : null;
          const label = value === null ? t('{day}: no figure yet', { day: formatDay(date) }) : `${formatDay(date)}: ${value}`;
          return (
            <li key={date} title={label} aria-label={label} onMouseEnter={() => setPointed(label)} onMouseLeave={() => setPointed(null)} className="group flex h-full min-w-0 flex-1 items-end">
              <span
                className={cn('w-full rounded-t-[3px] transition-colors', value === null ? 'border border-b-0 border-dashed border-slate-200' : date === today ? 'bg-blue-600' : 'bg-slate-300 group-hover:bg-slate-500')}
                style={{ height: value === null ? '8%' : `${Math.max(value > 0 ? 3 : 1, (value / most) * 100)}%` }}
              />
            </li>
          );
        })}
      </ol>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-slate-400">
        <span>{formatDate(dates[0]!)}</span>
        <span>{formatDate(dates[Math.floor(CHART_DAYS / 2)]!)}</span>
        <span className="text-blue-700">{t('Today')}</span>
      </div>
      {/* The same figures as numbers: a bar says its own only under a pointer. */}
      <details className="group mt-4 rounded-xl border border-slate-100">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-600">
          {t('The figures of each day')}
          <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="max-h-80 overflow-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-right text-xs font-semibold text-slate-400">
                <th className="py-2 pl-4 text-left font-semibold">{t('Day')}</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-3 py-2 font-semibold last:pr-4">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...dates].reverse().map((date) => {
                const point = byDate.get(date);
                return (
                  <tr key={date} className="border-t border-slate-100 text-right tabular-nums text-slate-700">
                    <th scope="row" className="whitespace-nowrap py-2 pl-4 text-left font-medium text-slate-900">
                      {formatDay(date)}
                    </th>
                    {SERIES.map((s) => (
                      <td key={s.key} className="px-3 py-2 last:pr-4">
                        {point ? s.value(point) : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** The first ten of the leaderboard, for those who may open the whole of it. */
function TopPlayers() {
  const board = useQuery({ queryKey: [...tdKeys.ops, 'dashboard', 'board'], queryFn: ({ signal }) => tdAdmin.leaderboard.standings({ limit: 10 }, { signal }), refetchInterval: 60_000 });
  const rows = board.data?.items ?? [];
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Trophy className="size-4 text-slate-400" />
            {t('Leaderboard')}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{board.data ? t('The top 10 by rating, of {total} ranked players.', { total: board.data.total }) : t('The top 10 by rating.')}</p>
        </div>
        <Link href="/td/leaderboard" className="shrink-0 text-xs font-bold text-blue-700 underline underline-offset-2">
          {t('The whole leaderboard')}
        </Link>
      </div>
      <TdErrorPanel error={board.error} className="m-5" />
      {board.isSuccess && rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">{t('Nobody has finished a ranked match yet.')}</p>}
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-400">
              <th className="w-12 py-2 pl-5 font-semibold">#</th>
              <th className="py-2 font-semibold">{t('Player')}</th>
              <th className="py-2 text-right font-semibold">{t('Rating')}</th>
              <th className="py-2 text-right font-semibold">{t('Games')}</th>
              <th className="py-2 pr-5 text-right font-semibold">{t('Wins')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.playerId} className="border-t border-slate-100">
                <td className="py-2.5 pl-5 tabular-nums text-slate-400">{row.rank}</td>
                <td className="max-w-0 truncate py-2.5 font-medium text-slate-900">{row.displayName}</td>
                <td className="py-2.5 text-right font-bold tabular-nums text-slate-900">{row.rating}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-500">{row.games}</td>
                <td className="py-2.5 pr-5 text-right tabular-nums text-slate-500">{row.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function TdDashboard() {
  const { user } = useTdAuth();
  const dashboard = useQuery({ queryKey: [...tdKeys.ops, 'dashboard'], queryFn: ({ signal }) => tdAdmin.dashboard({ signal }), refetchInterval: 60_000 });
  const data = dashboard.data;
  const range = (period: Period | null | undefined) => (period ? `${formatDate(period.fromDate)} – ${formatDate(period.toDate)}` : '');
  // Today stands out; the longer periods are empty until the API has counted every day of them.
  const columns: Array<{ key: string; label: string; when: string; of: Day | Period | null | undefined; strong?: boolean }> = [
    { key: 'today', label: t('Today'), when: data ? formatDay(data.today.date) : '', of: data?.today, strong: true },
    { key: 'yesterday', label: t('Yesterday'), when: data ? formatDay(data.yesterday.date) : '', of: data?.yesterday },
    { key: 'week', label: t('Last 7 days'), when: range(data?.last7Days), of: data?.last7Days },
    { key: 'month', label: t('Last 30 days'), when: range(data?.last30Days), of: data?.last30Days },
  ];
  return (
    <>
      <TdErrorPanel error={dashboard.error} />
      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-100 align-bottom">
                <th className="px-5 py-4 text-base font-semibold text-slate-900">{t('Overview')}</th>
                {columns.map((column) => (
                  <th key={column.key} className={cn('w-[19%] whitespace-nowrap px-4 py-4 text-right', column.strong && 'bg-blue-50/60')}>
                    <span className={cn('block text-sm font-bold', column.strong ? 'text-blue-700' : 'text-slate-700')}>{column.label}</span>
                    <span className="block min-h-4 text-[11px] font-medium text-slate-400">{column.when}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(({ key, label, icon: Icon, value, sub }) => (
                <tr key={key} className="border-b border-slate-100 align-top last:border-0">
                  <th scope="row" className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-600">
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-slate-400" />
                      {label}
                    </span>
                  </th>
                  {columns.map((column) => (
                    <td key={column.key} className={cn('whitespace-nowrap px-4 py-4 text-right', column.strong && 'bg-blue-50/60')}>
                      <span className="block text-2xl font-bold tabular-nums text-slate-900">{column.of ? value(column.of) : '—'}</span>
                      <span className="block min-h-4 text-xs text-slate-500">{column.of && sub ? sub(column.of) : ''}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {data && (data.last7Days === null || data.last30Days === null) && <p className="text-xs text-slate-500">{t('The figures of the last 7 and 30 days are still being counted; they appear within the hour.')}</p>}
      {data && data.penaltiesToReview > 0 && (
        <p className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            {tn(
              data.penaltiesToReview,
              '{count} early-quit penalty needs a second look: a match was voided afterwards, so the player may not have deserved it.',
              '{count} early-quit penalties need a second look: a match was voided afterwards, so the player may not have deserved them.',
            )}
          </span>
          {user?.role === 'ops' && (
            <Link href="/td/players" className="shrink-0 font-semibold underline">
              {t('Review')}
            </Link>
          )}
        </p>
      )}
      {data && <DayByDay days={data.days} today={data.today.date} />}
      {user && canAccessTab(getTab('leaderboard'), user.role) && <TopPlayers />}
      {data && (
        <p className="text-xs text-slate-500">
          {t('A day runs from midnight to midnight in Georgian time, and the last 7 and 30 days include today. A player who played on several days counts once. Test accounts are left out, and bots are not counted as players.')}{' '}
          {data.today.matches.corrected > 0 && `${tn(data.today.matches.corrected, '{count} match corrected today.', '{count} matches corrected today.')} `}
          {t('Updated {time}.', { time: formatGeorgiaTime(data.generatedAt) })}
        </p>
      )}
    </>
  );
}
