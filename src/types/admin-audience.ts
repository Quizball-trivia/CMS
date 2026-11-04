export type AudiencePeriod = 'today' | 'yesterday' | '7d' | '30d';

export interface DayRange {
  from: string;
  to: string;
}

export interface KeyedCount {
  key: string;
  people: number;
}

export type AudienceSources =
  | { connected: false }
  | { connected: true; error: string }
  | { connected: true; newVisitors: number; referrers: KeyedCount[]; landingPages: KeyedCount[]; utmSources: KeyedCount[] };

/** GET /admin/stats/audience — each person once, Asia/Tbilisi days, from the production DB (+ PostHog sources). */
export interface Audience {
  period: AudiencePeriod;
  range: DayRange;
  partial: boolean;
  summary: {
    active: number;
    registered: number;
    guests: number;
    plays: number;
    /** null until every day since coverage.start is final (first-time players can't be told apart before). */
    newPlayers: number | null;
    newGuests: number | null;
    returning: number | null;
    newRegistered: number;
    newRegisteredPlayed: number;
    signupPlatforms: { web: number; android: number; ios: number };
  };
  previous: { range: DayRange; active: number; registered: number; guests: number; newGuests: number | null; newRegistered: number } | null;
  countries: { country: string; active: number; registered: number; guests: number; newRegistered: number }[];
  games: { mode: string; players: number; registered: number; guests: number; plays: number }[];
  trend: { day: string; active: number; registered: number; guests: number; counted: boolean }[];
  sources: AudienceSources;
  coverage: { start: string; firstCompleteDay: string | null; incompleteDays: number; historyComplete: boolean; refreshedAt: string | null };
  generatedAt: string;
  timezone: 'Asia/Tbilisi';
}
