'use client';

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Check, ChevronLeft, ChevronRight, Eye, History, Loader2, RefreshCw, Save, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { useTdContentRow, useTdCurrentRelease, useTdHistory, useTdWrite } from '@/hooks/use-td-content';
import { TD_CONTENT_SCHEMA_NAMES, type TdContentData, type TdContentRow, type TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { contentWriteIssues, TD_MERGE_UNITS } from '@/lib/td/content-rules';
import type { SchemaIssue } from '@/lib/td/contract';
import { describeTdError } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tc, TD_LANG, tr } from '@/lib/td/i18n';
import { mergeDrafts, resolveConflicts, sameDraft, type TdDraft, type TdFieldConflict } from '@/lib/td/merge';
import { contentActions } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_TYPE_CONFIG } from './content-types';
import { TdCategoryApproval } from './td-category-approval';
import { TdUploadingContext } from './td-uploading';
import { issuesAt, TdField, TdInvalidInputContext, TdNumberField } from './td-form';
import { hasPreview, TdPreview } from './td-preview';
import { TdStatusChip, TD_STATUS_LABELS, TD_STATUS_WORDS } from './td-status';

export interface TdEditorTarget<T extends TdContentType = TdContentType> {
  type: T;
  /** null: a new row. */
  row: TdContentRow<T> | null;
  preset?: Partial<TdContentData<T>>;
}

const draftOf = (row: TdContentRow): TdDraft => ({ data: row.data as Record<string, unknown>, position: row.position, note: row.note });

const CATEGORY_TYPES = new Set<TdContentType>(['card-categories', 'box-categories']);

type Tab = 'edit' | 'preview' | 'history' | 'approved';

/** Where the open row stands in its list, and how to step to its neighbours. */
export interface TdEditorNav {
  index: number;
  total: number;
  /** The list has more rows than are loaded: the last one still has a next. */
  more: boolean;
  onGo: (index: number) => void;
}

/** The editor of one row, in a dialog over its list (as the Quizball CMS reviews
 *  and edits a question). With `nav`, the arrows and the ← → keys step through
 *  the list, staying on the tab that is open; `startOn="preview"` opens an
 *  existing row on what a player sees. */
