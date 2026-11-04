import { SESSION_CHANGED, TdApiError } from './api-client';
import type { DependencyDetails, SchemaIssue } from './contract';
import { t, TD_LANG } from '@/lib/td/i18n';

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
  self_approval: t('You made the last edit, so a colleague must approve it.'),
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
  invalid_credentials: t('Email or password is incorrect.'),
  invalid_refresh_token: t('Your session has ended; sign in again.'),
  refresh_token_reused: t('Your session was ended for safety; sign in again.'),
  invalid_token: t('This link has expired or was already used.'),
  weak_password: t('This password is not accepted: use 12 to 256 characters, different from the current one.'),
  wrong_password: t('The current password is not right.'),
  [SESSION_CHANGED]: t('You signed out or switched accounts; the request was cancelled.'),
};

/** Sentences the API writes (in English) that say more than a refusal's title, in the workspace's language. */
const API_MESSAGES: Record<string, string> = {
  'Ops members are managed on the server only': t('Ops members are managed on the server only'),
  'This email is already on the team': t('This email is already on the team'),
  'The team changed meanwhile; try again': t('The team changed meanwhile; try again'),
  'A snapshot already has this label': t('A snapshot already has this label'),
  'This snapshot was withdrawn: it holds accounts never eligible for prizes; take a new one': t('This snapshot was withdrawn: it holds accounts never eligible for prizes; take a new one'),
  'This event is being sent now; look again in a moment': t('This event is being sent now; look again in a moment'),
  'This event was delivered already': t('This event was delivered already'),
  'This review is closed already': t('This review is closed already'),
  'Webhooks to this partner are not configured here': t('Webhooks to this partner are not configured here'),
  'The winner must be one of the match’s players': t('The winner must be one of the match’s players'),
  'The new password must differ from the current one': t('The new password must differ from the current one'),
  'The result changed meanwhile; look again': t('The result changed meanwhile; look again'),
  'The setting changed meanwhile; look again': t('The setting changed meanwhile; look again'),
  'The match is busy; try again in a moment': t('The match is busy; try again in a moment'),
  'The setting is busy; try again in a moment': t('The setting is busy; try again in a moment'),
  'Signing in took too long; try again': t('Signing in took too long; try again'),
  'Too many sign-ins at once; try again in a moment': t('Too many sign-ins at once; try again in a moment'),
  'This import key was used for other items': t('This import key was used for other items'),
  'Some items cannot be imported': t('Some items cannot be imported'),
  'This refers to content that does not exist': t('This refers to content that does not exist'),
  'The uploaded file is missing': t('The uploaded file is missing'),
};

const GEORGIAN = /[\u10D0-\u10FF]/;

/**
 * An API sentence in the workspace's language, or null: a Georgian build never shows the API's English. Text the CMS
 * wrote itself is Georgian already and kept; the English build keeps the API's words as they are.
 */
export function tdApiMessage(message: string): string | null {
  const bare = message.replace(/\.$/, '');
  if (Object.hasOwn(API_MESSAGES, bare)) return API_MESSAGES[bare]!;
  return TD_LANG === 'en' || GEORGIAN.test(message) ? message : null;
}

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
    .map((issue) => ({ path: typeof issue.path === 'string' ? issue.path : '', message: tdApiMessage(issue.message as string) ?? t('Not a valid value') }));
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
  const said = error.message ? tdApiMessage(error.message) : null;
  const title = TITLES[error.code] ?? said ?? t('Something went wrong.');
  const imageReason = error.code === 'invalid_image' && typeof details.reason === 'string' ? details.reason : null;
  return {
    code: error.code,
    status: error.status,
    title: imageReason ? (TD_IMAGE_REFUSALS[imageReason] ?? title) : title,
    detail: said && said !== title ? said : null,
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
