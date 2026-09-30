'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Download, FileUp, Loader2, SearchCheck, Undo2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TD_TYPE_CONFIG } from '@/components/td/content/content-types';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import type { ContentImportBatch, ContentImportBatchList, ContentImportReport } from '@/lib/td/contract';
import { downloadText } from '@/lib/td/download';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { canonicalJson, sha256Hex } from '@/lib/td/hash';
import { parseItemsJson, parseSheet, sheetTemplate, TD_IMPORT_COLUMNS, TD_IMPORTABLE_TYPES, type TdParsedImport } from '@/lib/td/import-format';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

/** Batch keys by payload hash, so a retry of the same items (a lost answer, a reload) is the same import. */
const KEYS_STORAGE = 'td_import_keys';

function batchKeyFor(hash: string): string {
  let known: Record<string, string> = {};
  try {
    known = JSON.parse(sessionStorage.getItem(KEYS_STORAGE) ?? '{}') as Record<string, string>;
  } catch {
    // Unavailable storage: a fresh key, which the API still de-duplicates by content if resent at once.
  }
  if (known[hash]) return known[hash];
  const key = `cms:${hash.slice(0, 24)}:${crypto.randomUUID().slice(0, 8)}`;
  try {
    sessionStorage.setItem(KEYS_STORAGE, JSON.stringify({ ...known, [hash]: key }));
  } catch {
    // Kept in memory for this import only.
  }
  return key;
}

/** A batch key is spent once its batch is undone: the same items then make a new import. */
function retireBatchKey(batchKey: string) {
  try {
    const known = JSON.parse(sessionStorage.getItem(KEYS_STORAGE) ?? '{}') as Record<string, string>;
    sessionStorage.setItem(KEYS_STORAGE, JSON.stringify(Object.fromEntries(Object.entries(known).filter(([, key]) => key !== batchKey))));
  } catch {
    // Nothing kept, nothing to retire.
  }
}

interface Prepared extends TdParsedImport {
  source: string;
  hash: string;
  batchKey: string;
}

