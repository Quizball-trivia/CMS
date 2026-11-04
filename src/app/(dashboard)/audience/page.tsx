'use client';

import { useState } from 'react';
import { Activity, Gamepad2, Globe2, Link2, Repeat, UserPlus, UserRoundPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAudience } from '@/hooks/use-admin-analytics';
import { RealDataGate } from '@/components/analytics/real-data-gate';
import type { Audience, AudiencePeriod, KeyedCount } from '@/types/admin-audience';
import { countryLabel, gameLabel } from '@/lib/audience-labels';

const PERIODS: { key: AudiencePeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
];
const REGISTERED = '#2a78d6';
const GUESTS = '#eda100';
const GRID_STROKE = '#eef2f7';

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

function shortDay(day: string): string {
  return day.slice(5).replace('-', '/');
}

function rangeLabel(data: Audience): string {
  const { from, to } = data.range;
  return from === to ? from : `${from} → ${to}`;
}

function Delta({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (now === null || before === undefined || before === null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const tone = pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-red-600' : 'text-slate-500';
  return <span className={`ml-2 text-xs font-medium ${tone}`}>{pct > 0 ? '+' : ''}{pct}% vs before</span>;
}

interface StatCardProps {
  label: string;
  value: number | null;
  before?: number | null;
  sub: string;
  icon: React.ElementType;
  accent: string;
}

function StatCard({ label, value, before, sub, icon: Icon, accent }: StatCardProps) {
  return (
    <Card className="gap-3 py-5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
        <div className={`rounded-lg p-2 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline">
          <span className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{fmt(value)}</span>
          <Delta now={value} before={before} />
        </div>
        <p className="mt-1 text-xs text-slate-500">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ShareBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 rounded-sm bg-slate-100">
      <div className="h-2 rounded-sm" style={{ width: `${Math.max(2, (value / Math.max(max, 1)) * 100)}%`, backgroundColor: color }} />
    </div>
  );
}

function KeyedTable({ title, rows, keyLabel }: { title: string; rows: KeyedCount[]; keyLabel: string }) {
  const max = rows[0]?.people ?? 1;
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{keyLabel}</TableHead>
            <TableHead className="text-right">People</TableHead>
            <TableHead className="w-1/4" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="max-w-[16rem] truncate font-medium" title={r.key}>{r.key === '$direct' ? 'Direct / no referrer' : r.key}</TableCell>
              <TableCell className="text-right tabular-nums">{fmt(r.people)}</TableCell>
              <TableCell><ShareBar value={r.people} max={max} color={REGISTERED} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SourcesCard({ data }: { data: Audience }) {
  const src = data.sources;
  const s = data.summary;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Link2 className="h-4 w-4 text-slate-400" />
        <CardTitle className="text-base">Where new people come from</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!src.connected && (
          <p className="text-sm text-slate-500">
            Traffic sources come from PostHog. Add a read-only PostHog personal API key (<code>POSTHOG_PERSONAL_API_KEY</code>,
            query:read) and <code>POSTHOG_PROJECT_ID</code> to the backend to show first referrer, landing page and UTM source here.
          </p>
        )}
        {src.connected && 'error' in src && <p className="text-sm text-red-600">PostHog: {src.error}</p>}
        {src.connected && 'referrers' in src && (
          <>
            <div className="grid gap-2 sm:grid-cols-4">
              {[
                { label: 'New visitors (first visit in 120 days)', value: src.newVisitors, unknown: false },
                { label: 'New guests who played', value: s.newGuests ?? 0, unknown: s.newGuests === null },
                { label: 'New accounts', value: s.newRegistered, unknown: false },
                { label: 'New accounts who played', value: s.newRegisteredPlayed, unknown: false },
              ].map((step, i) => (
                <div key={step.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">{i + 1}. {step.label}</div>
                  <div className="text-xl font-bold tabular-nums text-slate-900">{step.unknown ? '—' : fmt(step.value)}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <KeyedTable title="First referrer" keyLabel="Source" rows={src.referrers} />
              <KeyedTable title="Landing page" keyLabel="Page" rows={src.landingPages} />
              <KeyedTable title="UTM source" keyLabel="utm_source" rows={src.utmSources} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AudienceInner() {
  const [period, setPeriod] = useState<AudiencePeriod>('yesterday');
  const { data, isLoading, isError } = useAudience(period);

  const tabs = (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Period">
      {PERIODS.map((p) => (
        <button
          key={p.key}
          type="button"
          role="tab"
          aria-selected={period === p.key}
          onClick={() => setPeriod(p.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            period === p.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audience</h1>
        <p className="text-sm text-slate-500">
          Every game, each person counted once (a guest who signs up counts as the member). Real accounts only — no bots,
          staff or partner players. Days in Asia/Tbilisi. A game counts on the day it was started; warm-ups and public
          quizzes record no plays, so they are not included.
        </p>
      </div>
      {tabs}
    </div>
  );

  if (isLoading) return <div className="space-y-6 p-6">{header}<p className="text-sm text-slate-500">Loading…</p></div>;
  if (isError || !data) {
    return <div className="space-y-6 p-6">{header}<p className="text-sm text-red-600">Could not load the audience — is your account an admin?</p></div>;
  }

  const s = data.summary;
  const prev = data.previous;
  const historyNote = !data.coverage.historyComplete;
  // Days not counted yet are left as gaps instead of looking like zero players.
  const trend = data.trend.map((d) => ({
    day: shortDay(d.day),
    registered: d.counted ? d.registered : null,
    guests: d.counted ? d.guests : null,
  }));
  const topGames = data.games.slice(0, 5);
  const maxCountry = data.countries[0]?.active ?? 1;
  const maxGame = data.games[0]?.players ?? 1;

  return (
    <div className="space-y-6 p-6">
      {header}
      <p className="text-xs text-slate-500">
        {rangeLabel(data)}{data.partial ? ' · today so far' : ''} · updated {new Date(data.generatedAt).toLocaleTimeString()}
        {data.coverage.refreshedAt && ` · counts refreshed ${new Date(data.coverage.refreshedAt).toLocaleTimeString()}`}
        {prev && ` · compared with ${prev.range.from === prev.range.to ? prev.range.from : `${prev.range.from} → ${prev.range.to}`}`}
      </p>
      {historyNote && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          History since {data.coverage.start} is still being counted ({fmt(data.coverage.incompleteDays)} days left, about 6 every 10 minutes).
          Until it is done, new vs returning players show as —; everything else is already final.
        </p>
      )}
      {data.partial && data.period !== 'today' && (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">Some days in this range are not counted yet; totals may still rise.</p>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Players" value={s.active} before={prev?.active}
          sub={`${fmt(s.registered)} registered · ${fmt(s.guests)} guests`} icon={Activity} accent="bg-blue-50 text-blue-600" />
        <StatCard label="New accounts" value={s.newRegistered} before={prev?.newRegistered}
          sub={`${fmt(s.newRegisteredPlayed)} played · web ${fmt(s.signupPlatforms.web)} · Android ${fmt(s.signupPlatforms.android)} · iOS ${fmt(s.signupPlatforms.ios)}`}
          icon={UserPlus} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="New guests" value={s.newGuests} before={prev?.newGuests}
          sub={s.newGuests === null ? 'available once history is counted' : 'guests playing for the first time'}
          icon={UserRoundPlus} accent="bg-amber-50 text-amber-600" />
        <StatCard label="Returning players" value={s.returning}
          sub={s.newPlayers === null ? 'available once history is counted' : `played before · ${fmt(s.newPlayers)} new players in total`}
          icon={Repeat} accent="bg-violet-50 text-violet-600" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Players per day — last 30 days</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={(v, name) => [fmt(Number(v ?? 0)), String(name)]} labelStyle={{ color: '#0f172a' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="registered" name="Registered" stackId="p" stroke={REGISTERED} fill={REGISTERED} fillOpacity={0.25} />
              <Area type="monotone" dataKey="guests" name="Guests" stackId="p" stroke={GUESTS} fill={GUESTS} fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Globe2 className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-base">Countries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right">New accounts</TableHead>
                  <TableHead className="w-1/5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.countries.map((c) => (
                  <TableRow key={c.country}>
                    <TableCell className="font-medium">{countryLabel(c.country)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(c.active)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.registered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.guests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(c.newRegistered)}</TableCell>
                    <TableCell><ShareBar value={c.active} max={maxCountry} color={REGISTERED} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-slate-400" />
            <CardTitle className="text-base">Top games</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead className="text-right">Players</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right" title="Games, rounds or daily runs recorded">Sessions</TableHead>
                  <TableHead className="w-1/5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.games.map((g, i) => (
                  <TableRow key={g.mode} className={i < 5 ? '' : 'text-slate-500'}>
                    <TableCell className={i < 5 ? 'font-medium' : ''}>{i < 5 ? `${i + 1}. ` : ''}{gameLabel(g.mode)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{fmt(g.players)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(g.registered)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(g.guests)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(g.plays)}</TableCell>
                    <TableCell><ShareBar value={g.players} max={maxGame} color={GUESTS} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {topGames.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Top 5: {topGames.map((g) => gameLabel(g.mode)).join(' · ')}. A person who plays several games counts once in each.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SourcesCard data={data} />
    </div>
  );
}

export default function AudiencePage() {
  return <RealDataGate><AudienceInner /></RealDataGate>;
}
