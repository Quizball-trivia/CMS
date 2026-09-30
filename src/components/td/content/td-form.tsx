'use client';

import { useId, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Lock, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SchemaIssue } from '@/lib/td/contract';
import { cn } from '@/lib/utils';

export const tdInputClass = 'h-10 rounded-lg border-border bg-(--td-input) text-sm text-foreground placeholder:text-(--td-text-3)';

/** Issues at `path` or under it (`data.aliases` takes `data.aliases.2`). */
export function issuesAt(issues: SchemaIssue[], path: string): SchemaIssue[] {
  return issues.filter((issue) => issue.path === path || issue.path.startsWith(`${path}.`));
}

export function TdIssueText({ issues }: { issues: SchemaIssue[] }) {
  if (!issues.length) return null;
  const messages = [...new Set(issues.map((issue) => issue.message))];
  return (
    <p role="alert" className="text-xs text-(--td-danger)">
      {messages.join(' · ')}
    </p>
  );
}

export function TdField({
  label,
  hint,
  issues = [],
  locked,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  issues?: SchemaIssue[];
  /** Fixed once created (the API refuses a change). */
  locked?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-(--td-text-3)">
        {label}
        {locked && (
          <span title="Fixed once created" className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide">
            <Lock className="size-3" />
            fixed
          </span>
        )}
      </label>
      {children}
      {hint && !issues.length && <p className="text-xs text-(--td-text-3)">{hint}</p>}
      <TdIssueText issues={issues} />
    </div>
  );
}

export function TdTextField({
  label,
  value,
  onChange,
  issues = [],
  hint,
  locked,
  placeholder,
  multiline,
  className,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  issues?: SchemaIssue[];
  hint?: ReactNode;
  locked?: boolean;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  type?: 'text' | 'date';
}) {
  const id = useId();
  return (
    <TdField label={label} hint={hint} issues={issues} locked={locked} htmlFor={id} className={className}>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          disabled={locked}
          placeholder={placeholder}
          aria-invalid={issues.length > 0}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-20 rounded-lg border-border bg-(--td-input) text-sm"
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          disabled={locked}
          placeholder={placeholder}
          aria-invalid={issues.length > 0}
          onChange={(event) => onChange(event.target.value)}
          className={tdInputClass}
        />
      )}
    </TdField>
  );
}

/** An optional text: empty is null. */
export function TdOptionalTextField({ value, onChange, ...rest }: Omit<Parameters<typeof TdTextField>[0], 'value' | 'onChange'> & { value: string | null; onChange: (value: string | null) => void }) {
  return <TdTextField {...rest} value={value ?? ''} onChange={(next) => onChange(next === '' ? null : next)} />;
}

export function TdNumberField({
  label,
  value,
  onChange,
  issues = [],
  hint,
  locked,
  nullable,
  className,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  issues?: SchemaIssue[];
  hint?: ReactNode;
  locked?: boolean;
  nullable?: boolean;
  className?: string;
}) {
  const id = useId();
  // The text as typed, so "-" or "1." can be typed on the way to a number.
  const [text, setText] = useState<{ raw: string; for: number | null }>({ raw: value === null ? '' : String(value), for: value });
  const raw = text.for === value ? text.raw : value === null ? '' : String(value);
  return (
    <TdField label={label} hint={hint} issues={issues} locked={locked} htmlFor={id} className={className}>
      <Input
        id={id}
        inputMode="decimal"
        value={raw}
        disabled={locked}
        aria-invalid={issues.length > 0}
        onChange={(event) => {
          const next = event.target.value.trim();
          const parsed = next === '' ? null : Number(next);
          if (parsed !== null && Number.isNaN(parsed)) {
            setText({ raw: event.target.value, for: value });
            return;
          }
          const committed = parsed === null && !nullable ? value : parsed;
          setText({ raw: event.target.value, for: committed });
          onChange(committed);
        }}
        className={tdInputClass}
      />
    </TdField>
  );
}

