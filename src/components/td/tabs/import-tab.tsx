'use client';

import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, ChevronDown, Download, FileUp, Loader2, SearchCheck, Undo2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TD_TYPE_CONFIG } from '@/components/td/content/content-types';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdWrite, useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { ContentImportBatch, ContentImportBatchList, ContentImportReport } from '@/lib/td/contract';
import { downloadText } from '@/lib/td/download';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tn } from '@/lib/td/i18n';
import { beginOperation, type TdOperation } from '@/lib/td/operation';
import { canonicalJson, sha256Hex } from '@/lib/td/hash';
import { batchKeyFor, markSent, retireBatchKey } from '@/lib/td/import-keys';
import { parseItemsJson, parseSheet, sheetTemplate, TD_IMPORT_COLUMNS, TD_IMPORTABLE_TYPES, type TdParsedImport } from '@/lib/td/import-format';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

interface Prepared extends TdParsedImport {
  source: string;
  hash: string;
  batchKey: string;
}

/** On its own page the form sits in a titled section; in the dialog the dialog's header names it. */
function Frame({ embedded, children }: { embedded: boolean; children: ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <TdSection title={t('Import a spreadsheet')} description={t('Every row becomes a draft, all at once or none. Then they go through ready and approval like any other content.')}>
      {children}
    </TdSection>
  );
}

const CATEGORY_OF: Partial<Record<TdContentType, 'card-categories' | 'box-categories'>> = { cards: 'card-categories', 'box-questions': 'box-categories' };

/** The upload: a page of its own, and (`embedded`) the body of the Questions
 *  page's upload dialog, opened on that page's game mode and category. */
