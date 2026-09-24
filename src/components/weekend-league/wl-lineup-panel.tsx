'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CalendarCheck, CheckCircle2, Download, Eye, Loader2, Save } from 'lucide-react';
import type { components } from '@/types/wl-content.api.generated';
import { downloadText, rowSummary, takeSelectedFile, toWlQuestion, wlContentApi, type WlContentBatchDetail } from '@/lib/wl-content';
import {
  lineupTemplate,
  parseLineupFile,
  WL_GAME_NAMES,
  WL_LINEUP_ROUNDS,
  WL_LINEUP_SCOPES,
  wlGameDay,
  type LineupItem,
  type LineupProblem,
  type WlLineupScope,
} from '@/lib/wl-lineup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { QuestionCard, type NextQuestion } from './wl-next-event';
import { STATUS_LABEL, STATUS_STYLE } from './wl-upload-panel';

type LineupEvent = components['schemas']['WlLineupEventsResponse']['events'][number];
type Preview = components['schemas']['WlLineupPreviewResponse'];
type PreviewSlot = Preview['slots'][number];

const KIND_OF_ROUND = WL_LINEUP_ROUNDS.map((r) => r.kind);
const ROUND_LABEL: Record<string, string> = Object.fromEntries(WL_LINEUP_ROUNDS.map((r) => [r.kind, r.label]));

function weekendLabel(e: { week_key: string }): string {
  return `${wlGameDay(e.week_key, 0)} – ${wlGameDay(e.week_key, 3)}`;
}

