'use client';

import { type MutableRefObject, useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { newKey } from '@/components/td/content/content-types';
import { TdCategoryApproval } from '@/components/td/content/td-category-approval';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { useTdContentRow, useTdWrite } from '@/hooks/use-td-content';
import { TD_CONTENT_SCHEMA_NAMES, type TdContentRow } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { contentWriteIssues } from '@/lib/td/content-rules';
import type { SchemaIssue } from '@/lib/td/contract';
import { describeTdError, isTdError } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tc } from '@/lib/td/i18n';
import { contentActions } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { categoryText, categoryTypeOf, TD_CATEGORY_ROUNDS, useTdCategoryCounts, type TdCategoryRow, type TdCategoryType } from './td-category-data';
import { TdCategoryPreview } from './td-category-preview';
import { TdCategoryQuestions } from './td-category-questions';

interface TdCategoryFormProps {
  /** Absent: a new category. */
  category?: TdCategoryRow;
  /** Asked before the dialog closes: the form says whether it may be left. */
  leaveRef: MutableRefObject<() => boolean>;
  onSuccess?: () => void;
}

const inputClass = 'h-10 shadow-sm border-border/50 bg-white/5 backdrop-blur-md focus:ring-1 focus:ring-primary/30 transition-all rounded-xl';
const labelClass = 'text-[10px] font-bold text-muted-foreground uppercase tracking-wider ml-1';
const secondaryClass = 'h-11 rounded-xl font-semibold bg-white/5 border border-white/10 hover:bg-white/10';
const COLUMNS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

type Busy = 'save' | 'ready' | 'restore';

