'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarPlus, Loader2, RotateCcw } from 'lucide-react';
import { WL_KIND_LABEL, WL_ROUND_KIND_LABEL, wlContentApi, type WlContentBatch, type WlContentBatchDetail } from '@/lib/wl-content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const STATUS: Record<WlContentBatch['status'], string> = {
  processing: 'border-blue-500 text-blue-700', undoing: 'border-blue-500 text-blue-700', done: 'border-green-600 text-green-700', failed: 'border-red-500 text-red-700', undone: 'border-slate-400 text-slate-500',
};

export function WlBatches({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [batches, setBatches] = useState<WlContentBatch[] | null>(null);
  const [detail, setDetail] = useState<WlContentBatchDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<WlContentBatch[] | null> => {
    const fail = (message: string) => { setError(message); toast.error(`Could not refresh batches: ${message}`); return null; };
    try {
      const { data, error: err } = await wlContentApi.GET('/api/v1/admin/wl/content/batches');
      if (!data) return fail((err as { message?: string } | undefined)?.message ?? 'request failed');
      setBatches(data.batches); setError(null);
      return data.batches;
    } catch (err) { return fail(err instanceof Error ? err.message : String(err)); }
  }, []);

  /** What an earlier undo could not finish: staging copies and stored photos (the backend retries only those). */
  const cleanupPending = (b: WlContentBatch): { staging: number; photos: boolean } => {
    const undo = undoOf(b.result);
    return { staging: undo?.staging_pending_ids?.length ?? 0, photos: Boolean(undo?.photos_pending) };
  };

  /**
   * The photo step can queue behind a running import. Refresh until an outcome
   * other than the one already shown lands (an older error is not this attempt's result).
   */
  const watchPhotos = useCallback(async (id: string, seen: string | null) => {
    for (let i = 0; i < 180; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const b = (await load())?.find((x) => x.id === id);
      const photos = undoOf(b?.result)?.photos;
      if (!photos?.at || photos.at === seen) continue;
      // An open detail dialog renders its own copy of the batch; refresh it too.
      const fresh = await wlContentApi.GET('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id } } }).catch(() => null);
      if (fresh?.data) setDetail((prev) => (prev?.id === id ? fresh.data : prev));
      if (photos.error) toast.error(`Photo cleanup failed: ${photos.error} — use Retry cleanup`);
      else toast.success(`Photo cleanup finished${photoNote(photos)}`);
      return;
    }
  }, [load]);

  const retryCleanup = async (b: WlContentBatch) => {
    const seen = undoOf(b.result)?.photos?.at ?? null;
    setBusy(b.id);
    const { data, error } = await wlContentApi.DELETE('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id: b.id } } });
    setBusy(null);
    if (error || !data) { toast.error((error as { message?: string } | undefined)?.message ?? 'Retry failed'); return; }
    void load();
    const stagingFailed = data.staging_deleted != null && data.staging_deleted < 0;
    if (data.photos === null) { toast.info('Photo cleanup is queued behind an import that is still running — this list updates when it finishes'); void watchPhotos(b.id, seen); return; }
    if (stagingFailed || data.photos.error) toast.error(`Cleanup incomplete${stagingFailed ? ' · staging failed again' : ''}${data.photos.error ? ` · photos: ${data.photos.error}` : ''}`);
    else toast.success(`Cleanup done${data.staging_deleted != null ? ` · staging: ${data.staging_deleted} deleted` : ''}${photoNote(data.photos)}`);
  };
  // State is set only after the fetch resolves; the rule cannot see through the async boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, refreshKey]);

  /** "Use in next weekend": re-draw the coming event with this batch drawn first. */
  const schedule = async (b: WlContentBatchDetail) => {
    if (!window.confirm('Re-draw next weekend with this batch first? Its questions take the earliest slots (Saturday Game 1 onward); the rest of the lineup is re-drawn from the pool. The current lineup is kept as a backup. Only possible before play starts.')) return;
    setBusy(b.id);
    const res = await wlContentApi.POST('/api/v1/admin/wl/content/batches/{id}/schedule', { params: { path: { id: b.id } }, body: {} })
      .catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
    setBusy(null);
    if (res instanceof Error) {
      // The re-draw may still have committed: show the batch as it is now.
      toast.error(`Could not confirm the schedule (${res.message}) — the placements below show what the weekend holds now`);
      void open(b.id);
      return;
    }
    const { data, error } = res;
    if (error || !data) { toast.error((error as { message?: string } | undefined)?.message ?? 'Could not schedule the batch'); return; }
    if (!data.ok) {
      const short = Object.entries(data.shortages ?? {}).map(([k, v]) => `${WL_KIND_LABEL[k] ?? k} ${v.have}/${v.need}`).join(', ');
      toast.error(`Not enough questions in the pool to re-draw (${short}) — the lineup was left unchanged`);
      return;
    }
    toast.success(`${formatDay(data.week_key, 0)}: ${data.placed_main} in main slots${data.placed_reserve ? `, ${data.placed_reserve} as reserves` : ''}${data.not_placed ? `, ${data.not_placed} not placed (more than the weekend needs, or played recently)` : ''}`);
    void open(b.id); onChanged?.();
  };

  const open = async (id: string) => {
    try {
      const { data, error } = await wlContentApi.GET('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id } } });
      if (data) setDetail(data);
      else toast.error(`Could not open the batch: ${(error as { message?: string } | undefined)?.message ?? 'request failed'} — if this persists, sign in again`);
    } catch (err) { toast.error(`Could not open the batch: ${err instanceof Error ? err.message : String(err)}`); }
  };

  const undo = async (b: WlContentBatch) => {
    const total = b.counts.published + b.counts.failed + b.counts.created + b.counts.translated;
    const prompt = b.kind === 'lineup'
      ? `Undo this lineup upload? Its questions are scheduled in a weekend (or kept in that weekend's backup), so Undo keeps them — it does not restore the previous lineup. To change those games, upload a new lineup for them.`
      : `Undo this batch? Its ${total} question(s) are deleted unless an event has already dealt them or a reseed backup still points at them.`;
    if (!window.confirm(prompt)) return;
    const seen = undoOf(b.result)?.photos?.at ?? null;
    setBusy(b.id);
    const { data, error } = await wlContentApi.DELETE('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id: b.id } } });
    setBusy(null);
    if (error || !data) { toast.error((error as { message?: string } | undefined)?.message ?? 'Undo failed'); return; }
    const text = `Deleted ${data.deleted}${data.kept ? `, kept ${data.kept} already dealt` : ''}${data.staging_deleted != null ? ` · staging: ${data.staging_deleted < 0 ? 'failed' : data.staging_deleted}` : ''}${photoNote(data.photos)}`;
    if (data.photos?.error || (data.staging_deleted ?? 0) < 0) toast.warning(`${text} — use Retry cleanup on the batch`); else toast.success(text);
    if (data.photos === null) void watchPhotos(b.id, seen);
    void load(); onChanged?.();
  };

  if (error && !batches) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">Could not load batches: {error}. <button className="underline" onClick={() => void load()}>Retry</button> — if this persists, sign in again.</div>;
  if (!batches) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading batches…</div>;
  if (batches.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No uploads yet.</p>;

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Round</TableHead><TableHead>Note</TableHead>
              <TableHead className="text-right">Published</TableHead><TableHead className="text-right">Failed</TableHead><TableHead>Status</TableHead><TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => void open(b.id)}>
                <TableCell className="whitespace-nowrap text-sm">{new Date(b.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</TableCell>
                <TableCell className="text-sm">{b.created_by_email ?? '—'}</TableCell>
                <TableCell className="text-sm">{WL_KIND_LABEL[b.kind] ?? b.kind}</TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{b.note ?? ''}</TableCell>
                <TableCell className="text-right tabular-nums">{b.counts.published}</TableCell>
                <TableCell className={cn('text-right tabular-nums', b.counts.failed && 'text-red-600')}>{b.counts.failed}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS[b.status]}>{b.status}</Badge></TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {b.status !== 'undone' && b.status !== 'processing' && b.status !== 'undoing' && (
                    <Button variant="ghost" size="sm" disabled={busy === b.id} onClick={() => void undo(b)}>
                      {busy === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RotateCcw className="mr-1 h-3.5 w-3.5" /> Undo</>}
                    </Button>
                  )}
                  {b.status === 'undone' && (cleanupPending(b).staging > 0 || cleanupPending(b).photos) && (
                    <Button variant="outline" size="sm" disabled={busy === b.id} onClick={() => void retryCleanup(b)}
                      title={[cleanupPending(b).staging && `${cleanupPending(b).staging} question(s) still on staging`, cleanupPending(b).photos && 'stored photos not deleted yet'].filter(Boolean).join(' · ')}>
                      {busy === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Retry cleanup'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {detail && (
        <Dialog open onOpenChange={(o) => !o && setDetail(null)}>
          <DialogContent className="max-h-[85vh] w-[min(94vw,1000px)] max-w-none overflow-y-auto">
            <DialogHeader><DialogTitle>Batch · {WL_KIND_LABEL[detail.kind] ?? detail.kind} · {detail.rows.length} rows</DialogTitle></DialogHeader>
            {detail.error && <p className="text-sm text-red-600">{detail.error}</p>}
            {detail.status === 'undone' && <PhotoOutcome result={detail.result} />}
            {detail.lineup && <LineupPlacement lineup={detail.lineup} />}
            {detail.kind !== 'lineup' && (detail.status === 'done' || detail.status === 'failed') && detail.counts.published > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 p-2 text-sm">
                <span className="text-muted-foreground">Uploads go to the pool; the draw decides the weekend lineup.</span>
                <Button size="sm" variant="outline" disabled={busy === detail.id} onClick={() => void schedule(detail)}>
                  {busy === detail.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CalendarPlus className="mr-1 h-3.5 w-3.5" /> Use in next weekend</>}
                </Button>
              </div>
            )}
            <ol className="space-y-1 text-sm">
              {detail.rows.map((r) => (
                <li key={r.row_index} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded border p-2">
                  <span className="text-right text-muted-foreground">{r.row_index + 1}</span>
                  <div className="min-w-0">
                    <p className="break-words">{r.summary || <em className="text-muted-foreground">(no summary)</em>}</p>
                    {r.error && <p className="mt-0.5 break-words text-xs text-red-600">{r.error}</p>}
                    {r.state === 'published' && <p className="mt-0.5 text-xs text-muted-foreground">{placementLabel(r.placements)}</p>}
                    {r.question_id && (r.placements.length > 0 || r.in_backup) && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        Undo keeps this question: {r.placements.length > 0 ? `it is ${r.placements[0]!.status === 'completed' ? 'part of a finished weekend' : 'scheduled'}` : 'a weekend backup (the lineup it replaced or was replaced in) still points at it'}. It stays private to the WL pool.
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={cn('shrink-0', r.state === 'published' ? 'border-green-600 text-green-700' : r.state === 'failed' ? 'border-red-500 text-red-700' : r.state === 'deleted' ? 'border-slate-400 text-slate-500' : '')}>{r.state}</Badge>
                </li>
              ))}
            </ol>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

type UndoPhotos = { deleted: number; shared: number; error: string | null; at?: string } | null | undefined;
type UndoResult = { staging_pending_ids?: string[]; photos_pending?: boolean; photos?: UndoPhotos };

function undoOf(result: unknown): UndoResult | undefined {
  return result && typeof result === 'object' ? (result as { undo?: UndoResult }).undo : undefined;
}

function photoNote(p: UndoPhotos): string {
  if (p === null) return ' · photos: cleanup queued behind a running import';
  if (!p) return '';
  if (p.error) return ` · photos not deleted (${p.error})`;
  if (!p.deleted && !p.shared) return '';
  return ` · photos: ${p.deleted} deleted${p.shared ? `, ${p.shared} kept (still used by a dealt question)` : ''}`;
}

function PhotoOutcome({ result }: { result: unknown }) {
  const undo = undoOf(result);
  if (!undo || (!undo.photos && !undo.photos_pending)) return null;
  const p = undo.photos;
  return (
    <p className={cn('text-sm', undo.photos_pending ? 'text-amber-700' : 'text-muted-foreground')}>
      {p && !p.error && <>Stored photos: {p.deleted} deleted{p.shared ? `, ${p.shared} kept because a dealt question still uses them` : ''}</>}
      {undo.photos_pending && <>Stored photos not deleted yet{p?.error ? ` (${p.error})` : ''} — close this and press Retry cleanup</>}
    </p>
  );
}

type Placement = WlContentBatchDetail['rows'][number]['placements'][number];

/** Saturday = the event's week_key; games 1–3 play Saturday, the final (game index 3) on Sunday. */
function formatDay(weekKey: string, gameIndex: number): string {
  const d = new Date(`${weekKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return weekKey;
  if (gameIndex >= 3) d.setUTCDate(d.getUTCDate() + 1);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function placementLabel(placements: Placement[]): string {
  const p = placements[0];
  if (!p) return 'In pool — not scheduled';
  const game = p.game_index >= 3 ? 'Final' : `Game ${p.game_index + 1}`;
  const slot = p.reserve_ordinal > 0 ? `Reserve ${p.reserve_ordinal} (${WL_ROUND_KIND_LABEL[p.kind] ?? p.kind})` : `Round ${(p.round_index ?? 0) + 1} · Q${(p.question_index ?? 0) + 1}`;
  const played = p.status === 'completed' ? 'Completed weekend · ' : '';
  const more = placements.length > 1 ? ` (+${placements.length - 1} earlier)` : '';
  return `${played}${formatDay(p.week_key, p.game_index)} · ${game} · ${slot}${more}`;
}

const LINEUP_GAMES = ['Saturday Game 1', 'Saturday Game 2', 'Saturday Game 3', 'Sunday Final'];

/** Every slot a lineup upload saved (uploaded + pool reserves), and whether the weekend still holds it there. */
function LineupPlacement({ lineup }: { lineup: NonNullable<WlContentBatchDetail['lineup']> }) {
  const replaced = lineup.slots.filter((s) => !s.current).length;
  return (
    <details open className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">
        Lineup for {formatDay(lineup.week_key, 0)} · {lineup.games.map((g) => LINEUP_GAMES[g]).join(', ')} — {lineup.slots.length} slots
        {replaced ? <span className="ml-1 font-normal text-amber-700">({replaced} replaced since)</span> : <span className="ml-1 font-normal text-green-700">(all still scheduled)</span>}
      </summary>
      <p className="mt-1 text-xs text-muted-foreground">Undo does not restore the lineup this upload replaced; scheduled questions are kept. To change these games, upload a new lineup for them.</p>
      <ol className="mt-2 space-y-1">
        {lineup.slots
          .slice()
          .sort((a, b) => a.game_index - b.game_index || a.reserve_ordinal - b.reserve_ordinal || (a.round_index ?? 9) - (b.round_index ?? 9) || (a.question_index ?? 0) - (b.question_index ?? 0))
          .map((sl, i) => (
            <li key={i} className={cn('grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-start gap-2 text-xs', !sl.current && 'opacity-60')}>
              <span className="text-muted-foreground">{LINEUP_GAMES[sl.game_index]} · {sl.reserve_ordinal > 0 ? `Reserve ${sl.reserve_ordinal} (${WL_ROUND_KIND_LABEL[sl.kind] ?? sl.kind})` : `R${(sl.round_index ?? 0) + 1} Q${(sl.question_index ?? 0) + 1}`}</span>
              <span className="break-words">{sl.summary}{sl.origin === 'pool' && <Badge variant="outline" className="ml-1 border-violet-400 text-violet-700">pool</Badge>}</span>
              <span className={sl.current ? 'text-green-700' : 'text-amber-700'}>{sl.current ? 'scheduled' : 'replaced'}</span>
            </li>
          ))}
      </ol>
    </details>
  );
}
