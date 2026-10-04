'use client';

import { TdMediaPicker } from '@/components/td/media/td-media';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentData, TdContentType } from '@/lib/td/admin-api';
import type { SchemaIssue } from '@/lib/td/contract';
import { t, tc, tn } from '@/lib/td/i18n';
import { issuesAt, TdIssueText, TdListField, TdNumberField, TdSelectField, TdSpellingsField, TdSwitchField, TdTextField } from '../td-form';

export interface TdEditorProps<T extends TdContentType> {
  value: TdContentData<T>;
  /** A value, or an update of the latest one: what finishes later (an upload, a picked image) must not undo edits made meanwhile. */
  onChange: (next: TdContentData<T> | ((current: TdContentData<T>) => TdContentData<T>)) => void;
  issues: SchemaIssue[];
  /** Fixed fields may change only before the first save. */
  creating: boolean;
}

/** A row's ID: what releases and other rows call it. It is made when the row is
 *  and never shown, as the Quizball CMS shows none; only the API refusing it shows. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so every editor calls it the same way
export function KeyField({ value, onChange, issues, creating, path = 'data.key' }: { value: string; onChange: (key: string) => void; issues: SchemaIssue[]; creating: boolean; label?: string; path?: string }) {
  return <TdIssueText issues={issuesAt(issues, path)} />;
}

/** The category a card or box question belongs to; chosen from the live categories before the first save. */
function CategoryField({ type, value, onChange, issues, creating }: { type: 'card-categories' | 'box-categories'; value: string; onChange: (key: string) => void; issues: SchemaIssue[]; creating: boolean }) {
  const categories = useTdAllRows(type, creating ? { status: 'draft,ready,approved' } : {});
  const nameOf = (key: string) => {
    const row = categories.data?.rows.find((r) => r.data.key === key);
    return row ? ('prompt' in row.data ? row.data.prompt : row.data.title) : key;
  };
  if (!creating) return <TdTextField label={t('Category')} value={nameOf(value)} onChange={() => {}} locked issues={issuesAt(issues, 'data.categoryKey')} />;
  const options = (categories.data?.rows ?? []).map((row) => ({ value: row.data.key, label: nameOf(row.data.key) }));
  return (
    <TdSelectField
      label={t('Category')}
      value={value}
      onChange={onChange}
      options={[{ value: '', label: categories.isLoading ? t('Loading…') : t('Choose a category') }, ...options]}
      issues={issuesAt(issues, 'data.categoryKey')}
    />
  );
}

export function CardCategoryEditor({ value, onChange, issues, creating }: TdEditorProps<'card-categories'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label={t('Prompt')} multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} hint={t('Shown above the category’s cards, up to 300 characters.')} />
    </>
  );
}

export function CardEditor({ value, onChange, issues, creating }: TdEditorProps<'cards'>) {
  return (
    <>
      <CategoryField type="card-categories" value={value.categoryKey} onChange={(categoryKey) => onChange({ ...value, categoryKey })} issues={issues} creating={creating} />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdSelectField
        label={tc('Value', 'points of a card')}
        value={String(value.value) as '1' | '2' | '3'}
        onChange={(next) => onChange({ ...value, value: Number(next) as 1 | 2 | 3 })}
        options={[
          { value: '1', label: tn(1, '{count} point', '{count} points') },
          { value: '2', label: tn(2, '{count} point', '{count} points') },
          { value: '3', label: tn(3, '{count} point', '{count} points') },
        ]}
        issues={issuesAt(issues, 'data.value')}
      />
      <TdTextField label={t('Answer (as shown)')} value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
      <TdListField label={t('Clue lines')} values={value.lines} onChange={(lines) => onChange({ ...value, lines })} issues={issues} path="data.lines" max={8} addLabel={t('Add a line')} numbered hint={t('Up to 8 lines, in the order the card shows them.')} />
      <TdSwitchField
        label={t('SoFIFA face')}
        checked={value.photo !== null}
        onChange={(on) => onChange({ ...value, photo: on ? { id: 1, ver: '' } : null })}
        hint={t('The player’s face from SoFIFA. An uploaded photo, when chosen, is shown instead.')}
      />
      {value.photo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TdNumberField label={t('SoFIFA player id')} value={value.photo.id} onChange={(id) => onChange({ ...value, photo: { ...value.photo!, id: id ?? 1 } })} issues={issuesAt(issues, 'data.photo.id')} />
          <TdTextField label={t('SoFIFA version')} value={value.photo.ver} onChange={(ver) => onChange({ ...value, photo: { ...value.photo!, ver } })} issues={issuesAt(issues, 'data.photo.ver')} placeholder={t('e.g. 25_1')} />
        </div>
      )}
      <TdMediaPicker label={t('Uploaded photo')} value={value.imageKey} onChange={(imageKey) => onChange((current) => ({ ...current, imageKey }))} />
    </>
  );
}

export function WhoamiEditor({ value, onChange, issues, creating }: TdEditorProps<'whoami-subjects'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label={t('Answer (as shown)')} value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
      <TdListField
        label={t('Clues, in the order they are read')}
        values={value.clues}
        onChange={(clues) => onChange({ ...value, clues })}
        issues={issues}
        path="data.clues"
        max={20}
        addLabel={t('Add a clue')}
        numbered
        multiline
        hint={t('1 to 20 clues, hardest first; a match reads 5.')}
      />
    </>
  );
}

export function BoxCategoryEditor({ value, onChange, issues, creating }: TdEditorProps<'box-categories'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label={t('Title')} value={value.title} onChange={(title) => onChange({ ...value, title })} issues={issuesAt(issues, 'data.title')} />
    </>
  );
}

export function BoxQuestionEditor({ value, onChange, issues, creating }: TdEditorProps<'box-questions'>) {
  return (
    <>
      <CategoryField type="box-categories" value={value.categoryKey} onChange={(categoryKey) => onChange({ ...value, categoryKey })} issues={issues} creating={creating} />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label={t('Question')} multiline value={value.q} onChange={(q) => onChange({ ...value, q })} issues={issuesAt(issues, 'data.q')} />
      <TdTextField label={t('Answer (as shown)')} value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
    </>
  );
}

export function PenaltyEditor({ value, onChange, issues, creating }: TdEditorProps<'penalty-questions'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label={t('Question')} multiline value={value.q} onChange={(q) => onChange({ ...value, q })} issues={issuesAt(issues, 'data.q')} hint={t('Keep it short: the shoot-out gives a few seconds per question.')} />
      <TdTextField label={t('Answer (as shown)')} value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
    </>
  );
}
