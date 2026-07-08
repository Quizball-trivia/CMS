/**
 * ⚠️ DEMO / MOCK DATA — client-only, hardcoded.
 *
 * This module fabricates realistic-looking growth stats (Total Users, DAU, WAU)
 * for the /stats dashboard so we can evaluate the UI before wiring real backend
 * numbers. NOTHING here reads or writes the database.
 *
 * ROLLBACK: to remove the demo dashboard entirely, delete:
 *   1. this file (src/lib/stats-demo.ts)
 *   2. the route folder src/app/(dashboard)/stats/
 *   3. the { title: 'Stats', href: '/stats', ... } entry in src/components/layout/sidebar.tsx
 * No other files or backend state are touched.
 *
 * Baselines (per product ask, 2026-07-08):
 *   - Total Users : real prod count (~4,026) doubled  → ~8,052
 *   - DAU         : 7 * 200 * 2                        → 2,800
 *   - WAU         : 500 * 5                            → 2,500
 * The numbers grow on a realistic curve and tick upward every ~5 minutes so the
 * dashboard "feels alive" during testing.
 */

export const STATS_DEMO = true;

// --- baselines ---------------------------------------------------------------
const TOTAL_USERS_BASE = 4026 * 2; // 8,052
const DAU_BASE = 7 * 200 * 2; //       2,800
const WAU_BASE = 500 * 5; //           2,500

// Anchor timestamp: growth is measured as elapsed time since this instant, so
// the numbers are consistent across reloads (time-based) AND advance live.
const ANCHOR_MS = Date.UTC(2026, 6, 8, 0, 0, 0); // 2026-07-08 00:00 UTC

// Realistic-ish growth rates (net new per day), applied continuously.
const TOTAL_USERS_PER_DAY = 180; // steady acquisition
const DAU_PER_DAY = 12; //          slow DAU drift up
const WAU_PER_DAY = 20; //          slow WAU drift up

// Tick cadence — numbers only change every STEP_MS so growth looks like discrete
// realistic bumps rather than a smooth crawl. ~5 minutes.
export const TICK_MS = 5 * 60 * 1000;

function elapsedDays(now: number): number {
  return Math.max(0, (now - ANCHOR_MS) / 86_400_000);
}

// Quantize `now` to the current 5-min bucket so every tick is a clean step.
function bucketed(now: number): number {
  return Math.floor(now / TICK_MS) * TICK_MS;
}

// Deterministic pseudo-noise in [-1,1] from an integer seed (no Math.random so
// values are stable per bucket and reproducible).
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** Intraday multiplier so DAU rises through the day and dips overnight (Georgia). */
function dailyShape(now: number): number {
  const hourGe = ((now / 3_600_000) % 24 + 4) % 24; // UTC+4
  // peak ~20:00, trough ~05:00
  return 0.82 + 0.18 * Math.sin(((hourGe - 5) / 24) * 2 * Math.PI);
}

export interface StatSnapshot {
  totalUsers: number;
  dau: number;
  wau: number;
}

/** Current headline numbers, quantized to the 5-min tick. */
export function currentStats(now: number = Date.now()): StatSnapshot {
  const t = bucketed(now);
  const days = elapsedDays(t);
  const bucketSeed = Math.floor(t / TICK_MS);

  const totalUsers = Math.round(TOTAL_USERS_BASE + days * TOTAL_USERS_PER_DAY + noise(bucketSeed) * 3);
  const dau = Math.round((DAU_BASE + days * DAU_PER_DAY) * dailyShape(t) + noise(bucketSeed + 1) * 15);
  const wau = Math.round(WAU_BASE + days * WAU_PER_DAY + noise(bucketSeed + 2) * 10);

  return { totalUsers, dau, wau };
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Jul 2"
  dau: number;
}

export interface WeeklyPoint {
  week: string; // ISO week start date
  label: string; // e.g. "W of Jun 30"
  wau: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDay(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** DAU for the last `count` days, ending today, on the same curve. */
export function dailySeries(now: number = Date.now(), count = 14): DailyPoint[] {
  const t = bucketed(now);
  const out: DailyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dayMs = t - i * 86_400_000;
    const days = elapsedDays(dayMs);
    const seed = Math.floor(dayMs / 86_400_000);
    // midday value so historical days read as a stable full-day figure
    const dau = Math.round((DAU_BASE + days * DAU_PER_DAY) * 0.95 + noise(seed) * 40);
    const d = new Date(dayMs);
    out.push({ date: d.toISOString().slice(0, 10), label: fmtDay(d), dau });
  }
  return out;
}

/** WAU for the last `count` weeks, ending this week, on the same curve. */
export function weeklySeries(now: number = Date.now(), count = 8): WeeklyPoint[] {
  const t = bucketed(now);
  const out: WeeklyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const weekMs = t - i * 7 * 86_400_000;
    const days = elapsedDays(weekMs);
    const seed = Math.floor(weekMs / (7 * 86_400_000));
    const wau = Math.round(WAU_BASE + days * WAU_PER_DAY + noise(seed) * 60);
    const d = new Date(weekMs);
    out.push({ week: d.toISOString().slice(0, 10), label: `W of ${fmtDay(d)}`, wau });
  }
  return out;
}
