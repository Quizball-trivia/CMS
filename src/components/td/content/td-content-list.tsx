'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Check, Loader2, Plus, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdContentList, type TdListQuery } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus, TdContentType } from '@/lib/td/admin-api';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { beginOperation, runEach } from '@/lib/td/operation';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdStatusChip } from './td-status';

export interface TdColumn<T extends TdContentType> {
  header: string;
  cell: (row: TdContentRow<T>) => ReactNode;
  className?: string;
}

const STATUSES: TdContentStatus[] = ['draft', 'ready', 'approved', 'archived'];
const SORTS = [
  { value: 'natural', label: 'Order', dir: 'asc' },
  { value: 'updated', label: 'Recently changed', dir: 'desc' },
  { value: 'created', label: 'Recently created', dir: 'desc' },
] as const;

const CATEGORY_TYPES = new Set<TdContentType>(['card-categories', 'box-categories']);

export function TdContentList<T extends TdContentType>({
  type,
  title,
  description,
  columns,
  fixedQuery,
  onOpen,
  onCreate,
  createLabel = 'New',
  selectedId,
  searchPlaceholder = 'Search the text',
  initialSearch = '',
  emptyTitle,
  emptyBody,
  bulk = true,
  actions,
  className,
}: {
  type: T;
  title: string;
  description?: string;
  columns: TdColumn<T>[];
  fixedQuery?: TdListQuery;
  onOpen: (row: TdContentRow<T>) => void;
  onCreate?: () => void;
  createLabel?: string;
  selectedId?: string | null;
  searchPlaceholder?: string;
  /** Search the list opens with. */
  initialSearch?: string;
  emptyTitle: string;
  emptyBody?: ReactNode;
  bulk?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialSearch);
  const [q, setQ] = useState(initialSearch);
  const [statuses, setStatuses] = useState<TdContentStatus[]>([]);
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('natural');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Array<{ label: string; message: string }>>([]);

  const query = useMemo<TdListQuery>(() => {
    const dir = SORTS.find((s) => s.value === sort)!.dir;
    return { ...fixedQuery, q: q || undefined, status: statuses.length ? statuses.join(',') : undefined, sort, dir };
  }, [fixedQuery, q, statuses, sort]);
  const list = useTdContentList(type, query);
  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const chosen = rows.filter((row) => selected.has(row.id));
  const readyable = chosen.filter((row) => row.status === 'draft');
  const approvable = user && isTdPublisher(user.role) && !CATEGORY_TYPES.has(type) ? chosen.filter((row) => row.status === 'ready' && row.lastEditor.id !== user.id) : [];

  const resetSelection = () => setSelected(new Set());
  const setFilter = (apply: () => void) => {
    apply();
    resetSelection();
  };

  const runBulk = async (action: 'ready' | 'approve', targets: TdContentRow<T>[]) => {
    setRunning(action);
    setRefusals([]);
    const operation = beginOperation(tdTokens);
    const api = tdAdmin.content(type);
    const results = await runEach(tdTokens, operation, targets, (row) =>
      action === 'ready' ? api.ready(row.id, row.version, operation) : api.approve(row.id, row.version, undefined, operation),
    );
    const failed = results.filter((r) => !r.ok);
    const done = results.length - failed.length;
    if (done) toast.success(`${done} ${action === 'ready' ? 'marked ready' : 'approved'}`);
    setRefusals(failed.map((r) => ({ label: labelOf(r.item), message: tdErrorText(!r.ok ? r.error : null) })));
    setRunning(null);
    resetSelection();
    await queryClient.invalidateQueries({ queryKey: tdKeys.content });
    await queryClient.invalidateQueries({ queryKey: tdKeys.releases });
  };

  const labelOf = (row: TdContentRow<T>) => String((row.data as Record<string, unknown>).key ?? (row.data as Record<string, unknown>).date ?? row.id);
  const allShown = rows.length > 0 && rows.every((row) => selected.has(row.id));

  return (
    <TdSection
      title={title}
      description={description}
      className={className}
      actions={
        <>
          {actions}
          {onCreate && (
            <Button onClick={onCreate} className="rounded-lg">
              <Plus />
              {createLabel}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 border-b border-(--td-divider) px-5 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter(() => setQ(text.trim()));
          }}
        >
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={searchPlaceholder} aria-label={`Search ${title}`} className="h-9 rounded-full bg-(--td-input) pl-9 pr-9" />
            {q && (
              <button type="button" aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-(--td-text-3) hover:text-foreground" onClick={() => setFilter(() => { setText(''); setQ(''); })}>
                <X className="size-4" />
              </button>
            )}
          </div>
          <select
            aria-label="Sort"
            value={sort}
            onChange={(event) => setFilter(() => setSort(event.target.value as typeof sort))}
            className="h-9 rounded-full border border-border bg-(--td-input) px-3 text-sm"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </form>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Status">
          {STATUSES.map((status) => {
            const on = statuses.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(() => setStatuses(on ? statuses.filter((s) => s !== status) : [...statuses, status]))}
                className={cn('rounded-full border px-2.5 py-0.5 text-xs', on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-(--td-text-3) hover:text-foreground')}
              >
                {status}
              </button>
            );
          })}
          <span className="text-xs text-(--td-text-3)">{statuses.length ? '' : 'All but archived'}</span>
        </div>
        {bulk && chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-(--td-input) px-3 py-2 text-sm">
            <span className="text-(--td-text-2)">{chosen.length} selected</span>
            {readyable.length > 0 && (
              <Button size="sm" variant="secondary" disabled={running !== null} onClick={() => void runBulk('ready', readyable)} className="rounded-lg">
                {running === 'ready' ? <Loader2 className="animate-spin" /> : <Send />}
                Mark {readyable.length} ready
              </Button>
            )}
            {approvable.length > 0 && (
              <Button size="sm" disabled={running !== null} onClick={() => void runBulk('approve', approvable)} className="rounded-lg">
                {running === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
                Approve {approvable.length}
              </Button>
            )}
            <button type="button" className="text-xs text-(--td-text-3) hover:text-foreground" onClick={resetSelection}>
              Clear
            </button>
          </div>
        )}
        {refusals.length > 0 && (
          <div role="alert" className="rounded-lg bg-(--td-danger)/10 px-3 py-2 text-xs text-(--td-danger)">
            <p className="font-medium">{refusals.length} refused</p>
            <ul className="mt-1 list-disc pl-4">
              {refusals.map((r, i) => (
                <li key={i}>
                  <span className="font-mono">{r.label}</span>: {r.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {list.error ? (
        <div className="p-5">
          <TdErrorPanel error={list.error} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-(--td-divider) hover:bg-transparent">
                {bulk && (
                  <TableHead className="w-10 pl-5">
                    <input type="checkbox" aria-label="Select all shown" checked={allShown} onChange={() => setSelected(allShown ? new Set() : new Set(rows.map((row) => row.id)))} className="accent-(--td-primary)" />
                  </TableHead>
                )}
                {columns.map((column) => (
                  <TableHead key={column.header} className={cn('h-10 px-3 text-xs font-semibold uppercase tracking-wide text-(--td-text-3) first:pl-5', column.className)}>
                    {column.header}
                  </TableHead>
                ))}
                <TableHead className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-(--td-text-3)">Status</TableHead>
                <TableHead className="hidden h-10 px-3 pr-5 text-xs font-semibold uppercase tracking-wide text-(--td-text-3) lg:table-cell">Changed (Georgia)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading &&
                Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={i} className="border-(--td-divider) hover:bg-transparent">
                    <TableCell colSpan={columns.length + (bulk ? 3 : 2)} className="px-5 py-4">
                      <span className="block h-3 w-1/2 animate-pulse rounded bg-secondary" />
                    </TableCell>
                  </TableRow>
                ))}
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={selectedId === row.id ? 'selected' : undefined}
                  className={cn('cursor-pointer border-(--td-divider) hover:bg-secondary/40', selectedId === row.id && 'bg-secondary/60')}
                  onClick={() => onOpen(row)}
                >
                  {bulk && (
                    <TableCell className="pl-5" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${labelOf(row)}`}
                        checked={selected.has(row.id)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          setSelected(next);
                        }}
                        className="accent-(--td-primary)"
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.header} className={cn('max-w-72 px-3 py-2.5 first:pl-5', column.className)}>
                      {column.cell(row)}
                    </TableCell>
                  ))}
                  <TableCell className="px-3 py-2.5">
                    <TdStatusChip status={row.status} />
                  </TableCell>
                  <TableCell className="hidden px-3 py-2.5 pr-5 text-xs text-(--td-text-3) lg:table-cell">
                    {formatGeorgiaTime(row.updatedAt)}
                    <span className="block">{row.updatedBy.name}</span>
                  </TableCell>
                </TableRow>
              ))}
              {list.isSuccess && rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length + (bulk ? 3 : 2)} className="p-0">
                    <TdEmptyState title={q || statuses.length ? 'Nothing matches' : emptyTitle}>{q || statuses.length ? 'Try another search or status.' : emptyBody}</TdEmptyState>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {list.hasNextPage && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
            {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
            Load more
          </Button>
        </div>
      )}
    </TdSection>
  );
}

/** A cell with a main line and a muted key under it. */
export function TdCellTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block truncate font-medium">{title || '—'}</span>
      {sub && <span className="block truncate font-mono text-xs text-(--td-text-3)">{sub}</span>}
    </span>
  );
}