/** Quizball's category form, over the Table Derby workflow: save as a draft, mark ready, approve (with the category's ready cards or questions). */
export function TdCategoryForm({ category, leaveRef, onSuccess }: TdCategoryFormProps) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const countOf = useTdCategoryCounts();
  const nameId = useId();
  const roundId = useId();

  const [row, setRow] = useState<TdCategoryRow | null>(category ?? null);
  const [round, setRound] = useState<TdCategoryType>('card-categories');
  // What the field was loaded from, so a change can be told.
  const [base, setBase] = useState(category ? categoryText(category) : '');
  const [text, setText] = useState(base);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const creating = row === null;
  const type = row ? categoryTypeOf(row) : round;
  const nameField = type === 'card-categories' ? 'prompt' : 'title';
  const name = text.trim();
  const dirty = creating ? name !== '' : name !== base;
  const archived = row?.status === 'archived';

  const mayLeave = useCallback(() => !dirty || window.confirm(t('This one has changes that are not saved. Leave it without saving?')), [dirty]);
  useEffect(() => {
    leaveRef.current = mayLeave;
    return () => {
      leaveRef.current = () => true;
    };
  }, [leaveRef, mayLeave]);

  // A fresher copy replaces the form only while nothing is typed in it.
  const fresh = useTdContentRow(type, row?.id ?? null);
  if (fresh.data && row && fresh.data.version > row.version && !dirty) {
    const next = fresh.data as TdCategoryRow;
    setRow(next);
    setBase(categoryText(next));
    setText(categoryText(next));
  }

  const actions = row && user ? contentActions(row, user) : null;
  const api = tdAdmin.content(type);
  const schemaName = TD_CONTENT_SCHEMA_NAMES[type];
  const nameIssues = issues.filter((issue) => issue.path === `data.${nameField}`);
  const otherIssues = issues.filter((issue) => issue.path !== `data.${nameField}`);

  function handleRefusal(caught: unknown) {
    const view = describeTdError(caught);
    if (caught instanceof TdApiError && caught.code === 'revision_conflict' && row) {
      const theirs = (view.current ?? null) as TdCategoryRow | null;
      if (theirs) {
        setRow(theirs);
        setBase(categoryText(theirs));
        setNotice(t('It changed meanwhile ({name}, {time}); this is the row as it is now. Check it and try again.', { name: theirs.updatedBy.name, time: formatGeorgiaTime(theirs.updatedAt) }));
        return;
      }
    }
    if (view.code === 'validation') setIssues(view.issues);
    setError(caught);
  }

  const alive = useRef(true);
  useEffect(() => {
    // Set again on mount: development mounts effects twice.
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function run(label: Busy, work: () => Promise<unknown>, done: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await work();
      toast.success(done);
      // Only while this form is still the one open: a save finishing after its dialog closed must not close the next one.
      if (alive.current) onSuccess?.();
    } catch (caught) {
      handleRefusal(caught);
    } finally {
      setBusy(null);
    }
  }

  const save = () => {
    if (busy || !dirty) return;
    if (row) {
      const body = { version: row.version, data: { ...row.data, [nameField]: name }, position: row.position, note: row.note };
      const found = contentWriteIssues(type, schemaName, 'edit', body);
      setIssues(found);
      if (found.length) return;
      void run('save', () => write((operation) => api.edit(row.id, body as never, operation)), t('Category updated successfully'));
      return;
    }
    const keyPrefix = type === 'card-categories' ? 'cat' : 'box';
    const found = contentWriteIssues(type, schemaName, 'create', { data: { key: newKey(keyPrefix), [nameField]: name } });
    setIssues(found);
    if (found.length) return;
    // The key is made up and never shown: a key that is taken is replaced by another.
    const create = async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          return await write((operation) => api.create({ data: { key: newKey(keyPrefix), [nameField]: name } } as never, operation));
        } catch (caught) {
          if (!isTdError(caught, 'already_exists') || attempt >= 5) throw caught;
        }
      }
    };
    void run('save', create, t('Category created successfully'));
  };

  const transition = (action: 'ready' | 'restore', done: string) => {
    if (!row || busy) return;
    const { id, version } = row;
    void run(action, () => write((operation) => api[action](id, version, operation)), done);
  };

  const offered = [actions?.ready.allowed, actions?.approve.allowed].filter(Boolean).length;
  const reasons = actions ? [archived ? actions.save.reason : undefined, actions.restore.reason, actions.approve.reason].filter((reason): reason is string => Boolean(reason)) : [];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <TdCategoryPreview name={name} type={type} status={row?.status ?? 'draft'} count={creating ? 0 : countOf(type, row.data.key)} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {creating && (
          <div className="grid gap-2 col-span-2">
            <Label htmlFor={roundId} className={labelClass}>
              {t('Round')}
            </Label>
            <Select value={round} onValueChange={(next) => setRound(next as TdCategoryType)} disabled={busy !== null}>
              <SelectTrigger id={roundId} className={cn(inputClass, 'w-full')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-white/10 bg-background/80 backdrop-blur-xl shadow-2xl">
                {TD_CATEGORY_ROUNDS.map((option) => (
                  <SelectItem key={option.type} value={option.type}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid gap-2 col-span-2">
          <Label htmlFor={nameId} className={labelClass}>
            {t('Name')}
          </Label>
          <Input
            id={nameId}
            placeholder={t('Category name')}
            className={inputClass}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={archived || busy !== null}
            aria-invalid={nameIssues.length > 0}
          />
          {nameIssues.length > 0 && (
            <p role="alert" className="text-destructive text-[10px]">
              {[...new Set(nameIssues.map((issue) => issue.message))].join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Category Questions - Only show when editing */}
      {row && <TdCategoryQuestions type={type} categoryKey={row.data.key} />}

      {notice && <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600">{notice}</p>}
      {otherIssues.length > 0 && <TdErrorPanel error={new TdApiError(422, 'validation', 'Some fields are not valid', { issues: otherIssues })} />}
      <TdErrorPanel error={error} hideIssues={issues.length > 0} />

      <div className="pt-2">
        {creating ? (
          <Button type="submit" disabled={busy !== null || !dirty} className="w-full h-11 rounded-xl font-bold shadow-lg shadow-primary/20">
            {busy === 'save' ? t('Saving…') : t('Save as Draft')}
          </Button>
        ) : archived ? (
          actions?.restore.allowed && (
            <Button type="button" disabled={busy !== null} onClick={() => transition('restore', t('Category restored'))} className="w-full h-11 rounded-xl font-bold shadow-lg shadow-primary/20">
              <ArchiveRestore />
              {t('Restore')}
            </Button>
          )
        ) : (
          <div className={cn('grid gap-3', COLUMNS[1 + offered])}>
            <Button type="submit" disabled={busy !== null || !dirty} className="h-11 rounded-xl font-bold shadow-lg shadow-primary/20">
              {busy === 'save' ? t('Saving…') : t('Save Changes')}
            </Button>
            {actions?.ready.allowed && (
              <Button type="button" variant="secondary" disabled={busy !== null || dirty} className={secondaryClass} onClick={() => transition('ready', t('Marked ready for review'))}>
                {t('Mark ready')}
              </Button>
            )}
            {actions?.approve.allowed && (
              <Button type="button" variant="secondary" disabled={busy !== null || dirty} className={secondaryClass} onClick={() => setApproving(true)}>
                {t('Approve')}
              </Button>
            )}
          </div>
        )}
        {reasons.map((reason) => (
          <p key={reason} className="mt-2 text-xs text-muted-foreground">
            {reason}
          </p>
        ))}
        {dirty && !creating && !archived && offered > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('Unsaved changes. Save before changing the status.')}</p>}
      </div>

      {approving && row && (
        <TdCategoryApproval
          type={type}
          category={row as TdContentRow<'card-categories'>}
          onClose={() => setApproving(false)}
          onApproved={() => {
            setApproving(false);
            toast.success(tc('Approved', 'it happened'));
            onSuccess?.();
          }}
        />
      )}
    </form>
  );
}
