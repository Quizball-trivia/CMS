// Types for what is left of the old HQ: the product analytics, and the departments the sidebar groups the CMS by.

/** The departments of the company; the sidebar has one group per department. */
export type HqDepartmentKey = 'content' | 'games' | 'competitions' | 'marketing' | 'partners' | 'investors';

export interface HqAnalytics {
  generatedAt: string;
  days: number;
  series: Array<{ date: string; newUsers: number; activePlayers: number; matches: number }>;
  actives: { dau: number; wau: number; mau: number };
  totals: { registeredUsers: number };
  modes: Array<{ mode: string; matches: number; share: number }>;
  /** Top modes + 'other' per day: `{ date, [mode]: count }`. */
  modesByDay: Array<{ date: string } & Record<string, number | string>>;
  modeLabels: Record<string, string>;
  /** Top 30 by players. */
  countries: Array<{ country: string; players: number; registered: number }>;
  /** Players / registered users across ALL countries (before the top-30 cut), for true shares. */
  countriesTotalPlayers: number;
  countriesTotalRegistered: number;
  /** Shares 0–1; null while the window hasn't elapsed. */
  retention: Array<{ cohortStart: string; size: number; d1: number | null; d7: number | null; d30: number | null }>;
}

export type HqPosthog =
  | { connected: false }
  | {
      connected: true;
      visitorsByDay: Array<{ date: string; visitors: number; pageviews: number }>;
      topCountries: Array<{ country: string; visitors: number }>;
      topReferrers: Array<{ source: string; visitors: number }>;
      topPages: Array<{ path: string; views: number }>;
      funnel: { visitors: number; signups: number; firstMatch: number };
      error?: undefined;
    }
  /** Configured, but PostHog failed this time. */
  | { connected: true; error: string };
