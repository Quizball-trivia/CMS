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
 * August snapshot targets (2026-08-12):
 *   - Total Users : ~11,500
 *   - DAU         : ~2,945
 *   - WAU         : ~4,207
 *     (WAU must always be ≥ DAU — everyone active in the last 24h was active in 7d.)
 * User counts are cumulative, but they are intentionally flat between registrations.
 * Activity has weekday/weekend seasonality, multi-day waves, and a slower August curve
 * so the dashboard reads like a small live product rather than a counter animation.
 */

export const STATS_DEMO = true;

// --- baselines ---------------------------------------------------------------
// The baseline plus cumulative registrations is calibrated to the August
// snapshot. Keep these values together so the Stats and Users views agree.
const TOTAL_USERS_BASE = 7739;
const DAU_BASE = 3539;
const WAU_BASE = 4985;

// Launch date — the product went live ~June 9, 2026. Before this, there are
// effectively no users; after it, a realistic launch ramp climbs toward the
// baseline targets. History before launch reads as ~0 (not a flat line).
const LAUNCH_MS = Date.UTC(2026, 5, 9, 0, 0, 0); // 2026-06-09 00:00 UTC

// Growth starts after the launch ramp has matured. The daily rate is varied below
// instead of adding a fixed amount on every tick.
const GROWTH_START_DAYS = 25;
// A deliberately modest registration pace keeps the cumulative line from
// jumping too sharply once the launch ramp has matured.
const TOTAL_USERS_PER_DAY = 150;
const DAU_PER_DAY = 1.5;
const WAU_PER_DAY = 2;

// Ramp shape: fraction of the baseline reached `d` days after launch. An S-curve
// that starts at 0 on launch day, climbs steeply through the first ~3 weeks, and
// approaches 1.0 by ~day 25. `RAMP_MID` = day of steepest growth, `RAMP_K` = slope.
const RAMP_MID = 12;
const RAMP_K = 0.28;
function rampFraction(daysSinceLaunch: number): number {
  if (daysSinceLaunch <= 0) return 0;
  // logistic normalized so f(0) ≈ 0 and it saturates near 1
  const raw = 1 / (1 + Math.exp(-RAMP_K * (daysSinceLaunch - RAMP_MID)));
  const atZero = 1 / (1 + Math.exp(-RAMP_K * (0 - RAMP_MID)));
  return Math.max(0, (raw - atZero) / (1 - atZero));
}

// Tick cadence — activity refreshes every five minutes, while total users move
// in daily registration steps so the headline does not climb on every refresh.
export const TICK_MS = 5 * 60 * 1000;

/** Days since launch (0 before launch). */
function daysSinceLaunch(now: number): number {
  return (now - LAUNCH_MS) / 86_400_000;
}

// Big activity spike around the June 19 event — a Gaussian bump on top of the
// ramp (biggest single peak in the series). `SPIKE_PEAK` = multiplier at center.
const SPIKE_MS = Date.UTC(2026, 5, 19, 0, 0, 0); // 2026-06-19
const SPIKE_WIDTH_DAYS = 2.2; // std-dev of the bump
const SPIKE_PEAK = 0.5; // +50% at the peak
function spikeBoost(now: number): number {
  const dd = (now - SPIKE_MS) / 86_400_000;
  return SPIKE_PEAK * Math.exp(-(dd * dd) / (2 * SPIKE_WIDTH_DAYS * SPIKE_WIDTH_DAYS));
}

/**
 * Seasonal acquisition multiplier. August is deliberately quieter because of
 * summer travel, while keeping enough new registrations for the total to rise.
 */
function acquisitionSeasonality(dayMs: number): number {
  const month = new Date(dayMs).getUTCMonth();
  if (month === 7) return 0.2; // August: near-plateau during the summer
  if (month === 6) return 0.92; // July: softer than the launch month
  if (month === 8) return 0.7; // early September recovery
  return 1;
}

/** New registrations for a calendar day. The value is deterministic but not flat. */
function registrationsForDay(dayMs: number): number {
  const dayIndex = Math.floor(daysSinceLaunch(dayMs));
  const weekday = new Date(dayMs).getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 0.9 : 1.04;
  const mediumWave = 1 + 0.2 * Math.sin((dayIndex - 3) / 8.5);
  const shortWave = 1 + 0.1 * Math.sin(dayIndex / 3.4 + 1.2);
  const dayNoise = noise(dayIndex + 700) * 0.08;
  const rate =
    TOTAL_USERS_PER_DAY *
    acquisitionSeasonality(dayMs) *
    weekendFactor *
    mediumWave *
    shortWave *
    (1 + dayNoise);

  return Math.max(0, rate);
}

/**
 * Cumulative registrations since the ramp matured. This is the key distinction
 * from the old fixed drift: it stays flat during the day, then moves in uneven
 * but monotonic daily steps as the next day's registrations are recorded.
 */