export function TdSelectField<V extends string>({
  label,
  value,
  onChange,
  options,
  issues = [],
  hint,
  locked,
  className,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  options: ReadonlyArray<{ value: V; label: string }>;
  issues?: SchemaIssue[];
  hint?: ReactNode;
  locked?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <TdField label={label} hint={hint} issues={issues} locked={locked} htmlFor={id} className={className}>
      <select
        id={id}
        value={value}
        disabled={locked}
        onChange={(event) => onChange(event.target.value as V)}
        className={cn(tdInputClass, 'w-full border px-3 disabled:opacity-60')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </TdField>
  );
}

export function TdSwitchField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border border-border bg-(--td-input)/40 px-3 py-2.5">
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-(--td-text-3)">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-[#3a3a3a]')}
      >
        <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export type TdListChange = { kind: 'edit' | 'add' } | { kind: 'move'; from: number; to: number } | { kind: 'remove'; index: number };

/** An ordered list of short texts (clue lines, clues, options), with add, remove and reorder. */
export function TdListField({
  label,
  values,
  onChange,
  issues = [],
  path,
  hint,
  placeholder,
  max,
  addLabel = 'Add',
  numbered,
  multiline,
  renderMarker,
  canRemove,
}: {
  label: string;
  values: string[];
  /** With what changed, for a caller that keeps an index into the list (a practice question's right option). */
  onChange: (values: string[], change: TdListChange) => void;
  /** An item that may not be removed now (the reason is its title). */
  canRemove?: (index: number) => string | true;
  issues?: SchemaIssue[];
  /** The list's issue path, for per-item messages (`data.clues`). */
  path: string;
  hint?: ReactNode;
  placeholder?: string;
  max?: number;
  addLabel?: string;
  numbered?: boolean;
  multiline?: boolean;
  renderMarker?: (index: number) => ReactNode;
}) {
  const own = issues.filter((issue) => issue.path === path);
  const set = (index: number, value: string) => onChange(values.map((v, i) => (i === index ? value : v)), { kind: 'edit' });
  const move = (index: number, by: number) => {
    const next = [...values];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next, { kind: 'move', from: index, to: index + by });
  };
  return (
    <TdField label={label} hint={hint} issues={own}>
      <ol className="flex flex-col gap-2">
        {values.map((value, index) => {
          const itemIssues = issuesAt(issues, `${path}.${index}`);
          return (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                {renderMarker ? renderMarker(index) : numbered && <span className="mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums text-(--td-text-3)">{index + 1}</span>}
                {multiline ? (
                  <Textarea
                    value={value}
                    placeholder={placeholder}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={itemIssues.length > 0}
                    onChange={(event) => set(index, event.target.value)}
                    className="min-h-10 flex-1 rounded-lg border-border bg-(--td-input) text-sm"
                  />
                ) : (
                  <Input
                    value={value}
                    placeholder={placeholder}
                    aria-label={`${label} ${index + 1}`}
                    aria-invalid={itemIssues.length > 0}
                    onChange={(event) => set(index, event.target.value)}
                    className={cn(tdInputClass, 'flex-1')}
                  />
                )}
                <div className="flex shrink-0 items-center">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={index === values.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove"
                    disabled={canRemove !== undefined && canRemove(index) !== true}
                    title={canRemove && canRemove(index) !== true ? String(canRemove(index)) : undefined}
                    onClick={() => onChange(values.filter((_, i) => i !== index), { kind: 'remove', index })}
                  >
                    <X />
                  </Button>
                </div>
              </div>
              <TdIssueText issues={itemIssues} />
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="secondary" size="sm" className="w-fit rounded-lg" disabled={max !== undefined && values.length >= max} onClick={() => onChange([...values, ''], { kind: 'add' })}>
        <Plus />
        {addLabel}
      </Button>
    </TdField>
  );
}

/** Accepted spellings: chips, added with Enter or a comma. */
export function TdSpellingsField({
  label = 'Accepted spellings',
  values,
  onChange,
  issues = [],
  path,
  hint = 'Press Enter or type a comma after each spelling. Players’ answers are compared with these.',
  max = 40,
}: {
  label?: string;
  values: string[];
  onChange: (values: string[]) => void;
  issues?: SchemaIssue[];
  path: string;
  hint?: ReactNode;
  max?: number;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const commit = (raw: string) => {
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => !values.includes(part));
    if (parts.length) onChange([...values, ...parts].slice(0, max));
    setDraft('');
  };
  return (
    <TdField label={label} hint={hint} issues={issuesAt(issues, path)} htmlFor={id}>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-(--td-input) px-2 py-1.5">
        {values.map((value, index) => (
          <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-card px-2 py-0.5 text-xs">
            {value}
            <button type="button" aria-label={`Remove ${value}`} className="text-(--td-text-3) hover:text-foreground" onClick={() => onChange(values.filter((_, i) => i !== index))}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={values.length ? '' : 'e.g. messi, lionel messi'}
          onChange={(event) => (event.target.value.includes(',') ? commit(event.target.value) : setDraft(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit(draft);
            } else if (event.key === 'Backspace' && draft === '' && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-(--td-text-3)"
        />
      </div>
    </TdField>
  );
}
