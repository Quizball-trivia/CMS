'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, RefreshCw, Shuffle } from 'lucide-react';
import { WL_ROUND_KIND_LABEL, wlContentApi } from '@/lib/wl-content';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';

type I18n = Record<string, string>;
export interface NextQuestion {
  kind: string; reserve_ordinal: number; question_index: number | null;
  prompt: I18n | null; options: Array<{ id: string; text: I18n; correct: boolean }> | null;
  image_url: string | null; clubs: Array<{ name: I18n; logo_url: string | null }> | null;
  clues: I18n[] | null; answer: I18n | null; accepted_answers: string[] | null;
  difficulty: string | null; source_question_id: string | null; editor: boolean;
  batch?: { id: string; kind: string; created_at: string; note: string | null } | null;
}
interface NextEvent {
  tournament: { id: string; week_key: string; status: string; is_test: boolean; qualifier_starts_at: string | null; final_starts_at: string | null; answers: number; can_reseed: boolean } | null;
  seeded: boolean;
  games: Array<{ game_index: number; rounds: Array<{ kind: string; played: NextQuestion[]; reserves: NextQuestion[] }> }>;
}

const GAME_LABEL = ['Game 1 · Saturday', 'Game 2 · Saturday', 'Game 3 · Saturday', 'Final · Sunday'];
const en = (f: I18n | null | undefined) => f?.en ?? '';
const ka = (f: I18n | null | undefined) => f?.ka ?? '';

interface EventOption { id: string; week_key: string; status: string; editable: boolean }

