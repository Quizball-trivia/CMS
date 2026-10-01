'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, Check, FileText, ImageIcon, Layers, Loader2, MoreHorizontal, Pencil, Plus, Rocket, Search, Send, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdAllRows, useTdContentList, type TdListQuery } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus, TdContentType } from '@/lib/td/admin-api';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { beginOperation, runEach } from '@/lib/td/operation';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

type CategoryType = 'card-categories' | 'box-categories';

interface Mode {
  key: string;
  label: string;
  type: TdContentType;
  /** What one row is called on the buttons. */
  noun: string;
  categoryType?: CategoryType;
}

/** The game modes a question belongs to: the list shows one at a time, as the
 *  Quizball CMS's question list shows one category. */
export const TD_QUESTION_MODES: readonly Mode[] = [
  { key: 'round-1', label: 'Round I · ბარათონი', type: 'cards', noun: 'card', categoryType: 'card-categories' },
  { key: 'round-2', label: 'Round II · გამარჯობა', type: 'whoami-subjects', noun: 'subject' },
  { key: 'round-3', label: 'Round III · პაპა კარლოს ყუთი', type: 'box-questions', noun: 'question', categoryType: 'box-categories' },
  { key: 'penalties', label: 'Penalties', type: 'penalty-questions', noun: 'question' },
  { key: 'practice', label: 'Practice · ივარჯიშე', type: 'practice-questions', noun: 'question' },
  { key: 'football-logic', label: 'Daily · Football Logic', type: 'football-logic', noun: 'question' },
  { key: 'put-in-order', label: 'Daily · Put in Order', type: 'put-in-order', noun: 'round' },
  { key: 'career-path', label: 'Daily · Career Path', type: 'career-path', noun: 'question' },
];

