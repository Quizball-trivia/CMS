export const TD_ROLES = ['editor', 'publisher', 'betsson_admin', 'ops'] as const;
export type TdRole = (typeof TD_ROLES)[number];

export const TD_ROLE_LABELS: Record<TdRole, string> = {
  editor: 'Editor',
  publisher: 'Publisher',
  betsson_admin: 'Betsson admin',
  ops: 'Ops (Quizball)',
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
