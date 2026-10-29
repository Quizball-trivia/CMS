import { t } from '@/lib/td/i18n';

/** Betsson's team has one role: a member writes, publishes and invites (2026-10-28). */
export const TD_ROLES = ['betsson_admin', 'ops'] as const;
export type TdRole = (typeof TD_ROLES)[number];

export const TD_ROLE_LABELS: Record<TdRole, string> = {
  betsson_admin: t('Editor'),
  ops: t('Ops (Quizball)'),
};

/** `GET /admin/me` */
export interface TdStaff {
  id: string;
  email: string;
  name: string;
  role: TdRole;
}

/** One row of `GET /admin/staff` */
export interface TdStaffMember extends TdStaff {
  status: 'active' | 'invited' | 'disabled';
  lastSignInAt: string | null;
}

export interface TdStaffListResponse {
  items: TdStaffMember[];
}

/** `POST /admin/auth/login` and `POST /admin/auth/refresh`; `expiresAt` is ISO 8601. */
export interface TdTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface TdApiErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}
