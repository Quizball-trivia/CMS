'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Clock, FileText, HelpCircle, Image as ImageIcon, Layers, Loader2, MoreHorizontal, Plus, Rocket, Search, Send, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DifficultySignal, getDifficultyTextColor } from '@/components/ui/difficulty-signal';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { TD_STATUS_LABELS, TD_STATUS_WORDS } from '@/components/td/content/td-status';
import { tdKeys, useTdAllRows, useTdContentList, type TdListQuery } from '@/hooks/use-td-content';
import type { TdContentRow, TdContentStatus, TdContentType } from '@/lib/td/admin-api';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { t, tn } from '@/lib/td/i18n';
import { beginOperation, runEach } from '@/lib/td/operation';
import { TD_QUESTION_MODES } from '@/lib/td/question-modes';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TdImportTab } from './import-tab';
import { TdReleasesTab } from './releases-tab';

const PAGE_SIZE = 10;
const STATUS_OPTIONS: TdContentStatus[] = ['draft', 'ready', 'approved', 'archived'];
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
const DIFFICULTY_WORDS: Record<string, string> = { easy: t('easy'), medium: t('medium'), hard: t('hard') };

const TRIGGER = 'h-10 rounded-xl border-gray-200 bg-white text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50';
const ITEM = 'text-xs font-medium';
const CHIP = 'flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white transition-all hover:bg-slate-800';
const MENU_ITEM = 'gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors';

const STATUS_DOT: Record<TdContentStatus, string> = {
  draft: 'border-2 border-gray-200 bg-transparent',
  ready: 'bg-amber-400',
  approved: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
  archived: 'border-2 border-gray-200 bg-gray-100',
};

const STATUS_PILL: Record<TdContentStatus, string> = {
  draft: 'bg-slate-100 text-slate-400',
  ready: 'bg-amber-50 text-amber-600',
  approved: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-slate-100 text-slate-300',
};

interface Shown {
  title: string;
  /** Its category or set. */
  place: string | null;
  detail: string;
  image: boolean;
  difficulty?: string;
  points?: number;
}

function show(type: TdContentType, row: TdContentRow): Shown {
  switch (type) {
    case 'cards': {
      const d = (row as TdContentRow<'cards'>).data;
      return { title: d.display, place: d.categoryKey, detail: tn(d.lines.length, '{count} clue line', '{count} clue lines'), image: Boolean(d.imageKey || d.photo), points: d.value };
    }
    case 'whoami-subjects': {
      const d = (row as TdContentRow<'whoami-subjects'>).data;
      return { title: d.display, place: null, detail: tn(d.clues.length, '{count} clue', '{count} clues'), image: false };
    }
    case 'box-questions': {
      const d = (row as TdContentRow<'box-questions'>).data;
      return { title: d.q, place: d.categoryKey, detail: t('Answer: {answer}', { answer: d.display }), image: false };
    }
    case 'penalty-questions': {
      const d = (row as TdContentRow<'penalty-questions'>).data;
      return { title: d.q, place: null, detail: t('Answer: {answer}', { answer: d.display }), image: false };
    }
    case 'practice-questions': {
      const d = (row as TdContentRow<'practice-questions'>).data;
      return { title: d.prompt, place: d.category || null, detail: tn(d.options.length, '{count} option', '{count} options'), image: Boolean(d.imageKey), difficulty: d.difficulty };
    }
    case 'football-logic': {
      const d = (row as TdContentRow<'football-logic'>).data;
      return { title: d.prompt || d.displayAnswer, place: d.puzzle || null, detail: t('Answer: {answer}', { answer: d.displayAnswer }), image: Boolean(d.imageA || d.imageB) };
    }
    case 'put-in-order': {
      const d = (row as TdContentRow<'put-in-order'>).data;
      return { title: d.prompt, place: d.puzzle || null, detail: tn(d.items.length, '{count} item', '{count} items'), image: false };
    }
    case 'career-path': {
      const d = (row as TdContentRow<'career-path'>).data;
      return { title: d.displayAnswer, place: d.puzzle || null, detail: tn(d.clubs.length, '{count} club', '{count} clubs'), image: false };
    }
    default: {
      const data = row.data as Record<string, unknown>;
      return { title: String(data.key ?? row.id), place: null, detail: '', image: false };
    }
  }
}

