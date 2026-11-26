// Data layer for the HQ Content tab (`/admin/harness`), through the shared apiClient like hq-api.ts.
import { apiClient } from '@/services';
import type { HarnessGames, HarnessCreateEvent, HarnessCreateRequest, HarnessItemAction, HarnessOverview, HarnessPriority, HarnessSettings, HarnessUpdateSettingsRequest } from '@/types';

const BASE = '/admin/harness';

export const harnessApi = {
  games(): Promise<HarnessGames> {
    return apiClient.get<HarnessGames>(`${BASE}/games`);
  },
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
  createEvent(body: HarnessCreateEvent) {
    return apiClient.post<{ id: string }>(`${BASE}/events`, body);
  },
  cancelEvent(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/events/${encodeURIComponent(id)}/cancel`, {});
  },
  createProposal(body: { name: string; why?: string; target?: number }) {
    return apiClient.post<{ id: string; categoryId: string; slug: string }>(`${BASE}/proposals`, body);
  },
  proposalGoLive(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/proposals/${encodeURIComponent(id)}/go-live`, {});
  },
  cancelProposal(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/proposals/${encodeURIComponent(id)}/cancel`, {});
  },
  createAsk(message: string) {
    return apiClient.post<{ id: string }>(`${BASE}/asks`, { message });
  },
  applyAsk(id: string, indexes: number[]) {
    return apiClient.post<{ id: string; results: Array<{ index: number; ok: boolean; error?: string }> }>(`${BASE}/asks/${encodeURIComponent(id)}/apply`, { indexes });
  },
  dismissAsk(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/asks/${encodeURIComponent(id)}/dismiss`, {});
  },
  /** `seen`: the pack's updatedAt as it was read, so a pack that changed since is not changed or approved unread. */
  swapShowQuestion(id: string, index: number, seen: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/show/${encodeURIComponent(id)}/swap`, { index, seen });
  },
  newShowPack(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/show/${encodeURIComponent(id)}/new`, {});
  },
  approveShowPack(id: string, seen: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/show/${encodeURIComponent(id)}/approve`, { seen });
  },
  itemAction(itemId: string, body: { action: HarnessItemAction; version: number; note?: string }) {
    return apiClient.post<{ id: string; stage: string }>(`${BASE}/items/${encodeURIComponent(itemId)}/action`, body);
  },
};