export function TdImportTab({ embedded = false, initialType, initialCategory }: { embedded?: boolean; initialType?: TdContentType; initialCategory?: string | null } = {}) {
  const { user } = useTdAuth();
  const [type, setType] = useState<TdContentType>(initialType && TD_IMPORTABLE_TYPES.includes(initialType) ? initialType : 'penalty-questions');
  // Rows that name no category go to this one.
  const [category, setCategory] = useState(initialCategory ?? '');
  const categoryType = CATEGORY_OF[type];
  const categories = useTdAllRows(categoryType ?? 'card-categories', { status: 'draft,ready,approved' }, categoryType !== undefined);
  const [pasted, setPasted] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  // The report and the payload hash it was made for: an answer for items no longer shown is dropped.
  const [report, setReport] = useState<{ hash: string; report: ContentImportReport } | null>(null);
  const [result, setResult] = useState<{ created: boolean; batch: ContentImportBatch } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);
  const shown = useRef<string | null>(null);
  // Counts every clearing of what is shown: a file still being read for the type or category chosen before is dropped.
  const cleared = useRef(0);
  const write = useTdWrite();

  const reset = () => {
    cleared.current += 1;
    shown.current = null;
    setPrepared(null);
    setReport(null);
    setResult(null);
    setError(null);
  };

  const prepare = async (text: string, source: string, json: boolean) => {
    if (!user) return;
    // Begun before reading, so a replay cannot go out under a sign-in made meanwhile.
    const operation = tdTokens.read()?.staffId === user.id ? beginOperation(tdTokens) : null;
    reset();
    const mine = cleared.current;
    const parsed = json ? parseItemsJson(text) : parseSheet(type, text, { categoryKey: categoryType && category ? category : undefined });
    const hash = await sha256Hex(canonicalJson(parsed.items));
    if (cleared.current !== mine) return;
    shown.current = hash;
    const saved = batchKeyFor(user.id, hash);
    const next = { ...parsed, source, hash, batchKey: saved.key };
    setPrepared(next);
    // These very items went out once without an answer. A check would count that import's own rows as duplicates,
    // so its key is asked first: the API answers with that batch, or imports the items the member already confirmed.
    if (saved.sent && operation && parsed.items.length > 0 && parsed.problems.length === 0) await apply(next, operation);
  };

  const check = async () => {
    if (!prepared) return;
    setBusy('check');
    setError(null);
    const target = prepared;
    try {
      const out = await write((operation) => tdAdmin.imports.preview(target.items, operation), []);
      if (shown.current === target.hash) setReport({ hash: target.hash, report: out });
    } catch (caught) {
      if (shown.current === target.hash) setError(caught);
    } finally {
      setBusy(null);
    }
  };

  /** With `replay`, the operation the re-read began under: asked with the saved key before any check. */
  const apply = async (target: Prepared, replay?: TdOperation) => {
    if (!user) return;
    setBusy('apply');
    setError(null);
    markSent(user.id, target.hash, true);
    try {
      const out = await write((operation) => tdAdmin.imports.apply(target.batchKey, target.items, operation), [tdKeys.content, tdKeys.releases, tdKeys.imports], replay);
      if (!out.created && out.batch.status !== 'applied') {
        // Imported before and undone since: this key is spent.
        retireBatchKey(user.id, target.batchKey);
        if (replay) {
          if (shown.current === target.hash) setPrepared({ ...target, batchKey: batchKeyFor(user.id, target.hash).key });
          return;
        }
        setError(new TdApiError(409, 'conflict', t('These items were imported before and that import was undone. Read the file again to import them anew.')));
        return;
      }
      setResult(out);
      toast.success(out.created ? t('{n} drafts imported', { n: out.batch.rows.length }) : t('These items were imported already; nothing was added'));
    } catch (caught) {
      // Refused, so nothing was imported under this key.
      if (caught instanceof TdApiError && (caught.code === 'validation' || caught.code === 'conflict')) markSent(user.id, target.hash, false);
      // A preview that passed can still lose a race: the API answers with the whole report.
      if (caught instanceof TdApiError && caught.code === 'validation' && caught.details && typeof caught.details === 'object' && 'rows' in caught.details) {
        setReport({ hash: target.hash, report: caught.details as ContentImportReport });
      }
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const columns = TD_IMPORT_COLUMNS[type];
  const current = report && prepared && report.hash === prepared.hash ? report.report : null;
  const canApply = prepared && current && current.counts.error === 0 && prepared.problems.length === 0 && !result;

  return (
    <>
      <Frame embedded={embedded}>
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
              {t('Content type')}
              <select
                value={type}
                disabled={busy !== null}
                onChange={(event) => {
                  setType(event.target.value as TdContentType);
                  setCategory('');
                  reset();
                }}
                className="h-10 min-w-56 rounded-lg border border-border bg-(--td-input) px-3 text-sm text-foreground"
              >
                {TD_IMPORTABLE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {TD_TYPE_CONFIG[option].plural}
                  </option>
                ))}
              </select>
            </label>
            {categoryType && (
              <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
                {t('Category for the rows')}
                <select
                  value={category}
                  disabled={busy !== null}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    reset();
                  }}
                  className="h-10 min-w-56 rounded-lg border border-border bg-(--td-input) px-3 text-sm text-foreground"
                >
                  <option value="">{t('As the file says (categoryKey column)')}</option>
                  {(categories.data?.rows ?? []).map((row) => (
                    <option key={row.id} value={row.data.key}>
                      {'prompt' in row.data ? row.data.prompt : row.data.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button variant="secondary" className="rounded-lg" onClick={() => downloadText(sheetTemplate(type), `table-derby-${type}-template.csv`)}>
              <Download />
              {t('Template')}
            </Button>
            <input
              ref={file}
              type="file"
              accept=".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,application/json"
              className="hidden"
              data-testid="td-import-file"
              onChange={async (event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (!chosen) return;
                // Counted as chosen, so of two files read at once the later choice is the one shown.
                const mine = ++cleared.current;
                const text = await chosen.text();
                if (cleared.current === mine) await prepare(text, chosen.name, chosen.name.toLowerCase().endsWith('.json'));
              }}
            />
            <Button className="rounded-lg" disabled={busy !== null} onClick={() => file.current?.click()}>
              <FileUp />
              {t('Choose a file')}
            </Button>
          </div>

          <details open={embedded ? true : undefined} className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
              {t('Columns for {type}', { type: TD_TYPE_CONFIG[type].plural })}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-(--td-divider) px-4 py-3 text-xs">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[...columns, { name: 'position', help: t('Order in a release (optional)'), required: false }, { name: 'note', help: t('A note for the team (optional)'), required: false }].map((c) => (
                  <li key={c.name}>
                    <span className="font-mono text-primary">{c.name}</span>
                    {c.required && <span className="text-(--td-text-3)"> *</span>} <span className="text-(--td-text-2)">{c.help}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-medium text-(--td-text-2)">{t('An example file')}</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100">{sheetTemplate(type).trim()}</pre>
              <p className="mt-3 text-(--td-text-3)">
                {t('CSV or TSV with a header row, or cells pasted from a spreadsheet. Lists are separated by | (write \\| for a bar). Rows are imported in order: a row may refer to one above it. A JSON file of items may mix types.')}
              </p>
            </div>
          </details>

          <div className="flex flex-col gap-2">
            <label htmlFor="td-import-paste" className="text-xs font-medium text-(--td-text-3)">
              {t('Or paste the cells here (with the header row)')}
            </label>
            <Textarea id="td-import-paste" value={pasted} onChange={(event) => setPasted(event.target.value)} className="min-h-28 rounded-lg border-border bg-(--td-input) font-mono text-xs" />
            <Button variant="secondary" className="w-fit rounded-lg" disabled={!pasted.trim() || busy !== null} onClick={() => void prepare(pasted, t('pasted cells'), false)}>
              {t('Read the pasted cells')}
            </Button>
          </div>

          {prepared && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <p className="text-sm">
                <span className="font-medium">{prepared.source}</span>: {tn(prepared.items.length, '{count} item read', '{count} items read')}
                {prepared.problems.length > 0 && <span className="text-(--td-danger)"> · {t('{n} could not be read', { n: prepared.problems.length })}</span>}
              </p>
              {prepared.problems.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-(--td-danger)">
                  {prepared.problems.slice(0, 50).map((p, i) => (
                    <li key={i}>
                      {p.line > 0 && t('Line {line}', { line: p.line })}
                      {p.column && ` · ${p.column}`}
                      {p.line > 0 || p.column ? ': ' : ''}
                      {p.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="rounded-lg" disabled={busy !== null || prepared.items.length === 0 || prepared.problems.length > 0 || Boolean(result)} onClick={() => void check()}>
                  {busy === 'check' ? <Loader2 className="animate-spin" /> : <SearchCheck />}
                  {t('Check')}
                </Button>
                <Button className="rounded-lg" disabled={busy !== null || !canApply} onClick={() => void apply(prepared)}>
                  {busy === 'apply' ? <Loader2 className="animate-spin" /> : <Upload />}
                  {current ? t('Import {n} as drafts', { n: current.counts.create }) : t('Import  as drafts')}
                </Button>
              </div>
              <TdErrorPanel error={error} hideIssues />
              {current && <ImportReport report={current} lines={prepared.lines} />}
              {result && (
                <p className="flex items-center gap-2 rounded-lg bg-(--td-new)/10 px-3 py-2 text-sm text-(--td-new)">
                  <CheckCircle2 className="size-4" />
                  {result.created
                    ? t('Imported {n} drafts as batch {batch}.', { n: result.batch.rows.length, batch: result.batch.batchKey })
                    : t('Already imported as batch {batch}; nothing was added.', { batch: result.batch.batchKey })}{' '}
                  {t('It can be undone below while its rows are untouched.')}
                </p>
              )}
            </div>
          )}
        </div>
      </Frame>
      {!embedded && <ImportBatches />}
    </>
  );
}

function ImportReport({ report, lines }: { report: ContentImportReport; lines: number[] }) {
  const errors = report.rows.filter((row) => row.action === 'error');
  return (
    <div className="flex flex-col gap-2">
      <p className={cn('text-sm', errors.length ? 'text-(--td-danger)' : 'text-(--td-new)')}>
        {errors.length
          ? t('{ready} ready to import · {problems} with problems: fix them in the sheet and read it again.', { ready: report.counts.create, problems: report.counts.error })
          : t('{ready} ready to import · {problems} with problems.', { ready: report.counts.create, problems: report.counts.error })}
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-(--td-divider) hover:bg-transparent">
              <TableHead className="h-9 w-16 px-3 text-xs text-(--td-text-3)">{t('Line')}</TableHead>
              <TableHead className="h-9 px-3 text-xs text-(--td-text-3)">{t('Item')}</TableHead>
              <TableHead className="h-9 px-3 text-xs text-(--td-text-3)">{t('Result')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(errors.length ? errors : report.rows).slice(0, 300).map((row) => (
              <TableRow key={row.index} className="border-(--td-divider) align-top hover:bg-transparent">
                <TableCell className="px-3 py-2 text-xs tabular-nums text-(--td-text-3)">{lines[row.index] ?? row.index + 1}</TableCell>
                <TableCell className="px-3 py-2">
                  <span className="font-mono text-xs">{row.label ?? '—'}</span>
                  <span className="block text-xs text-(--td-text-3)">{row.type}</span>
                </TableCell>
                <TableCell className="px-3 py-2 text-xs">
                  {row.action === 'create' ? (
                    <span className="text-(--td-new)">{t('Creates a draft')}</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5 text-(--td-danger)">
                      {row.issues.map((issue, i) => (
                        <li key={i}>
                          <span className="font-mono">{issue.code}</span>
                          {issue.path && <span className="font-mono text-(--td-text-3)"> {issue.path}</span>}: {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const BATCH_STATUS: Record<ContentImportBatch['status'], string> = { applied: t('Imported'), partly_undone: t('Partly undone'), undone: t('Undone') };
const ROW_OUTCOMES: Record<string, string> = { created: t('created'), removed: t('removed'), kept: t('kept') };
const KEPT_BECAUSE: Record<string, string> = {
  edited: t('kept (changed since)'),
  approved: t('kept (approved)'),
  referenced: t('kept (still referred to)'),
  published: t('kept (in a release)'),
};

/** What became of a batch's row, with why it was kept. */
function rowOutcome(outcome: string, reason: string | null): string {
  const label = ROW_OUTCOMES[outcome] ?? outcome;
  if (!reason) return label;
  return (outcome === 'kept' ? KEPT_BECAUSE[reason] : undefined) ?? `${label} (${reason})`;
}

function ImportBatches() {
  const { user } = useTdAuth();
  const [open, setOpen] = useState<string | null>(null);
  const batches = useInfiniteQuery({
    queryKey: [...tdKeys.imports, 'list'],
    queryFn: ({ pageParam, signal }) => tdAdmin.imports.list({ cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ContentImportBatchList) => last.nextCursor ?? undefined,
  });
  const items = batches.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <TdSection title={t('Imports')} description={t('Undo removes the rows of a batch nobody has touched since (not even a note or a ready) and keeps the others, saying why.')}>
      <TdErrorPanel error={batches.error} className="m-5" />
      {batches.isSuccess && items.length === 0 && <TdEmptyState title={t('No imports yet')} />}
      <ul className="divide-y divide-(--td-divider)">
        {items.map((batch) => (
          <li key={batch.id} className="px-5 py-3">
            <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left" onClick={() => setOpen(open === batch.id ? null : batch.id)}>
              <span className="font-mono text-xs">{batch.batchKey}</span>
              <span className="text-xs text-(--td-text-3)">
                {t('{n} items · by {name} · {time}', { n: batch.itemCount, name: batch.createdBy.name, time: formatGeorgiaTime(batch.createdAt) })}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', batch.status === 'applied' ? 'bg-(--td-new)/15 text-(--td-new)' : 'bg-secondary text-(--td-text-2)')}>{BATCH_STATUS[batch.status]}</span>
              {batch.status !== 'applied' && (
                <span className="text-xs text-(--td-text-3)">
                  {t('{removed} removed · {kept} kept', { removed: batch.counts.removed, kept: batch.counts.kept })}
                </span>
              )}
            </button>
            {open === batch.id && user && <BatchDetail id={batch.id} staffId={user.id} canUndo={Boolean(user && (batch.createdBy.id === user.id || isTdPublisher(user.role)))} />}
          </li>
        ))}
      </ul>
      {batches.hasNextPage && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={batches.isFetchingNextPage} onClick={() => void batches.fetchNextPage()}>
            {t('Load more')}
          </Button>
        </div>
      )}
    </TdSection>
  );
}

function BatchDetail({ id, staffId, canUndo }: { id: string; staffId: string; canUndo: boolean }) {
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const batch = useQuery({ queryKey: [...tdKeys.imports, 'batch', id], queryFn: ({ signal }) => tdAdmin.imports.get(id, { signal }) });
  const undo = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await write((operation) => tdAdmin.imports.undo(id, operation), []);
      // Retired before any view refreshes: a re-read of the same file must already get a new key.
      retireBatchKey(staffId, out.batchKey);
      queryClient.setQueryData([...tdKeys.imports, 'batch', id], out);
      await Promise.all([tdKeys.content, tdKeys.releases, tdKeys.imports].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(t('{removed} removed, {kept} kept', { removed: out.counts.removed, kept: out.counts.kept }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  if (batch.isLoading) return <p className="mt-2 text-xs text-(--td-text-3)">{t('Loading…')}</p>;
  if (!batch.data) return <TdErrorPanel error={batch.error} className="mt-2" />;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <ol className="max-h-64 overflow-y-auto rounded-lg border border-border text-xs">
        {batch.data.rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 border-b border-(--td-divider) px-3 py-1.5 last:border-0">
            <span className="w-8 tabular-nums text-(--td-text-3)">{row.index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono">{row.label}</span>
            <span className="text-(--td-text-3)">{row.type}</span>
            <span className={cn(row.outcome === 'removed' ? 'text-(--td-text-3)' : row.outcome === 'kept' ? 'text-amber-800' : 'text-(--td-new)')}>
              {rowOutcome(row.outcome, row.reason)}
            </span>
          </li>
        ))}
      </ol>
      {canUndo && batch.data.status === 'applied' && (
        <Button variant="secondary" size="sm" className="w-fit rounded-lg" disabled={busy} onClick={() => void undo()}>
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
          {t('Undo this import')}
        </Button>
      )}
      <TdErrorPanel error={error} />
    </div>
  );
}
