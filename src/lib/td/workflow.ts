/**
 * Which workflow actions to offer on a row (plan §13.2/§13.3). The API decides
 * every one of them; this only keeps the UI from offering what the API would
 * always refuse, and says why an action is missing.
 */
import type { TdContentRow } from './admin-api';
import type { ContentHistory } from './contract';
import { t } from './i18n';
import type { TdRole, TdStaff } from '@/types/td';

export type TdContentAction = 'save' | 'ready' | 'approve' | 'archive' | 'restore';

export interface TdActionState {
  allowed: boolean;
  /** Why it is not offered, when that is worth saying. */
  reason?: string;
}

export const TD_PUBLISHER_ROLES: readonly TdRole[] = ['publisher', 'betsson_admin', 'ops'];
export const isTdPublisher = (role: TdRole) => TD_PUBLISHER_ROLES.includes(role);

type Row = Pick<TdContentRow, 'status' | 'version' | 'approvedVersion' | 'lastEditor' | 'updatedBy'>;

/**
 * `trail`: the row's history. The editor archive rule needs all of it (nobody
 * else may ever have written to the row, not even a note or a ready), so an
 * editor is offered Archive only once the whole trail has been read.
 */
export function contentActions(row: Row, me: TdStaff, trail?: { items: ContentHistory['items']; complete: boolean } | null): Record<TdContentAction, TdActionState> {
  const publisher = isTdPublisher(me.role);
  const archived = row.status === 'archived';
  const ownLastEdit = row.lastEditor.id === me.id;

  let approve: TdActionState = { allowed: false };
  if (row.status === 'ready') {
    if (!publisher) approve = { allowed: false, reason: t('Ready for a publisher to approve.') };
    else if (ownLastEdit) approve = { allowed: false, reason: t('You made the last edit, so another publisher approves it.') };
    else approve = { allowed: true };
  }

  let archive: TdActionState = { allowed: !archived && publisher };
  if (!archived && !publisher) {
    // The trail counts when it is whole and current: its newest entry is the row's revision.
    const current = Boolean(trail?.complete && trail.items[0]?.version === row.version);
    const untouched = current && trail!.items.every((entry) => entry.actor.id === me.id);
    archive =
      row.approvedVersion === null && untouched
        ? { allowed: true }
        : { allowed: false, reason: t('Editors archive only their own drafts that nobody else has touched and that were never approved.') };
  }

  return {
    save: archived ? { allowed: false, reason: t('Restore it before editing.') } : { allowed: true },
    ready: { allowed: row.status === 'draft' },
    approve,
    archive,
    restore: archived ? (publisher ? { allowed: true } : { allowed: false, reason: t('A publisher restores archived content.') }) : { allowed: false },
  };
}
