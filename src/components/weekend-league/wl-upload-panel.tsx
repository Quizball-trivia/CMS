'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, Copy, Download, Eye, Loader2, Upload } from 'lucide-react';
import type { ParsedBulkQuestion, ParseError } from '@/lib/parsers/question-parser';
import {
  WL_FORMAT_EXAMPLES,
  WL_FORMAT_NOTES,
  WL_KINDS,
  downloadText,
  parseWlFile,
  rowSummary,
  takeSelectedFile,
  toWlQuestion,
  wlContentApi,
  type WlContentBatchDetail,
  type WlContentKind,
  type WlContentRowReport,
} from '@/lib/wl-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getDifficultyVariant } from '@/components/ui/difficulty-signal';
import { QuestionImagePreview } from '@/components/questions/question-image-preview';

type Row = { id: string; parsed: ParsedBulkQuestion; selected: boolean; report?: WlContentRowReport };

/** Errors (bad shape, dead photo) block publishing regardless of the displayed status; duplicates may be forced. */
const isBlocked = (r: Row) => Boolean(r.report && (r.report.status === 'error' || r.report.issues.some((i) => i.severity === 'error')));

export const STATUS_STYLE: Record<WlContentRowReport['status'], string> = {
  ready: 'border-green-600 text-green-700',
  warning: 'border-amber-500 text-amber-700',
  duplicate: 'border-red-500 text-red-700',
  played: 'border-red-600 bg-red-50 text-red-800',
  error: 'border-red-600 bg-red-50 text-red-800',
};
export const STATUS_LABEL: Record<WlContentRowReport['status'], string> = {
  ready: 'Ready', warning: 'Check', duplicate: 'Duplicate', played: 'Played before', error: 'Needs fix',
};

function describeStaging(result: WlContentBatchDetail['result']): string {
  const staging = result && typeof result === 'object' ? (result as { staging?: unknown }).staging : null;
  if (!staging || typeof staging !== 'object') return '';
  const s = staging as { error?: string; inserted_questions?: number; already_present?: number };
  if (s.error) return ` · staging copy failed: ${s.error}`;
  return ` · copied to staging: ${s.inserted_questions ?? 0}${s.already_present ? ` (${s.already_present} already there)` : ''}`;
}

