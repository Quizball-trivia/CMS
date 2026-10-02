import { SESSION_CHANGED, TdApiError } from './api-client';
import type { DependencyDetails, SchemaIssue } from './contract';
import { t } from '@/lib/td/i18n';

export type TdDependencyRef = DependencyDetails['refs'][number];

/** A refusal as the UI shows it: what happened in plain words, with what the API said about it. */
export interface TdErrorView {
  code: string;
  status: number;
  title: string;
  /** The API's own message, when it adds something to the title. */
  detail: string | null;
  /** 422 validation: field issues by path. */
  issues: SchemaIssue[];
  /** 409 dependency_unapproved: what must be approved first. */
  refs: TdDependencyRef[];
  /** 409 revision_conflict: the record as it is now. */
  current: unknown;
  /** 409 publication_in_progress: the run holding the slot. */
  publicationId: string | null;
  /** 422 invalid_image: why the file was refused. */
  imageReason: string | null;
}

const TITLES: Record<string, string> = {
  invalid_request: t('The API did not accept this request.'),
  unauthorized: t('Your session has ended; sign in again.'),
  session_expired: t('Your session has ended; sign in again.'),
  not_signed_in: t('You are signed out.'),
  forbidden: t('Your role cannot do this.'),
  not_found: t('It no longer exists; it may have been removed.'),
  rate_limited: t('Too many requests; wait a minute and try again.'),
  already_exists: t('This key is already taken.'),
  conflict: t('This conflicts with something that already exists.'),
  busy: t('The API is busy; try again.'),
  internal: t('Something went wrong on the API.'),
  revision_conflict: t('Someone changed this since you opened it.'),
  forbidden_transition: t('This step is not allowed from the current status.'),
  self_approval: t('You made the last edit, so another publisher must approve it.'),
  validation: t('Some fields are not valid.'),
  dependency_unapproved: t('Approve what this refers to first.'),
  in_use: t('Live content still uses this.'),
  conflict_retry: t('Another change got in the way; try again.'),
  match_not_decided: t('The match is not decided yet; it can be corrected once it is.'),
  same_result: t('That is already the result of this match.'),
  too_close_to_midnight: t('Tickets per day cannot change within five minutes of Georgian midnight.'),
  invalid_image: t('This image was refused.'),
  too_large: t('An image is at most 2 MB.'),
  storage_unavailable: t('Image storage is not available right now; try again later.'),
  publication_in_progress: t('Another publish or roll back is running.'),
  idempotency_conflict: t('This request key was already used for something else; start again.'),
  not_rollback_target: t('This release cannot be rolled back to: it must have been current before, not be current now, and still be available.'),
  release_unrunnable: t('This release no longer serves every daily game today, so it cannot be made current.'),
  refresh_unavailable: t('Could not renew your session; try again.'),
  [SESSION_CHANGED]: t('You signed out or switched accounts; the request was cancelled.'),
};

export const TD_IMAGE_REFUSALS: Record<string, string> = {
  type: t('Only JPEG, PNG or WebP images are accepted.'),
  signature: t('The file is not the image its type says.'),
  trailing_data: t('The file carries data after the image.'),
  too_large: t('An image is at most 2 MB.'),
  dimensions: t('An image is at most 4096 pixels a side.'),
  animated: t('Animated images are not accepted.'),
  decode: t('The image could not be read.'),
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function issuesOf(details: Record<string, unknown>): SchemaIssue[] {
  const issues = Array.isArray(details.issues) ? details.issues : [];
  return issues
    .map((issue) => record(issue))
    .filter((issue) => typeof issue.message === 'string')
    .map((issue) => ({ path: typeof issue.path === 'string' ? issue.path : '', message: issue.message as string }));
}

export function describeTdError(error: unknown): TdErrorView {
  if (!(error instanceof TdApiError)) {
    const network = error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');
    return {
      code: network ? 'network' : 'unknown',
      status: 0,
      title: network ? t('The Table Derby API is not responding; try again.') : t('Something went wrong.'),
      detail: null,
      issues: [],
      refs: [],
      current: undefined,
      publicationId: null,
      imageReason: null,
    };
  }
  const details = record(error.details);
  const title = TITLES[error.code] ?? error.message;
  const imageReason = error.code === 'invalid_image' && typeof details.reason === 'string' ? details.reason : null;
  return {
    code: error.code,
    status: error.status,
    title: imageReason ? (TD_IMAGE_REFUSALS[imageReason] ?? title) : title,
    detail: error.message && error.message !== title ? error.message : null,
    issues: issuesOf(details),
    refs: Array.isArray(details.refs) ? (details.refs as TdDependencyRef[]) : [],
    current: details.current,
    publicationId: typeof details.publicationId === 'string' ? details.publicationId : null,
    imageReason,
  };
}

/** One line for a toast. */
export function tdErrorText(error: unknown): string {
  const view = describeTdError(error);
  return view.detail && view.code !== 'validation' ? `${view.title} ${view.detail}` : view.title;
}

export const isTdError = (error: unknown, ...codes: string[]) => error instanceof TdApiError && codes.includes(error.code);
