'use client';

import { TdMediaPicker } from '@/components/td/media/td-media';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentData, TdContentType } from '@/lib/td/admin-api';
import type { SchemaIssue } from '@/lib/td/contract';
import { issuesAt, TdListField, TdNumberField, TdSelectField, TdSpellingsField, TdSwitchField, TdTextField } from '../td-form';

export interface TdEditorProps<T extends TdContentType> {
  value: TdContentData<T>;
  onChange: (next: TdContentData<T>) => void;
  issues: SchemaIssue[];
  /** Fixed fields may change only before the first save. */
  creating: boolean;
}

export function KeyField({ value, onChange, issues, creating, label = 'Key', path = 'data.key' }: { value: string; onChange: (key: string) => void; issues: SchemaIssue[]; creating: boolean; label?: string; path?: string }) {
  return (
    <TdTextField
      label={label}
      value={value}
      onChange={onChange}
      issues={issuesAt(issues, path)}
      locked={!creating}
      hint={creating ? 'Lower-case letters, digits, - and _. It names the row in releases and cannot change once saved.' : undefined}
    />
  );
}

/** The category a card or box question belongs to; chosen from the live categories before the first save. */
function CategoryField({ type, value, onChange, issues, creating }: { type: 'card-categories' | 'box-categories'; value: string; onChange: (key: string) => void; issues: SchemaIssue[]; creating: boolean }) {
  const categories = useTdAllRows(type, { status: 'draft,ready,approved' }, creating);
  if (!creating) return <TdTextField label="Category" value={value} onChange={onChange} locked issues={issuesAt(issues, 'data.categoryKey')} />;
  const options = (categories.data?.rows ?? []).map((row) => ({
    value: row.data.key,
    label: `${row.data.key} · ${'prompt' in row.data ? row.data.prompt : row.data.title}`,
  }));
  return (
    <TdSelectField
      label="Category"
      value={value}
      onChange={onChange}
      options={[{ value: '', label: categories.isLoading ? 'Loading…' : 'Choose a category' }, ...options]}
      issues={issuesAt(issues, 'data.categoryKey')}
    />
  );
}

export function CardCategoryEditor({ value, onChange, issues, creating }: TdEditorProps<'card-categories'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label="Prompt" multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} hint="Shown above the category’s cards, up to 300 characters." />
    </>
  );
}

export function CardEditor({ value, onChange, issues, creating }: TdEditorProps<'cards'>) {
  return (
    <>
      <CategoryField type="card-categories" value={value.categoryKey} onChange={(categoryKey) => onChange({ ...value, categoryKey })} issues={issues} creating={creating} />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdSelectField
        label="Value"
        value={String(value.value) as '1' | '2' | '3'}
        onChange={(next) => onChange({ ...value, value: Number(next) as 1 | 2 | 3 })}
        options={[
          { value: '1', label: '1 point' },
          { value: '2', label: '2 points' },
          { value: '3', label: '3 points' },
        ]}
        issues={issuesAt(issues, 'data.value')}
      />
      <TdTextField label="Answer (as shown)" value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
      <TdListField label="Clue lines" values={value.lines} onChange={(lines) => onChange({ ...value, lines })} issues={issues} path="data.lines" max={8} addLabel="Add a line" numbered hint="Up to 8 lines, in the order the card shows them." />
      <TdSwitchField
        label="SoFIFA face"
        checked={value.photo !== null}
        onChange={(on) => onChange({ ...value, photo: on ? { id: 1, ver: '' } : null })}
        hint="The player’s face from SoFIFA. An uploaded photo, when chosen, is shown instead."
      />
      {value.photo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <TdNumberField label="SoFIFA player id" value={value.photo.id} onChange={(id) => onChange({ ...value, photo: { ...value.photo!, id: id ?? 1 } })} issues={issuesAt(issues, 'data.photo.id')} />
          <TdTextField label="SoFIFA version" value={value.photo.ver} onChange={(ver) => onChange({ ...value, photo: { ...value.photo!, ver } })} issues={issuesAt(issues, 'data.photo.ver')} placeholder="e.g. 25_1" />
        </div>
      )}
      <TdMediaPicker label="Uploaded photo" value={value.imageKey} onChange={(imageKey) => onChange({ ...value, imageKey })} />
    </>
  );
}

export function WhoamiEditor({ value, onChange, issues, creating }: TdEditorProps<'whoami-subjects'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label="Answer (as shown)" value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
      <TdListField
        label="Clues, in the order they are read"
        values={value.clues}
        onChange={(clues) => onChange({ ...value, clues })}
        issues={issues}
        path="data.clues"
        max={20}
        addLabel="Add a clue"
        numbered
        multiline
        hint="1 to 20 clues, hardest first; a match reads 5."
      />
    </>
  );
}

export function BoxCategoryEditor({ value, onChange, issues, creating }: TdEditorProps<'box-categories'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label="Title" value={value.title} onChange={(title) => onChange({ ...value, title })} issues={issuesAt(issues, 'data.title')} />
    </>
  );
}

export function BoxQuestionEditor({ value, onChange, issues, creating }: TdEditorProps<'box-questions'>) {
  return (
    <>
      <CategoryField type="box-categories" value={value.categoryKey} onChange={(categoryKey) => onChange({ ...value, categoryKey })} issues={issues} creating={creating} />
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label="Question" multiline value={value.q} onChange={(q) => onChange({ ...value, q })} issues={issuesAt(issues, 'data.q')} />
      <TdTextField label="Answer (as shown)" value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
    </>
  );
}

export function PenaltyEditor({ value, onChange, issues, creating }: TdEditorProps<'penalty-questions'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <TdTextField label="Question" multiline value={value.q} onChange={(q) => onChange({ ...value, q })} issues={issuesAt(issues, 'data.q')} hint="Keep it short: the shoot-out gives a few seconds per question." />
      <TdTextField label="Answer (as shown)" value={value.display} onChange={(display) => onChange({ ...value, display })} issues={issuesAt(issues, 'data.display')} />
      <TdSpellingsField values={value.aliases} onChange={(aliases) => onChange({ ...value, aliases })} issues={issues} path="data.aliases" />
    </>
  );
}
