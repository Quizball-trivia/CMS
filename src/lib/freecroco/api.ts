import type {
  CalendarResponse,
  CalendarUpdate,
  DeliveriesQuery,
  DeliveriesResponse,
  DeliveryAttempt,
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

export interface FreecrocoApi {
  getGames(): Promise<PartnerGamesConfig>;
  putGames(config: PartnerGamesConfig): Promise<PartnerGamesConfig>;
  getCalendar(from: string, to: string): Promise<CalendarResponse>;
  putCalendar(update: CalendarUpdate): Promise<CalendarResponse>;
  getRankedPoints(): Promise<RankedPointsConfig>;
  putRankedPoints(update: RankedPointsUpdate): Promise<RankedPointsConfig>;
  listDeliveries(query: DeliveriesQuery): Promise<DeliveriesResponse>;
  listAttempts(eventId: string): Promise<DeliveryAttempt[]>;
  resendDelivery(eventId: string): Promise<void>;
  getPlayer(playerId: string): Promise<PartnerPlayerView>;
  getStats(from: string, to: string): Promise<PartnerStats>;
  listStaff(): Promise<PartnerStaffList>;
  addStaff(request: StaffAddRequest): Promise<StaffAddResult>;
  updateStaffRole(userId: string, role: StaffRole): Promise<PartnerStaffMember>;
  removeStaff(userId: string): Promise<void>;
}
