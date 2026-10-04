'use client';

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, ChevronLeft, ChevronRight, Edit, Eye, Loader2, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { useTdAllRows, useTdContentRow, useTdHistory, useTdWrite } from '@/hooks/use-td-content';
import { TD_CONTENT_SCHEMA_NAMES, type TdContentData, type TdContentRow, type TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { contentWriteIssues, TD_MERGE_UNITS } from '@/lib/td/content-rules';
import type { SchemaIssue } from '@/lib/td/contract';
import { describeTdError } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tc, TD_LANG, tn } from '@/lib/td/i18n';
import { mergeDrafts, resolveConflicts, sameDraft, type TdDraft, type TdFieldConflict } from '@/lib/td/merge';
import { contentActions } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_TYPE_CONFIG } from './content-types';
import { TdCategoryApproval } from './td-category-approval';
import { TdUploadingContext } from './td-uploading';
import { TdInvalidInputContext, TdPendingInputContext } from './td-form';
import { hasPreview, TdPreview } from './td-preview';
import { TD_STATUS_LABELS, TD_STATUS_WORDS } from './td-status';

export interface TdEditorTarget<T extends TdContentType = TdContentType> {
  type: T;
  /** null: a new row. */
  row: TdContentRow<T> | null;
  preset?: Partial<TdContentData<T>>;
}

const draftOf = (row: TdContentRow): TdDraft => ({ data: row.data as Record<string, unknown>, position: row.position, note: row.note });

const CATEGORY_TYPES = new Set<TdContentType>(['card-categories', 'box-categories']);
const CATEGORY_OF: Partial<Record<TdContentType, 'card-categories' | 'box-categories'>> = { cards: 'card-categories', 'box-questions': 'box-categories' };

type Mode = 'view' | 'edit';

/** Where the open row stands in its list, and how to step to its neighbours. */
export interface TdEditorNav {
  index: number;
  total: number;
  /** The list has more rows than are loaded: the last one still has a next. */
  more: boolean;
  /** The next row's page is on its way: the form is locked until it opens. */
  waiting?: boolean;
  onGo: (index: number) => void;
}

/** The game modes a new row may be made in, for the form's Type select (the Questions page passes its own). */
export interface TdTypeChoice {
  options: ReadonlyArray<{ type: TdContentType; label: string }>;
  onChange: (type: TdContentType) => void;
}

const LABEL = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

/** The Quizball CMS's question dialog (components/questions/question-dialog.tsx):
 *  an existing question opens on its preview, with the arrows and the ← → keys
 *  stepping through the list; "Edit Details" turns it into the form. A row
 *  with no preview (a category, a setting) opens on the form. */
