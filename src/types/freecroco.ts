// Admin API types, copied from docs/FREECROCO-INTERNAL-API-V1.md section 2.

export type PartnerGameId =
  | 'ranked'
  | 'countdown'
  | 'true-false'
  | 'pick-em'
  | 'career-path'
  | 'higher-lower'
  | 'card-detective'
  | 'guess-the-goal'
  | 'road-to-goal'
  | 'trivia-mines'
  | 'quiz-board';

export interface PartnerGameConfig {
  gameId: PartnerGameId;
  enabled: boolean;
  order: number;
  defaultLimit: number;
  ready: boolean;
}

export interface PartnerGamesConfig {
  version: number;
  games: PartnerGameConfig[];
}

export interface CalendarOverride {
  date: string;
  gameId: PartnerGameId;
  limit: number;
}

export interface CalendarResponse {
  version: number;
  overrides: CalendarOverride[];
}

export interface CalendarChange {
  date: string;
  gameId: PartnerGameId;
  limit: number | null;
}

export interface CalendarUpdate {
  version: number;
  changes: CalendarChange[];
}

export interface RankedPointsPair {
  winner: number;
  loser: number;
}

export interface RankedPointsTable {
  /** Win by 1, 2, 3, 4, 5, then 6 or more goals. */
  margins: RankedPointsPair[];
  penaltyWin: RankedPointsPair;
  drawAfterPenalties: number;
  leftNotAhead: number;
}

export interface RankedPointsConfig {
  version: number;
  points: RankedPointsTable;
  /** The most one ranked play can score under this table. */
  maxScore: number;
}

export interface RankedPointsUpdate {
  version: number;
  points: RankedPointsTable;
}

export type DeliveryStatus = 'pending' | 'sent' | 'dead';

export interface DeliveryItem {
  eventId: string;
  playerId: string;
  gameId: PartnerGameId;
  score: number;
  occurredAt: string;
  status: DeliveryStatus;
  attempts: number;
  lastAttemptAt: string | null;
  lastHttpStatus: number | null;
  lastError: string | null;
}

export interface DeliveriesResponse {
  items: DeliveryItem[];
  nextCursor: string | null;
}

export interface DeliveriesQuery {
  status?: DeliveryStatus;
  gameId?: PartnerGameId;
  playerId?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

export interface DeliveryAttempt {
  attempt: number;
  attemptedAt: string;
  latencyMs: number | null;
  httpStatus: number | null;
  error: string | null;
}

export interface DeliveryAttemptsResponse {
  items: DeliveryAttempt[];
}

export interface PartnerPlayerView {
  playerId: string;
  displayName: string;
  status: 'active' | 'blocked';
  firstSeenAt: string;
  lastSeenAt: string | null;
  today: Array<{ gameId: PartnerGameId; playsUsed: number; playsLimit: number }>;
}

export interface PartnerDayStats {
  /** Tbilisi day, YYYY-MM-DD. */
  day: string;
  newPlayers: number;
  /** Players who started at least one play that day. */
  activePlayers: number;
  playsStarted: number;
  playsFinished: number;
  /** Points in events Freecroco accepted, by the day the play finished. */
  pointsSent: number;
}

export interface PartnerGameStats {
  gameId: PartnerGameId;
  plays: number;
  finished: number;
  averageScore: number | null;
  maxScore: number | null;
  uniquePlayers: number;
}

export interface PartnerStats {
  from: string;
  to: string;
  today: string;
  totals: {
    playersEver: number;
    newPlayers: number;
    activeToday: number;
    activeYesterday: number;
    activeLast7Days: number;
    activeInRange: number;
  };
  todayStats: PartnerDayStats;
  yesterdayStats: PartnerDayStats;
  daily: PartnerDayStats[];
  games: PartnerGameStats[];
  ranked: {
    plays: number;
    matches: number;
    vsPlayers: number;
    vsBots: number;
    settled: number;
    cancelled: number;
    returned: number;
    open: number;
  };
  delivery: {
    sent: number;
    pending: number;
    dead: number;
    pendingNow: number;
    deadNow: number;
    oldestPendingSeconds: number | null;
  };
}

export type StaffRole = 'viewer' | 'editor';

export interface PartnerStaffMember {
  userId: string;
  email: string | null;
  role: StaffRole;
  addedAt: string;
  addedBy: { userId: string; email: string | null } | null;
  lastSignInAt: string | null;
}

export interface PartnerStaffList {
  items: PartnerStaffMember[];
}

export interface StaffAddRequest {
  email: string;
  role: StaffRole;
}

export interface StaffAddResult {
  member: PartnerStaffMember;
  /** existing: a Quizball account became staff; invited: a new account was invited. */
  account: 'existing' | 'invited';
  /** False when the email already had a sign-in, so no invite email went out. */
  inviteSent: boolean;
}
