import { freecrocoRequest } from '@/lib/freecroco/http';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import type { FreecrocoApi } from '@/lib/freecroco/api';
import type {
  CalendarResponse,
  DeliveriesResponse,
  DeliveryAttemptsResponse,
  PartnerGamesConfig,
  PartnerPlayerView,
  PartnerStaffList,
  PartnerStaffMember,
  PartnerStats,
  RankedPointsConfig,
  RankedPointsUpdate,
  StaffAddRequest,
  StaffAddResult,
  StaffRole,
} from '@/types/freecroco';

// Compared to a literal so Next inlines it at build time.
export const isFreecrocoMock = (): boolean => process.env.NEXT_PUBLIC_FREECROCO_MOCK === '1';

const player = (playerId: string) => `/players/${encodeURIComponent(playerId)}`;
const staffMember = (userId: string) => `/staff/${encodeURIComponent(userId)}`;

const realApi: FreecrocoApi = {
  getGames: () => freecrocoRequest<PartnerGamesConfig>('GET', '/games'),
  putGames: (config) => freecrocoRequest<PartnerGamesConfig>('PUT', '/games', { body: config }),
  getCalendar: (from, to) => freecrocoRequest<CalendarResponse>('GET', '/calendar', { query: { from, to } }),
  putCalendar: (update) => freecrocoRequest<CalendarResponse>('PUT', '/calendar', { body: update }),
  getRankedPoints: () => freecrocoRequest<RankedPointsConfig>('GET', '/ranked-points'),
  putRankedPoints: (update) => freecrocoRequest<RankedPointsConfig>('PUT', '/ranked-points', { body: update }),
  listDeliveries: (query) =>
    freecrocoRequest<DeliveriesResponse>('GET', '/deliveries', { query: { ...query } }),
  async listAttempts(eventId) {
    const res = await freecrocoRequest<DeliveryAttemptsResponse>(
      'GET',
      `/deliveries/${encodeURIComponent(eventId)}/attempts`,
    );
    return res.items;
  },
  async resendDelivery(eventId) {
    await freecrocoRequest<void>('POST', `/deliveries/${encodeURIComponent(eventId)}/resend`);
  },
  getPlayer: (playerId) => freecrocoRequest<PartnerPlayerView>('GET', player(playerId)),
  getStats: (from, to) => freecrocoRequest<PartnerStats>('GET', '/stats', { query: { from, to } }),
  listStaff: () => freecrocoRequest<PartnerStaffList>('GET', '/staff'),
  addStaff: (request) => freecrocoRequest<StaffAddResult>('POST', '/staff', { body: request }),
  updateStaffRole: (userId, role) => freecrocoRequest<PartnerStaffMember>('PATCH', staffMember(userId), { body: { role } }),
  async removeStaff(userId) {
    await freecrocoRequest<void>('DELETE', staffMember(userId));
  },
};

function api(): FreecrocoApi {
  return isFreecrocoMock() ? getFreecrocoMock() : realApi;
}

// Admin API for the Freecroco section. Calls go to /partner-admin/v1/partners/freecroco with the
// bearer token only; see lib/freecroco/http.ts.
export const freecrocoService = {
  getGames: () => api().getGames(),
  putGames: (config: PartnerGamesConfig) => api().putGames(config),
  getCalendar: (from: string, to: string) => api().getCalendar(from, to),
  putCalendar: (update: Parameters<FreecrocoApi['putCalendar']>[0]) => api().putCalendar(update),
  getRankedPoints: () => api().getRankedPoints(),
  putRankedPoints: (update: RankedPointsUpdate) => api().putRankedPoints(update),
  listDeliveries: (query: Parameters<FreecrocoApi['listDeliveries']>[0]) => api().listDeliveries(query),
  listAttempts: (eventId: string) => api().listAttempts(eventId),
  resendDelivery: (eventId: string) => api().resendDelivery(eventId),
  getPlayer: (playerId: string) => api().getPlayer(playerId),
  getStats: (from: string, to: string) => api().getStats(from, to),
  listStaff: () => api().listStaff(),
  addStaff: (request: StaffAddRequest) => api().addStaff(request),
  updateStaffRole: (userId: string, role: StaffRole) => api().updateStaffRole(userId, role),
  removeStaff: (userId: string) => api().removeStaff(userId),
};