/** The page of the question list that holds rows of this type (links from the release report). */
export function questionsHref(type: TdContentType, q?: string): string | null {
  const mode = TD_QUESTION_MODES.find((m) => m.type === type);
  if (!mode) return null;
  return `/td/questions?mode=${mode.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
}

const STATUS_OPTIONS: Array<{ value: TdContentStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'ready', label: 'Ready for review' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
];

const SORTS = [
  { value: 'natural', label: 'In game order', dir: 'asc' },
  { value: 'updated', label: 'Recently changed', dir: 'desc' },
  { value: 'created', label: 'Recently created', dir: 'desc' },
] as const;

const STATUS_PILL: Record<TdContentStatus, string> = {
  draft: 'bg-slate-100 text-slate-400',
  ready: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-white text-slate-300 ring-1 ring-inset ring-slate-200',
};

const STATUS_DOT: Record<TdContentStatus, string> = {
  draft: 'border-2 border-gray-200 bg-transparent',
  ready: 'bg-amber-400',
  approved: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
  archived: 'border-2 border-gray-200 bg-gray-100',
};

const DIFFICULTY_TEXT: Record<string, string> = { easy: 'text-emerald-600', medium: 'text-amber-600', hard: 'text-rose-600' };
const DIFFICULTY_DOTS: Record<string, number> = { easy: 1, medium: 2, hard: 3 };

interface Shown {
  title: string;
  /** Where it sits: its category or puzzle. */
  place: string | null;
  detail: string;
  image: boolean;
  /** One to three: a card's points, or a practice question's difficulty. */
  level?: { dots: number; label: string; className: string };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function show(type: TdContentType, row: TdContentRow): Shown {
  const data = row.data as Record<string, unknown>;
  switch (type) {
    case 'cards': {
      const d = (row as TdContentRow<'cards'>).data;
      return {
        title: d.display,
        place: d.categoryKey,
        detail: plural(d.lines.length, 'clue line'),
        image: Boolean(d.imageKey || d.photo),
        level: { dots: d.value, label: plural(d.value, 'point'), className: 'text-slate-600' },
      };
    }
    case 'whoami-subjects': {
      const d = (row as TdContentRow<'whoami-subjects'>).data;
      return { title: d.display, place: null, detail: plural(d.clues.length, 'clue'), image: false };
    }
    case 'box-questions': {
      const d = (row as TdContentRow<'box-questions'>).data;
      return { title: d.q, place: d.categoryKey, detail: `Answer: ${d.display}`, image: false };
    }
    case 'penalty-questions': {
      const d = (row as TdContentRow<'penalty-questions'>).data;
      return { title: d.q, place: null, detail: `Answer: ${d.display}`, image: false };
    }
    case 'practice-questions': {
      const d = (row as TdContentRow<'practice-questions'>).data;
      return {
        title: d.prompt,
        place: d.category || null,
        detail: plural(d.options.length, 'option'),
        image: Boolean(d.imageKey),
        level: { dots: DIFFICULTY_DOTS[d.difficulty] ?? 1, label: d.difficulty, className: DIFFICULTY_TEXT[d.difficulty] ?? 'text-slate-600' },
      };
    }
    case 'football-logic': {
      const d = (row as TdContentRow<'football-logic'>).data;
      return { title: d.prompt || d.displayAnswer, place: d.puzzle || null, detail: `Answer: ${d.displayAnswer}`, image: Boolean(d.imageA || d.imageB) };
    }
    case 'put-in-order': {
      const d = (row as TdContentRow<'put-in-order'>).data;
      return { title: d.prompt, place: d.puzzle || null, detail: plural(d.items.length, 'item'), image: false };
    }
    case 'career-path': {
      const d = (row as TdContentRow<'career-path'>).data;
      return { title: d.displayAnswer, place: d.puzzle || null, detail: plural(d.clubs.length, 'club'), image: false };
    }
    default:
      return { title: String(data.key ?? row.id), place: null, detail: '', image: false };
  }
}

const keyOf = (row: TdContentRow) => String((row.data as Record<string, unknown>).key ?? row.id);

function readParam(name: string): string {
  return typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get(name) ?? '');
}

const TRIGGER = 'h-10 rounded-xl border-gray-200 bg-white text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50';
const ITEM = 'text-xs font-medium';

/** Every game mode's questions on one page, worked the way the Quizball CMS's
 *  question list is: choose the mode, search, filter, open a row to edit or
 *  preview it, upload a file, mark ready and approve one or many. */
export function TdQuestionsTab() {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const [modeKey, setModeKey] = useState(() => (TD_QUESTION_MODES.some((m) => m.key === readParam('mode')) ? readParam('mode') : TD_QUESTION_MODES[0]!.key));
  const mode = TD_QUESTION_MODES.find((m) => m.key === modeKey)!;
  const [text, setText] = useState(() => readParam('q'));
  const [q, setQ] = useState(() => readParam('q'));
  const [category, setCategory] = useState(() => readParam('category') || 'all');
  const [status, setStatus] = useState<'all' | TdContentStatus>('all');
  const [sort, setSort] = useState<(typeof SORTS)[number]['value']>('natural');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<string | null>(null);
  const [refusals, setRefusals] = useState<Array<{ label: string; message: string }>>([]);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);

  // Typing searches after a pause, as the Quizball question list does.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setSelected(new Set());
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const query = useMemo<TdListQuery>(
    () => ({
      q: q || undefined,
      status: status === 'all' ? undefined : status,
      category: mode.categoryType && category !== 'all' ? category : undefined,
      sort,
      dir: SORTS.find((s) => s.value === sort)!.dir,
    }),
    [q, status, category, sort, mode.categoryType],
  );
  const list = useTdContentList(mode.type, query);
  const categories = useTdAllRows(mode.categoryType ?? 'card-categories', {}, mode.categoryType !== undefined);
  const rows = useMemo(() => (list.data?.pages.flatMap((page) => page.items) ?? []) as TdContentRow[], [list.data]);

  const publisher = user ? isTdPublisher(user.role) : false;
  const canReady = (row: TdContentRow) => row.status === 'draft';
  const canApprove = (row: TdContentRow) => publisher && row.status === 'ready' && row.lastEditor.id !== user?.id;
  const chosen = rows.filter((row) => selected.has(row.id));
  const readyable = chosen.filter(canReady);
  const approvable = chosen.filter(canApprove);
  const allShown = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const reset = (apply: () => void) => {
    apply();
    setSelected(new Set());
    setRefusals([]);
  };

  const changeMode = (key: string) =>
    reset(() => {
      setModeKey(key);
      setCategory('all');
      window.history.replaceState(null, '', `?mode=${key}`);
    });

  const run = async (action: 'ready' | 'approve', targets: TdContentRow[]) => {
    setRunning(action);
    setRefusals([]);
    const operation = beginOperation(tdTokens);
    const api = tdAdmin.content(mode.type);
    const results = await runEach(tdTokens, operation, targets, (row) =>
      action === 'ready' ? api.ready(row.id, row.version, operation) : api.approve(row.id, row.version, undefined, operation),
    );
    const failed = results.filter((r) => !r.ok);
    const done = results.length - failed.length;
    if (done) toast.success(`${done} ${action === 'ready' ? 'marked ready' : 'approved'}`);
    setRefusals(failed.map((r) => ({ label: keyOf(r.item), message: tdErrorText(!r.ok ? r.error : null) })));
    setRunning(null);
    setSelected(new Set());
    await queryClient.invalidateQueries({ queryKey: tdKeys.content });
    await queryClient.invalidateQueries({ queryKey: tdKeys.releases });
  };

  const categoryName = (key: string) => {
    const found = categories.data?.rows.find((row) => (row.data as { key: string }).key === key);
    if (!found) return key;
    const d = found.data as { prompt?: string; title?: string };
    return d.prompt ?? d.title ?? key;
  };

  const filtered = Boolean(q) || status !== 'all' || category !== 'all';

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <header className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">Questions</h1>
          <p className="text-base font-medium text-gray-500">The cards and questions of every game mode.</p>
        </header>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline" className="h-11 rounded-xl border-gray-200 bg-white px-4 text-sm font-semibold shadow-sm">
            <Link href="/td/releases">
              <Rocket />
              Publish
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl border-gray-200 bg-white px-4 text-sm font-semibold shadow-sm">
            <Link href="/td/import">
              <Upload />
              Upload Questions
            </Link>
          </Button>
          <Button
            onClick={() => setTarget({ type: mode.type, row: null, preset: mode.categoryType && category !== 'all' ? { categoryKey: category } : undefined })}
            className="h-11 rounded-xl bg-gray-900 px-6 text-sm font-bold text-white shadow-lg shadow-gray-200 hover:bg-gray-800 active:scale-95"
          >
            <Plus />
            New {mode.noun === 'question' ? 'Question' : mode.noun.charAt(0).toUpperCase() + mode.noun.slice(1)}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-gray-400" />
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search questions, answers and accepted spellings..."
            aria-label="Search questions"
            className="h-10 rounded-xl border-transparent bg-gray-200/30 pl-10 pr-10 text-sm font-medium transition-all focus:border-gray-200 focus:bg-white focus-visible:ring-2 focus-visible:ring-gray-900/5"
          />
          {text && (
            <button type="button" aria-label="Clear search" className="absolute right-3.5 top-3 text-gray-400 hover:text-gray-900" onClick={() => setText('')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select value={modeKey} onValueChange={changeMode}>
            <SelectTrigger aria-label="Game mode" className={cn(TRIGGER, 'w-[250px]')}>
              <SelectValue placeholder="Game mode" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
              {TD_QUESTION_MODES.map((m) => (
                <SelectItem key={m.key} value={m.key} className={ITEM}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mode.categoryType && (
            <Select value={category} onValueChange={(value) => reset(() => setCategory(value))}>
              <SelectTrigger aria-label="Category" className={cn(TRIGGER, 'w-[220px]')}>
                <SelectValue placeholder="Categories" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                <SelectItem value="all" className={ITEM}>
                  Categories
                </SelectItem>
                {categories.data?.rows.map((row) => {
                  const key = (row.data as { key: string }).key;
                  return (
                    <SelectItem key={row.id} value={key} className={ITEM}>
                      {categoryName(key)}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          <Select value={status} onValueChange={(value) => reset(() => setStatus(value as typeof status))}>
            <SelectTrigger aria-label="Status" className={cn(TRIGGER, 'w-[170px]')}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
              <SelectItem value="all" className={ITEM}>
                Status
              </SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} className={ITEM}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => reset(() => setSort(value as typeof sort))}>
            <SelectTrigger aria-label="Order" className={cn(TRIGGER, 'w-[180px]')}>
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value} className={ITEM}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mode.categoryType && (
            <Link href="/td/categories" className="text-xs font-bold text-slate-500 underline underline-offset-2 hover:text-slate-900">
              Manage categories
            </Link>
          )}
        </div>

        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200/70 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-bold text-gray-600">{chosen.length} selected</span>
            {readyable.length > 0 && (
              <Button size="sm" variant="outline" disabled={running !== null} onClick={() => void run('ready', readyable)} className="h-8 rounded-lg text-xs font-bold">
                {running === 'ready' ? <Loader2 className="animate-spin" /> : <Send />}
                Mark {readyable.length} ready
              </Button>
            )}
            {approvable.length > 0 && (
              <Button size="sm" disabled={running !== null} onClick={() => void run('approve', approvable)} className="h-8 rounded-lg bg-gray-900 text-xs font-bold text-white hover:bg-gray-800">
                {running === 'approve' ? <Loader2 className="animate-spin" /> : <Check />}
                Approve {approvable.length}
              </Button>
            )}
            <button type="button" className="text-xs font-medium text-gray-400 hover:text-gray-900" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        )}

        {refusals.length > 0 && (
          <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
            <p className="font-bold">{refusals.length} refused</p>
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

      <div>
        {list.error ? (
          <TdErrorPanel error={list.error} />
        ) : list.isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[2rem] border border-dashed border-slate-200 bg-white/60 px-6 py-16 text-center">
            <FileText className="size-8 text-slate-300" />
            <p className="text-base font-semibold text-slate-900">{filtered ? 'Nothing matches' : `No ${mode.noun}s yet`}</p>
            <p className="text-sm text-slate-500">{filtered ? 'Try another search, category or status.' : `Create the first ${mode.noun}, or upload a file.`}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[2.5rem] bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-gray-50 bg-white px-6 py-4">
              <input
                type="checkbox"
                aria-label="Select all shown"
                className="h-4 w-4 rounded-md border-gray-200 text-slate-900 focus:ring-slate-900"
                checked={allShown}
                onChange={() => setSelected(allShown ? new Set() : new Set(rows.map((row) => row.id)))}
              />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Select all</span>
            </div>
            <ul>
              {rows.map((row) => {
                const shown = show(mode.type, row);
                return (
                  <li
                    key={row.id}
                    className="group relative flex cursor-pointer items-center justify-between border-b border-gray-50 px-6 py-5 transition-colors last:border-0 hover:bg-slate-50"
                    onClick={() => setTarget({ type: mode.type, row })}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${keyOf(row)}`}
                        className="h-4 w-4 rounded-md border-gray-200 text-slate-900 focus:ring-slate-900"
                        checked={selected.has(row.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(row.id)) next.delete(row.id);
                          else next.add(row.id);
                          setSelected(next);
                        }}
                      />
                      <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_DOT[row.status])} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[16px] font-semibold leading-tight text-slate-900">{shown.title || '—'}</span>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {shown.place && (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                              <Layers className="h-3.5 w-3.5 text-slate-300" />
                              {mode.categoryType ? categoryName(shown.place) : shown.place}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                            {shown.image ? <ImageIcon className="h-3.5 w-3.5 text-slate-300" /> : <FileText className="h-3.5 w-3.5 text-slate-300" />}
                            <span className="max-w-72 truncate">{shown.detail}</span>
                          </span>
                          {shown.level && (
                            <span className={cn('flex items-center gap-2 text-xs font-bold capitalize', shown.level.className)}>
                              <span aria-hidden className="flex gap-0.5">
                                {[1, 2, 3].map((n) => (
                                  <span key={n} className={cn('h-1.5 w-1.5 rounded-full', n <= shown.level!.dots ? 'bg-current' : 'bg-slate-200')} />
                                ))}
                              </span>
                              {shown.level.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex shrink-0 items-center gap-6">
                      <div className="flex flex-col items-end gap-1 px-4">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-300">Status</span>
                        <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', STATUS_PILL[row.status])}>{row.status}</span>
                      </div>
                      <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${keyOf(row)}`} className="h-9 w-9 rounded-xl text-slate-400 hover:bg-white hover:text-slate-900 hover:shadow-md">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-[1.25rem] border-slate-100 bg-white p-2 shadow-2xl">
                            <DropdownMenuItem onClick={() => setTarget({ type: mode.type, row })} className="gap-3 rounded-lg px-3 py-2.5 font-medium">
                              <Pencil className="h-4 w-4 text-slate-400" /> Open
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canReady(row) || running !== null} onClick={() => void run('ready', [row])} className="gap-3 rounded-lg px-3 py-2.5 font-medium">
                              <Send className="h-4 w-4 text-amber-500" /> Mark ready
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!canApprove(row) || running !== null} onClick={() => void run('approve', [row])} className="gap-3 rounded-lg px-3 py-2.5 font-medium">
                              <Check className="h-4 w-4 text-emerald-500" /> Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setTarget({ type: mode.type, row })} className="gap-3 rounded-lg px-3 py-2.5 font-medium">
                              <Archive className="h-4 w-4 text-slate-400" /> Archive or restore…
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs font-medium text-muted-foreground">
            Showing <span className="text-foreground">{rows.length}</span> {mode.noun}
            {rows.length === 1 ? '' : 's'}
            {list.hasNextPage ? ' so far' : ''}
          </p>
          {list.hasNextPage && (
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>
              {list.isFetchingNextPage && <Loader2 className="animate-spin" />}
              Load more
            </Button>
          )}
        </div>
      )}

      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