export function WlUploadPanel({ onPublished, onOpenBatches }: { onPublished?: (batchId: string) => void; onOpenBatches?: () => void }) {
  const [kind, setKind] = useState<WlContentKind>('true_false');
  const [rows, setRows] = useState<Row[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [syncToStaging, setSyncToStaging] = useState(true);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<number | null>(null);
  const [batch, setBatch] = useState<WlContentBatchDetail | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; batchId: string | null } | null>(null);
  const [stagingConfigured, setStagingConfigured] = useState<boolean | null>(null);
  const lastFile = useRef<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Every upload gets a ticket; a pool-check response whose ticket is stale
  // (round type changed, file cleared, new file chosen) is dropped — otherwise
  // the previous file could reappear under the new round type and be published.
  const uploadTicket = useRef(0);

  const reset = () => { uploadTicket.current += 1; setRows([]); setParseErrors([]); setBatch(null); setChecking(false); setCheckError(null); setPublishError(null); lastFile.current = null; if (fileRef.current) fileRef.current.value = ''; };
  const changeKind = (next: WlContentKind) => { setKind(next); reset(); };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = takeSelectedFile(event.target);
    if (!file) return;
    if (!/\.(txt|md)$/i.test(file.name)) { toast.error('Upload a .txt file'); return; }
    lastFile.current = file;
    await processFile(file);
  };

  const processFile = async (file: File) => {
    const ticket = ++uploadTicket.current;
    const content = await file.text();
    if (ticket !== uploadTicket.current) return;
    const result = parseWlFile(content, kind);
    setParseErrors(result.errors);
    setBatch(null);
    setCheckError(null);
    setPublishError(null);
    if (result.questions.length === 0) { setRows([]); toast.error('No questions could be parsed — check the format below'); return; }
    const next: Row[] = result.questions.map((q, i) => ({ id: `${q.questionNumber}-${q.lineNumber}-${i}`, parsed: q, selected: true }));
    setRows(next);
    setChecking(true);
    try {
      const { data, error } = await wlContentApi.POST('/api/v1/admin/wl/content/check', {
        body: { questions: next.map((r) => toWlQuestion(r.parsed)) },
      });
      if (error || !data) throw new Error((error as { message?: string } | undefined)?.message ?? 'check failed');
      if (ticket !== uploadTicket.current) return; // superseded — do not resurrect the old file
      setStagingConfigured(data.staging_configured);
      if (!data.staging_configured) setSyncToStaging(false);
      setRows(next.map((r, i) => {
        const report = data.rows[i];
        const unselected = report?.status === 'duplicate' || report?.status === 'played' || report?.status === 'error' || Boolean(report?.issues.some((i) => i.severity === 'error'));
        return { ...r, report, selected: !unselected };
      }));
      const s = data.summary;
      toast[s.error || s.played || s.duplicate ? 'warning' : 'success'](
        `${result.questions.length} parsed · ${s.ready} ready · ${s.warning} to check · ${s.duplicate + s.played} already used · ${s.error} need fixing`
      );
    } catch (err) {
      if (ticket !== uploadTicket.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setCheckError(message);
      toast.error(`Could not check against the pool: ${message}`);
    } finally {
      if (ticket === uploadTicket.current) setChecking(false);
    }
  };

  const publish = async () => {
    const selected = rows.filter((r) => r.selected);
    if (!selected.length) { toast.error('Nothing selected'); return; }
    if (selected.some((r) => !r.report)) { toast.error('The pool check did not complete — re-upload the file before publishing'); return; }
    if (selected.some((r) => r.parsed.kind !== kind)) { toast.error('These rows were parsed for a different round type — re-upload the file'); return; }
    if (selected.some(isBlocked)) { toast.error('Fix the rows marked "Needs fix" (or with an image error) in the file and re-upload'); return; }
    setPublishing(true);
    try {
      const questions = selected.map((r) => toWlQuestion(r.parsed));
      const force = selected.map((r, i) => (r.report?.status === 'duplicate' || r.report?.status === 'played' ? i : -1)).filter((i) => i >= 0);
      const { data, error } = await wlContentApi.POST('/api/v1/admin/wl/content/import', {
        body: { kind, note: note || undefined, sync_to_staging: syncToStaging, force_indexes: force, questions },
      });
      if (error || !data) throw new Error((error as { message?: string } | undefined)?.message ?? 'import refused');
      toast.success(`Batch accepted — publishing ${data.accepted} question${data.accepted === 1 ? '' : 's'}…`);
      setPublishError(null);
      // Poll until the background job settles. The job runs on the server: if
      // polling fails (session expired, network) we stop and say so — the
      // batch keeps going and shows up under Batches.
      let failures = 0;
      for (let i = 0; i < 600; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await wlContentApi.GET('/api/v1/admin/wl/content/batches/{id}', { params: { path: { id: data.batch_id } } }).catch((e: unknown) => ({ data: undefined, error: { message: e instanceof Error ? e.message : String(e) } }));
        if (res.data) {
          failures = 0;
          setBatch(res.data);
          if (res.data.status !== 'processing') break;
          continue;
        }
        failures += 1;
        const message = (res.error as { message?: string } | undefined)?.message ?? 'request failed';
        if (/auth|token|401/i.test(message) || failures >= 3) {
          setPublishError({ message: /auth|token|401/i.test(message) ? 'Your session expired while publishing.' : `Lost contact with the server while publishing (${message}).`, batchId: data.batch_id });
          break;
        }
      }
      onPublished?.(data.batch_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPublishError({ message: `Publish request failed: ${message}`, batchId: null });
      toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const selectedCount = rows.filter((r) => r.selected).length;
  const errorCount = parseErrors.filter((e) => e.severity === 'error').length;
  const example = WL_FORMAT_EXAMPLES[kind];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <span className="font-semibold">How a weekend is built:</span> Saturday has 3 games and Sunday 1 final. Every game plays the same 5 rounds in order —
        True/False (5) → Put in order (5) → Photo (5) → Career path (5) → Who am I? (1) — drawn automatically from the pool, editor questions first.
        Upload questions here by type; then open <span className="font-semibold">Next weekend</span> to see exactly what each game will play, or press <span className="font-semibold">Re-draw from pool</span> there.
      </div>
      <div className="grid gap-4 md:grid-cols-[260px_1fr_1fr]">
        <div className="space-y-2">
          <Label>Question type</Label>
          <Select value={kind} onValueChange={changeKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WL_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label} <span className="text-muted-foreground">· {k.round}, {k.perGame}</span></SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Uploads go into the pool for this type — not to a specific day.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-file">Question file (.txt)</Label>
          <Input id="wl-file" ref={fileRef} type="file" accept=".txt,.md" onChange={handleFile} disabled={checking || publishing} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wl-note">Batch note (optional)</Label>
          <Input id="wl-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sep 26 batch, Serie A week" maxLength={400} />
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold">Format — {WL_KINDS.find((k) => k.value === kind)?.label} <span className="font-normal text-muted-foreground">(one weekend uses {WL_KINDS.find((k) => k.value === kind)?.perEvent}, reserves included)</span></h4>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(example).then(() => toast.success('Example copied'), () => toast.error('Could not copy — use Download template')); }}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy example
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadText(`wl-${kind}-template.txt`, example)}>
                <Download className="mr-1 h-3.5 w-3.5" /> Download template
              </Button>
            </div>
          </div>
          <pre className="rounded-lg border bg-muted p-3 text-xs overflow-x-auto">{example}</pre>
          <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-1">
            {WL_FORMAT_NOTES[kind].map((n) => <li key={n}>{n}</li>)}
          </ul>
        </CardContent>
      </Card>

      {parseErrors.length > 0 && (
        <Alert variant={errorCount ? 'destructive' : 'default'} className={cn(!errorCount && 'border-amber-500 bg-amber-50')}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-1">{parseErrors.length} parse issue{parseErrors.length === 1 ? '' : 's'} — these blocks were skipped</p>
            <ul className="list-disc pl-5 text-sm space-y-0.5">
              {parseErrors.slice(0, 8).map((e, i) => <li key={i}>Line {e.lineNumber}{e.questionNumber ? ` (question ${e.questionNumber})` : ''}: {e.message}</li>)}
              {parseErrors.length > 8 && <li>…and {parseErrors.length - 8} more</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {checkError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>The pool check failed: {checkError}. Nothing can be published until it succeeds{/auth|token|401/i.test(checkError) ? ' — sign in again, then retry' : ''}.</span>
            <Button variant="outline" size="sm" disabled={checking || !lastFile.current} onClick={() => { if (lastFile.current) void processFile(lastFile.current); }}>Retry check</Button>
          </AlertDescription>
        </Alert>
      )}

      {publishError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{publishError.message}{publishError.batchId ? ' The batch is still being processed on the server — check its result under Batches.' : ''}</span>
            {publishError.batchId && <Button variant="outline" size="sm" onClick={() => onOpenBatches?.()}>Open Batches</Button>}
          </AlertDescription>
        </Alert>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-semibold">{selectedCount}</span> of {rows.length} selected to publish
              {checking && <span className="ml-2 inline-flex items-center text-muted-foreground"><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> checking against the pool and past events…</span>}
            </div>
            <label className={cn('flex items-center gap-2 text-sm', stagingConfigured === false && 'text-muted-foreground')} title={stagingConfigured === false ? 'This backend has no staging database configured' : undefined}>
              <Checkbox checked={syncToStaging} disabled={stagingConfigured === false} onCheckedChange={(c) => setSyncToStaging(Boolean(c))} />
              Also copy to staging{stagingConfigured === false ? ' (not available on this server)' : ''}
            </label>
          </div>

          <div className="rounded-lg border max-h-[520px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={(() => {
                        const selectable = rows.filter((r) => !isBlocked(r));
                        if (!selectable.length || !selectable.some((r) => r.selected)) return false;
                        return selectable.every((r) => r.selected) ? true : 'indeterminate';
                      })()}
                      onCheckedChange={(c) => setRows((prev) => prev.map((r) => ({ ...r, selected: c === true && !isBlocked(r) })))}
                    />
                  </TableHead>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead className="w-24">Difficulty</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id} className={cn('cursor-pointer hover:bg-muted/50', !r.selected && 'opacity-50')} onClick={() => setPreview(i)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={r.selected}
                        disabled={isBlocked(r)}
                        onCheckedChange={(c) => setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, selected: c === true } : x)))}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.parsed.questionNumber}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="flex items-center gap-2">
                        {r.parsed.kind === 'mcq_single' && r.parsed.imageUrl && (
                          <QuestionImagePreview src={r.parsed.imageUrl} alt="" compact className="h-10 w-14 shrink-0 overflow-hidden rounded" />
                        )}
                        <span className="truncate">{rowSummary(r.parsed)}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={cn('border', getDifficultyVariant(r.parsed.difficulty))}>{r.parsed.difficulty}</Badge></TableCell>
                    <TableCell>
                      {r.report ? <Badge variant="outline" className={STATUS_STYLE[r.report.status]}>{STATUS_LABEL[r.report.status]}</Badge>
                        : checking ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.report?.duplicate_of && (
                        <div>{r.report.duplicate_of.where === 'history' ? `Dealt ${r.report.duplicate_of.played ? 'and played' : '(reserve)'} on ${r.report.duplicate_of.week_key ?? '?'}` : r.report.duplicate_of.where === 'batch' ? 'Repeated in this file' : r.report.duplicate_of.where === 'public' ? 'Already in the public question bank (events can draw it too)' : `Already in the WL pool (${r.report.duplicate_of.status})`}</div>
                      )}
                      {r.report?.issues.slice(0, 3).map((iss) => <div key={iss.code + iss.message}>{iss.message}</div>)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button variant="outline" size="sm" onClick={() => setPreview(i)}><Eye className="mr-1 h-3.5 w-3.5" /> Preview</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={reset} disabled={publishing}>Clear</Button>
            <Button onClick={publish} disabled={publishing || checking || selectedCount === 0 || rows.some((r) => !r.report) || rows.some((r) => r.selected && isBlocked(r))}>
              {publishing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Publishing…</> : <><Upload className="mr-2 h-4 w-4" /> Publish {selectedCount} to the WL pool</>}
            </Button>
          </div>
        </div>
      )}

      {batch && (
        <Alert className={cn(batch.status === 'done' && !batch.counts.failed ? 'border-green-600 bg-green-50' : 'border-amber-500 bg-amber-50')}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            <p className="font-semibold">
              {batch.status === 'processing' ? 'Publishing…' : `Batch ${batch.status}`}: {batch.counts.published} published
              {batch.counts.failed ? `, ${batch.counts.failed} left as draft` : ''}
              {describeStaging(batch.result)}
            </p>
            {batch.rows.filter((r) => r.state === 'failed').map((r) => (
              <p key={r.row_index} className="text-sm">Row {r.row_index + 1} ({r.summary.slice(0, 60)}): {r.error}</p>
            ))}
            {batch.status !== 'processing' && batch.counts.published > 0 && (
              <p className="mt-1 text-sm">
                These questions are in the pool — not scheduled yet. The draw fills each weekend from the pool;
                to put this batch into the coming weekend now, open it in{' '}
                {onOpenBatches ? <button type="button" className="underline" onClick={onOpenBatches}>Batches</button> : 'Batches'}{' '}
                and press <strong>Use in next weekend</strong>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {preview !== null && rows[preview] && (
        <RowPreview row={rows[preview]} index={preview} total={rows.length} onClose={() => setPreview(null)} onNavigate={setPreview} />
      )}
    </div>
  );
}

function RowPreview({ row, index, total, onClose, onNavigate }: { row: Row; index: number; total: number; onClose: () => void; onNavigate: (i: number) => void }) {
  const q = row.parsed;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < total - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total, onNavigate]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-[min(92vw,720px)] max-w-none overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-6">
            <span>Question {q.questionNumber}</span>
            <span className="text-sm font-normal text-muted-foreground">{index + 1} / {total} · ← →</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={cn('border', getDifficultyVariant(q.difficulty))}>{q.difficulty}</Badge>
            {row.report && <Badge variant="outline" className={STATUS_STYLE[row.report.status]}>{STATUS_LABEL[row.report.status]}</Badge>}
          </div>
          {q.kind === 'mcq_single' && (
            <>
              {q.imageUrl && <QuestionImagePreview src={q.imageUrl} alt="" sourceUrl={q.imageUrl} />}
              <p className="font-medium">{q.prompt}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <div key={i} className={cn('rounded-lg border p-2', o.is_correct ? 'border-green-500 bg-green-50 font-semibold' : 'bg-muted/40')}>
                    {String.fromCharCode(65 + i)}) {o.text}
                  </div>
                ))}
              </div>
              {row.report?.image && !row.report.image.ok && <p className="text-red-700">Image: {row.report.image.reason}</p>}
              {row.report?.image?.ok && <p className="text-muted-foreground">Image {row.report.image.width}×{row.report.image.height}, {Math.round((row.report.image.bytes ?? 0) / 1024)} KB</p>}
            </>
          )}
          {q.kind === 'true_false' && (<><p className="font-medium">{q.prompt}</p><Badge className={q.answer ? 'bg-green-600' : 'bg-red-600'}>{q.answer ? 'TRUE' : 'FALSE'}</Badge></>)}
          {q.kind === 'put_in_order' && (
            <>
              <p className="font-medium">{q.prompt}</p>
              <ol className="list-decimal pl-5 space-y-1">{q.orderedAnswer.map((it) => <li key={it}>{it}</li>)}</ol>
            </>
          )}
          {q.kind === 'career_path' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {q.clubs.map((club, i) => {
                  const crest = row.report?.crests.find((c) => c.club === club);
                  return (
                    <span key={`${club}-${i}`} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs', crest && !crest.club_id && 'border-red-400 bg-red-50')}>
                      {crest?.logo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={crest.logo_url} alt="" className="h-4 w-4 object-contain" />
                        : <span className="inline-block h-4 w-4 rounded-full bg-red-200 text-center text-[10px] leading-4 text-red-700">?</span>}
                      {club}{i < q.clubs.length - 1 ? ' →' : ''}
                    </span>
                  );
                })}
              </div>
              <p><span className="font-semibold">{q.displayAnswer}</span> <span className="text-muted-foreground">accepts: {q.acceptedAnswers.join(', ')} (+ surname, first name, Georgian forms on publish)</span></p>
            </>
          )}
          {q.kind === 'clue_chain' && (
            <>
              <ol className="space-y-1.5">{q.clues.map((c, i) => <li key={i} className="rounded-lg border bg-muted/40 p-2"><span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">Clue {i + 1}</span>{c}</li>)}</ol>
              <p><span className="font-semibold">{q.displayAnswer}</span> <span className="text-muted-foreground">accepts: {q.acceptedAnswers.join(', ')}</span></p>
            </>
          )}
          {row.report && row.report.issues.length > 0 && (
            <Alert variant={row.report.status === 'error' ? 'destructive' : 'default'}>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4 space-y-0.5">{row.report.issues.map((i) => <li key={i.code + i.message}>{i.message}</li>)}</ul>
              </AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
