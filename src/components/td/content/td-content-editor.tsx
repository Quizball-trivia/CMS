'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, Check, History, Loader2, RefreshCw, Save, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { useTdContentRow, useTdCurrentRelease, useTdHistory, useTdWrite } from '@/hooks/use-td-content';
import { TD_CONTENT_SCHEMA_NAMES, type TdContentData, type TdContentRow, type TdContentType } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { contentWriteIssues } from '@/lib/td/content-rules';
import type { SchemaIssue } from '@/lib/td/contract';
import { describeTdError } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { mergeDrafts, resolveConflicts, sameDraft, type TdDraft, type TdFieldConflict } from '@/lib/td/merge';
import { contentActions } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { TD_TYPE_CONFIG } from './content-types';
import { TdCategoryApproval } from './td-category-approval';
import { TdUploadingContext } from './td-uploading';
import { issuesAt, TdField, TdNumberField } from './td-form';
import { TdStatusChip, TD_STATUS_LABELS } from './td-status';

export interface TdEditorTarget<T extends TdContentType = TdContentType> {
  type: T;
  /** null: a new row. */
  row: TdContentRow<T> | null;
  preset?: Partial<TdContentData<T>>;
}

const draftOf = (row: TdContentRow): TdDraft => ({ data: row.data as Record<string, unknown>, position: row.position, note: row.note });

const CATEGORY_TYPES = new Set<TdContentType>(['card-categories', 'box-categories']);

/** The editor of one row, in a sheet over its list. */
export function TdContentEditorSheet({ target, onClose, onSaved }: { target: TdEditorTarget | null; onClose: () => void; onSaved?: (row: TdContentRow) => void }) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 border-border bg-(--td-surface) p-0 sm:max-w-2xl">
        {target && <EditorBody key={`${target.type}:${target.row?.id ?? 'new'}`} target={target} onSaved={onSaved} />}
      </SheetContent>
    </Sheet>
  );
}

type Tab = 'edit' | 'history' | 'approved';

interface Conflict {
  theirs: TdContentRow | null;
  conflicts: TdFieldConflict[];
  merged: TdDraft;
  choices: Record<string, 'mine' | 'theirs'>;
}

