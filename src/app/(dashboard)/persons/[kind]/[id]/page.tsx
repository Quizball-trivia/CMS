'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleDot } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePersonActivity } from '@/hooks/use-admin-persons';
import { RealDataGate } from '@/components/analytics/real-data-gate';

const TYPE_LABELS: Record<string, string> = {
  account_created: 'Account created',
  guest_journey_started: 'Guest journey started',
  converted_to_account: 'Converted to account',
  match: 'Match',
  daily_challenge: 'Daily challenge',
  squad_spin: 'Squad Spin',
  trivia_mines: 'Trivia Mines',
  free_kicks: 'Free Kicks',
  road_to_goal: 'Road to Goal',
  guess_the_goal: 'Guess the Goal',
  ultimo: 'Último',
  name_chain: 'Name Chain',
  coins: 'Coins',
};

function metaSummary(type: string, meta: Record<string, unknown>): string {
  const parts: string[] = [];
  if (type === 'match') {
    parts.push(String(meta.variant ?? meta.mode ?? ''));
    if (meta.placement != null) parts.push(`placement ${meta.placement}`);
    if (meta.points != null) parts.push(`${meta.points} pts`);
  } else if (type === 'coins') {
    parts.push(String(meta.event ?? ''));
    if (meta.delta != null) parts.push(`${Number(meta.delta) > 0 ? '+' : ''}${meta.delta} coins`);
    if (meta.reason) parts.push(String(meta.reason));
  } else {
    if (meta.challenge) parts.push(String(meta.challenge));
    if (meta.stake != null) parts.push(`stake ${meta.stake}`);
    if (meta.payout != null) parts.push(`payout ${meta.payout}`);
    if (meta.status) parts.push(String(meta.status));
    if (meta.score != null) parts.push(`score ${meta.score}`);
    if (meta.points != null) parts.push(`${meta.points} pts`);
    if (meta.correct != null) parts.push(meta.correct ? 'correct' : 'wrong');
    if (meta.country) parts.push(String(meta.country));
    if (meta.first_mode) parts.push(String(meta.first_mode));
    if (meta.link_type) parts.push(String(meta.link_type));
  }
  return parts.filter(Boolean).join(' · ');
}

function PersonDetailInner({ kind, id }: { kind: 'registered' | 'guest'; id: string }) {
  const { data, isLoading, isError } = usePersonActivity(kind, id);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link href="/persons" className="text-slate-400 hover:text-slate-600"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {kind === 'registered' ? 'User' : 'Guest'} <span className="font-mono text-base text-slate-500">{id}</span>
          </h1>
          <p className="text-sm text-slate-500">Full journey from the production database, newest first (max 200 entries).</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
        <CardContent>
          {isLoading && <div className="py-8 text-sm text-slate-500">Loading journey…</div>}
          {isError && <div className="py-8 text-sm text-red-600">Could not load this person.</div>}
          {data && data.activity.length === 0 && (
            <div className="py-8 text-sm text-slate-500">No recorded activity.</div>
          )}
          {data && data.activity.length > 0 && (
            <ol className="relative space-y-0 border-l border-slate-200 pl-5">
              {data.activity.map((entry, i) => (
                <li key={`${entry.at}-${entry.type}-${i}`} className="relative py-2.5">
                  <CircleDot className="absolute -left-[27px] top-3 h-3.5 w-3.5 text-slate-300" />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Badge variant="outline" className="font-normal">{TYPE_LABELS[entry.type] ?? entry.type}</Badge>
                    <span className="text-sm text-slate-700">{metaSummary(entry.type, entry.meta)}</span>
                    <span className="ml-auto text-xs tabular-nums text-slate-400">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function PersonDetailPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = use(params);
  const safeKind = kind === 'guest' ? 'guest' : 'registered';
  return <RealDataGate><PersonDetailInner kind={safeKind} id={id} /></RealDataGate>;
}
