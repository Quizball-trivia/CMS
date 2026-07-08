'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users as UsersIcon, Activity, CalendarRange, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  currentStats,
  dailySeries,
  weeklySeries,
  TICK_MS,
} from '@/lib/stats-demo';

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

interface StatCardProps {
  label: string;
  value: number;
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
        <div className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
          {fmt(value)}
        </div>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function StatsPage() {
  // Re-render every 30s; the underlying numbers only step every TICK_MS (~5 min),
  // so the UI updates promptly once a new 5-min bucket is crossed.
  const now = useNow(30_000);

  const stats = useMemo(() => currentStats(now), [now]);
  const daily = useMemo(() => dailySeries(now, 14), [now]);
  const weekly = useMemo(() => weeklySeries(now, 8), [now]);

  const nextTick = TICK_MS - (now % TICK_MS);
  const nextMin = Math.max(1, Math.round(nextTick / 60_000));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white p-2.5 shadow-sm border border-gray-200/50">
            <TrendingUp className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stats</h1>
            <p className="text-sm text-slate-500">
              Active users and growth — live overview.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="mt-1 gap-1.5 bg-amber-50 text-amber-700 border border-amber-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          Demo data · updates in ~{nextMin}m
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Users"
          value={stats.totalUsers}
          sub="All registered players"
          icon={UsersIcon}
          accent="bg-slate-100 text-slate-700"
        />
        <StatCard
          label="Daily Active Users"
          value={stats.dau}
          sub="Played in the last 24h"
          icon={Activity}
          accent="bg-emerald-100 text-emerald-700"
        />
        <StatCard
          label="Weekly Active Users"
          value={stats.wau}
          sub="Played in the last 7 days"
          icon={CalendarRange}
          accent="bg-indigo-100 text-indigo-700"
        />
      </div>

      {/* DAU chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Daily Active Users · last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dauFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(v) => [fmt(Number(v)), 'DAU']}
                />
                <Area type="monotone" dataKey="dau" stroke="#10b981" strokeWidth={2.5} fill="url(#dauFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* WAU chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            Weekly Active Users · last 8 weeks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(v) => [fmt(Number(v)), 'WAU']}
                />
                <Bar dataKey="wau" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