export function TdContentEditorDialog({
  target,
  onClose,
  onSaved,
  nav,
  startOn = 'edit',
  types,
}: {
  target: TdEditorTarget | null;
  onClose: () => void;
  onSaved?: (row: TdContentRow) => void;
  nav?: TdEditorNav | null;
  startOn?: 'edit' | 'preview';
  types?: TdTypeChoice;
}) {
  // Chosen when the dialog opens and kept while stepping through rows.
  const [session, setSession] = useState<{ open: boolean; mode: Mode }>({ open: false, mode: 'edit' });
  if ((target !== null) !== session.open) {
    setSession({ open: target !== null, mode: target?.row && startOn === 'preview' && hasPreview(target.type) ? 'view' : 'edit' });
  }
  // A new row turns to its preview once saved (the form asks for it).
  const mode: Mode = session.mode === 'view' && target && hasPreview(target.type) ? 'view' : 'edit';
  // Asked before the dialog closes: the open form says whether it may be left.
  const leaveRef = useRef<() => boolean>(() => true);
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && leaveRef.current() && onClose()}>
      <DialogContent
        className={cn(
          'rounded-[1.5rem] border border-slate-200 bg-white shadow-2xl focus:outline-none',
          mode === 'view' ? 'flex max-h-[92vh] w-[min(94vw,920px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none' : 'max-h-[calc(100vh-2rem)] w-full overflow-y-auto p-5 sm:max-w-2xl sm:p-6',
        )}
      >
        {target && (
          <EditorBody
            key={`${target.type}:${target.row?.id ?? 'new'}`}
            target={target}
            leaveRef={leaveRef}
            onSaved={onSaved}
            onClose={onClose}
            nav={target.row ? (nav ?? null) : null}
            mode={mode}
            setMode={(next) => setSession((current) => ({ ...current, mode: next }))}
            types={target.row ? undefined : types}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Conflict {
  theirs: TdContentRow | null;
  conflicts: TdFieldConflict[];
  merged: TdDraft;
  choices: Record<string, 'mine' | 'theirs'>;
}

function EditorBody({
  target,
  leaveRef,
  onSaved,
  onClose,
  nav,
  mode,
  setMode,
  types,
}: {
  target: TdEditorTarget;
  leaveRef: MutableRefObject<() => boolean>;
  onSaved?: (row: TdContentRow) => void;
  onClose: () => void;
  nav: TdEditorNav | null;
  mode: Mode;
  setMode: (mode: Mode) => void;
  types?: TdTypeChoice;
}) {
  const { type } = target;
  const config = TD_TYPE_CONFIG[type] as unknown as (typeof TD_TYPE_CONFIG)['penalty-questions'];
  const { user } = useTdAuth();
  const write = useTdWrite();
  const [row, setRow] = useState<TdContentRow | null>(target.row);
  // What the form was loaded from: the base of a three-way merge.
  const [base, setBase] = useState<TdDraft>(() => (target.row ? draftOf(target.row) : { data: config.empty(target.preset as never) as Record<string, unknown>, position: 0, note: '' }));
  const [draft, setDraft] = useState<TdDraft>(base);
  // Uploads running inside the form: writes wait for them, so the draft never changes under a write.
  const [uploads, setUploads] = useState(0);
  const reportUploading = useCallback((on: boolean) => setUploads((n) => Math.max(0, n + (on ? 1 : -1))), []);
  // Fields whose text is not a valid value: the draft still has the old one, so nothing is written meanwhile.
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(() => new Set());
  const reportInvalid = useCallback(
    (field: string, bad: boolean) =>
      setInvalid((current) => {
        if (current.has(field) === bad) return current;
        const next = new Set(current);
        if (bad) next.add(field);
        else next.delete(field);
        return next;
      }),
    [],
  );
  const held = uploads > 0 || invalid.size > 0;
  // Fields holding text that is not in the draft yet: nothing is held for it, but leaving asks first.
  const [typing, setTyping] = useState<ReadonlySet<string>>(() => new Set());
  const reportPending = useCallback(
    (field: string, pending: boolean) =>
      setTyping((current) => {
        if (current.has(field) === pending) return current;
        const next = new Set(current);
        if (pending) next.add(field);
        else next.delete(field);
        return next;
      }),
    [],
  );
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [approving, setApproving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const creating = row === null;
  const dirty = creating || !sameDraft(draft, base);
  // Something here would be lost by leaving: a change, text the draft does not have yet (not a valid number, a spelling not entered), an upload still running.
  const unsaved = held || typing.size > 0 || !sameDraft(draft, base);
  const mayLeave = useCallback(() => !unsaved || window.confirm(t('This one has changes that are not saved. Leave it without saving?')), [unsaved]);
  useEffect(() => {
    leaveRef.current = mayLeave;
    return () => {
      leaveRef.current = () => true;
    };
  }, [leaveRef, mayLeave]);

  const go = useCallback(
    (index: number) => {
      if (!nav || nav.waiting || index < 0 || (index >= nav.total && !nav.more)) return;
      if (mayLeave()) nav.onGo(index);
    },
    [nav, mayLeave],
  );
  // ← and → step through the list on the preview, unless a field has the keys or another dialog is on top.
  useEffect(() => {
    if (!nav || mode !== 'view') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const el = event.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(?:INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelectorAll('[data-slot="dialog-content"]').length > 1) return;
      event.preventDefault();
      go(nav.index + (event.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav, go, mode]);
  const history = useTdHistory(type, row?.id ?? null);
  const categoryType = CATEGORY_OF[type];
  const categories = useTdAllRows(categoryType ?? 'card-categories', {}, categoryType !== undefined && mode === 'view');

  // A fresher copy replaces the form only while nothing is typed in it.
  const fresh = useTdContentRow(type, row?.id ?? null);
  if (fresh.data && row && fresh.data.version > row.version && !dirty && !held && !conflict) {
    setRow(fresh.data);
    setBase(draftOf(fresh.data));
    setDraft(draftOf(fresh.data));
  }

  const adopt = (next: TdContentRow) => {
    setRow(next);
    setBase(draftOf(next));
    setDraft(draftOf(next));
    setIssues([]);
    setConflict(null);
  };

  const api = tdAdmin.content(type);
  const schemaName = TD_CONTENT_SCHEMA_NAMES[type];

  async function run(label: string, work: () => Promise<TdContentRow>, done: string): Promise<boolean> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const next = await work();
      adopt(next);
      toast.success(done);
      onSaved?.(next);
      return true;
    } catch (caught) {
      handleRefusal(caught);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function handleRefusal(caught: unknown) {
    const view = describeTdError(caught);
    if (caught instanceof TdApiError && caught.code === 'revision_conflict' && row) {
      const theirs = (view.current ?? null) as TdContentRow | null;
      if (!dirty && theirs) {
        adopt(theirs);
        setNotice(t('It changed meanwhile ({name}, {time}); this is the row as it is now. Check it and try again.', { name: theirs.updatedBy.name, time: formatGeorgiaTime(theirs.updatedAt) }));
        return;
      }
      const merge = theirs ? mergeDrafts(base, draft, draftOf(theirs), TD_MERGE_UNITS[type]) : { merged: draft, conflicts: [] };
      setConflict({ theirs, conflicts: merge.conflicts, merged: merge.merged, choices: {} });
      setMode('edit');
      return;
    }
    if (view.code === 'validation') {
      setIssues(view.issues);
      setMode('edit');
    }
    setError(caught);
  }

  const save = async () => {
    if (held) return;
    const body = creating
      ? { data: draft.data, ...(draft.note ? { note: draft.note } : {}) }
      : { version: row.version, data: draft.data, position: draft.position, note: draft.note };
    const found = contentWriteIssues(type, schemaName, creating ? 'create' : 'edit', body);
    setIssues(found);
    if (found.length) {
      setError(null);
      return;
    }
    const saved = await run(
      'save',
      () => write((operation) => (creating ? api.create(body as never, operation) : api.edit(row.id, body as never, operation))),
      creating ? t('{type} created as a draft', { type: capitalise(config.singular) }) : t('Saved'),
    );
    if (saved && hasPreview(type)) setMode('view');
  };

  const cancel = () => {
    if (!mayLeave()) return;
    if (creating || !hasPreview(type)) return onClose();
    setDraft(base);
    setIssues([]);
    setError(null);
    setConflict(null);
    setMode('view');
  };

  const transition = (action: 'ready' | 'approve' | 'archive' | 'restore', done: string) => {
    if (!row) return;
    const { id, version } = row;
    setConfirmArchive(false);
    void run(
      action,
      () => write((operation) => (action === 'approve' ? api.approve(id, version, undefined, operation) : api[action](id, version, operation))),
      done,
    );
  };
  const approve = () => (CATEGORY_TYPES.has(type) ? setApproving(true) : transition('approve', tc('Approved', 'it happened')));

  // A trail whose last refresh failed may be stale: it does not count.
  const actions = row && user ? contentActions(row, user, history.isError ? null : (history.data ?? null)) : null;
  const Editor = config.Editor;
  const question = hasPreview(type);
  const name = config.title(draft.data as never) || config.singular;
  const title =
    mode === 'view' ? t('Question Preview') : creating ? (question ? t('New Question') : t('New {type}', { type: config.singular })) : question ? t('Edit Question') : t('Edit {type}', { type: config.singular });
  const approvedDiffers = Boolean(row?.approved && !sameDraft({ data: row.approved as Record<string, unknown>, position: row.approvedPosition ?? 0, note: '' }, { data: row.data as Record<string, unknown>, position: row.position, note: '' }));
  const reason = actions && (actions.approve.reason ?? actions.restore.reason);

  const workflow = actions && (
    <>
      {actions.approve.allowed ? (
        <QuickAction tone="go" busy={busy === 'approve'} disabled={busy !== null || dirty || held} onClick={approve} icon={<Eye className="mr-2 h-4 w-4" />}>
          {t('Approve')}
        </QuickAction>
      ) : actions.ready.allowed ? (
        <QuickAction tone="go" busy={busy === 'ready'} disabled={busy !== null || dirty || held} onClick={() => transition('ready', t('Marked ready for review'))} icon={<Send className="mr-2 h-4 w-4" />}>
          {t('Mark ready')}
        </QuickAction>
      ) : actions.restore.allowed ? (
        <QuickAction tone="go" busy={busy === 'restore'} disabled={busy !== null || dirty || held} onClick={() => transition('restore', t('Restored'))} icon={<ArchiveRestore className="mr-2 h-4 w-4" />}>
          {t('Restore')}
        </QuickAction>
      ) : null}
    </>
  );
  const archive = actions?.archive.allowed && (
    <Button
      variant={confirmArchive ? 'destructive' : 'ghost'}
      disabled={busy !== null || dirty || held}
      onClick={() => (confirmArchive ? transition('archive', tc('Archived', 'it happened')) : setConfirmArchive(true))}
      className={cn('h-11 rounded-xl text-sm font-bold transition-all', !confirmArchive && 'text-red-400 hover:bg-red-50 hover:text-red-600')}
    >
      {busy === 'archive' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}
      {confirmArchive ? t('Confirm?') : t('Archive')}
    </Button>
  );

  const header = (
    <DialogHeader className={cn(mode === 'view' ? 'shrink-0 border-b border-slate-100 py-5 pl-6 pr-14' : 'pb-4 pr-12')}>
      <div className="flex items-center justify-between gap-3">
        <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">{title}</DialogTitle>
        {mode === 'view' && nav && nav.total > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">
              {nav.index + 1} <span className="mx-1 text-slate-200">/</span> {nav.total}
              {nav.more ? '+' : ''}
            </span>
            <div className="flex gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1">
              <Button variant="ghost" size="icon" aria-label={t('Previous')} title={t('Previous')} disabled={nav.waiting || nav.index <= 0} onClick={() => go(nav.index - 1)} className="h-8 w-8 rounded-lg transition-all hover:bg-white hover:shadow-sm">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t('Next')} title={t('Next')} disabled={nav.waiting || (nav.index >= nav.total - 1 && !nav.more)} onClick={() => go(nav.index + 1)} className="h-8 w-8 rounded-lg transition-all hover:bg-white hover:shadow-sm">
                {nav.waiting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
      <DialogDescription className="sr-only">{row ? revisionLine(row) : t('Saved as a draft; mark it ready when it is done, then a publisher approves it.')}</DialogDescription>
    </DialogHeader>
  );

  if (mode === 'view' && row) {
    const data = draft.data;
    const categoryKey = typeof data.categoryKey === 'string' ? data.categoryKey : null;
    const categoryRow = categoryKey ? categories.data?.rows.find((r) => (r.data as { key: string }).key === categoryKey) : undefined;
    const categoryName = categoryRow ? ((categoryRow.data as { prompt?: string; title?: string }).prompt ?? (categoryRow.data as { title?: string }).title) : categoryKey;
    const difficulty = type === 'practice-questions' ? String(data.difficulty) : null;
    return (
      <>
        {header}
        <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {difficulty && (
                <span className={cn('rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest', DIFFICULTY_TEXT[difficulty] ?? 'text-slate-500')}>{DIFFICULTY_WORDS[difficulty] ?? difficulty}</span>
              )}
              {type === 'cards' && (
                <span className="rounded-full border border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">{tn(Number(data.value), '{count} point', '{count} points')}</span>
              )}
              <span className="rounded-full border border-slate-200 bg-slate-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700">{config.singular}</span>
              {categoryName && <span className="rounded-full border border-slate-200 bg-slate-50/50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700">{categoryName}</span>}
              <span className={cn('rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest', row.status === 'approved' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-500')}>{TD_STATUS_WORDS[row.status]}</span>
            </div>
            {approvedDiffers && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {t('This version is not approved yet: players get the last approved one until it is.')}
              </p>
            )}
            {notice && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{notice}</p>}
            <TdPreview type={type} data={data} />
            <TdErrorPanel error={error} />
            {reason && <p className="text-xs font-medium text-slate-400">{reason}</p>}
            <div className="flex gap-3 border-t border-slate-100 pt-4">
              {workflow}
              {actions?.save.allowed && (
                <Button variant="outline" onClick={() => setMode('edit')} className="h-11 flex-1 rounded-xl border-slate-200 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50">
                  <Edit className="mr-2 h-4 w-4" />
                  {t('Edit Details')}
                </Button>
              )}
              {archive}
            </div>
          </div>
        </div>
        {approving && CATEGORY_TYPES.has(type) && (
          <TdCategoryApproval
            type={type as 'card-categories' | 'box-categories'}
            category={row as TdContentRow<'card-categories'>}
            onClose={() => setApproving(false)}
            onApproved={(next) => {
              adopt(next);
              setApproving(false);
              onSaved?.(next);
            }}
          />
        )}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        {conflict ? (
          <ConflictPanel
            conflict={conflict}
            onChoose={(field, side) => setConflict({ ...conflict, choices: { ...conflict.choices, [field]: side } })}
            onUseMerged={() => {
              if (!conflict.theirs) return;
              setRow(conflict.theirs);
              setBase(draftOf(conflict.theirs));
              setDraft(resolveConflicts(conflict.merged, conflict.conflicts, conflict.choices));
              setConflict(null);
              setNotice(t('Merged onto the newer version. Review it, then save.'));
            }}
            onDiscard={() => {
              if (conflict.theirs) adopt(conflict.theirs);
              setConflict(null);
            }}
          />
        ) : (
          <>
            {types && (
              <div className="space-y-1.5">
                <label htmlFor="td-new-type" className={cn(LABEL, 'ml-1')}>
                  {t('Type')} *
                </label>
                <select
                  id="td-new-type"
                  value={type}
                  onChange={(event) => mayLeave() && types.onChange(event.target.value as TdContentType)}
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium"
                >
                  {types.options.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {notice && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{notice}</p>}
            {/* Locked while a write and its refresh run: the answer replaces the form, so nothing typed meanwhile may be lost. */}
            <TdUploadingContext.Provider value={reportUploading}>
              <TdInvalidInputContext.Provider value={reportInvalid}>
                <TdPendingInputContext.Provider value={reportPending}>
                  <fieldset disabled={busy !== null || Boolean(nav?.waiting)} className="flex flex-col gap-4">
                    <Editor
                      value={draft.data as never}
                      onChange={(update: unknown) =>
                        setDraft((current) => ({
                          ...current,
                          data: (typeof update === 'function' ? (update as (d: Record<string, unknown>) => Record<string, unknown>)(current.data) : update) as Record<string, unknown>,
                        }))
                      }
                      issues={issues}
                      creating={creating}
                    />
                  </fieldset>
                </TdPendingInputContext.Provider>
              </TdInvalidInputContext.Provider>
            </TdUploadingContext.Provider>
            {issues.some((issue) => !issue.path.startsWith('data.')) && <TdErrorPanel error={new TdApiError(422, 'validation', 'Some fields are not valid', { issues })} />}
            <TdErrorPanel error={error} hideIssues={issues.length > 0} />
            {invalid.size > 0 && <p className="text-xs font-medium text-red-600">{t('A number in the form is not valid: fix it to save.')}</p>}
            {uploads > 0 && <p className="text-xs text-slate-400">{t('Waiting for the upload to finish.')}</p>}
            {!question && row && reason && <p className="text-xs font-medium text-slate-400">{reason}</p>}
            {!question && row && (workflow || archive) && (
              <div className="flex gap-3">
                {workflow}
                {archive}
              </div>
            )}
            <div className="flex gap-3 border-t border-slate-100 pt-4">
              <Button variant="ghost" onClick={cancel} className="h-11 flex-1 rounded-xl text-sm font-bold text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-900">
                {t('Cancel')}
              </Button>
              {(creating || actions?.save.allowed) && (
                <Button
                  onClick={() => void save()}
                  disabled={busy !== null || !dirty || held || Boolean(nav?.waiting)}
                  className="h-11 flex-1 rounded-xl bg-slate-900 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-0"
                >
                  {busy === 'save' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  {creating ? (question ? t('Create Question') : t('Create')) : t('Save Changes')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
      {approving && row && CATEGORY_TYPES.has(type) && (
        <TdCategoryApproval
          type={type as 'card-categories' | 'box-categories'}
          category={row as TdContentRow<'card-categories'>}
          onClose={() => setApproving(false)}
          onApproved={(next) => {
            adopt(next);
            setApproving(false);
            onSaved?.(next);
          }}
        />
      )}
      <span className="sr-only">{name}</span>
    </>
  );
}

const DIFFICULTY_TEXT: Record<string, string> = { easy: 'text-emerald-600', medium: 'text-amber-600', hard: 'text-rose-600' };
const DIFFICULTY_WORDS: Record<string, string> = { easy: t('easy'), medium: t('medium'), hard: t('hard') };

/** The Quizball dialog's status button: ghost, green while it moves the row on. */
function QuickAction({ tone, busy, disabled, onClick, icon, children }: { tone: 'go'; busy: boolean; disabled: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className={cn('h-11 flex-1 rounded-xl text-sm font-bold transition-all', tone === 'go' && 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700')}
    >
      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : icon}
      {children}
    </Button>
  );
}

/** English starts a sentence with a capital; Georgian has none (and its letters' upper case is another script). */
const capitalise = (text: string) => (TD_LANG === 'en' ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** The header line of a saved row: its revision, its content version, who approved and who last edited it. */
function revisionLine(row: TdContentRow): string {
  const vars = { revision: row.version, content: row.contentVersion, editor: row.lastEditor.name };
  if (row.approvedVersion === null) return t('Revision {revision} · content v{content} · last edit by {editor}', vars);
  if (!row.approvedBy) return t('Revision {revision} · content v{content} · approved v{approved} · last edit by {editor}', { ...vars, approved: row.approvedVersion });
  return t('Revision {revision} · content v{content} · approved v{approved} by {approver} · last edit by {editor}', { ...vars, approved: row.approvedVersion, approver: row.approvedBy.name });
}

export function showValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item))).join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const fieldName = (field: string) => field.replace(/^data\./, '').split('+').join(' + ');

/** A unit's value (an object of its fields) one field a line; any other value as showValue has it. */
function UnitValue({ conflict, value }: { conflict: TdFieldConflict; value: unknown }) {
  if (!conflict.unit) return <span className="break-words">{showValue(value)}</span>;
  const fields = conflict.unit.filter((field) => showValue((conflict.mine as Record<string, unknown>)[field]) !== showValue((conflict.theirs as Record<string, unknown>)[field]));
  return (
    <span className="flex flex-col gap-0.5">
      {(fields.length ? fields : conflict.unit).map((field) => (
        <span key={field} className="break-words">
          <span className="font-mono text-[10px] text-(--td-text-3)">{field}: </span>
          {showValue((value as Record<string, unknown>)[field])}
        </span>
      ))}
    </span>
  );
}

function ConflictPanel({
  conflict,
  onChoose,
  onUseMerged,
  onDiscard,
}: {
  conflict: Conflict;
  onChoose: (field: string, side: 'mine' | 'theirs') => void;
  onUseMerged: () => void;
  onDiscard: () => void;
}) {
  const { theirs } = conflict;
  if (!theirs)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-(--td-danger)/40 p-4">
        <p className="font-semibold">{t('This row no longer exists')}</p>
        <p className="text-sm text-(--td-text-2)">{t('It was removed while you were editing (an import undo removes rows nobody changed). Copy anything you need, then close.')}</p>
      </div>
    );
  const archived = theirs.status === 'archived';
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="font-semibold">{t('Someone changed this while you were editing')}</p>
        <p className="mt-1 text-sm text-(--td-text-2)">
          {t('{name} saved revision {revision} ({status}) at {time}.', {
            name: theirs.updatedBy.name,
            revision: theirs.version,
            status: TD_STATUS_LABELS[theirs.status].toLowerCase(),
            time: formatGeorgiaTime(theirs.updatedAt),
          })}{' '}
          {archived
            ? t('It is archived now: a publisher restores it before anyone edits it.')
            : t('Their changes to fields you did not touch are kept; where you both changed a field, choose which to keep.')}
        </p>
      </div>
      {!archived && conflict.conflicts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {conflict.conflicts.map((c) => (
            <li key={c.field} className="rounded-lg border border-border p-3">
              <p className="font-mono text-xs text-(--td-text-3)">{fieldName(c.field)}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(['theirs', 'mine'] as const).map((side) => (
                  <label key={side} className={cn('flex cursor-pointer gap-2 rounded-lg border p-2 text-sm', (conflict.choices[c.field] ?? 'mine') === side ? 'border-primary bg-primary/5' : 'border-border')}>
                    <input type="radio" name={c.field} checked={(conflict.choices[c.field] ?? 'mine') === side} onChange={() => onChoose(c.field, side)} className="mt-1 accent-(--td-primary)" />
                    <span className="min-w-0">
                      <span className="block text-xs text-(--td-text-3)">{side === 'theirs' ? t('Theirs') : t('Yours')}</span>
                      <UnitValue conflict={c} value={side === 'theirs' ? c.theirs : c.mine} />
                    </span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!archived && conflict.conflicts.length === 0 && <p className="text-sm text-(--td-text-2)">{t('Your changes and theirs touch different fields, so they merge cleanly.')}</p>}
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button onClick={onUseMerged} className="rounded-lg">
            {t('Continue with the merge')}
          </Button>
        )}
        <Button variant="secondary" onClick={onDiscard} className="rounded-lg">
          <RefreshCw />
          {t('Discard mine, load theirs')}
        </Button>
      </div>
    </div>
  );
}

