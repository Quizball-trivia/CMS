// Data layer for the HQ Content tab (`/admin/harness`), through the shared apiClient like hq-api.ts.
import { apiClient } from '@/services';
import type { HarnessCreateRequest, HarnessItemAction, HarnessOverview, HarnessPriority, HarnessSettings, HarnessUpdateSettingsRequest } from '@/types';

const BASE = '/admin/harness';

export const harnessApi = {
  overview(): Promise<HarnessOverview> {
    return apiClient.get<HarnessOverview>(`${BASE}/overview`);
  },
  updateSettings(body: HarnessUpdateSettingsRequest): Promise<HarnessSettings> {
    return apiClient.patch<HarnessSettings>(`${BASE}/settings`, body);
  },
  setPolicy(key: string, value: unknown): Promise<{ key: string; value: unknown }> {
    return apiClient.put(`${BASE}/policies/${encodeURIComponent(key)}`, { value });
  },
  setSteering(categoryId: string, body: { priority?: HarnessPriority; direction?: string }) {
    return apiClient.put<{ categoryId: string; priority: HarnessPriority; direction: string }>(`${BASE}/steering/${encodeURIComponent(categoryId)}`, body);
  },
  setDirection(direction: string) {
    return apiClient.put<{ direction: string }>(`${BASE}/direction`, { direction });
  },
  createRequest(body: HarnessCreateRequest) {
    return apiClient.post<{ id: string }>(`${BASE}/requests`, body);
  },
  cancelRequest(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/requests/${encodeURIComponent(id)}/cancel`, {});
  },
  itemAction(itemId: string, body: { action: HarnessItemAction; version: number; note?: string }) {
    return apiClient.post<{ id: string; stage: string }>(`${BASE}/items/${encodeURIComponent(itemId)}/action`, body);
  },
};
