// Data layer for the HQ Content tab (`/admin/harness`), through the shared apiClient like hq-api.ts.
import { apiClient } from '@/services';
import type { HarnessOverview, HarnessSettings, HarnessUpdateSettingsRequest } from '@/types';

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
};
