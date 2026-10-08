'use client';

import { AlertCircle } from 'lucide-react';
import { TD_CONTENT_SCHEMA_NAMES, type TdContentType } from '@/lib/td/admin-api';
import { describeTdError, type TdDependencyRef } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  'card-categories': t('card category'),
  cards: t('card'),
  'whoami-subjects': t('subject'),
  'box-categories': t('box category'),
  'box-questions': t('box question'),
  'penalty-questions': t('penalty question'),
  'practice-questions': t('practice question'),
  media: t('image'),
  clubs: t('club'),
  'football-logic': t('Football Logic question'),
  'put-in-order': t('Put in Order round'),
  'career-path': t('Career Path question'),
  'daily-schedule': t('calendar date'),
  'daily-settings': t('daily settings'),
};

/** The statuses as the API names them in a refusal. */
const STATUS_LABELS: Record<string, string> = {
  draft: t('draft'),
  ready: t('ready'),
  approved: t('approved'),
  archived: t('archived'),
};

export function describeRef(ref: TdDependencyRef): string {
  const type = TYPE_LABELS[ref.type] ?? (TD_CONTENT_SCHEMA_NAMES[ref.type as TdContentType] ?? ref.type);
  const what = ref.key
    ? t('{type} “{key}”', { type, key: ref.key })
    : ref.puzzle
      ? t('{type} in puzzle “{puzzle}”', { type, puzzle: ref.puzzle })
      : ref.type === 'cards'
        ? t('cards: none approved yet')
        : ref.type === 'box-questions'
          ? t('box questions: none approved yet')
          : type;
  return ref.status ? `${what} (${STATUS_LABELS[ref.status] ?? ref.status})` : what;
}

/** A refusal, in plain words, with what the API said about it (issues, what to approve first). */
export function TdErrorPanel({ error, className, hideIssues }: { error: unknown; className?: string; hideIssues?: boolean }) {
  if (!error) return null;
  const view = describeTdError(error);
  return (
    <div role="alert" className={cn('flex items-start gap-2 rounded-lg bg-(--td-danger)/10 px-3 py-2.5 text-sm text-(--td-danger)', className)}>
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{view.title}</p>
        {view.detail && view.code !== 'validation' && <p className="mt-0.5 text-xs opacity-90">{view.detail}</p>}
        {!hideIssues && view.issues.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {view.issues.map((issue, i) => (
              <li key={i}>
                {issue.path && <span className="font-mono">{issue.path}: </span>}
                {issue.message}
              </li>
            ))}
          </ul>
        )}
        {view.refs.length > 0 && (
          <ul className="mt-1 list-disc pl-4 text-xs">
            {view.refs.map((ref, i) => (
              <li key={i}>{describeRef(ref)}</li>
            ))}
          </ul>
        )}
        <p className="mt-1 font-mono text-[10px] opacity-70">{view.code}</p>
      </div>
    </div>
  );
}
