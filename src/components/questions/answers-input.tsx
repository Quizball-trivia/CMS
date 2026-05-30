'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface AnswersInputProps {
  /** Current committed answers. */
  value: string[];
  /** Called with the parsed answers when editing finishes (on blur). */
  onCommit: (answers: string[]) => void;
  placeholder?: string;
  className?: string;
}

function parseAnswers(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Comma-separated answers input. Keeps a raw draft string in local state while
 * editing so commas, spaces and trailing characters type freely — parsing into
 * the `string[]` happens only on blur, not on every keystroke.
 *
 * Parsing per-keystroke (the old `value={arr.join(', ')}` +
 * `onChange={arr.split(',').filter(Boolean)}` pattern) round-trips the value
 * through an array and strips the comma/space the user just typed, making the
 * field impossible to extend.
 */
export function AnswersInput({ value, onCommit, placeholder, className }: AnswersInputProps) {
  const joined = value.join(', ');
  // `synced` is the committed value the draft was last derived from. When the
  // prop changes externally (and we're not editing) we re-derive the draft
  // during render — React's recommended alternative to a prop->state effect.
  // `editing` guards against clobbering in-progress typing. Both live in state
  // (not refs) so reads/writes during render are allowed.
  const [state, setState] = useState({ draft: joined, synced: joined, editing: false });

  if (!state.editing && joined !== state.synced) {
    setState({ draft: joined, synced: joined, editing: false });
  }

  return (
    <Input
      className={className}
      value={state.draft}
      placeholder={placeholder}
      onFocus={() => setState((s) => ({ ...s, editing: true }))}
      onChange={(e) => {
        const next = e.target.value;
        setState((s) => ({ ...s, draft: next, editing: true }));
      }}
      onBlur={() => {
        const parsed = parseAnswers(state.draft);
        const normalized = parsed.join(', ');
        setState({ draft: normalized, synced: normalized, editing: false });
        onCommit(parsed);
      }}
    />
  );
}