const keyOf = (row: TdContentRow) => String((row.data as Record<string, unknown>).key ?? row.id);

/** Read in the browser only: the console draws its pages once the sign-in is known, never on the server. */
function readParam(name: string): string {
  return typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get(name) ?? '');
}

/** The Quizball CMS's Questions page (app/(dashboard)/questions with
 *  components/questions/question-list.tsx), for Table Derby's game modes:
 *  the same header, toolbar, filter chips, rows, review dialog and paging. */
export function TdQuestionsTab() {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const [modeKey, setModeKey] = useState(() => (TD_QUESTION_MODES.some((m) => m.key === readParam('mode')) ? readParam('mode') : TD_QUESTION_MODES[0]!.key));
  const mode = TD_QUESTION_MODES.find((m) => m.key === modeKey)!;
  const [searchQuery, setSearchQuery] = useState(() => readParam('q'));
  const [q, setQ] = useState(() => readParam('q'));
  const [category, setCategory] = useState(() => readParam('category') || 'all');
  const [status, setStatus] = useState<'all' | TdContentStatus>('all');
  const [difficulty, setDifficulty] = useState<'all' | (typeof DIFFICULTIES)[number]>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [refusals, setRefusals] = useState<Array<{ label: string; message: string }>>([]);
  const [archiving, setArchiving] = useState<TdContentRow[] | null>(null);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // A step past the last loaded row waits for its page. Closing, another step or a new filter gives the wait up.
  const wait = useRef<object | null>(null);
  const [waiting, setWaiting] = useState(false);
  const stopWaiting = () => {
    wait.current = null;
    setWaiting(false);
  };

  const byDifficulty = mode.type === 'practice-questions' && difficulty !== 'all';
  const query = useMemo<TdListQuery>(
    () => ({ q: q || undefined, status: status === 'all' ? undefined : status, category: mode.categoryType && category !== 'all' ? category : undefined }),
    [q, status, category, mode.categoryType],
  );
  // The API filters by text, status and category; difficulty is read from every practice question.
  const list = useTdContentList(mode.type, query, !byDifficulty);
  const everyPractice = useTdAllRows('practice-questions', query, byDifficulty);
  const categories = useTdAllRows(mode.categoryType ?? 'card-categories', {}, mode.categoryType !== undefined);
  const rows = useMemo<TdContentRow[]>(() => {
    if (byDifficulty) return ((everyPractice.data?.rows ?? []) as TdContentRow<'practice-questions'>[]).filter((row) => row.data.difficulty === difficulty);
    return (list.data?.pages.flatMap((p) => p.items) ?? []) as TdContentRow[];
  }, [byDifficulty, everyPractice.data, list.data, difficulty]);
  const more = !byDifficulty && Boolean(list.hasNextPage);
  const isLoading = byDifficulty ? everyPractice.isLoading : list.isLoading;
  const error = byDifficulty ? everyPractice.error : list.error;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // A page past the loaded rows loads the next fifty first.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    if (!byDifficulty && pageRows.length < PAGE_SIZE && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [byDifficulty, pageRows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  function reset(apply: () => void) {
    apply();
    stopWaiting();
    setPage(1);
    setSelected([]);
    setRefusals([]);
  }

  // Typing searches after a pause; Enter searches at once.
  const searched = useRef(q);
  const applySearch = (value: string) => {
    const next = value.trim();
    if (next === searched.current) return;
    searched.current = next;
    reset(() => setQ(next));
  };
  useEffect(() => {
    const timer = setTimeout(() => applySearch(searchQuery), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applySearch only reads refs and calls setters
  }, [searchQuery]);

  const openIndex = target?.row ? rows.findIndex((row) => row.id === target.row!.id) : -1;
  const open = (next: TdEditorTarget | null) => {
    stopWaiting();
    setTarget(next);
  };
  const goTo = (index: number) => {
    const row = rows[index];
    if (row) {
      setPage(Math.floor(index / PAGE_SIZE) + 1);
      return open({ type: mode.type, row });
    }
    if (!more) return;
    const { type } = mode;
    const mine = {};
    wait.current = mine;
    setWaiting(true);
    void fetchNextPage().then((result) => {
      if (wait.current !== mine) return;
      const arrived = result.data?.pages.flatMap((p) => p.items)[index] as TdContentRow | undefined;
      if (!arrived) return stopWaiting();
      setPage(Math.floor(index / PAGE_SIZE) + 1);
      open({ type, row: arrived });
    });
  };

  const publisher = user ? isTdPublisher(user.role) : false;
  const canReady = (row: TdContentRow) => row.status === 'draft';
  const canApprove = (row: TdContentRow) => publisher && row.status === 'ready' && row.lastEditor.id !== user?.id;
  const canArchive = (row: TdContentRow) => row.status !== 'archived' && (publisher || (row.approvedVersion === null && row.lastEditor.id === user?.id));
  const chosen = rows.filter((row) => selected.includes(row.id));
  const visibleIds = pageRows.map((row) => row.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const changeMode = (key: string) =>
    reset(() => {
      setModeKey(key);
      setCategory('all');
      setDifficulty('all');
      window.history.replaceState(null, '', `?mode=${key}`);
    });

  const run = async (action: 'ready' | 'approve' | 'archive' | 'restore', targets: TdContentRow[]) => {
    setRefusals([]);
    setBulk({ completed: 0, total: targets.length, failed: 0 });
    const operation = beginOperation(tdTokens);
    const api = tdAdmin.content(mode.type);
    let completed = 0;
    let failed = 0;
    const results = await runEach(tdTokens, operation, targets, async (row) => {
      try {
        return action === 'approve' ? await api.approve(row.id, row.version, undefined, operation) : await api[action](row.id, row.version, operation);
      } catch (caught) {
        failed++;
        throw caught;
      } finally {
        completed++;
        setBulk({ completed, total: targets.length, failed });
      }
    });
    const refused = results.filter((r) => !r.ok);
    const done = results.length - refused.length;
    const words = { ready: t('{n} marked ready', { n: done }), approve: t('{n} approved', { n: done }), archive: t('{n} archived', { n: done }), restore: t('{n} restored', { n: done }) };
    if (done) toast.success(words[action]);
    setRefusals(refused.map((r) => ({ label: show(mode.type, r.item).title || keyOf(r.item), message: tdErrorText(!r.ok ? r.error : null) })));
    setBulk(null);
    setSelected([]);
    await queryClient.invalidateQueries({ queryKey: tdKeys.content });
    await queryClient.invalidateQueries({ queryKey: tdKeys.releases });
  };

  const categoryName = (key: string) => {
    const found = categories.data?.rows.find((row) => (row.data as { key: string }).key === key);
    if (!found) return key;
    const d = found.data as { prompt?: string; title?: string };
    return d.prompt ?? d.title ?? key;
  };

  const toggleOne = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const toggleVisible = () => setSelected((current) => (allVisibleSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, rows.length);

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-8 py-4">
      <div className="flex items-center justify-between gap-4">
        <header className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight text-gray-900">{t('Questions')}</h1>
          <p className="text-base font-medium text-gray-500">{t('Manage and curate your quiz questions library.')}</p>
        </header>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={() => setPublishing(true)}>
            <Rocket className="mr-2 h-4 w-4" />
            {t('Publish')}
          </Button>
          <Button variant="outline" onClick={() => setUploading(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t('Upload Questions')}
          </Button>
          <Button
            onClick={() => open({ type: mode.type, row: null, preset: mode.categoryType && category !== 'all' ? { categoryKey: category } : undefined })}
            className="flex h-11 items-center gap-2 rounded-xl bg-gray-900 px-6 text-sm font-bold text-white shadow-lg shadow-gray-200 transition-all hover:bg-gray-800 active:scale-95"
          >
            <Plus className="h-4 w-4" />
            {t('New Question')}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Search & filter bar */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="group relative min-w-[300px] flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-gray-400 transition-colors group-focus-within:text-gray-900" />
              <Input
                placeholder={t('Search questions...')}
                aria-label={t('Search questions')}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && applySearch(searchQuery)}
                className="h-10 rounded-xl border-transparent bg-gray-200/30 pl-10 text-sm font-medium transition-all focus:border-gray-200 focus:bg-white focus-visible:ring-2 focus-visible:ring-gray-900/5"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={modeKey} onValueChange={changeMode}>
                <SelectTrigger aria-label={t('Type')} className={cn(TRIGGER, 'w-[230px]')}>
                  <SelectValue placeholder={t('Type')} />
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
                  <SelectTrigger aria-label={t('Category')} className={cn(TRIGGER, 'w-[200px]')}>
                    <SelectValue placeholder={t('Category')} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                    <SelectItem value="all" className={ITEM}>
                      {t('Categories')}
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
                <SelectTrigger aria-label={t('Status')} className={cn(TRIGGER, 'w-[170px]')}>
                  <SelectValue placeholder={t('Status')} />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                  <SelectItem value="all" className={ITEM}>
                    {t('Status')}
                  </SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option} className={ITEM}>
                      {TD_STATUS_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode.type === 'practice-questions' && (
                <Select value={difficulty} onValueChange={(value) => reset(() => setDifficulty(value as typeof difficulty))}>
                  <SelectTrigger aria-label={t('Difficulty')} className={cn(TRIGGER, 'w-[140px]')}>
                    <SelectValue placeholder={t('Difficulty')} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-gray-200 bg-white shadow-xl">
                    <SelectItem value="all" className={ITEM}>
                      {t('Difficulty')}
                    </SelectItem>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d} className={cn(ITEM, getDifficultyTextColor(d))}>
                        {DIFFICULTY_WORDS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {selected.length > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-gray-200/70 bg-white px-3 py-2 shadow-sm">
                {bulk ? (
                  <>
                    <div className="flex min-w-[200px] items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(bulk.completed / bulk.total) * 100}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs font-bold text-gray-600">
                        {bulk.completed}/{bulk.total}
                      </span>
                    </div>
                    {bulk.failed > 0 && <span className="text-xs font-bold text-red-500">{t('{n} refused', { n: bulk.failed })}</span>}
                  </>
                ) : (
                  <>
                    <span className="text-xs font-bold text-gray-600">{t('{n} selected', { n: selected.length })}</span>
                    <div className="h-4 w-px bg-gray-200" />
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={!chosen.some(canApprove)} onClick={() => void run('approve', chosen.filter(canApprove))}>
                      {t('Approve')}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={!chosen.some(canReady)} onClick={() => void run('ready', chosen.filter(canReady))}>
                      {t('Mark ready')}
                    </Button>
                    <Button variant="destructive" size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={!chosen.some(canArchive)} onClick={() => setArchiving(chosen.filter(canArchive))}>
                      {t('Archive')}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {category !== 'all' && (
              <button type="button" onClick={() => reset(() => setCategory('all'))} className={CHIP}>
                {t('Category: {name}', { name: categoryName(category) })}
                <X className="h-3 w-3" />
              </button>
            )}
            {status !== 'all' && (
              <button type="button" onClick={() => reset(() => setStatus('all'))} className={CHIP}>
                {t('Status: {status}', { status: TD_STATUS_WORDS[status] })}
                <X className="h-3 w-3" />
              </button>
            )}
            {difficulty !== 'all' && mode.type === 'practice-questions' && (
              <button type="button" onClick={() => reset(() => setDifficulty('all'))} className={CHIP}>
                {t('Difficulty: {difficulty}', { difficulty: DIFFICULTY_WORDS[difficulty] })}
                <X className="h-3 w-3" />
              </button>
            )}
            {q && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  applySearch('');
                }}
                className={CHIP}
              >
                {t('Search: {text}', { text: q })}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {refusals.length > 0 && (
            <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              <p className="font-bold">{t('{n} refused', { n: refusals.length })}</p>
              <ul className="mt-1 list-disc pl-4">
                {refusals.map((r, i) => (
                  <li key={i}>
                    <span className="font-semibold">{r.label}</span>: {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Rows */}
        <div className="space-y-px">
          {error ? (
            <TdErrorPanel error={error} />
          ) : isLoading ? (
            [...Array(5)].map((_, i) => <div key={i} className="mb-2 h-16 animate-pulse rounded-2xl border border-gray-100 bg-white" />)
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center space-y-4 rounded-[2rem] border border-dashed border-gray-200 bg-white py-20 text-gray-400">
              <HelpCircle className="h-12 w-12 opacity-10" />
              <div className="text-center">
                <p className="text-sm font-bold text-gray-900">{t('No questions found')}</p>
                <p className="mt-1 text-xs font-medium">{t('Try adjusting your filters or search terms.')}</p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[2.5rem] border-0 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-gray-50 bg-white px-6 py-4">
                <input
                  type="checkbox"
                  aria-label={t('Select all shown')}
                  className="h-4 w-4 rounded-md border-gray-200 text-slate-900 transition-all focus:ring-slate-900"
                  checked={allVisibleSelected}
                  onChange={toggleVisible}
                />
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('Select all')}</span>
              </div>
              {pageRows.map((row, index) => {
                const shown = show(mode.type, row);
                return (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.2) }}
                    className="group relative flex cursor-pointer items-center justify-between border-b border-gray-50 px-6 py-5 transition-all last:border-0 hover:scale-[1.01] hover:bg-slate-50 active:scale-[0.99]"
                    onClick={() => open({ type: mode.type, row })}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-5">
                      <input
                        type="checkbox"
                        aria-label={t('Select {label}', { label: shown.title || keyOf(row) })}
                        className="h-4 w-4 rounded-md border-gray-200 text-slate-900 transition-all focus:ring-slate-900"
                        checked={selected.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div className={cn('h-2.5 w-2.5 shrink-0 rounded-full transition-all duration-500', STATUS_DOT[row.status])} />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-[16px] font-semibold leading-tight text-slate-900">{shown.title || '—'}</span>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                          {shown.place && (
                            <div className="flex items-center gap-1.5">
                              <Layers className="h-3.5 w-3.5 text-slate-300" />
                              <span className="text-xs font-medium text-slate-400">{mode.categoryType ? categoryName(shown.place) : shown.place}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            {shown.image ? <ImageIcon className="h-3.5 w-3.5 text-slate-300" /> : <FileText className="h-3.5 w-3.5 text-slate-300" />}
                            <span className="max-w-72 truncate text-xs font-medium text-slate-400">{shown.detail}</span>
                          </div>
                          {shown.difficulty && (
                            <div className="flex items-center gap-2">
                              <DifficultySignal difficulty={shown.difficulty as 'easy'} size="sm" />
                              <span className={cn('text-xs font-bold', getDifficultyTextColor(shown.difficulty))}>{DIFFICULTY_WORDS[shown.difficulty] ?? shown.difficulty}</span>
                            </div>
                          )}
                          {shown.points !== undefined && <span className="text-xs font-bold text-slate-500">{tn(shown.points, '{count} point', '{count} points')}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="ml-4 flex shrink-0 items-center gap-6">
                      <div className="flex flex-col items-end gap-1 px-4">
                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-300">{t('Status')}</span>
                        <div className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', STATUS_PILL[row.status])}>{TD_STATUS_WORDS[row.status]}</div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-all duration-300 focus-within:opacity-100 group-hover:opacity-100" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={t('Actions for {label}', { label: shown.title || keyOf(row) })} className="h-9 w-9 rounded-xl text-slate-400 transition-all hover:bg-white hover:text-slate-900 hover:shadow-md">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-[1.25rem] border-slate-100 bg-white/95 p-2 shadow-2xl backdrop-blur-xl">
                            <DropdownMenuItem onClick={() => void run('approve', [row])} disabled={!canApprove(row) || bulk !== null} className={MENU_ITEM}>
                              <Send className="h-4 w-4 text-emerald-500" /> {t('Approve')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void run('ready', [row])} disabled={!canReady(row) || bulk !== null} className={MENU_ITEM}>
                              <Clock className="h-4 w-4 text-slate-400" /> {t('Mark ready')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-2 bg-slate-50" />
                            {row.status === 'archived' ? (
                              <DropdownMenuItem onClick={() => void run('restore', [row])} disabled={!publisher || bulk !== null} className={MENU_ITEM}>
                                <ArchiveRestore className="h-4 w-4 text-slate-400" /> {t('Restore')}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => setArchiving([row])} disabled={!canArchive(row) || bulk !== null} className={cn(MENU_ITEM, 'font-bold text-rose-500 focus:bg-rose-50 focus:text-rose-600')}>
                                <Archive className="h-4 w-4" /> {t('Archive')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Paging */}
        {rows.length > PAGE_SIZE || more ? (
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-medium text-muted-foreground">
              {more
                ? t('Showing {first} to {last} of {total}+ questions', { first, last, total: rows.length })
                : t('Showing {first} to {last} of {total} questions', { first, last, total: rows.length })}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" aria-label={t('Previous page')} className="h-8 w-8 rounded-lg" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center rounded-lg border bg-muted/50 px-3 py-1 text-xs font-bold">
                {page} / {more ? `${totalPages}+` : totalPages}
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('Next page')}
                className="h-8 w-8 rounded-lg"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page >= totalPages && !more) || (!byDifficulty && isFetchingNextPage)}
              >
                {!byDifficulty && isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Archive confirmation, as the Quizball list confirms a delete */}
      <Dialog open={archiving !== null} onOpenChange={(isOpen) => !isOpen && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Archive Question')}</DialogTitle>
            <DialogDescription>
              {archiving && archiving.length > 1
                ? t('Archive {n} selected questions? They leave the game at the next publish and can be restored.', { n: archiving.length })
                : t('Archive this question? It leaves the game at the next publish and can be restored.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={bulk !== null}
              onClick={() => {
                const targets = archiving ?? [];
                setArchiving(null);
                void run('archive', targets);
              }}
            >
              {t('Archive')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-[2rem] border-slate-200 bg-white p-0 sm:max-w-4xl">
          <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-5">
            <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">{t('Upload questions')}</DialogTitle>
            <DialogDescription>{t('Choose the game mode and the category, check the file format below, then choose the file. Every row becomes a draft.')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {uploading && <TdImportTab embedded initialType={mode.type} initialCategory={mode.categoryType && category !== 'all' ? category : null} />}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={publishing} onOpenChange={setPublishing}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-[2rem] border-slate-200 bg-white p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-5">
            <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">{t('Publish')}</DialogTitle>
            <DialogDescription>{t('Approved questions reach players when they are published.')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{publishing && <TdReleasesTab />}</div>
        </DialogContent>
      </Dialog>

      <TdContentEditorDialog
        target={target}
        onClose={() => open(null)}
        startOn="preview"
        nav={openIndex >= 0 ? { index: openIndex, total: rows.length, more, waiting, onGo: goTo } : null}
        types={{
          options: TD_QUESTION_MODES.map((m) => ({ type: m.type, label: m.label })),
          onChange: (type) => open({ type, row: null }),
        }}
      />
    </div>
  );
}
