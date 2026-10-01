'use client';

import Link from 'next/link';
import { CalendarDays, Dumbbell, Gamepad2, TriangleAlert, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { tdKeys } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { Dashboard } from '@/lib/td/contract';
import { formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdErrorPanel } from './td-error-panel';

type Day = Dashboard['today'];

const dailiesPlayed = (day: Day) => day.dailies.footballLogic.attempts + day.dailies.putInOrder.attempts + day.dailies.careerPath.attempts;

const METRICS: Array<{ key: string; label: string; icon: typeof Users; value: (day: Day) => number; sub: (day: Day) => string }> = [
  { key: 'players', label: 'Players', icon: Users, value: (d) => d.players.active, sub: (d) => `${d.players.new} new` },
  { key: 'matches', label: 'Matches', icon: Gamepad2, value: (d) => d.matches.settled, sub: (d) => `${d.matches.created} started · ${d.matches.voided} voided` },
  { key: 'dailies', label: 'Dailies played', icon: CalendarDays, value: dailiesPlayed, sub: (d) => `${d.dailies.footballLogic.completed + d.dailies.putInOrder.completed + d.dailies.careerPath.completed} completed` },
  { key: 'practice', label: 'Practice runs', icon: Dumbbell, value: (d) => d.practice.runs, sub: () => '' },
];

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
              <dt className="text-xs font-medium text-slate-500">Today</dt>
              <dt className="text-xs font-medium text-slate-500">Yesterday</dt>
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
            {data.penaltiesToReview} early-quit penalt{data.penaltiesToReview === 1 ? 'y needs' : 'ies need'} a second look: a match was voided afterwards, so the player may not have deserved{' '}
            {data.penaltiesToReview === 1 ? 'it' : 'them'}.
          </span>
          {user?.role === 'ops' && (
            <Link href="/td/players" className="shrink-0 font-semibold underline">
              Review
            </Link>
          )}
        </p>
      )}
      {data && (
        <p className="text-xs text-slate-500">
          Today is {formatDay(data.today.date)} and yesterday {formatDay(data.yesterday.date)}, counted midnight to midnight in Georgian time. Test accounts are left out.{' '}
          {data.today.matches.corrected > 0 && `${data.today.matches.corrected} match${data.today.matches.corrected === 1 ? '' : 'es'} corrected today. `}
          Updated {formatGeorgiaTime(data.generatedAt)}.
        </p>
      )}
    </>
  );
}
