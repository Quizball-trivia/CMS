'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { WL_KIND_LABEL, WL_ROUND_KIND_LABEL, wlContentApi, type WlContentRunway } from '@/lib/wl-content';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const DIFFS = ['easy', 'medium', 'hard'] as const;
const TYPE_ORDER = ['true_false', 'put_in_order', 'mcq_single', 'career_path', 'clue_chain'];

export function WlRunway({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<WlContentRunway | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void wlContentApi.GET('/api/v1/admin/wl/content/runway').then(({ data: res, error: err }) => {
      if (!alive) return;
      if (res) { setData(res); setError(null); } else setError((err as { message?: string } | undefined)?.message ?? 'request failed');
    }, (err) => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, [refreshKey, attempt]);

  if (error) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">Could not load stock: {error}. <button className="underline" onClick={() => setAttempt((a) => a + 1)}>Retry</button> — if this persists, sign in again.</div>;
  if (!data) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Counting stock…</div>;

  const cell = (type: string, diff: string, photo?: boolean) =>
    data.inventory.filter((r) => r.type === type && r.difficulty === diff && (photo === undefined || r.photo === photo)).reduce((s, r) => s + r.fresh, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Events the seeder can still fill</h4>
            <p className="text-xs text-muted-foreground">Drawable = published, bilingual, protected questions not dealt in the last 35 days (the seeder&apos;s own rule). One event burns 28 per round (12 for Who am I), reserves included.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {data.drawable.map((d) => {
              const pct = Math.min(100, Math.round((d.drawable / (d.need * 4)) * 100));
              return (
                <div key={d.kind} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{WL_ROUND_KIND_LABEL[d.kind] ?? d.kind}</div>
                  <div className={cn('text-2xl font-semibold tabular-nums', d.events_left === 0 ? 'text-red-600' : d.events_left < 2 ? 'text-amber-600' : '')}>{d.events_left}<span className="text-sm font-normal text-muted-foreground"> events</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', d.events_left === 0 ? 'bg-red-500' : d.events_left < 2 ? 'bg-amber-500' : 'bg-green-600')} style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1 text-xs text-muted-foreground tabular-nums">{d.drawable} drawable · need {d.need}/event · fresh editor stock lasts {data.fresh_events_left[d.kind] ?? 0}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Fresh editor inventory (never dealt) by difficulty</h4>
            <p className="text-xs text-muted-foreground">What the editor has written that no event has used yet, by the difficulty tag. The automatic draw does not allocate by difficulty — this is inventory, not a promise about which game a question lands in.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Round</th>{DIFFS.map((d) => <th key={d} className="py-2 pr-4 capitalize">{d}</th>)}<th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.map((type) => (
                  <tr key={type} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{WL_KIND_LABEL[type]}{type === 'mcq_single' && <span className="block text-xs font-normal text-muted-foreground">photo / text — the draw prefers photos and falls back to text MCQs only when photos run out</span>}</td>
                    {DIFFS.map((d) => <td key={d} className="py-2 pr-4 tabular-nums">{type === 'mcq_single' ? <>{cell(type, d, true)} <span className="text-muted-foreground">/ {cell(type, d, false)}</span></> : cell(type, d)}</td>)}
                    <td className="py-2 font-semibold tabular-nums">{type === 'mcq_single' ? <>{DIFFS.reduce((s, d) => s + cell(type, d, true), 0)} <span className="font-normal text-muted-foreground">/ {DIFFS.reduce((s, d) => s + cell(type, d, false), 0)}</span></> : DIFFS.reduce((s, d) => s + cell(type, d), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
