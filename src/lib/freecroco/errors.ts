import { ApiClientError } from '@/services/api-client';

/** Someone else saved since this screen loaded (409 stale_version). */
export function isStaleVersion(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 409 && error.code === 'stale_version';
}

/** Resend was refused because the delivery is no longer dead (409 not_resendable). */
export function isNotResendable(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 409 && error.code === 'not_resendable';
}

export const NOT_RESENDABLE_MESSAGE =
  'This delivery can no longer be resent: it is not dead any more. The list was refreshed.';

export const STALE_GAMES_MESSAGE =
  'Someone else saved the games first. The latest settings were reloaded; re-apply your changes and save again.';
export const STALE_CALENDAR_MESSAGE =
  'Someone else saved the calendar first. The latest calendar was reloaded and your pending changes were kept on top of it; review them and save again.';
export const STALE_RANKED_POINTS_MESSAGE =
  'Someone else saved the ranked points first. The latest table was reloaded; re-apply your changes and save again.';