export function WlNextEvent({ refreshKey = 0, eventId: initialEventId = null }: { refreshKey?: number; eventId?: string | null }) {
  const [data, setData] = useState<NextEvent | null>(null);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string | null>(initialEventId);
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState(0);
  const [round, setRound] = useState(0);
  const [reseeding, setReseeding] = useState(false);
  const [showReserves, setShowReserves] = useState(false);
  const [editorOnly, setEditorOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch only sets state after the request resolves (no synchronous setState
  // inside the effect); the refresh button flips `loading` itself.
  /** Only the latest request may update the screen (switching weekends quickly must not show an older one). */
  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const req = ++requestRef.current;
    try {
      const { data: res, error: err } = await wlContentApi.GET('/api/v1/admin/wl/content/next-event', { params: { query: eventId ? { tournament_id: eventId } : {} } });
      if (req !== requestRef.current) return;
      if (err || !res) { const m = (err as { message?: string } | undefined)?.message ?? 'request failed'; setError(m); toast.error(`Could not load the weekend: ${m}`); }
      else { setData(res as unknown as NextEvent); setError(null); }
    } catch (err) {
      if (req !== requestRef.current) return;
      const m = err instanceof Error ? err.message : String(err); setError(m); toast.error(`Could not load the weekend: ${m}`);
    }
    setLoading(false);
  }, [eventId]);
  useEffect(() => {
    void wlContentApi.GET('/api/v1/admin/wl/content/lineup/events').then(({ data: res }) => { if (res) setEvents(res.events); }).catch(() => {});
  }, [refreshKey]);
  // State is set only after the fetch resolves; the rule cannot see through the async boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load, refreshKey]);
  const refresh = () => { setLoading(true); void load(); };

  const reseed = async () => {
    if (!data?.tournament) return;
    if (!window.confirm(`Re-draw ALL content for ${data.tournament.week_key} from the current pool? The current set is kept as a backup.`)) return;
    setReseeding(true);
    const out = await wlContentApi.POST('/api/v1/admin/wl/content/tournaments/{id}/reseed', { params: { path: { id: data.tournament.id } } }).catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));
    setReseeding(false);
    if (out instanceof Error) { toast.error(`Re-draw failed: ${out.message} — refreshing to show the current lineup`); void load(); return; }
    const { data: res, error } = out;
    if (error || !res) { toast.error((error as { message?: string } | undefined)?.message ?? 'Reseed failed'); return; }
    if (!res.ok) {
      const short = Object.entries(res.shortages ?? {}).map(([k, v]) => `${WL_ROUND_KIND_LABEL[k] ?? k}: ${v.have}/${v.need}`).join(', ');
      toast.error(`Not enough stock — previous content restored. Short: ${short}`);
    } else {
      toast.success(`Reseeded: ${res.inserted} rows (previous ${res.previous_rows} kept as backup)`);
    }
    void load();
  };

  if (loading && !data) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading the coming event…</div>;
  if (error && !data) return <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">Could not load the coming event: {error}. <button className="underline" onClick={refresh}>Retry</button> — if this persists, sign in again.</div>;
  if (!data?.tournament) return <Alert><AlertDescription>No upcoming Weekend League tournament exists yet — the weekly calendar creates it a few days before entry opens.</AlertDescription></Alert>;

  const t = data.tournament;
  const current = data.games[game];
  const selectedRound = current?.rounds[round];
  const mainQuestions = selectedRound?.played.filter((q) => !editorOnly || q.editor) ?? [];
  const reserveQuestions = selectedRound?.reserves.filter((q) => !editorOnly || q.editor) ?? [];
  const locations = data.games.flatMap((g, gi) => g.rounds.map((_, ri) => ({ gi, ri })));
  const locationIndex = locations.findIndex((p) => p.gi === game && p.ri === round);
  const moveRound = (step: number) => {
    const next = locations[locationIndex + step];
    if (next) { setGame(next.gi); setRound(next.ri); }
  };
  const totalEditor = data.games.flatMap((g) => g.rounds.flatMap((r) => [...r.played, ...r.reserves])).filter((q) => q.editor).length;
  const totalRows = data.games.flatMap((g) => g.rounds.flatMap((r) => [...r.played, ...r.reserves])).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Weekend of {t.week_key} <Badge variant="outline" className="ml-2 align-middle">{t.status}</Badge></h3>
          <p className="text-sm text-muted-foreground">
            {data.seeded ? `${totalRows} frozen rows · ${totalEditor} editor-authored · ${t.answers} answers so far` : 'Content not drawn yet (happens automatically before entry opens).'}
            {t.qualifier_starts_at && ` · qualifiers ${new Date(t.qualifier_starts_at).toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'short', hour: '2-digit', minute: '2-digit' })} GE`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {events.length > 1 && (
            <select aria-label="Weekend" value={t.id} onChange={(e) => { setLoading(true); setData(null); setError(null); setEventId(e.target.value); setGame(0); setRound(0); }}
              className="rounded-md border bg-background px-2 py-1 text-sm">
              {events.map((ev) => <option key={ev.id} value={ev.id}>Weekend of {ev.week_key}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={cn('mr-1 h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh</Button>
          <Button size="sm" onClick={reseed} disabled={!t.can_reseed || reseeding} title={t.can_reseed ? 'Draw fresh content from the pool (editor content first)' : 'Locked: play has started or the event is not in a reseedable state'}>
            {reseeding ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Shuffle className="mr-1 h-3.5 w-3.5" />} Re-draw from pool
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Saturday: Game 1 → Game 2 → Game 3 (the field is cut after each). Sunday: the Final. Every game plays the five rounds below in this order; reserves are only dealt if a question voids.</p>
      {!data.seeded ? null : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {data.games.map((g, i) => (
              <Button key={g.game_index} className="shrink-0" variant={i === game ? 'default' : 'outline'} size="sm" onClick={() => { setGame(i); setRound(0); }}>{GAME_LABEL[i] ?? `Game ${i + 1}`}</Button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
            <nav aria-label="Rounds in this game" className="rounded-xl border bg-muted/20 p-2 lg:self-start">
              <p id="wl-round-label" className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Choose a round</p>
              <select aria-labelledby="wl-round-label" value={round} onChange={(event) => setRound(Number(event.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm lg:hidden">
                {current?.rounds.map((item, ri) => <option key={item.kind} value={ri}>Round {ri + 1} · {WL_ROUND_KIND_LABEL[item.kind] ?? item.kind}</option>)}
              </select>
              <div className="hidden gap-1 lg:grid">
                {current?.rounds.map((item, ri) => {
                  const visible = item.played.filter((q) => !editorOnly || q.editor).length;
                  return (
                    <button key={item.kind} type="button" aria-current={ri === round ? 'step' : undefined} onClick={() => setRound(ri)}
                      className={cn('flex min-w-0 items-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        ri === round && 'bg-background font-semibold shadow-sm ring-1 ring-border')}>
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border text-xs tabular-nums', ri === round ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground')}>{ri + 1}</span>
                      <span className="min-w-0"><span className="block truncate text-sm">{WL_ROUND_KIND_LABEL[item.kind] ?? item.kind}</span><span className="block text-xs font-normal text-muted-foreground">{visible} main</span></span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {selectedRound && (
              <Card className="min-w-0 overflow-hidden">
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{GAME_LABEL[game] ?? `Game ${game + 1}`} · Round {round + 1} of {current.rounds.length}</p>
                      <h4 className="mt-1 text-lg font-semibold">{WL_ROUND_KIND_LABEL[selectedRound.kind] ?? selectedRound.kind}</h4>
                      <p className="text-sm text-muted-foreground">{mainQuestions.length} main questions · open a row to review its answer and translation</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => moveRound(-1)} disabled={locationIndex <= 0} aria-label="Previous round"><ChevronLeft className="size-4" /> Previous</Button>
                      <Button variant="outline" size="sm" onClick={() => moveRound(1)} disabled={locationIndex >= locations.length - 1} aria-label="Next round">Next <ChevronRight className="size-4" /></Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={editorOnly} onChange={(e) => setEditorOnly(e.target.checked)} /> Editor questions only</label>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={showReserves} onChange={(e) => setShowReserves(e.target.checked)} /> Show reserves ({reserveQuestions.length})</label>
                  </div>
                  {mainQuestions.length ? (
                    <ol className="space-y-2">
                      {selectedRound.played.map((q, i) => (!editorOnly || q.editor) && <QuestionCard key={`g${game}r${round}p${i}`} q={q} n={(q.question_index ?? i) + 1} />)}
                    </ol>
                  ) : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No {editorOnly ? 'editor' : 'main'} questions in this round.</p>}
                  {showReserves && reserveQuestions.length > 0 && (
                    <div className="space-y-2 border-t pt-4"><h5 className="text-sm font-semibold">Reserves <span className="font-normal text-muted-foreground">· used only if a question voids</span></h5>
                      <ol className="space-y-2">{selectedRound.reserves.map((q, i) => (!editorOnly || q.editor) && <QuestionCard key={`g${game}r${round}r${i}`} q={q} n={`R${q.reserve_ordinal}`} reserve />)}</ol>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function QuestionCard({ q, n, reserve = false }: { q: NextQuestion; n: number | string; reserve?: boolean }) {
  const preview = en(q.prompt) ||
    (q.clubs?.length ? q.clubs.map((club) => en(club.name)).join(' → ') : '') ||
    en(q.clues?.[0]) || en(q.answer) ||
    q.options?.slice(0, 2).map((option) => en(option.text)).join(' · ') || 'Question details';
  return (
    <li>
      <details className={cn('group rounded-lg border bg-background text-sm open:border-primary/30 open:shadow-sm', reserve && 'border-dashed')}>
        <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 marker:hidden hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">{n}</span>
          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{preview}</span><span className="mt-1 flex flex-wrap gap-1.5">
            {q.difficulty && <Badge variant="outline" className={cn('border', getDifficultyVariant(q.difficulty))}>{q.difficulty}</Badge>}
            <Badge variant="outline" className={q.editor ? 'border-blue-500 text-blue-700' : 'border-slate-300 text-slate-500'}>{q.editor ? 'editor' : 'pool'}</Badge>
            {q.batch && (
              <Badge variant="outline" className="border-violet-400 text-violet-700" title={q.batch.note ?? undefined}>
                {q.batch.kind === 'lineup' ? 'lineup upload' : 'pool upload'} · {new Date(q.batch.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Tbilisi' })}
              </Badge>
            )}
          </span></span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-2 border-t px-3 py-3 pl-13">
          {q.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.image_url} alt="" className="h-36 w-auto max-w-full rounded-md object-cover" loading="lazy" />
          )}
          {q.prompt && <p className="font-medium">{en(q.prompt)}<span className="block text-xs text-muted-foreground">{ka(q.prompt)}</span></p>}
          {q.clubs && (
            <div className="flex flex-wrap items-center gap-1.5">
              {q.clubs.map((c, i) => (
                <span key={i} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs', !c.logo_url && 'border-red-400 bg-red-50')}>
                  {c.logo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.logo_url} alt="" className="h-4 w-4 object-contain" />
                    : <span className="inline-block h-4 w-4 rounded-full bg-red-200 text-center text-[10px] leading-4 text-red-700">?</span>}
                  <span title={ka(c.name)}>{en(c.name)}</span>{i < q.clubs!.length - 1 ? ' →' : ''}
                </span>
              ))}
            </div>
          )}
          {q.clues && <ol className="space-y-1.5">{q.clues.map((c, i) => <li key={i}><span className="mr-1 text-xs font-semibold uppercase text-muted-foreground">Clue {i + 1}</span>{en(c)}<span className="block pl-12 text-xs text-muted-foreground">{ka(c)}</span></li>)}</ol>}
          {q.options && (
            <div className={cn('grid gap-1.5', q.kind === 'put_in_order' ? 'grid-cols-1' : 'sm:grid-cols-2')}>
              {q.options.map((o, i) => (
                <div key={o.id} className={cn('rounded-md border px-2 py-1 text-xs', o.correct ? 'border-green-500 bg-green-50 font-semibold' : 'bg-muted/40')}>
                  {q.kind === 'put_in_order' ? `${i + 1}. ` : `${String.fromCharCode(65 + i)}) `}{en(o.text)}<span className="block text-muted-foreground">{ka(o.text)}</span>
                </div>
              ))}
            </div>
          )}
          {q.answer && (q.kind === 'career_path' || q.kind === 'who_am_i' || q.kind === 'true_false') && (
            <p><span className="font-semibold">{en(q.answer)}</span><span className="block text-xs text-muted-foreground">{ka(q.answer)}</span>
              {q.accepted_answers && <span className="block text-xs text-muted-foreground">accepts: {q.accepted_answers.slice(0, 10).join(', ')}{q.accepted_answers.length > 10 ? '…' : ''}</span>}
            </p>
          )}
        </div>
      </details>
    </li>
  );
}
