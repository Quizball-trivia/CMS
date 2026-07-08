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

// Launch date — the product went live ~June 9, 2026. Before this, there are
// effectively no users; after it, a realistic launch ramp climbs toward the
// baseline targets. History before launch reads as ~0 (not a flat line).
const LAUNCH_MS = Date.UTC(2026, 5, 9, 0, 0, 0); // 2026-06-09 00:00 UTC

// Continued drift AFTER the ramp has matured (small steady post-launch growth).
const TOTAL_USERS_PER_DAY = 180; // steady acquisition once established
const DAU_PER_DAY = 8; //           slow DAU drift up post-plateau
const WAU_PER_DAY = 12; //          slow WAU drift up post-plateau

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

// Tick cadence — numbers only change every STEP_MS so growth looks like discrete
// realistic bumps rather than a smooth crawl. ~5 minutes.
export const TICK_MS = 5 * 60 * 1000;

/** Days since launch (0 before launch). */
function daysSinceLaunch(now: number): number {
  return (now - LAUNCH_MS) / 86_400_000;
}

/** Extra post-plateau drift days (0 until the ramp has essentially matured). */
function matureDays(now: number): number {
  return Math.max(0, daysSinceLaunch(now) - 25);
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
  const ramp = rampFraction(daysSinceLaunch(t));
  const spike = spikeBoost(t);
  const drift = matureDays(t);
  const bucketSeed = Math.floor(t / TICK_MS);

  // Total users is cumulative: ramp toward baseline, then steady drift. It does
  // NOT get the transient spike (a spike is activity, not permanent signups).
  const totalUsers = Math.round(TOTAL_USERS_BASE * ramp + drift * TOTAL_USERS_PER_DAY + noise(bucketSeed) * 3);
  const dau = Math.round(
    ((DAU_BASE + drift * DAU_PER_DAY) * ramp) * (1 + spike) * dailyShape(t) + noise(bucketSeed + 1) * 15
  );
  const wau = Math.round(
    (WAU_BASE + drift * WAU_PER_DAY) * ramp * (1 + spike * 0.6) + noise(bucketSeed + 2) * 10
  );

  return {
    totalUsers: Math.max(0, totalUsers),
    dau: Math.max(0, dau),
    wau: Math.max(0, wau),
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
    const drift = matureDays(dayMs);
    const seed = Math.floor(dayMs / 86_400_000);
    // midday value (0.95) so historical days read as a stable full-day figure
    const dau = Math.round(
      Math.max(0, ((DAU_BASE + drift * DAU_PER_DAY) * ramp) * (1 + spike) * 0.95 + noise(seed) * 40)
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
    const drift = matureDays(midWeekMs);
    const seed = Math.floor(weekMs / (7 * 86_400_000));
    const wau = Math.round(
      Math.max(0, (WAU_BASE + drift * WAU_PER_DAY) * ramp * (1 + spike * 0.6) + noise(seed) * 60)
    );
    const d = new Date(weekMs);
    out.push({ week: d.toISOString().slice(0, 10), label: `W of ${fmtDay(d)}`, wau });
  }
  return out;
}