export function TdContentEditorDialog({
  target,
  onClose,
  onSaved,
  nav,
  startOn = 'edit',
}: {
  target: TdEditorTarget | null;
  onClose: () => void;
  onSaved?: (row: TdContentRow) => void;
  nav?: TdEditorNav | null;
  startOn?: 'edit' | 'preview';
}) {
  // The tab is chosen when the dialog opens and kept while stepping through rows.
  const [session, setSession] = useState<{ open: boolean; tab: Tab }>({ open: false, tab: 'edit' });
  if ((target !== null) !== session.open) {
    setSession({ open: target !== null, tab: target?.row && startOn === 'preview' && hasPreview(target.type) ? 'preview' : 'edit' });
  }
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(90vh,880px)] w-full flex-col gap-0 overflow-hidden rounded-[2rem] border-slate-200 bg-white p-0 sm:max-w-3xl">
        {target && (
          <EditorBody
            key={`${target.type}:${target.row?.id ?? 'new'}`}
            target={target}
            onSaved={onSaved}
            nav={target.row ? (nav ?? null) : null}
            tab={session.tab}
            setTab={(tab) => setSession((current) => ({ ...current, tab }))}
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

function EditorBody({ target, onSaved, nav, tab, setTab }: { target: TdEditorTarget; onSaved?: (row: TdContentRow) => void; nav: TdEditorNav | null; tab: Tab; setTab: (tab: Tab) => void }) {
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
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const noteId = useId();
  const [approving, setApproving] = useState(false);

  const creating = row === null;
  const otherTab = tab === 'preview' || (tab === 'history' && row !== null) || (tab === 'approved' && Boolean(row?.approved));
  const dirty = creating || !sameDraft(draft, base);

  const go = useCallback(
    (index: number) => {
      if (!nav || index < 0 || (index >= nav.total && !nav.more)) return;
      if (!creating && !sameDraft(draft, base) && !window.confirm(t('This one has changes that are not saved. Leave it without saving?'))) return;
      nav.onGo(index);
    },
    [nav, creating, draft, base],
  );
  // ← and → step through the list, unless a field is being typed in or another dialog is on top.
  useEffect(() => {
    if (!nav) return;
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
  }, [nav, go]);
  const history = useTdHistory(type, row?.id ?? null);
  const release = useTdCurrentRelease();

  // A fresher copy replaces the form only while nothing is typed in it.
  const fresh = useTdContentRow(type, row?.id ?? null);
  if (fresh.data && row && fresh.data.version > row.version && !dirty && !conflict) {
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

  async function run(label: string, work: () => Promise<TdContentRow>, done: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const next = await work();
      adopt(next);
      toast.success(done);
      onSaved?.(next);
    } catch (caught) {
      handleRefusal(caught);
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
      return;
    }
    if (view.code === 'validation') setIssues(view.issues);
    setError(caught);
  }

  const save = () => {
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
    void run(
      'save',
      () => write((operation) => (creating ? api.create(body as never, operation) : api.edit(row.id, body as never, operation))),
      creating ? t('{type} created as a draft', { type: capitalise(config.singular) }) : t('Saved'),
    );
  };

  const transition = (action: 'ready' | 'approve' | 'archive' | 'restore', done: string) => {
    if (!row) return;
    const { id, version } = row;
    void run(
      action,
      () => write((operation) => (action === 'approve' ? api.approve(id, version, undefined, operation) : api[action](id, version, operation))),
      done,
    );
  };

  // A trail whose last refresh failed may be stale: it does not count.
  const actions = row && user ? contentActions(row, user, history.isError ? null : (history.data ?? null)) : null;
  const Editor = config.Editor;
  const title = creating ? t('New {type}', { type: config.singular }) : config.title(draft.data as never) || config.singular;
  const approvedDiffers = Boolean(row?.approved && (!sameDraft({ data: row.approved as Record<string, unknown>, position: row.approvedPosition ?? 0, note: '' }, { data: row.data as Record<string, unknown>, position: row.position, note: '' })));
  const inRelease = row ? release.members.get(row.id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DialogHeader className="gap-2 border-b border-(--td-divider) px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          {row && <TdStatusChip status={row.status} />}
          <span className="text-xs uppercase tracking-wide text-(--td-text-3)">{config.singular}</span>
          {nav && (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs font-black tabular-nums tracking-widest text-slate-400">
                {nav.index + 1} <span className="mx-1 text-slate-200">/</span> {nav.total}
                {nav.more ? '+' : ''}
              </span>
              <div className="flex gap-1 rounded-xl border border-slate-100 bg-slate-50 p-1">
                <Button variant="ghost" size="icon" aria-label={t('Previous')} title={t('Previous')} disabled={nav.index <= 0} onClick={() => go(nav.index - 1)} className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t('Next')} title={t('Next')} disabled={nav.index >= nav.total - 1 && !nav.more} onClick={() => go(nav.index + 1)} className="h-8 w-8 rounded-lg hover:bg-white hover:shadow-sm">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogTitle className="line-clamp-2 text-lg">{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex flex-col gap-0.5 text-xs text-(--td-text-3)">
            {row ? (
              <>
                <span>{revisionLine(row)}</span>
                {release.loaded && (
                  <span>
                    {inRelease === undefined
                      ? t('Not in the current release.')
                      : inRelease === row.contentVersion
                        ? t('In the current release at content v{version}.', { version: inRelease })
                        : t('In the current release at content v{version} (an older version).', { version: inRelease })}
                  </span>
                )}
              </>
            ) : (
              <span>{t('Saved as a draft; mark it ready when it is done, then a publisher approves it.')}</span>
            )}
          </div>
        </DialogDescription>
        {(row || hasPreview(type)) && (
          <div className="flex gap-1 pt-1" role="tablist">
            <TabButton active={tab === 'edit'} onClick={() => setTab('edit')}>
              {t('Content')}
            </TabButton>
            {hasPreview(type) && (
              <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
                <Eye className="size-3.5" />
                {t('Preview')}
              </TabButton>
            )}
            {row && (
              <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
                <History className="size-3.5" />
                {t('History')}
              </TabButton>
            )}
            {row?.approved && (
              <TabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
                {t('Approved version')}
              </TabButton>
            )}
          </div>
        )}
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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
            {tab === 'preview' && <TdPreview type={type} data={draft.data} />}
            {tab === 'history' && row && <HistoryList type={type} id={row.id} />}
            {tab === 'approved' && row?.approved && (
              <ApprovedCompare approved={row.approved as Record<string, unknown>} current={row.data as Record<string, unknown>} approvedPosition={row.approvedPosition} position={row.position} />
            )}
            {/* Hidden, not unmounted, on the other tabs: its fields keep what was typed, and a field whose text is not valid keeps holding Save. */}
            <div className={cn('flex flex-col gap-4', otherTab && 'hidden')}>
              {approvedDiffers && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {tr('This draft differs from the last approved version (v{version}). A release carries the approved version until this one is approved. {compare}', {
                      version: row!.approvedVersion,
                      compare: (
                        <button key="compare" type="button" className="underline" onClick={() => setTab('approved')}>
                          {t('Compare')}
                        </button>
                      ),
                    })}
                  </span>
                </p>
              )}
              {notice && <p className="rounded-lg bg-(--td-input) px-3 py-2 text-xs text-(--td-text-2)">{notice}</p>}
              {/* Locked while a write and its refresh run: the answer replaces the form, so nothing typed meanwhile may be lost. */}
              <TdUploadingContext.Provider value={reportUploading}>
                <TdInvalidInputContext.Provider value={reportInvalid}>
                  <fieldset disabled={busy !== null} className="contents">
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
                    {!creating && (
                      <TdNumberField
                        label={t('Position')}
                        value={draft.position}
                        onChange={(position) => setDraft({ ...draft, position: position ?? 0 })}
                        issues={issuesAt(issues, 'position')}
                        hint={t('The order in a release. Changing it is a change to the content.')}
                        className="max-w-40"
                      />
                    )}
                    <TdField label={t('Note')} htmlFor={noteId} issues={issuesAt(issues, 'note')} hint={t('For the team: sources, checks, questions. Changing only the note keeps the row’s status.')}>
                      <Textarea id={noteId} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="min-h-16 rounded-lg border-border bg-(--td-input) text-sm" />
                    </TdField>
                  </fieldset>
                </TdInvalidInputContext.Provider>
              </TdUploadingContext.Provider>
              {issues.some((issue) => !issue.path.startsWith('data.') && issue.path !== 'note' && issue.path !== 'position') && (
                <TdErrorPanel error={new TdApiError(422, 'validation', 'Some fields are not valid', { issues })} />
              )}
            </div>
          </>
        )}
      </div>

      {!conflict && (
        <footer className="flex flex-col gap-2 border-t border-(--td-divider) px-6 py-4">
          <TdErrorPanel error={error} hideIssues={issues.length > 0} />
          {invalid.size > 0 && <p className="text-xs text-(--td-danger)">{t('A number in the form is not valid: fix it to save.')}</p>}
          {actions && (actions.approve.reason || actions.restore.reason) && <p className="text-xs text-(--td-text-3)">{actions.approve.reason ?? actions.restore.reason}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {(creating || actions?.save.allowed) && (
              <Button onClick={save} disabled={busy !== null || !dirty || held} className="rounded-lg">
                {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
                {creating ? t('Create draft') : t('Save')}
              </Button>
            )}
            {actions?.ready.allowed && (
              <ActionButton busy={busy} name="ready" dirty={dirty || held} onClick={() => transition('ready', t('Marked ready for review'))} icon={<Send />}>
                {t('Mark ready')}
              </ActionButton>
            )}
            {actions?.approve.allowed && (
              <ActionButton
                busy={busy}
                name="approve"
                dirty={dirty || held}
                onClick={() => (CATEGORY_TYPES.has(type) ? setApproving(true) : transition('approve', tc('Approved', 'it happened')))}
                icon={<Check />}
              >
                {t('Approve')}
              </ActionButton>
            )}
            {actions?.restore.allowed && (
              <ActionButton busy={busy} name="restore" dirty={dirty || held} onClick={() => transition('restore', t('Restored'))} icon={<ArchiveRestore />}>
                {t('Restore')}
              </ActionButton>
            )}
            <span className="flex-1" />
            {actions?.archive.allowed && (
              <Button variant="ghost" disabled={busy !== null || dirty || held} onClick={() => transition('archive', tc('Archived', 'it happened'))} className="rounded-lg text-(--td-text-2) hover:text-(--td-danger)">
                {busy === 'archive' ? <Loader2 className="animate-spin" /> : <Archive />}
                {t('Archive')}
              </Button>
            )}
          </div>
          {uploads > 0 && <p className="text-xs text-(--td-text-3)">{t('Waiting for the upload to finish.')}</p>}
          {dirty && !creating && row && <p className="text-xs text-(--td-text-3)">{t('Unsaved changes. Save before changing the status.')}</p>}
        </footer>
      )}
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
    </div>
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium', active ? 'bg-(--td-input) text-foreground' : 'text-(--td-text-3) hover:text-foreground')}
    >
      {children}
    </button>
  );
}

function ActionButton({ busy, name, dirty, onClick, icon, children }: { busy: string | null; name: string; dirty: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  // `dirty` also covers an upload running (the caller passes both).
  return (
    <Button variant="secondary" disabled={busy !== null || dirty} onClick={onClick} className="rounded-lg">
      {busy === name ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  );
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

const ACTION_LABELS: Record<string, string> = {
  create: t('Created'),
  edit: t('Edited'),
  'edit.note': t('Note changed'),
  ready: t('Marked ready'),
  approve: tc('Approved', 'it happened'),
  archive: tc('Archived', 'it happened'),
  restore: t('Restored'),
  delete: t('Removed (import undo)'),
  seed: t('Seeded'),
};

function HistoryList({ type, id }: { type: TdContentType; id: string }) {
  const history = useTdHistory(type, id);
  if (history.isLoading) return <p className="text-sm text-(--td-text-3)">{t('Loading…')}</p>;
  if (history.error) return <TdErrorPanel error={history.error} />;
  return (
    <ol className="flex flex-col">
      {history.data?.items.map((entry) => (
        <li key={entry.id} className="flex gap-3 border-b border-(--td-divider) py-2.5 text-sm last:border-0">
          <span className="w-32 shrink-0 text-xs tabular-nums text-(--td-text-3)">{formatGeorgiaTime(entry.at)}</span>
          <span className="min-w-0 flex-1">
            {tr('{action} by {name}', {
              action: (
                <span key="action" className="font-medium">
                  {ACTION_LABELS[entry.action] ?? entry.action}
                </span>
              ),
              name: entry.actor.name,
            })}
            {entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus && (
              <span className="text-(--td-text-3)">
                {' '}
                · {TD_STATUS_WORDS[entry.fromStatus]} → {TD_STATUS_WORDS[entry.toStatus]}
              </span>
            )}
            {entry.batchId && <span className="text-(--td-text-3)"> · {t('import')}</span>}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-(--td-text-3)">{entry.contentVersion !== null && `v${entry.contentVersion}`}</span>
        </li>
      ))}
      {history.data && !history.data.complete && <li className="pt-2 text-xs text-(--td-text-3)">{t('Older changes are not shown.')}</li>}
    </ol>
  );
}

function ApprovedCompare({ approved, current, approvedPosition, position }: { approved: Record<string, unknown>; current: Record<string, unknown>; approvedPosition: number | null; position: number }) {
  const rows = useMemo(() => {
    const fields = [...new Set([...Object.keys(approved), ...Object.keys(current)])];
    return [...fields.map((field) => ({ field, approved: approved[field], current: current[field] })), { field: 'position', approved: approvedPosition, current: position }];
  }, [approved, current, approvedPosition, position]);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-(--td-text-3)">
          <th className="w-32 py-1.5 pr-3 font-medium">{t('Field')}</th>
          <th className="py-1.5 pr-3 font-medium">{t('Approved')}</th>
          <th className="py-1.5 font-medium">{t('Now')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const changed = showValue(r.approved) !== showValue(r.current);
          return (
            <tr key={r.field} className="border-t border-(--td-divider) align-top">
              <td className="py-2 pr-3 font-mono text-xs text-(--td-text-3)">{r.field}</td>
              <td className="py-2 pr-3 break-words">{showValue(r.approved)}</td>
              <td className={cn('py-2 break-words', changed && 'text-amber-700')}>{showValue(r.current)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
