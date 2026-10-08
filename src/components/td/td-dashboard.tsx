'use client';

import Link from 'next/link';
import { Activity, CalendarRange, Dumbbell, TrendingUp, TriangleAlert, Users as UsersIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { tdKeys } from '@/hooks/use-td-content';
import { tdAdmin } from '@/lib/td/client';
import type { Dashboard } from '@/lib/td/contract';
import { addDays, formatDate, formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tn, TD_LOCALE } from '@/lib/td/i18n';
import { canAccessTab, getTab } from '@/lib/td/navigation';
import { TD_ROOT } from '@/lib/workspace-guard';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdErrorPanel } from './td-error-panel';

type Day = Dashboard['today'];
type Period = NonNullable<Dashboard['last7Days']>;

const GAMES = ['footballLogic', 'putInOrder', 'careerPath'] as const;

function fmt(n: number): string {
  return n.toLocaleString(TD_LOCALE);
}

/** Today's figure of each card, and the same figure summed over the last 7 and 30 days. */
const CARDS: Array<{ key: string; label: string; icon: React.ElementType; accent: string; of: (of: Day | Period) => number }> = [
  { key: 'players', label: t('Players'), icon: UsersIcon, accent: 'bg-slate-100 text-slate-700', of: (of) => of.players.active },
  { key: 'matches', label: t('Matches played'), icon: Activity, accent: 'bg-emerald-100 text-emerald-700', of: (of) => of.matches.settled },
  { key: 'dailies', label: t('Dailies played'), icon: CalendarRange, accent: 'bg-indigo-100 text-indigo-700', of: (of) => GAMES.reduce((n, game) => n + of.dailies[game].attempts, 0) },
  { key: 'practice', label: t('Practice runs'), icon: Dumbbell, accent: 'bg-amber-100 text-amber-700', of: (of) => of.practice.runs },
];

interface StatCardProps {
  label: string;
  value: number | null;
  sub: string;
  icon: React.ElementType;
  accent: string;
}

function StatCard({ label, value, sub, icon: Icon, accent }: StatCardProps) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value === null ? '—' : fmt(value)}</div>
        <p className="mt-1 min-h-4 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

const CHART_DAYS = 30;

interface ChartPoint {
  date: string;
  players: number | null;
  matches: number | null;
}

/** The last 30 days, oldest first. A day the API has no figure for is null, so it is a gap in the chart and not a zero. */
function chartPoints(data: Dashboard): ChartPoint[] {
  const byDate = new Map(data.days.map((point) => [point.date, point]));
  return Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = addDays(data.today.date, i + 1 - CHART_DAYS);
    const point = byDate.get(date);
    return { date, players: point?.activePlayers ?? null, matches: point?.matchesSettled ?? null };
  });
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

const tick = { fontSize: 12, fill: '#64748b' };
const tooltipStyle = { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 };
const day = (date: unknown) => formatDay(String(date));

/** The top ten of the leaderboard, for those who may open the whole of it. */
function TopPlayers() {
  const board = useQuery({ queryKey: [...tdKeys.ops, 'dashboard', 'board'], queryFn: ({ signal }) => tdAdmin.leaderboard.standings({ limit: 10 }, { signal }), refetchInterval: 60_000 });
  const rows = board.data?.items ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">{t('Leaderboard · top 10')}</CardTitle>
        <CardAction>
          <Link href={`${TD_ROOT}/leaderboard`} className="text-sm font-medium text-slate-500 hover:text-slate-900">
            {t('The whole leaderboard')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <TdErrorPanel error={board.error} />
        {board.isSuccess && rows.length === 0 && <p className="py-8 text-center text-sm text-gray-400">{t('Nobody has finished a ranked match yet.')}</p>}
        {rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t('Player')}</TableHead>
                <TableHead className="text-right">{t('Rating')}</TableHead>
                <TableHead className="text-right">{t('Games')}</TableHead>
                <TableHead className="text-right">{t('Wins')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.playerId}>
                  <TableCell className="tabular-nums text-slate-400">{row.rank}</TableCell>
                  <TableCell className="max-w-0 truncate font-medium text-slate-900">{row.displayName}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums text-slate-900">{row.rating}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">{row.games}</TableCell>
                  <TableCell className="text-right tabular-nums text-slate-500">{row.wins}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TdDashboard() {
  const { user } = useTdAuth();
  const dashboard = useQuery({ queryKey: [...tdKeys.ops, 'dashboard'], queryFn: ({ signal }) => tdAdmin.dashboard({ signal }), refetchInterval: 60_000 });
  const data = dashboard.data;
  const points = data ? chartPoints(data) : [];
  // A point stands alone when both its neighbours are gaps: a line has nothing to join it to, so it gets a dot.
  const alone = (index: number) => points[index]?.players != null && points[index - 1]?.players == null && points[index + 1]?.players == null;
  const sum = (period: Period | null, of: (of: Day | Period) => number) => (period ? fmt(of(period)) : '—');

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-2.5 shadow-sm border border-gray-200/50">
          <TrendingUp className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('Stats')}</h1>
          <p className="text-sm text-slate-500">{t('Players and games played, today and over the last 30 days.')}</p>
        </div>
      </div>

      <TdErrorPanel error={dashboard.error} />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {CARDS.map((card) => (
          <StatCard
            key={card.key}
            label={card.label}
            value={data ? card.of(data.today) : null}
            sub={data ? t('7 days: {week} · 30 days: {month}', { week: sum(data.last7Days, card.of), month: sum(data.last30Days, card.of) }) : ''}
            icon={card.icon}
            accent={card.accent}
          />
        ))}
      </div>

      {/* Players chart */}
      <ChartCard title={t('Players per day · last 30 days')}>
        {data && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="playersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tick} axisLine={false} tickLine={false} interval={4} minTickGap={16} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={48} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={day} filterNull={false} formatter={(v) => [v == null ? t('No figure yet') : fmt(Number(v)), t('Players')]} />
              <Area
                type="monotone"
                dataKey="players"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#playersFill)"
                dot={({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) =>
                  index !== undefined && alone(index) ? <circle key={index} cx={cx} cy={cy} r={3.5} fill="#10b981" /> : <g key={index} />
                }
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Matches chart */}
      <ChartCard title={t('Matches played per day · last 30 days')}>
        {data && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={tick} axisLine={false} tickLine={false} interval={4} minTickGap={16} />
              <YAxis tick={tick} axisLine={false} tickLine={false} width={48} allowDecimals={false} />
              <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={tooltipStyle} labelFormatter={day} filterNull={false} formatter={(v) => [v == null ? t('No figure yet') : fmt(Number(v)), t('Matches played')]} />
              <Bar dataKey="matches" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {data && data.penaltiesToReview > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            {tn(
              data.penaltiesToReview,
              '{count} early-quit penalty needs a second look: a match was voided afterwards, so the player may not have deserved it.',
              '{count} early-quit penalties need a second look: a match was voided afterwards, so the player may not have deserved them.',
            )}
          </span>
          {user?.role === 'ops' && (
            <Link href={`${TD_ROOT}/players`} className="ml-auto shrink-0 underline">
              {t('Review')}
            </Link>
          )}
        </div>
      )}

      {user && canAccessTab(getTab('leaderboard'), user.role) && <TopPlayers />}

      {data && (
        <p className="text-xs text-slate-500">
          {t('Georgian time, midnight to midnight. Test accounts and bots are not counted.')} {t('Updated {time}.', { time: formatGeorgiaTime(data.generatedAt) })}
        </p>
      )}
    </div>
  );
}