export function WlLineupPanel({ onSaved, onOpenNext, onOpenBatches }: { onSaved?: () => void; onOpenNext?: (eventId: string) => void; onOpenBatches?: () => void }) {
  const [events, setEvents] = useState<LineupEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventId, setEventId] = useState<string>('');
  const [scope, setScope] = useState<WlLineupScope | ''>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<LineupItem[]>([]);
  const [problems, setProblems] = useState<LineupProblem[]>([]);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [force, setForce] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [batch, setBatch] = useState<WlContentBatchDetail | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<string>('');
  /** Bumped on every input change: a preview response for older inputs is dropped, never shown. */
  const revRef = useRef(0);

  const loadEvents = useCallback(async () => {
    try {
      const { data, error } = await wlContentApi.GET('/api/v1/admin/wl/content/lineup/events');
      if (!data) { setEventsError((error as { message?: string } | undefined)?.message ?? 'request failed'); return; }
      setEvents(data.events); setEventsError(null);
      const first = data.events.find((e) => e.editable);
      setEventId((cur) => cur || first?.id || '');
    } catch (err) { setEventsError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const event = events?.find((e) => e.id === eventId) ?? null;
  const scopeGames = WL_LINEUP_SCOPES.find((s) => s.value === scope)?.games ?? [];

  // An abandoned preview request also releases the busy state (its own finally ignores stale revisions).
  const reset = () => { revRef.current += 1; setPreview(null); setForce(new Set()); setRequestError(null); setBatch(null); setBusy((b) => (b === 'preview' ? null : b)); };
  const reparse = (text: string, games: readonly number[]) => {
    const parsed = parseLineupFile(text, games);
    setItems(parsed.items); setProblems(parsed.problems); reset();
  };
  const chooseScope = (value: WlLineupScope) => {
    setScope(value);
    if (textRef.current) reparse(textRef.current, WL_LINEUP_SCOPES.find((s) => s.value === value)!.games);
  };
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = takeSelectedFile(e.target);
    if (!file) return;
    const text = await file.text();
    textRef.current = text;
    setFileName(file.name);
    reparse(text, scopeGames);
  };

  const errors = problems.filter((p) => p.severity === 'error');
  const canPreview = Boolean(event?.editable && scope && fileName && items.length && !errors.length);

  const runPreview = async (forced: Set<number>) => {
    if (!event || !scope) return;
    const rev = ++revRef.current;
    setBusy('preview'); setRequestError(null);
    try {
      const { data, error } = await wlContentApi.POST('/api/v1/admin/wl/content/lineup/preview', {
        body: {
          tournament_id: event.id, scope, note: note || null,
          questions: items.map((i) => toWlQuestion(i.question)) as never,
          slots: items.map((i) => i.slot), lines: items.map((i) => i.line), force_indexes: [...forced],
        },
      });
      if (rev !== revRef.current) return;
      if (!data) { setRequestError((error as { message?: string } | undefined)?.message ?? 'The preview failed'); return; }
      setPreview(data); setForce(forced);
    } catch (err) { if (rev === revRef.current) setRequestError(err instanceof Error ? err.message : String(err)); } finally { if (rev === revRef.current) setBusy(null); }
  };

  const save = async () => {
    if (!preview?.preview_id) return;
    // Everything shown and confirmed comes from the preview itself, not from the pickers.
    const games = preview.games.map((g) => WL_GAME_NAMES[g]).join(', ');
    if (!window.confirm(`Save this lineup to ${weekendLabel(preview.event)}?\n\n${games} will be replaced exactly as previewed. Other games stay as they are.`)) return;
    setBusy('save'); setRequestError(null);
    try {
      const { data, error } = await wlContentApi.POST('/api/v1/admin/wl/content/lineup/save', { body: { preview_id: preview.preview_id } });
      if (!data) { setRequestError((error as { message?: string } | undefined)?.message ?? 'Saving failed'); setBusy(null); return; }
      toast.success(`Saving ${data.accepted} questions — this takes a minute (Georgian, photos)`);
      for (let i = 0; i < 360; i += 1) {
        const res = await wlContentApi.GET('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id: data.batch_id } } }).catch(() => null);
        if (res?.data) {
          setBatch(res.data);
          if (res.data.status !== 'processing') {
            if (res.data.status === 'done') { toast.success('Lineup saved'); onSaved?.(); void loadEvents(); } else toast.error('Nothing was scheduled — see the reason below');
            break;
          }
        } else if (res && res.response.status === 401) {
          setRequestError('Your session expired while saving. The save continues on the server — check Batches for the result.'); break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } catch (err) { setRequestError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  };

  if (eventsError && !events) return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>Could not load the weekends: {eventsError}. <button className="underline" onClick={() => void loadEvents()}>Retry</button> — if this persists, sign in again.</AlertDescription></Alert>;
  if (!events) return <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading weekends…</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        Upload the questions for chosen games of one weekend. You see exactly where every question will be played before anything is saved;
        games you don&apos;t choose stay exactly as they are. To add questions to the general pool instead, use <span className="font-semibold">Add to pool</span>.
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wl-lineup-event">1. Weekend</Label>
            <select id="wl-lineup-event" value={eventId} disabled={busy === 'save'} onChange={(e) => { setEventId(e.target.value); reset(); }}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              {!events.length && <option value="">No upcoming weekend yet</option>}
              {events.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.editable}>
                  {weekendLabel(e)}{e.editable ? '' : ` — ${e.reason}`}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {events.length ? 'Only weekends that exist and have not started can be changed.' : 'The next weekend appears here a day before its entries open (Sunday).'}
              {event && !event.editable && <span className="block text-red-700">{event.reason}</span>}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wl-lineup-scope">2. Games to upload</Label>
            <select id="wl-lineup-scope" value={scope} disabled={busy === 'save'} onChange={(e) => chooseScope(e.target.value as WlLineupScope)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm">
              <option value="" disabled>Choose…</option>
              {WL_LINEUP_SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            {event && scope && (
              <p className="text-xs text-muted-foreground">
                Replaces {scopeGames.map((g) => `${WL_GAME_NAMES[g]} (${wlGameDay(event.week_key, g)})`).join(', ')}.
                {scopeGames.length < 4 && ` Keeps ${[0, 1, 2, 3].filter((g) => !scopeGames.includes(g)).map((g) => WL_GAME_NAMES[g]).join(', ')}.`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">3. Question file (.txt)</h4>
            <div className="flex flex-wrap gap-2">
              {(['game_0', 'saturday', 'weekend'] as const).map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => { const tpl = lineupTemplate(s === 'game_0' && scope && scope.startsWith('game_') ? scope : s); downloadText(tpl.filename, tpl.text); }}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Template: {s === 'game_0' ? 'one game' : s === 'saturday' ? 'Saturday' : 'full weekend'}
                </Button>
              ))}
            </div>
          </div>
          <details className="rounded-md border bg-muted/30 p-3 text-sm">
            <summary className="cursor-pointer font-medium">How to write the file</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Start each game with a heading: <code>=== SATURDAY GAME 1 ===</code>, <code>=== SATURDAY GAME 2 ===</code>, <code>=== SATURDAY GAME 3 ===</code> or <code>=== SUNDAY FINAL ===</code>. The file must contain exactly the games you chose above.</li>
              <li>Inside each game, one heading per round, in any order: <code>--- Round 1: True or False ---</code> (5), <code>--- Round 2: Put in order ---</code> (5), <code>--- Round 3: Photo ---</code> (5), <code>--- Round 4: Career path ---</code> (5), <code>--- Round 5: Who am I ---</code> (1).</li>
              <li>Questions play in the order you write them. Each question uses the same format as the one-type uploader and ends with a <code>Difficulty:</code> line.</li>
              <li>Optional reserves: <code>--- Reserves: Career path ---</code> with up to 2 questions. A reserve is played only if a question of that round type has to be replayed. Reserves you leave out are taken from the pool and shown in the preview.</li>
              <li>Lines starting with <code>#</code> are ignored. The date and games come from the choices above, never from the file name.</li>
            </ul>
          </details>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Input ref={fileRef} type="file" accept=".txt" aria-label="Lineup file" onChange={(e) => void handleFile(e)} disabled={!scope || busy !== null} />
              {!scope && <p className="text-xs text-muted-foreground">Choose the games first.</p>}
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional), e.g. Derby week" maxLength={400} aria-label="Note" />
          </div>
          {fileName && !errors.length && items.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-4 w-4" /> {fileName}: {items.length} questions for {scopeGames.map((g) => WL_GAME_NAMES[g]).join(', ')}.</p>
          )}
          {problems.length > 0 && <ProblemList title={`${errors.length} problem${errors.length === 1 ? '' : 's'} in ${fileName ?? 'the file'} — fix ${errors.length === 1 ? 'it' : 'them'} and choose the file again`} rows={problems.map((p) => ({ line: p.line, where: p.where, message: p.message }))} />}
          <div className="flex items-center gap-3">
            <Button onClick={() => void runPreview(force)} disabled={!canPreview || busy !== null}>
              {busy === 'preview' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Eye className="mr-1 h-4 w-4" />} Check &amp; preview
            </Button>
            {busy === 'preview' && <span className="text-sm text-muted-foreground">Checking duplicates, photos and the pool…</span>}
          </div>
        </CardContent>
      </Card>

      {requestError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{requestError}</AlertDescription></Alert>}

      {preview && (
        <LineupPreview preview={preview} event={preview.event} items={items} force={force}
          onToggleForce={(i) => { revRef.current += 1; const next = new Set(force); if (next.has(i)) next.delete(i); else next.add(i); setForce(next); setPreview({ ...preview, preview_id: null }); }}
          onRefresh={() => void runPreview(force)} busy={busy} onSave={() => void save()} />
      )}

      {batch && <SaveResult batch={batch} onOpenNext={() => event && onOpenNext?.(event.id)} onOpenBatches={onOpenBatches} />}
    </div>
  );
}

function ProblemList({ title, rows }: { title: string; rows: Array<{ line: number | null; where: string; message: string }> }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <p className="mb-2 font-medium">{title}</p>
        <div className="max-h-72 overflow-auto rounded border border-red-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-red-50 text-red-900"><tr><th className="px-2 py-1">Line</th><th className="px-2 py-1">Where</th><th className="px-2 py-1">Problem</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-red-100 align-top"><td className="px-2 py-1 tabular-nums">{r.line ?? '—'}</td><td className="px-2 py-1">{r.where}</td><td className="px-2 py-1">{r.message}</td></tr>)}</tbody>
          </table>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function LineupPreview({ preview, event, items, force, onToggleForce, onRefresh, onSave, busy }: {
  preview: Preview; event: { week_key: string }; items: LineupItem[]; force: Set<number>;
  onToggleForce: (i: number) => void; onRefresh: () => void; onSave: () => void; busy: 'preview' | 'save' | null;
}) {
  const [game, setGame] = useState(preview.games[0] ?? 0);
  const shownGame = preview.games.includes(game) ? game : preview.games[0]!;
  const pool = preview.slots.filter((s) => s.origin === 'pool');
  const decisionsPending = preview.undecided.filter((i) => !force.has(i)).length;
  const stale = !preview.preview_id && !preview.problems.length && decisionsPending === 0;
  const rowReport = (i: number) => preview.checks.rows[i];
  const lineOf = (i: number | null) => (i === null ? null : items[i]?.line ?? null);

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview — nothing is saved yet</p>
            <h3 className="text-lg font-semibold">{weekendLabel(event)} · {preview.games.map((g) => WL_GAME_NAMES[g]).join(', ')}</h3>
            <p className="text-sm text-muted-foreground">
              {items.length} uploaded question{items.length === 1 ? '' : 's'} · {pool.length} reserve{pool.length === 1 ? '' : 's'} from the pool
              {preview.kept_games.length > 0 && ` · unchanged: ${preview.kept_games.map((g) => WL_GAME_NAMES[g]).join(', ')}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button onClick={onSave} disabled={!preview.preview_id || busy !== null}>
              {busy === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Save to {weekendLabel(event)}
            </Button>
            <span className="text-xs text-muted-foreground">
              {preview.preview_id ? `Georgian is written and photos are copied when you save. If anything fails, nothing changes. Preview valid until ${new Date(preview.expires_at!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tbilisi' })}.`
                : decisionsPending ? `${decisionsPending} flagged question${decisionsPending === 1 ? '' : 's'} need a decision below.`
                : stale ? 'You changed a decision — update the preview.' : 'Fix the problems below first.'}
            </span>
            {(stale || (decisionsPending === 0 && preview.undecided.length > 0 && !preview.preview_id)) && <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy !== null}>Update preview</Button>}
          </div>
        </div>

        {preview.problems.length > 0 && (
          <ProblemList title={`${preview.problems.length} problem${preview.problems.length === 1 ? '' : 's'} — this lineup can't be saved yet`}
            rows={preview.problems.map((p) => ({ line: lineOf(p.row_index), where: p.where, message: p.message }))} />
        )}

        <div className="flex flex-wrap gap-2">
          {preview.games.map((g) => (
            <Button key={g} size="sm" variant={g === shownGame ? 'default' : 'outline'} onClick={() => setGame(g)}>
              {WL_GAME_NAMES[g]} · {wlGameDay(event.week_key, g)}
            </Button>
          ))}
        </div>

        <GamePreview g={shownGame} preview={preview} items={items} force={force} onToggleForce={onToggleForce} rowReport={rowReport} />
      </CardContent>
    </Card>
  );
}

function GamePreview({ g, preview, items, force, onToggleForce, rowReport }: {
  g: number; preview: Preview; items: LineupItem[]; force: Set<number>; onToggleForce: (i: number) => void;
  rowReport: (i: number) => Preview['checks']['rows'][number] | undefined;
}) {
  const slots = preview.slots.filter((s) => s.game_index === g);
  const replaced = preview.replaced.find((r) => r.game_index === g)?.rows ?? [];
  return (
    <div className="space-y-4">
      {WL_LINEUP_ROUNDS.map((round) => {
        const main = slots.filter((s) => s.reserve_ordinal === 0 && s.round_index === round.index).sort((a, b) => (a.question_index ?? 0) - (b.question_index ?? 0));
        const reserves = slots.filter((s) => s.reserve_ordinal > 0 && s.kind === round.kind).sort((a, b) => a.reserve_ordinal - b.reserve_ordinal);
        return (
          <section key={round.index} className="rounded-lg border">
            <h4 className="border-b bg-muted/40 px-3 py-2 text-sm font-semibold">Round {round.index + 1} · {round.label}</h4>
            <ol className="divide-y">
              {main.map((s) => <SlotRow key={`m${s.question_index}`} slot={s} label={`Q${(s.question_index ?? 0) + 1}`} items={items} force={force} onToggleForce={onToggleForce} rowReport={rowReport} />)}
              {reserves.map((s) => <SlotRow key={`r${s.reserve_ordinal}`} slot={s} label={`Reserve ${s.reserve_ordinal}`} items={items} force={force} onToggleForce={onToggleForce} rowReport={rowReport} />)}
            </ol>
          </section>
        );
      })}
      <details className="rounded-lg border border-amber-300 bg-amber-50/50 p-3">
        <summary className="cursor-pointer text-sm font-semibold">This replaces {replaced.length} questions currently scheduled for {WL_GAME_NAMES[g]}</summary>
        <ol className="mt-3 space-y-2">
          {replaced.map((q, i) => {
            const nq = q as unknown as NextQuestion;
            return <QuestionCard key={i} q={nq} n={nq.reserve_ordinal > 0 ? `R${nq.reserve_ordinal}` : `${KIND_OF_ROUND.indexOf(nq.kind) + 1}.${(nq.question_index ?? 0) + 1}`} reserve={nq.reserve_ordinal > 0} />;
          })}
        </ol>
      </details>
    </div>
  );
}

function SlotRow({ slot, label, items, force, onToggleForce, rowReport }: {
  slot: PreviewSlot; label: string; items: LineupItem[]; force: Set<number>; onToggleForce: (i: number) => void;
  rowReport: (i: number) => Preview['checks']['rows'][number] | undefined;
}) {
  if (slot.origin === 'pool') {
    const q = slot.view as unknown as NextQuestion;
    return (
      <li className="px-3 py-2">
        <div className="mb-1 flex items-center gap-2 text-xs"><span className="font-semibold">{label}</span><Badge variant="outline" className="border-violet-400 text-violet-700">From the pool</Badge><span className="text-muted-foreground">{ROUND_LABEL[slot.kind]}</span></div>
        <ol><QuestionCard q={q} n={label.replace('Reserve ', 'R')} reserve /></ol>
      </li>
    );
  }
  const i = slot.row_index!;
  const item = items[i];
  const report = rowReport(i);
  const flagged = report && (report.status === 'duplicate' || report.status === 'played');
  const photo = item?.question.kind === 'mcq_single' ? item.question.imageUrl : undefined;
  return (
    <li className="flex items-start gap-3 px-3 py-2 text-sm">
      <span className="w-20 shrink-0 text-xs font-semibold">{label}{slot.reserve_ordinal > 0 && <Badge variant="outline" className="ml-1 border-blue-400 text-blue-700">Uploaded</Badge>}</span>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-12 w-16 shrink-0 rounded object-cover" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        {item ? (
          <details className="group">
            <summary className="cursor-pointer list-none break-words marker:hidden [&::-webkit-details-marker]:hidden">{rowSummary(item.question)} <span className="text-xs text-primary group-open:hidden">show answers</span></summary>
            <UploadedAnswers item={item} crests={report?.crests ?? []} />
          </details>
        ) : '—'}
        <p className="text-xs text-muted-foreground">line {item?.line ?? '—'} · {item?.question.difficulty}</p>
        {report?.issues.filter((x) => x.severity === 'warning' || x.severity === 'error').map((x, k) => (
          <p key={k} className={cn('text-xs', x.severity === 'error' ? 'text-red-700' : 'text-amber-700')}>{x.message}</p>
        ))}
        {flagged && (
          <label className="mt-1 flex items-center gap-2 text-xs">
            <Checkbox checked={force.has(i)} onCheckedChange={() => onToggleForce(i)} />
            Use anyway ({report.status === 'played' ? `played before${report.duplicate_of?.week_key ? ` on ${report.duplicate_of.week_key}` : ''}` : `already in the ${report.duplicate_of?.where ?? 'pool'}`})
          </label>
        )}
      </div>
      {report && <Badge variant="outline" className={cn('shrink-0', STATUS_STYLE[report.status])}>{STATUS_LABEL[report.status]}</Badge>}
    </li>
  );
}

function SaveResult({ batch, onOpenNext, onOpenBatches }: { batch: WlContentBatchDetail; onOpenNext: () => void; onOpenBatches?: () => void }) {
  const done = batch.counts.published;
  if (batch.status === 'processing') {
    const prepared = batch.rows.filter((r) => r.state === 'translated' || r.state === 'created').length;
    return <Alert><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>Saving… {prepared} of {batch.rows.length} questions prepared (Georgian, photos). The weekend changes only when every question is ready.</AlertDescription></Alert>;
  }
  if (batch.status === 'done' && batch.lineup) {
    const pool = batch.lineup.slots.filter((s) => s.origin === 'pool').length;
    return (
      <Alert className="border-green-600 bg-green-50">
        <CalendarCheck className="h-4 w-4" />
        <AlertDescription className="space-y-2">
          <p className="font-semibold">Saved to {wlGameDay(batch.lineup.week_key, 0)}: {batch.lineup.games.map((g) => WL_GAME_NAMES[g]).join(', ')} now play{batch.lineup.games.length === 1 ? 's' : ''} your {done} questions{pool ? ` plus ${pool} reserves from the pool` : ''}.</p>
          <div className="flex gap-2"><Button size="sm" variant="outline" onClick={onOpenNext}>Open Next weekend</Button>{onOpenBatches && <Button size="sm" variant="outline" onClick={onOpenBatches}>Open Batches</Button>}</div>
        </AlertDescription>
      </Alert>
    );
  }
  const failed = batch.rows.filter((r) => r.error);
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="space-y-1">
        <p className="font-semibold">{batch.error ?? 'Nothing was scheduled.'}</p>
        {failed.slice(0, 12).map((r) => <p key={r.row_index} className="text-sm">{r.summary.split(':')[0]}: {r.error}</p>)}
        <p className="text-sm">The weekend was not changed. Fix the file and preview again.</p>
      </AlertDescription>
    </Alert>
  );
}

/** The uploaded question in full — options with the key, the ordered answer, clues, clubs with crests — so a wrong star or order is caught before saving. */
function UploadedAnswers({ item, crests }: { item: LineupItem; crests: Array<{ club: string; logo_url: string | null }> }) {
  const q = item.question;
  return (
    <div className="mt-1 space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
      {q.kind === 'true_false' && <p>Answer: <span className="font-semibold">{q.answer ? 'True' : 'False'}</span></p>}
      {q.kind === 'mcq_single' && (
        <div className="grid gap-1 sm:grid-cols-2">
          {q.options.map((o) => <span key={o.letter} className={cn('rounded border px-2 py-0.5', o.is_correct ? 'border-green-500 bg-green-50 font-semibold' : 'bg-background')}>{o.letter}) {o.text}</span>)}
        </div>
      )}
      {q.kind === 'put_in_order' && <ol className="list-decimal pl-5">{q.orderedAnswer.map((a) => <li key={a}>{a}</li>)}</ol>}
      {q.kind === 'career_path' && (
        <>
          <p className="flex flex-wrap items-center gap-1">
            {q.clubs.map((club, k) => {
              const logo = crests.find((c) => c.club === club)?.logo_url;
              return (
                <span key={k} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5', !logo && 'border-red-400 bg-red-50')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo ? <img src={logo} alt="" className="h-3.5 w-3.5 object-contain" /> : <span className="text-red-700">?</span>}{club}{k < q.clubs.length - 1 ? ' →' : ''}
                </span>
              );
            })}
          </p>
          <p>Answer: <span className="font-semibold">{q.displayAnswer}</span>{q.acceptedAnswers.length > 0 && <span className="text-muted-foreground"> · also accepts {q.acceptedAnswers.join(', ')}</span>}</p>
        </>
      )}
      {q.kind === 'clue_chain' && (
        <>
          <ol className="space-y-0.5">{q.clues.map((c, k) => <li key={k}><span className="font-semibold text-muted-foreground">Clue {k + 1}:</span> {c}</li>)}</ol>
          <p>Answer: <span className="font-semibold">{q.displayAnswer}</span>{q.acceptedAnswers.length > 0 && <span className="text-muted-foreground"> · also accepts {q.acceptedAnswers.join(', ')}</span>}</p>
        </>
      )}
    </div>
  );
}
