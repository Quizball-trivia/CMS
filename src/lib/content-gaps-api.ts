// Data layer for HQ → Content gaps (`/admin/content-gaps`), through the shared apiClient like hq-api.ts.
import { apiClient } from '@/services';
import type {
  ContentFix, ContentFixHumanTarget, ContentFixesListParams, ContentGap, ContentGapHumanTarget, ContentGapSummaryRow, ContentGapsListParams,
} from '@/types';

const BASE = '/admin/content-gaps';

interface ItemsResponse<T> { items: T[] }

export const contentGapsApi = {
  list(params?: ContentGapsListParams): Promise<ItemsResponse<ContentGap>> {
    return apiClient.get<ItemsResponse<ContentGap>>(BASE, params as Record<string, string | number | undefined>);
  },
  summary(): Promise<ItemsResponse<ContentGapSummaryRow>> {
    return apiClient.get<ItemsResponse<ContentGapSummaryRow>>(`${BASE}/summary`);
  },
  updateGap(id: number, status: ContentGapHumanTarget, expectedRevision: number, reason: string): Promise<{ id: number; status: string; revision: number }> {
    return apiClient.patch(`${BASE}/${id}`, { status, expectedRevision, reason });
  },
  listFixes(params?: ContentFixesListParams): Promise<ItemsResponse<ContentFix>> {
    return apiClient.get<ItemsResponse<ContentFix>>(`${BASE}/fixes`, params as Record<string, string | number | undefined>);
  },
  updateFix(id: number, status: ContentFixHumanTarget, expectedRevision: number, reason: string): Promise<{ id: number; status: string; revision: number }> {
    return apiClient.patch(`${BASE}/fixes/${id}`, { status, expectedRevision, reason });
  },
};
