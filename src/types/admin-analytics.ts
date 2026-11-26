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
  /** totals.totalUsers, actives and the day series include Table Derby's players; these are the parts.
   *  Optional: absent from backends that predate it. tableDerby is null until its first sync. */
  breakdown?: {
    quizball: { totalUsers: number; dau: number; wau: number; mau: number };
    tableDerby: {
      day: string;
      updatedAt: string;
      totalUsers: number;
      newUsers: number;
      dau: number;
      wau: number;
      mau: number;
      matches: number;
      dauSeries: DayCount[];
      signupsPerDay: DayCount[];
    } | null;
  };
  generatedAt: string;
  timezone: 'Asia/Tbilisi';
}
