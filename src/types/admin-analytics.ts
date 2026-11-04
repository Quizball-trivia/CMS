export interface DayCount {
  day: string;
  count: number;
}

export interface GamesPerDayEntry {
  day: string;
  mode: string;
  games: number;
}

export interface CountryBreakdown {
  country: string;
  registered: number;
  guests: number;
  total: number;
}

/** GET /admin/stats/analytics-overview — real numbers from the production DB. */
export interface AnalyticsOverview {
  totals: {
    registered: number;
    playingGuests: number;
    totalUsers: number;
    guestConversionPct30d: number;
  };
  actives: { dau: number; wau: number; mau: number };
  dauSeries: DayCount[];
  signupsPerDay: DayCount[];
  gamesPerDay: GamesPerDayEntry[];
  countries: CountryBreakdown[];
  generatedAt: string;
  timezone: 'Asia/Tbilisi';
}
