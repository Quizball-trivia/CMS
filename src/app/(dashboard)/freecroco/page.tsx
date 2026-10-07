'use client';

import { useState } from 'react';
import { Activity, ChartColumn, Coins, Gamepad, Send, Swords, UserPlus } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFreecrocoStats } from '@/hooks';
import { useGeorgiaToday } from '@/hooks/use-georgia-today';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { GAME_LABELS } from '@/lib/freecroco/games';
import {
  deliveryHealth,
  formatAge,
  formatCount,
  lastDays,
  rangeLength,
  rangeProblem,
  shortDay,
  sortGamesByPlays,
  STATS_DEFAULT_RANGE_DAYS,
  STATS_METRICS,
  STATS_PRESETS,
  type DayRange,
  type StatsMetric,
} from '@/lib/freecroco/stats';
import { formatDay } from '@/lib/td/georgia';
import type { PartnerDayStats, PartnerStats } from '@/types/freecroco';

type RangeChoice = { preset: number } | { preset: null; range: DayRange };

interface KpiProps {
  label: string;
  metric: StatsMetric;
  today: PartnerDayStats;
  yesterday: PartnerDayStats;
  icon: React.ElementType;
  accent: string;
}

function Kpi({ label, metric, today, yesterday, icon: Icon, accent }: KpiProps) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        <div className={cn('rounded-lg p-2', accent)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">Today</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums" data-testid={`kpi-${metric}-today`}>
            {formatCount(today[metric])}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Yesterday</p>
          <p className="text-lg font-semibold text-slate-600 tabular-nums" data-testid={`kpi-${metric}-yesterday`}>
            {formatCount(yesterday[metric])}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function RangePicker({ today, value, onChange }: { today: string; value: DayRange; onChange: (choice: RangeChoice) => void }) {
  const [draft, setDraft] = useState<DayRange>(value);
  const problem = rangeProblem(draft, today);

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onChange({ preset: null, range: draft });
      }}
    >
      <div className="flex gap-1" role="group" aria-label="Quick ranges">
        {STATS_PRESETS.map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={rangeLength(value) === days && value.to === today ? 'default' : 'outline'}
            onClick={() => {
              setDraft(lastDays(today, days));
              onChange({ preset: days });
            }}
          >
            {days} days
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="fc-stats-from" className="text-xs">From</Label>
        <Input
          id="fc-stats-from"
          type="date"
          className="h-8 w-40"
          max={today}
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fc-stats-to" className="text-xs">To</Label>
        <Input
          id="fc-stats-to"
          type="date"
          className="h-8 w-40"
          max={today}
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
      </div>
      <Button type="submit" size="sm" disabled={problem !== null}>Apply</Button>
      {problem && <p className="w-full text-xs text-red-500">{problem}</p>}
    </form>
  );
}

