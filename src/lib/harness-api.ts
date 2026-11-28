// Data layer for the HQ Content tab (`/admin/harness`), through the shared apiClient like hq-api.ts.
import { apiClient } from '@/services';
import type { HarnessDayRound, HarnessDays, HarnessFeedback, HarnessFeedbackPastEmails, HarnessFeedbackRead, HarnessIdeaKind, HarnessMarket, HarnessGameChange, HarnessGameChanges, HarnessGames, HarnessReport, HarnessReports, HarnessCreateEvent, HarnessCreateRequest, HarnessItemAction, HarnessOverview, HarnessPriority, HarnessSettings, HarnessUpdateSettingsRequest } from '@/types';

const BASE = '/admin/harness';

export const harnessApi = {
  games(): Promise<HarnessGames> {
    return apiClient.get<HarnessGames>(`${BASE}/games`);
  },
  gameChanges(): Promise<HarnessGameChanges> {
    return apiClient.get<HarnessGameChanges>(`${BASE}/games/changes`);
  },
  createGameChange(body: { gameKey: string; title: string; request: string }) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes`, body);
  },
  replanGameChange(id: string, request: string) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes/${encodeURIComponent(id)}/replan`, { request });
  },
  cancelGameChange(id: string) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes/${encodeURIComponent(id)}/cancel`, {});
  },
  /** The Day Builder: days ahead and rounds on their way, per daily game. */
  days(): Promise<HarnessDays> {
    return apiClient.get<HarnessDays>(`${BASE}/days`);
  },
  dayRounds(game: string): Promise<{ items: HarnessDayRound[] }> {
    return apiClient.get<{ items: HarnessDayRound[] }>(`${BASE}/days/${encodeURIComponent(game)}/rounds`);
  },
  buildDays(game: string) {
    return apiClient.post<{ built: string[]; ordered: number }>(`${BASE}/days/${encodeURIComponent(game)}/build`, {});
  },
  /** What players wrote to us, with the Feedback Reader's recap. */
  feedback(): Promise<HarnessFeedback> {
    return apiClient.get<HarnessFeedback>(`${BASE}/feedback`);
  },
  readFeedback() {
    return apiClient.post<HarnessFeedbackRead>(`${BASE}/feedback/read`, {});
  },
  importFeedbackEmails() {
    return apiClient.post<HarnessFeedbackPastEmails>(`${BASE}/feedback/past-emails`, {});
  },
  reports(): Promise<HarnessReports> {
    return apiClient.get<HarnessReports>(`${BASE}/reports`);
  },
  createReport(agent: string) {
    return apiClient.post<HarnessReport>(`${BASE}/reports`, { agent });
  },
  archiveReport(id: string) {
    return apiClient.post<{ id: string; status: 'archived' }>(`${BASE}/reports/${encodeURIComponent(id)}/archive`, {});
  },
  buildGameChange(id: string) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes/${encodeURIComponent(id)}/build`, {});
  },
  /** `seen`: the commit of each built part as the page showed it. */
  mergeGameChange(id: string, seen: Partial<Record<'web' | 'backend', string>>) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes/${encodeURIComponent(id)}/merge`, { seen });
  },
  discardGameChange(id: string) {
    return apiClient.post<HarnessGameChange>(`${BASE}/games/changes/${encodeURIComponent(id)}/discard`, {});
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
  setSteering(categoryId: string, body: { priority?: HarnessPriority; direction?: string; market?: HarnessMarket; marketOnly?: boolean }) {
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
  createProposal(body: { name: string; why?: string; target?: number; market?: HarnessMarket }) {
    return apiClient.post<{ id: string; categoryId: string; slug: string }>(`${BASE}/proposals`, body);
  },
  proposalGoLive(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/proposals/${encodeURIComponent(id)}/go-live`, {});
  },
  cancelProposal(id: string) {
    return apiClient.post<{ id: string; status: string }>(`${BASE}/proposals/${encodeURIComponent(id)}/cancel`, {});
  },
  createIdea(body: { text: string; market: HarnessMarket; kind: HarnessIdeaKind }) {
    return apiClient.post<{ id: string; number: number; status: 'planning' }>(`${BASE}/ideas`, body);
  },
  /** Asks the Market Scout for ideas now, for one market or for all. */
  scoutIdeas(market: HarnessMarket) {
    return apiClient.post<{ started: true; market: HarnessMarket }>(`${BASE}/ideas/scout`, { market });
  },
  acceptIdea(id: string) {
    return apiClient.post<{ id: string; status: 'accepted'; results: Array<{ index: number; ok: boolean; error?: string }> }>(`${BASE}/ideas/${encodeURIComponent(id)}/accept`, {});
  },
  refuseIdea(id: string, reason: string) {
    return apiClient.post<{ id: string; status: 'refused' }>(`${BASE}/ideas/${encodeURIComponent(id)}/refuse`, { reason });
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