function EditorBody({ target, onSaved }: { target: TdEditorTarget; onSaved?: (row: TdContentRow) => void }) {
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
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [tab, setTab] = useState<Tab>('edit');
  const [approving, setApproving] = useState(false);

  const creating = row === null;
  const dirty = creating || !sameDraft(draft, base);
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
        setNotice(`It changed meanwhile (${theirs.updatedBy.name}, ${formatGeorgiaTime(theirs.updatedAt)}); this is the row as it is now. Check it and try again.`);
        return;
      }
      const merge = theirs ? mergeDrafts(base, draft, draftOf(theirs)) : { merged: draft, conflicts: [] };
      setConflict({ theirs, conflicts: merge.conflicts, merged: merge.merged, choices: {} });
      return;
    }
    if (view.code === 'validation') setIssues(view.issues);
    setError(caught);
  }

  const save = () => {
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
      creating ? `${capitalise(config.singular)} created as a draft` : 'Saved',
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
  const title = creating ? `New ${config.singular}` : config.title(draft.data as never) || config.singular;
  const approvedDiffers = Boolean(row?.approved && (!sameDraft({ data: row.approved as Record<string, unknown>, position: row.approvedPosition ?? 0, note: '' }, { data: row.data as Record<string, unknown>, position: row.position, note: '' })));
  const inRelease = row ? release.members.get(row.id) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-2 border-b border-(--td-divider) px-6 pb-4 pt-5">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          {row && <TdStatusChip status={row.status} />}
          <span className="text-xs uppercase tracking-wide text-(--td-text-3)">{config.singular}</span>
        </div>
        <SheetTitle className="line-clamp-2 text-lg">{title}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-col gap-0.5 text-xs text-(--td-text-3)">
            {row ? (
              <>
                <span>
                  Revision {row.version} · content v{row.contentVersion}
                  {row.approvedVersion !== null && ` · approved v${row.approvedVersion}${row.approvedBy ? ` by ${row.approvedBy.name}` : ''}`} · last edit by {row.lastEditor.name}
                </span>
                {release.loaded && (
                  <span>
                    {inRelease === undefined ? 'Not in the current release.' : `In the current release at content v${inRelease}${inRelease === row.contentVersion ? '' : ' (an older version)'}.`}
                  </span>
                )}
              </>
            ) : (
              <span>Saved as a draft; mark it ready when it is done, then a publisher approves it.</span>
            )}
          </div>
        </SheetDescription>
        {row && (
          <div className="flex gap-1 pt-1" role="tablist">
            <TabButton active={tab === 'edit'} onClick={() => setTab('edit')}>
              Content
            </TabButton>
            <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
              <History className="size-3.5" />
              History
            </TabButton>
            {row.approved && (
              <TabButton active={tab === 'approved'} onClick={() => setTab('approved')}>
                Approved version
              </TabButton>
            )}
          </div>
        )}
      </SheetHeader>

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
              setNotice('Merged onto the newer version. Review it, then save.');
            }}
            onDiscard={() => {
              if (conflict.theirs) adopt(conflict.theirs);
              setConflict(null);
            }}
          />
        ) : tab === 'history' && row ? (
          <HistoryList type={type} id={row.id} />
        ) : tab === 'approved' && row?.approved ? (
          <ApprovedCompare approved={row.approved as Record<string, unknown>} current={row.data as Record<string, unknown>} approvedPosition={row.approvedPosition} position={row.position} />
        ) : (
          <div className="flex flex-col gap-4">
            {approvedDiffers && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This draft differs from the last approved version (v{row!.approvedVersion}). A release carries the approved version until this one is approved.{' '}
                  <button type="button" className="underline" onClick={() => setTab('approved')}>
                    Compare
                  </button>
                </span>
              </p>
            )}
            {notice && <p className="rounded-lg bg-(--td-input) px-3 py-2 text-xs text-(--td-text-2)">{notice}</p>}
            {/* Locked while a write and its refresh run: the answer replaces the form, so nothing typed meanwhile may be lost. */}
            <TdUploadingContext.Provider value={reportUploading}>
              <fieldset disabled={busy !== null} className="contents">
                <Editor value={draft.data as never} onChange={(data) => setDraft({ ...draft, data: data as Record<string, unknown> })} issues={issues} creating={creating} />
                {!creating && (
                  <TdNumberField
                    label="Position"
                    value={draft.position}
                    onChange={(position) => setDraft({ ...draft, position: position ?? 0 })}
                    issues={issuesAt(issues, 'position')}
                    hint="The order in a release. Changing it is a change to the content."
                    className="max-w-40"
                  />
                )}
                <TdField label="Note" issues={issuesAt(issues, 'note')} hint="For the team: sources, checks, questions. Changing only the note keeps the row’s status.">
                  <Textarea value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className="min-h-16 rounded-lg border-border bg-(--td-input) text-sm" />
                </TdField>
              </fieldset>
            </TdUploadingContext.Provider>
            {issues.some((issue) => !issue.path.startsWith('data.') && issue.path !== 'note' && issue.path !== 'position') && (
              <TdErrorPanel error={new TdApiError(422, 'validation', 'Some fields are not valid', { issues })} />
            )}
          </div>
        )}
      </div>

      {!conflict && (
        <footer className="flex flex-col gap-2 border-t border-(--td-divider) px-6 py-4">
          <TdErrorPanel error={error} hideIssues={issues.length > 0} />
          {actions && (actions.approve.reason || actions.restore.reason) && <p className="text-xs text-(--td-text-3)">{actions.approve.reason ?? actions.restore.reason}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {(creating || actions?.save.allowed) && (
              <Button onClick={save} disabled={busy !== null || !dirty || uploads > 0} className="rounded-lg">
                {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />}
                {creating ? 'Create draft' : 'Save'}
              </Button>
            )}
            {actions?.ready.allowed && (
              <ActionButton busy={busy} name="ready" dirty={dirty || uploads > 0} onClick={() => transition('ready', 'Marked ready for review')} icon={<Send />}>
                Mark ready
              </ActionButton>
            )}
            {actions?.approve.allowed && (
              <ActionButton
                busy={busy}
                name="approve"
                dirty={dirty || uploads > 0}
                onClick={() => (CATEGORY_TYPES.has(type) ? setApproving(true) : transition('approve', 'Approved'))}
                icon={<Check />}
              >
                Approve
              </ActionButton>
            )}
            {actions?.restore.allowed && (
              <ActionButton busy={busy} name="restore" dirty={dirty || uploads > 0} onClick={() => transition('restore', 'Restored')} icon={<ArchiveRestore />}>
                Restore
              </ActionButton>
            )}
            <span className="flex-1" />
            {actions?.archive.allowed && (
              <Button variant="ghost" disabled={busy !== null || dirty || uploads > 0} onClick={() => transition('archive', 'Archived')} className="rounded-lg text-(--td-text-2) hover:text-(--td-danger)">
                {busy === 'archive' ? <Loader2 className="animate-spin" /> : <Archive />}
                Archive
              </Button>
            )}
          </div>
          {uploads > 0 && <p className="text-xs text-(--td-text-3)">Waiting for the upload to finish.</p>}
          {dirty && !creating && row && <p className="text-xs text-(--td-text-3)">Unsaved changes. Save before changing the status.</p>}
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

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

const fieldName = (field: string) => field.replace(/^data\./, '');

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
        <p className="font-semibold">This row no longer exists</p>
        <p className="text-sm text-(--td-text-2)">It was removed while you were editing (an import undo removes rows nobody changed). Copy anything you need, then close.</p>
      </div>
    );
  const archived = theirs.status === 'archived';
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4">
        <p className="font-semibold">Someone changed this while you were editing</p>
        <p className="mt-1 text-sm text-(--td-text-2)">
          {theirs.updatedBy.name} saved revision {theirs.version} ({TD_STATUS_LABELS[theirs.status].toLowerCase()}) at {formatGeorgiaTime(theirs.updatedAt)}.
          {archived
            ? ' It is archived now: a publisher restores it before anyone edits it.'
            : ' Their changes to fields you did not touch are kept; where you both changed a field, choose which to keep.'}
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
                      <span className="block text-xs text-(--td-text-3)">{side === 'theirs' ? 'Theirs' : 'Yours'}</span>
                      <span className="break-words">{showValue(side === 'theirs' ? c.theirs : c.mine)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!archived && conflict.conflicts.length === 0 && <p className="text-sm text-(--td-text-2)">Your changes and theirs touch different fields, so they merge cleanly.</p>}
      <div className="flex flex-wrap gap-2">
        {!archived && (
          <Button onClick={onUseMerged} className="rounded-lg">
            Continue with the merge
          </Button>
        )}
        <Button variant="secondary" onClick={onDiscard} className="rounded-lg">
          <RefreshCw />
          Discard mine, load theirs
        </Button>
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  edit: 'Edited',
  'edit.note': 'Note changed',
  ready: 'Marked ready',
  approve: 'Approved',
  archive: 'Archived',
  restore: 'Restored',
  delete: 'Removed (import undo)',
  seed: 'Seeded',
};

function HistoryList({ type, id }: { type: TdContentType; id: string }) {
  const history = useTdHistory(type, id);
  if (history.isLoading) return <p className="text-sm text-(--td-text-3)">Loading…</p>;
  if (history.error) return <TdErrorPanel error={history.error} />;
  return (
    <ol className="flex flex-col">
      {history.data?.items.map((entry) => (
        <li key={entry.id} className="flex gap-3 border-b border-(--td-divider) py-2.5 text-sm last:border-0">
          <span className="w-32 shrink-0 text-xs tabular-nums text-(--td-text-3)">{formatGeorgiaTime(entry.at)}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{ACTION_LABELS[entry.action] ?? entry.action}</span> by {entry.actor.name}
            {entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus && (
              <span className="text-(--td-text-3)">
                {' '}
                · {entry.fromStatus} → {entry.toStatus}
              </span>
            )}
            {entry.batchId && <span className="text-(--td-text-3)"> · import</span>}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-(--td-text-3)">{entry.contentVersion !== null && `v${entry.contentVersion}`}</span>
        </li>
      ))}
      {history.data && !history.data.complete && <li className="pt-2 text-xs text-(--td-text-3)">Older changes are not shown.</li>}
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
          <th className="w-32 py-1.5 pr-3 font-medium">Field</th>
          <th className="py-1.5 pr-3 font-medium">Approved</th>
          <th className="py-1.5 font-medium">Now</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const changed = showValue(r.approved) !== showValue(r.current);
          return (
            <tr key={r.field} className="border-t border-(--td-divider) align-top">
              <td className="py-2 pr-3 font-mono text-xs text-(--td-text-3)">{r.field}</td>
              <td className="py-2 pr-3 break-words">{showValue(r.approved)}</td>
              <td className={cn('py-2 break-words', changed && 'text-amber-200')}>{showValue(r.current)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