export function TdImportTab() {
  const [type, setType] = useState<TdContentType>('penalty-questions');
  const [pasted, setPasted] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  // The report and the payload hash it was made for: an answer for items no longer shown is dropped.
  const [report, setReport] = useState<{ hash: string; report: ContentImportReport } | null>(null);
  const [result, setResult] = useState<{ created: boolean; batch: ContentImportBatch } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const file = useRef<HTMLInputElement>(null);
  const shown = useRef<string | null>(null);
  const write = useTdWrite();

  const reset = () => {
    shown.current = null;
    setPrepared(null);
    setReport(null);
    setResult(null);
    setError(null);
  };

  const prepare = async (text: string, source: string, json: boolean) => {
    reset();
    const parsed = json ? parseItemsJson(text) : parseSheet(type, text);
    const hash = await sha256Hex(canonicalJson(parsed.items));
    shown.current = hash;
    setPrepared({ ...parsed, source, hash, batchKey: batchKeyFor(hash) });
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

  const apply = async () => {
    if (!prepared) return;
    setBusy('apply');
    setError(null);
    const target = prepared;
    try {
      const out = await write((operation) => tdAdmin.imports.apply(target.batchKey, target.items, operation), [tdKeys.content, tdKeys.releases, tdKeys.imports]);
      if (!out.created && out.batch.status !== 'applied') {
        // Imported before and undone since: this key is spent. Read the items again for a new import.
        retireBatchKey(target.batchKey);
        setError(new TdApiError(409, 'conflict', 'These items were imported before and that import was undone. Read the file again to import them anew.'));
        return;
      }
      setResult(out);
      toast.success(out.created ? `${out.batch.rows.length} drafts imported` : 'These items were imported already; nothing was added');
    } catch (caught) {
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
      <TdSection title="Import a spreadsheet" description="Every row becomes a draft, all at once or none. Then they go through ready and approval like any other content.">
        <div className="flex flex-col gap-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
              Content type
              <select
                value={type}
                disabled={busy !== null}
                onChange={(event) => {
                  setType(event.target.value as TdContentType);
                  reset();
                }}
                className="h-10 min-w-56 rounded-lg border border-border bg-(--td-input) px-3 text-sm text-foreground"
              >
                {TD_IMPORTABLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TD_TYPE_CONFIG[t].plural}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="secondary" className="rounded-lg" onClick={() => downloadText(sheetTemplate(type), `table-derby-${type}-template.csv`)}>
              <Download />
              Template
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
                if (chosen) await prepare(await chosen.text(), chosen.name, chosen.name.toLowerCase().endsWith('.json'));
              }}
            />
            <Button className="rounded-lg" disabled={busy !== null} onClick={() => file.current?.click()}>
              <FileUp />
              Choose a file
            </Button>
          </div>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-medium">
              Columns for {TD_TYPE_CONFIG[type].plural}
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-(--td-divider) px-4 py-3 text-xs">
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {[...columns, { name: 'position', help: 'Order in a release (optional)', required: false }, { name: 'note', help: 'A note for the team (optional)', required: false }].map((c) => (
                  <li key={c.name}>
                    <span className="font-mono text-primary">{c.name}</span>
                    {c.required && <span className="text-(--td-text-3)"> *</span>} <span className="text-(--td-text-2)">{c.help}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-(--td-text-3)">
                CSV or TSV with a header row, or cells pasted from a spreadsheet. Lists are separated by | (write \| for a bar). Rows are imported in order: a row may refer to one above it. A JSON file of items may mix types.
              </p>
            </div>
          </details>

          <div className="flex flex-col gap-2">
            <label htmlFor="td-import-paste" className="text-xs font-medium text-(--td-text-3)">
              Or paste the cells here (with the header row)
            </label>
            <Textarea id="td-import-paste" value={pasted} onChange={(event) => setPasted(event.target.value)} className="min-h-28 rounded-lg border-border bg-(--td-input) font-mono text-xs" />
            <Button variant="secondary" className="w-fit rounded-lg" disabled={!pasted.trim() || busy !== null} onClick={() => void prepare(pasted, 'pasted cells', false)}>
              Read the pasted cells
            </Button>
          </div>

          {prepared && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <p className="text-sm">
                <span className="font-medium">{prepared.source}</span>: {prepared.items.length} item{prepared.items.length === 1 ? '' : 's'} read
                {prepared.problems.length > 0 && <span className="text-(--td-danger)"> · {prepared.problems.length} could not be read</span>}
              </p>
              {prepared.problems.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-(--td-danger)">
                  {prepared.problems.slice(0, 50).map((p, i) => (
                    <li key={i}>
                      {p.line > 0 && `Line ${p.line}`}
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
                  Check
                </Button>
                <Button className="rounded-lg" disabled={busy !== null || !canApply} onClick={() => void apply()}>
                  {busy === 'apply' ? <Loader2 className="animate-spin" /> : <Upload />}
                  Import {current ? current.counts.create : ''} as drafts
                </Button>
              </div>
              <TdErrorPanel error={error} hideIssues />
              {current && <ImportReport report={current} lines={prepared.lines} />}
              {result && (
                <p className="flex items-center gap-2 rounded-lg bg-(--td-new)/10 px-3 py-2 text-sm text-(--td-new)">
                  <CheckCircle2 className="size-4" />
                  {result.created ? `Imported ${result.batch.rows.length} drafts as batch ${result.batch.batchKey}.` : `Already imported as batch ${result.batch.batchKey}; nothing was added.`} It can be undone below while its rows are untouched.
                </p>
              )}
            </div>
          )}
        </div>
      </TdSection>
      <ImportBatches />
    </>
  );
}

function ImportReport({ report, lines }: { report: ContentImportReport; lines: number[] }) {
  const errors = report.rows.filter((row) => row.action === 'error');
  return (
    <div className="flex flex-col gap-2">
      <p className={cn('text-sm', errors.length ? 'text-(--td-danger)' : 'text-(--td-new)')}>
        {report.counts.create} ready to import · {report.counts.error} with problems{errors.length ? ': fix them in the sheet and read it again.' : '.'}
      </p>
      <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-(--td-divider) hover:bg-transparent">
              <TableHead className="h-9 w-16 px-3 text-xs text-(--td-text-3)">Line</TableHead>
              <TableHead className="h-9 px-3 text-xs text-(--td-text-3)">Item</TableHead>
              <TableHead className="h-9 px-3 text-xs text-(--td-text-3)">Result</TableHead>
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
                    <span className="text-(--td-new)">Creates a draft</span>
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

const BATCH_STATUS: Record<ContentImportBatch['status'], string> = { applied: 'Imported', partly_undone: 'Partly undone', undone: 'Undone' };
const KEEP_REASONS: Record<string, string> = { edited: 'changed since', approved: 'approved', referenced: 'still referred to', published: 'in a release' };

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
    <TdSection title="Imports" description="Undo removes the rows of a batch nobody has touched since (not even a note or a ready) and keeps the others, saying why.">
      <TdErrorPanel error={batches.error} className="m-5" />
      {batches.isSuccess && items.length === 0 && <TdEmptyState title="No imports yet" />}
      <ul className="divide-y divide-(--td-divider)">
        {items.map((batch) => (
          <li key={batch.id} className="px-5 py-3">
            <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 text-left" onClick={() => setOpen(open === batch.id ? null : batch.id)}>
              <span className="font-mono text-xs">{batch.batchKey}</span>
              <span className="text-xs text-(--td-text-3)">
                {batch.itemCount} items · by {batch.createdBy.name} · {formatGeorgiaTime(batch.createdAt)}
              </span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', batch.status === 'applied' ? 'bg-(--td-new)/15 text-(--td-new)' : 'bg-secondary text-(--td-text-2)')}>{BATCH_STATUS[batch.status]}</span>
              {batch.status !== 'applied' && (
                <span className="text-xs text-(--td-text-3)">
                  {batch.counts.removed} removed · {batch.counts.kept} kept
                </span>
              )}
            </button>
            {open === batch.id && <BatchDetail id={batch.id} canUndo={Boolean(user && (batch.createdBy.id === user.id || isTdPublisher(user.role)))} />}
          </li>
        ))}
      </ul>
      {batches.hasNextPage && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={batches.isFetchingNextPage} onClick={() => void batches.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </TdSection>
  );
}

function BatchDetail({ id, canUndo }: { id: string; canUndo: boolean }) {
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
      retireBatchKey(out.batchKey);
      queryClient.setQueryData([...tdKeys.imports, 'batch', id], out);
      await Promise.all([tdKeys.content, tdKeys.releases, tdKeys.imports].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      toast.success(`${out.counts.removed} removed, ${out.counts.kept} kept`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  if (batch.isLoading) return <p className="mt-2 text-xs text-(--td-text-3)">Loading…</p>;
  if (!batch.data) return <TdErrorPanel error={batch.error} className="mt-2" />;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <ol className="max-h-64 overflow-y-auto rounded-lg border border-border text-xs">
        {batch.data.rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 border-b border-(--td-divider) px-3 py-1.5 last:border-0">
            <span className="w-8 tabular-nums text-(--td-text-3)">{row.index + 1}</span>
            <span className="min-w-0 flex-1 truncate font-mono">{row.label}</span>
            <span className="text-(--td-text-3)">{row.type}</span>
            <span className={cn(row.outcome === 'removed' ? 'text-(--td-text-3)' : row.outcome === 'kept' ? 'text-amber-300' : 'text-(--td-new)')}>
              {row.outcome}
              {row.reason && ` (${KEEP_REASONS[row.reason] ?? row.reason})`}
            </span>
          </li>
        ))}
      </ol>
      {canUndo && batch.data.status === 'applied' && (
        <Button variant="secondary" size="sm" className="w-fit rounded-lg" disabled={busy} onClick={() => void undo()}>
          {busy ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Undo this import
        </Button>
      )}
      <TdErrorPanel error={error} />
    </div>
  );
}
