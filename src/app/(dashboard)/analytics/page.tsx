'use client';

import { useMemo } from 'react';
import { Users as UsersIcon, UserCheck, UserPlus, Activity, Globe2, Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { useAnalyticsOverview } from '@/hooks/use-admin-analytics';
import { RealDataGate } from '@/components/analytics/real-data-gate';
import type { AnalyticsOverview } from '@/types/admin-analytics';

// Categorical palette: validated slot order (dataviz six-checks, light surface).
// Color follows the MODE, never its rank — the mapping is fixed; everything
// else folds into neutral "Other".
const MODE_COLORS: Record<string, string> = {
  grid: '#2a78d6',
  ranked: '#eb6834',
  daily: '#1baf7a',
  trivia_mines: '#eda100',
  auction: '#e87ba4',
  squad_spin: '#008300',
};
const OTHER_COLOR = '#9a9a93';
const MODE_LABELS: Record<string, string> = {
  grid: 'Grid', ranked: 'Ranked', daily: 'Daily', trivia_mines: 'Trivia Mines',
  auction: 'Auction', squad_spin: 'Squad Spin', other: 'Other',
};
const PRIMARY = '#2a78d6';
const GRID_STROKE = '#eef2f7';
const SURFACE = '#ffffff';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function shortDay(day: string): string {
  return day.slice(5).replace('-', '/');
}

interface StatCardProps {
  label: string;
  value: string;
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
        <div className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function buildModeSeries(data: AnalyticsOverview) {
  const namedModes = Object.keys(MODE_COLORS);
  const byDay = new Map<string, Record<string, number>>();
  for (const row of data.gamesPerDay) {
    const bucket = byDay.get(row.day) ?? {};
    const key = namedModes.includes(row.mode) ? row.mode : 'other';
    bucket[key] = (bucket[key] ?? 0) + row.games;
    byDay.set(row.day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, modes]) => ({ day: shortDay(day), ...modes }));
}

function AnalyticsInner() {
  const { data, isLoading, isError } = useAnalyticsOverview();

  const modeSeries = useMemo(() => (data ? buildModeSeries(data) : []), [data]);
  const modeTotals = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, number>();
    for (const row of data.gamesPerDay) {
      const key = row.mode in MODE_COLORS ? row.mode : 'other';
      totals.set(key, (totals.get(key) ?? 0) + row.games);
    }
    return [...totals.entries()].sort(([, a], [, b]) => b - a);
  }, [data]);

  if (isLoading) {
    return <div className="p-8 text-sm text-slate-500">Loading live analytics…</div>;
  }
  if (isError || !data) {
    return <div className="p-8 text-sm text-red-600">Could not load analytics — is your account an admin?</div>;
  }

  const dauSeries = data.dauSeries.map((d) => ({ day: shortDay(d.day), count: d.count }));
  const signupSeries = data.signupsPerDay.map((d) => ({ day: shortDay(d.day), count: d.count }));
  const stackOrder = [...Object.keys(MODE_COLORS), 'other'];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Analytics — live</h1>
        <p className="text-sm text-slate-500">
          Real numbers from the production database (no demo scaling). Days in Asia/Tbilisi.
          Updated {new Date(data.generatedAt).toLocaleTimeString()} · refreshes every minute.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total users" value={fmt(data.totals.totalUsers)}
          sub="registered + guests who played" icon={UsersIcon} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Registered" value={fmt(data.totals.registered)}
          sub="real accounts (no bots/seeds)" icon={UserCheck} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Playing guests" value={fmt(data.totals.playingGuests)}
          sub="journeys with ≥1 game, not converted" icon={UserPlus} accent="bg-amber-50 text-amber-600" />
        <StatCard label="Guest → account" value={`${data.totals.guestConversionPct30d}%`}
          sub="conversion, last 30 days" icon={Percent} accent="bg-violet-50 text-violet-600" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="DAU" value={fmt(data.actives.dau)} sub="played today" icon={Activity} accent="bg-blue-50 text-blue-600" />
        <StatCard label="WAU" value={fmt(data.actives.wau)} sub="played, last 7 days" icon={Activity} accent="bg-blue-50 text-blue-600" />
        <StatCard label="MAU" value={fmt(data.actives.mau)} sub="played, last 30 days" icon={Activity} accent="bg-blue-50 text-blue-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily active players — 30 days</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dauSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'players']} labelStyle={{ color: '#0f172a' }} />
                <Area type="monotone" dataKey="count" name="players" stroke={PRIMARY} strokeWidth={2}
                  fill={PRIMARY} fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New accounts per day — 30 days</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={(v) => [fmt(Number(v ?? 0)), 'accounts']} labelStyle={{ color: '#0f172a' }} />
                <Bar dataKey="count" name="accounts" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Games played per day by mode — 30 days</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={modeSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v, name) => [fmt(Number(v ?? 0)), MODE_LABELS[String(name)] ?? String(name)]} labelStyle={{ color: '#0f172a' }} />
              <Legend formatter={(value: string) => MODE_LABELS[value] ?? value} wrapperStyle={{ fontSize: 12 }} />
              {stackOrder.map((mode) => (
                <Bar key={mode} dataKey={mode} stackId="games" name={mode}
                  fill={mode === 'other' ? OTHER_COLOR : MODE_COLORS[mode]}
                  stroke={SURFACE} strokeWidth={1} maxBarSize={22} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
        <CardContent className="pt-0">
          <p className="text-xs text-slate-500">
            30-day totals:{' '}
            {modeTotals.map(([mode, total], i) => (
              <span key={mode}>
                {i > 0 && ' · '}
                <span className="font-medium text-slate-700">{MODE_LABELS[mode] ?? mode}</span> {fmt(total)}
              </span>
            ))}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Globe2 className="h-4 w-4 text-slate-400" />
          <CardTitle className="text-base">Top countries — all users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Country</TableHead>
                <TableHead className="text-right">Registered</TableHead>
                <TableHead className="text-right">Guests</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="w-1/3">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.countries.map((c) => {
                const max = data.countries[0]?.total ?? 1;
                return (
                  <TableRow key={c.country}>
                    <TableCell className="font-medium uppercase">{c.country}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.registered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.guests)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(c.total)}</TableCell>
                    <TableCell>
                      <div className="h-2 rounded-sm bg-slate-100">
                        <div className="h-2 rounded-sm" style={{ width: `${Math.max(2, (c.total / max) * 100)}%`, backgroundColor: PRIMARY }} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  return <RealDataGate><AnalyticsInner /></RealDataGate>;
}
