'use client';

import Link from 'next/link';
import { CalendarDays, Dumbbell, Gamepad2, TriangleAlert, Trophy, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { tdKeys } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { Dashboard } from '@/lib/td/contract';
import { formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tn } from '@/lib/td/i18n';
import { canAccessTab, getTab } from '@/lib/td/navigation';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdErrorPanel } from './td-error-panel';

type Day = Dashboard['today'];

const dailiesPlayed = (day: Day) => day.dailies.footballLogic.attempts + day.dailies.putInOrder.attempts + day.dailies.careerPath.attempts;

const METRICS: Array<{ key: string; label: string; icon: typeof Users; value: (day: Day) => number; sub: (day: Day) => string }> = [
  { key: 'players', label: t('Players'), icon: Users, value: (d) => d.players.active, sub: (d) => t('{n} new', { n: d.players.new }) },
  { key: 'matches', label: t('Matches'), icon: Gamepad2, value: (d) => d.matches.settled, sub: (d) => t('{started} started · {voided} voided', { started: d.matches.created, voided: d.matches.voided }) },
  { key: 'dailies', label: t('Dailies played'), icon: CalendarDays, value: dailiesPlayed, sub: (d) => t('{n} completed', { n: d.dailies.footballLogic.completed + d.dailies.putInOrder.completed + d.dailies.careerPath.completed }) },
  { key: 'practice', label: t('Practice runs'), icon: Dumbbell, value: (d) => d.practice.runs, sub: () => '' },
];

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
  return (
    <>
      <TdErrorPanel error={dashboard.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {METRICS.map(({ key, label, icon: Icon, value, sub }) => (
          <div key={key} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Icon className="size-4 text-slate-400" />
              {label}
            </div>
            {/* One short label per column, so the two figures sit on one line; the dates are named once, under the cards. */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4">
              <dt className="text-xs font-medium text-slate-500">{t('Today')}</dt>
              <dt className="text-xs font-medium text-slate-500">{t('Yesterday')}</dt>
              <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{data ? value(data.today) : '—'}</dd>
              <dd className="mt-1 text-3xl font-bold tabular-nums text-slate-400">{data ? value(data.yesterday) : '—'}</dd>
              <dd className="mt-1 text-xs text-slate-500">{data ? sub(data.today) : ''}</dd>
              <dd className="mt-1 text-xs text-slate-500">{data ? sub(data.yesterday) : ''}</dd>
            </dl>
          </div>
        ))}
      </div>
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
      {user && canAccessTab(getTab('leaderboard'), user.role) && <TopPlayers />}
      {data && (
        <p className="text-xs text-slate-500">
          {t('Today is {today} and yesterday {yesterday}, counted midnight to midnight in Georgian time. Test accounts are left out.', {
            today: formatDay(data.today.date),
            yesterday: formatDay(data.yesterday.date),
          })}{' '}
          {data.today.matches.corrected > 0 && `${tn(data.today.matches.corrected, '{count} match corrected today.', '{count} matches corrected today.')} `}
          {t('Updated {time}.', { time: formatGeorgiaTime(data.generatedAt) })}
        </p>
      )}
    </>
  );
}
