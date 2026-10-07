import { SESSION_CHANGED, TdApiError } from './api-client';
import type { DependencyDetails, SchemaIssue } from './contract';

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
  invalid_request: 'The API did not accept this request.',
  unauthorized: 'Your session has ended; sign in again.',
  session_expired: 'Your session has ended; sign in again.',
  not_signed_in: 'You are signed out.',
  forbidden: 'Your role cannot do this.',
  not_found: 'It no longer exists; it may have been removed.',
  rate_limited: 'Too many requests; wait a minute and try again.',
  already_exists: 'This key is already taken.',
  conflict: 'This conflicts with something that already exists.',
  busy: 'The API is busy; try again.',
  internal: 'Something went wrong on the API.',
  revision_conflict: 'Someone changed this since you opened it.',
  forbidden_transition: 'This step is not allowed from the current status.',
  self_approval: 'You made the last edit, so another publisher must approve it.',
  validation: 'Some fields are not valid.',
  dependency_unapproved: 'Approve what this refers to first.',
  in_use: 'Live content still uses this.',
  conflict_retry: 'Another change got in the way; try again.',
  match_not_decided: 'The match is not decided yet; it can be corrected once it is.',
  same_result: 'That is already the result of this match.',
  too_close_to_midnight: 'Tickets per day cannot change within five minutes of Georgian midnight.',
  invalid_image: 'This image was refused.',
  too_large: 'An image is at most 2 MB.',
  storage_unavailable: 'Image storage is not available right now; try again later.',
  publication_in_progress: 'Another publish or roll back is running.',
  idempotency_conflict: 'This request key was already used for something else; start again.',
  not_rollback_target: 'This release cannot be rolled back to: it must have been current before, not be current now, and still be available.',
  release_unrunnable: 'This release no longer serves every daily game today, so it cannot be made current.',
  refresh_unavailable: 'Could not renew your session; try again.',
  [SESSION_CHANGED]: 'You signed out or switched accounts; the request was cancelled.',
};

export const TD_IMAGE_REFUSALS: Record<string, string> = {
  type: 'Only JPEG, PNG or WebP images are accepted.',
  signature: 'The file is not the image its type says.',
  trailing_data: 'The file carries data after the image.',
  too_large: 'An image is at most 2 MB.',
  dimensions: 'An image is at most 4096 pixels a side.',
  animated: 'Animated images are not accepted.',
  decode: 'The image could not be read.',
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
      title: network ? 'The Table Derby API is not responding; try again.' : 'Something went wrong.',
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
