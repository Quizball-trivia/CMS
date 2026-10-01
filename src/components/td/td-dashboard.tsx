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
import { TdSection } from './td-page';

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
          <div key={key} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-(--td-text-2)">
              <Icon className="size-4 text-primary" />
              {label}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-(--td-text-3)">Today{data && ` · ${formatDay(data.today.date)}`}</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums">{data ? value(data.today) : '—'}</dd>
                {data && sub(data.today) && <dd className="text-xs text-(--td-text-3)">{sub(data.today)}</dd>}
              </div>
              <div>
                <dt className="text-xs text-(--td-text-3)">Yesterday{data && ` · ${formatDay(data.yesterday.date)}`}</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums text-(--td-text-2)">{data ? value(data.yesterday) : '—'}</dd>
                {data && sub(data.yesterday) && <dd className="text-xs text-(--td-text-3)">{sub(data.yesterday)}</dd>}
              </div>
            </dl>
          </div>
        ))}
      </div>
      {data && data.penaltiesToReview > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <TriangleAlert className="size-4" />
          {data.penaltiesToReview} penalt{data.penaltiesToReview === 1 ? 'y' : 'ies'} to review after a correction.
          {user?.role === 'ops' && (
            <Link href="/td/players" className="underline">
              Review them
            </Link>
          )}
        </p>
      )}
      <TdSection title="Days" description="All figures are Georgian days (Asia/Tbilisi, UTC+4); load-test players are left out.">
        <div className="px-5 py-4 text-sm text-(--td-text-2)">
          {data ? (
            <>
              Today runs {formatGeorgiaTime(data.today.from)} – {formatGeorgiaTime(data.today.to)}. {data.today.matches.corrected} correction{data.today.matches.corrected === 1 ? '' : 's'} today. Updated {formatGeorgiaTime(data.generatedAt)}.
            </>
          ) : (
            'Loading…'
          )}
        </div>
      </TdSection>
    </>
  );
}
