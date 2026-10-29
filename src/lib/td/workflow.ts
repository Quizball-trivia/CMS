/**
 * Which workflow actions to offer on a row (plan §13.2/§13.3). The API decides
 * every one of them; this only keeps the UI from offering what the API would
 * always refuse, and says why an action is missing.
 */
import type { TdContentRow } from './admin-api';
import { t } from './i18n';

export type TdContentAction = 'save' | 'ready' | 'approve' | 'archive' | 'restore';

export interface TdActionState {
  allowed: boolean;
  /** Why it is not offered, when that is worth saying. */
  reason?: string;
}

type Row = Pick<TdContentRow, 'status'>;

/** Every member writes and publishes (one role for Betsson's team, 2026-10-28). */
export function contentActions(row: Row): Record<TdContentAction, TdActionState> {
  const archived = row.status === 'archived';
  return {
    save: archived ? { allowed: false, reason: t('Restore it before editing.') } : { allowed: true },
    ready: { allowed: row.status === 'draft' },
    approve: { allowed: row.status === 'ready' },
    archive: { allowed: !archived },
    restore: { allowed: archived },
  };
}
