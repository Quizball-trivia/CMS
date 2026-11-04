import { apiClient } from './api-client';

export interface PersonRow {
  id: string;
  kind: 'registered' | 'guest';
  nickname: string | null;
  email: string | null;
  country: string | null;
  createdAt: string;
  coins: number | null;
  converted: boolean;
}

export interface ActivityEntry {
  at: string;
  type: string;
  meta: Record<string, unknown>;
}

export const adminPersonsService = {
  list(params: { kind: 'registered' | 'guest'; search?: string; limit?: number; offset?: number }, signal?: AbortSignal) {
    return apiClient.get<{ persons: PersonRow[] }>('/admin/stats/persons', {
      kind: params.kind,
      ...(params.search ? { search: params.search } : {}),
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    }, signal);
  },
  activity(kind: 'registered' | 'guest', id: string, signal?: AbortSignal) {
    return apiClient.get<{ activity: ActivityEntry[] }>(`/admin/stats/persons/${kind}/${id}/activity`, undefined, signal);
  },
};