function DailyChart({ daily }: { daily: PartnerDayStats[] }) {
  const [metric, setMetric] = useState<StatsMetric>('activePlayers');
  const chosen = STATS_METRICS.find((m) => m.key === metric)!;
  const data = daily.map((d) => ({ ...d, label: shortDay(d.day) }));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-semibold text-slate-900">Daily</CardTitle>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart metric">
          {STATS_METRICS.map((m) => (
            <Button
              key={m.key}
              type="button"
              size="sm"
              variant={m.key === metric ? 'default' : 'outline'}
              aria-pressed={m.key === metric}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fcDailyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chosen.color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chosen.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                formatter={(v) => [formatCount(Number(v)), chosen.label]}
              />
              <Area type="monotone" dataKey={metric} stroke={chosen.color} strokeWidth={2.5} fill="url(#fcDailyFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyTable({ daily }: { daily: PartnerDayStats[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Day</TableHead>
          {STATS_METRICS.map((m) => (
            <TableHead key={m.key} className="text-right">{m.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...daily].reverse().map((d) => (
          <TableRow key={d.day}>
            <TableCell className="whitespace-nowrap">{formatDay(d.day)}</TableCell>
            {STATS_METRICS.map((m) => (
              <TableCell key={m.key} className="text-right tabular-nums">{formatCount(d[m.key])}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GamesTable({ stats }: { stats: PartnerStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">By game</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Game</TableHead>
              <TableHead className="text-right">Plays</TableHead>
              <TableHead className="text-right">Finished</TableHead>
              <TableHead className="text-right">Average score</TableHead>
              <TableHead className="text-right">Max score</TableHead>
              <TableHead className="text-right">Players</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortGamesByPlays(stats.games).map((g) => (
              <TableRow key={g.gameId}>
                <TableCell className="font-medium text-gray-900">{GAME_LABELS[g.gameId]}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(g.plays)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(g.finished)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(g.averageScore)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(g.maxScore)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(g.uniquePlayers)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const HEALTH_BADGE = {
  ok: { label: 'Healthy', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  degraded: { label: 'Slow', className: 'bg-amber-100 text-amber-800 hover:bg-amber-100' },
  down: { label: 'Stuck', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
} as const;

export default function FreecrocoOverviewPage() {
  const today = useGeorgiaToday();
  if (!today) return <p className="text-sm text-gray-400">Loading…</p>;
  return <Overview today={today} />;
}

function Overview({ today }: { today: string }) {
  const [choice, setChoice] = useState<RangeChoice>({ preset: STATS_DEFAULT_RANGE_DAYS });
  // A preset follows the Georgian day, so a page left open past midnight moves on with it.
  const range = choice.preset === null ? choice.range : lastDays(today, choice.preset);
  const { data, isLoading, isError, isFetching, refetch } = useFreecrocoStats(range.from, range.to);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ChartColumn className="size-6 text-gray-700" />
            <h1 className="text-2xl font-semibold text-gray-900">Freecroco overview</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Days are Georgia time (Asia/Tbilisi). A player is active on a day they start at least one play.
          </p>
        </div>
        <RangePicker key={`${range.from}|${range.to}`} today={today} value={range} onChange={setChoice} />
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {!isLoading && !data && (
        <div className="space-y-3">
          <p className="text-sm text-red-500">Failed to load the overview.</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className={cn('space-y-6', isFetching && 'opacity-70 transition-opacity')}>
          {isError && <p className="text-sm text-amber-700">Showing the last loaded numbers; the refresh failed.</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Active players" metric="activePlayers" today={data.todayStats} yesterday={data.yesterdayStats} icon={Activity} accent="bg-emerald-100 text-emerald-700" />
            <Kpi label="New players" metric="newPlayers" today={data.todayStats} yesterday={data.yesterdayStats} icon={UserPlus} accent="bg-indigo-100 text-indigo-700" />
            <Kpi label="Plays started" metric="playsStarted" today={data.todayStats} yesterday={data.yesterdayStats} icon={Gamepad} accent="bg-sky-100 text-sky-700" />
            <Kpi label="Points sent" metric="pointsSent" today={data.todayStats} yesterday={data.yesterdayStats} icon={Coins} accent="bg-rose-100 text-rose-700" />
          </div>

          <Card className="py-5">
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Players ever" value={formatCount(data.totals.playersEver)} />
              <Figure label="Active, last 7 days" value={formatCount(data.totals.activeLast7Days)} />
              <Figure
                label="New in range"
                value={formatCount(data.totals.newPlayers)}
                hint={`${formatDay(data.from)} – ${formatDay(data.to)}`}
              />
              <Figure label="Active in range" value={formatCount(data.totals.activeInRange)} />
            </CardContent>
          </Card>

          <DailyChart daily={data.daily} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Swords className="size-4 text-gray-600" />
                <CardTitle className="text-base font-semibold text-slate-900">Ranked</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure label="Plays" value={formatCount(data.ranked.plays)} />
                <Figure label="Matches" value={formatCount(data.ranked.matches)} />
                <Figure label="Vs Freecroco players" value={formatCount(data.ranked.vsPlayers)} />
                <Figure label="Vs bots" value={formatCount(data.ranked.vsBots)} />
                <Figure label="Settled" value={formatCount(data.ranked.settled)} />
                <Figure label="Cancelled" value={formatCount(data.ranked.cancelled)} />
                <Figure label="Returned" value={formatCount(data.ranked.returned)} hint="Play given back" />
                <Figure label="In progress" value={formatCount(data.ranked.open)} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Send className="size-4 text-gray-600" />
                <CardTitle className="text-base font-semibold text-slate-900">Score delivery</CardTitle>
                <Badge className={cn('ml-auto', HEALTH_BADGE[deliveryHealth(data.delivery.oldestPendingSeconds)].className)}>
                  {HEALTH_BADGE[deliveryHealth(data.delivery.oldestPendingSeconds)].label}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Figure label="Sent" value={formatCount(data.delivery.sent)} hint="Plays in range" />
                  <Figure label="Pending" value={formatCount(data.delivery.pending)} hint="Plays in range" />
                  <Figure label="Dead" value={formatCount(data.delivery.dead)} hint="Plays in range" />
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
                  <Figure label="Pending now" value={formatCount(data.delivery.pendingNow)} />
                  <Figure label="Dead now" value={formatCount(data.delivery.deadNow)} />
                  <Figure label="Oldest pending" value={formatAge(data.delivery.oldestPendingSeconds)} />
                </div>
              </CardContent>
            </Card>
          </div>

          <GamesTable stats={data} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-slate-900">Day by day</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyTable daily={data.daily} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