function cumulativeRegistrations(now: number): number {
  const days = daysSinceLaunch(now);
  if (days <= GROWTH_START_DAYS) return 0;

  const firstDay = Math.floor(GROWTH_START_DAYS);
  const lastDay = Math.floor(days);
  let total = 0;

  for (let dayIndex = firstDay; dayIndex < lastDay; dayIndex += 1) {
    const dayMs = LAUNCH_MS + dayIndex * 86_400_000;
    total += registrationsForDay(dayMs);
  }

  return total;
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

/** Small intraday adjustment; DAU is a rolling 24h metric, not a live visitor count. */
function dailyShape(now: number): number {
  const hourGe = ((now / 3_600_000) % 24 + 4) % 24; // UTC+4
  // peak ~20:00, trough ~05:00; keep the effect modest for a 24h metric
  return 0.96 + 0.04 * Math.sin(((hourGe - 5) / 24) * 2 * Math.PI);
}

/** Multi-day activity waves create believable dips and recoveries in the chart. */
function activityWave(dayMs: number): number {
  const dayIndex = Math.floor(daysSinceLaunch(dayMs));
  const longWave = 1 + 0.1 * Math.sin((dayIndex - 1) / 7.5);
  const shortWave = 1 + 0.06 * Math.sin(dayIndex / 2.8 + 0.8);
  const dayNoise = noise(dayIndex + 1700) * 0.025;
  return longWave * shortWave * (1 + dayNoise);
}

function activitySeasonality(dayMs: number): number {
  const date = new Date(dayMs);
  const month = date.getUTCMonth();
  const weekday = date.getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 1.08 : 0.98;
  const summerFactor = month === 7 ? 0.84 : month === 6 ? 1.01 : 1;
  return weekendFactor * summerFactor;
}

function activeTrend(now: number, perDay: number): number {
  return Math.max(0, daysSinceLaunch(now) - GROWTH_START_DAYS) * perDay;
}

export interface StatSnapshot {
  totalUsers: number;
  dau: number;
  wau: number;
}

/** Current headline numbers, quantized to the 5-min tick. */
export function currentStats(now: number = Date.now()): StatSnapshot {
  const t = bucketed(now);
  const ramp = rampFraction(daysSinceLaunch(t));
  const spike = spikeBoost(t);
  const registrations = cumulativeRegistrations(t);
  const bucketSeed = Math.floor(t / TICK_MS);

  // Total users is cumulative: activity spikes never create permanent signups.
  const totalUsers = Math.round(TOTAL_USERS_BASE * ramp + registrations);
  const activityDay = Math.floor(t / 86_400_000) * 86_400_000;
  const activityFactor = activitySeasonality(activityDay) * activityWave(activityDay);
  const dau = Math.round(
    ((DAU_BASE + activeTrend(t, DAU_PER_DAY)) * ramp) *
      activityFactor *
      (1 + spike) *
      dailyShape(t) +
      noise(bucketSeed + 1) * 12
  );
  const wau = Math.round(
    (WAU_BASE + activeTrend(t, WAU_PER_DAY)) *
      ramp *
      (activitySeasonality(activityDay) * 0.96 + activityWave(activityDay) * 0.04) *
      (1 + spike * 0.6) +
      noise(bucketSeed + 2) * 8
  );

  const dauClamped = Math.max(0, dau);
  return {
    totalUsers: Math.max(0, totalUsers),
    dau: dauClamped,
    // WAU ≥ DAU by definition: anyone active in the last 24h is active in the last 7d
    wau: Math.max(dauClamped, wau),
  };
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

/** DAU for the last `count` days, ending today. ~0 before launch, ramps up,
 *  with the biggest peak around the Jun 19 event. */
export function dailySeries(now: number = Date.now(), count = 14): DailyPoint[] {
  const t = bucketed(now);
  const out: DailyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dayMs = t - i * 86_400_000;
    const ramp = rampFraction(daysSinceLaunch(dayMs));
    const spike = spikeBoost(dayMs);
    const seed = Math.floor(dayMs / 86_400_000);
    const activityFactor = activitySeasonality(dayMs) * activityWave(dayMs);
    const dau = Math.round(
      Math.max(
        0,
        ((DAU_BASE + activeTrend(dayMs, DAU_PER_DAY)) * ramp) *
          activityFactor *
          (1 + spike) +
          noise(seed + 1) * 32
      )
    );
    const d = new Date(dayMs);
    out.push({ date: d.toISOString().slice(0, 10), label: fmtDay(d), dau });
  }
  return out;
}

/** WAU for the last `count` weeks, ending this week. ~0 before launch, ramps up,
 *  peaking on the week containing the Jun 19 event. */
export function weeklySeries(now: number = Date.now(), count = 8): WeeklyPoint[] {
  const t = bucketed(now);
  const out: WeeklyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const weekMs = t - i * 7 * 86_400_000;
    // sample the spike at the week's midpoint so the Jun 19 week reads highest
    const midWeekMs = weekMs + 3.5 * 86_400_000;
    const ramp = rampFraction(daysSinceLaunch(midWeekMs));
    const spike = spikeBoost(midWeekMs);
    const seed = Math.floor(weekMs / (7 * 86_400_000));
    const activityFactor = activitySeasonality(midWeekMs) * activityWave(midWeekMs);
    const wau = Math.round(
      Math.max(
        0,
        (WAU_BASE + activeTrend(midWeekMs, WAU_PER_DAY)) *
          ramp *
          activityFactor *
          (1 + spike * 0.6) +
          noise(seed) * 45
      )
    );
    const d = new Date(weekMs);
    out.push({ week: d.toISOString().slice(0, 10), label: `W of ${fmtDay(d)}`, wau });
  }
  return out;
}
