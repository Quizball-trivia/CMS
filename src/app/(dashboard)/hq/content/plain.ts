// Plain-language helpers for the Content tab: the tab is read by the content
// team, not engineers, so stages, events and rates are put in their words.

import type { HarnessCategoryHealth, HarnessEvent, HarnessOverview } from '@/types';

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ka', label: 'Georgian' },
  { code: 'es', label: 'Spanish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'el', label: 'Greek' },
];

/** The five steps every question goes through, with how many are in each right now. */
export function flow(o: HarnessOverview): Array<{ key: string; label: string; hint: string; count: number }> {
  const n = (...stages: string[]) => o.stages.filter((s) => s.mode === 'classic' && stages.includes(s.stage)).reduce((t, s) => t + s.count, 0);
  const briefs = o.jobs.filter((j) => (j.kind === 'plan' || j.kind === 'make') && (j.status === 'queued' || j.status === 'running')).reduce((t, j) => t + j.count, 0);
  return [
    { key: 'writing', label: 'Writing', hint: briefs ? `${briefs} batches planned or being written` : 'the Planner and the Question Maker', count: n('draft') },
    { key: 'checking', label: 'Checking', hint: 'facts and quality, by a different AI', count: n('validated') },
    { key: 'translating', label: 'Translating', hint: 'into 9 languages, then checked', count: n('verified', 'localized') },
    { key: 'releasing', label: 'Releasing', hint: 'passed everything, going into the game', count: n('approved') },
    { key: 'live', label: 'Live today', hint: 'added to the game today', count: o.today.live },
  ];
}

/** Roughly how long until a category is full, at the pace of the last 7 days. */
export function fillEstimate(c: HarnessCategoryHealth): string {
  // Full means enough questions live; ones still being made don't count yet.
  const missingLive = c.needed - c.pool;
  if (missingLive <= 0) return 'Full';
  if (c.priority === 'hold') return 'On hold';
  if (c.liveLast7d <= 0) return c.inPipeline > 0 ? 'First ones on the way' : 'Not started';
  const days = Math.ceil(missingLive / (c.liveLast7d / 7));
  return days <= 1 ? 'About a day' : days > 60 ? 'Over 2 months' : `About ${days} days`;
}

const STEP: Record<string, string> = {
  'draft -> validated': 'written, passed the format checks',
  'draft -> rejected': 'dropped: a repeat or broken',
  'validated -> draft': 'sent back to the writer by a checker',
  'validated -> verified': 'passed the fact and quality checks',
  'validated -> rejected': 'rejected by a checker',
  'verified -> localized': 'translated into 9 languages',
  'localized -> verified': 'translation sent back for fixes',
  'localized -> approved': 'languages checked',
  'approved -> live': 'went live in ranked',
  'approved -> approved': 'release retried',
  'live -> retired': 'taken out of ranked',
  'escalated -> approved': 'approved by the team',
  'escalated -> rejected': 'rejected by the team',
  'escalated -> draft': 'sent back to the writer by the team',
};

/** One activity line in plain words, or null for engine noise the team doesn't need. */
/** Every stuck question, not just the ones listed. */
export function stuckCount(o: HarnessOverview): number {
  return o.stages.filter((s) => s.mode === 'classic' && s.stage === 'escalated').reduce((t, s) => t + s.count, 0);
}

export function plainEvent(e: HarnessEvent): { text: string; tone: 'neutral' | 'good' | 'attention' } | null {
  if (e.type === 'worker' || e.type === 'decision') return null;
  const about = [e.category, e.prompt ? `“${e.prompt}”` : null].filter(Boolean).join(': ');
  if (e.type === 'item_stage') {
    const to = e.message.split(' -> ')[1] ?? '';
    const what = to === 'escalated' ? 'got stuck and needs you' : (STEP[e.message] ?? e.message);
    return { text: about ? `${about} — ${what}` : `A question ${what}`, tone: to === 'live' ? 'good' : to === 'escalated' || to === 'rejected' ? 'attention' : 'neutral' };
  }
  if (e.type === 'trigger') return { text: e.message.replace('Classic health:', 'Ranked check:').replace('new briefs', 'new batches ordered'), tone: 'neutral' };
  if (e.type === 'editor' || e.type === 'request') return { text: about ? `${e.message} — ${about}` : e.message, tone: 'neutral' };
  return { text: about ? `${e.message} — ${about}` : e.message, tone: e.level === 'info' ? 'neutral' : 'attention' };
}

// ── subscriptions (seats) and why agents are quiet ─────────────────────────

/** "Mon 00:00" in Georgian time, where the team is. */
export function georgianTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tbilisi' }).format(new Date(iso)).replace(',', '');
}

const WINDOW_LABEL: Record<string, string> = { five_hour: '5-hour allowance', seven_day: 'Weekly allowance', seven_day_opus: 'Weekly Opus allowance', seven_day_sonnet: 'Weekly Sonnet allowance' };
export const windowLabel = (key: string) => WINDOW_LABEL[key] ?? key.replace(/_/g, ' ');

type Seat = HarnessOverview['accounts'][number];
export type SeatState = { kind: 'off' | 'login' | 'used-up' | 'working' | 'free'; label: string; until: string | null };

/** When a used-up seat comes back: the latest of its block and of every allowance that is spent. */
function usedUpUntil(a: Seat, now: number): string | null | undefined {
  const times: number[] = [];
  let spent = false;
  if (a.blockedUntil && Date.parse(a.blockedUntil) > now) {
    spent = true;
    times.push(Date.parse(a.blockedUntil));
  }
  for (const w of Object.values(a.windows ?? {})) {
    if (w.resets_at && Date.parse(w.resets_at) <= now) continue;
    if (w.status === 'rejected' || (typeof w.utilization === 'number' && w.utilization * 100 >= a.softPct)) {
      spent = true;
      if (w.resets_at) times.push(Date.parse(w.resets_at));
    }
  }
  if (!spent) return undefined;
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/** One subscription in plain words: off, needs a login, used up (until when), working, or free. */
export function seatState(a: Seat, now: number = Date.now()): SeatState {
  if (a.reservedForPeople || a.status !== 'active') return { kind: 'off', label: 'Not used by agents', until: null };
  // A rejected login stays a login problem until a run succeeds on the seat again, whether or not its retry pause is over.
  if (a.state === 'auth') return { kind: 'login', label: 'Needs a new login', until: null };
  const until = usedUpUntil(a, now);
  if (until !== undefined) return { kind: 'used-up', label: until ? `Used up until ${georgianTime(until)}` : 'Used up for now', until };
  const running = a.running ?? 0;
  if (running > 0) return { kind: 'working', label: `Working: ${running} of ${a.maxParallel ?? running} at once`, until: null };
  return { kind: 'free', label: 'Free', until: null };
}

export type AgentsNow = { tone: 'working' | 'paused' | 'waiting' | 'idle'; headline: string; detail: string };

/** One honest line on what the agents are doing right now, and if they are quiet, why. */
export function agentsNow(o: HarnessOverview, now: number = Date.now()): AgentsNow {
  if (o.settings.paused) return { tone: 'paused', headline: 'Agents paused', detail: 'Nothing new starts until someone switches them on.' };
  const q = o.queue;
  if (!q) return { tone: 'working', headline: 'Agents working', detail: '' };
  const active = o.accounts.filter((a) => !a.reservedForPeople && a.status === 'active');
  const seats = active.map((a) => seatState(a, now));
  const jobs = (n: number) => `${n} job${n === 1 ? '' : 's'}`;
  // Counted from the runs themselves: a seat that just ran out can still be finishing one.
  const on = active.filter((a) => (a.running ?? 0) > 0).length;
  const runningText = `${q.running} running now on ${on} subscription${on === 1 ? '' : 's'}`;
  if (q.dailyLimitReached) {
    const when = "Today's run limit is reached. New work starts again at midnight, or when the limit is raised in the Engine room.";
    return q.running > 0
      ? { tone: 'waiting', headline: 'Agents finishing for today', detail: `${runningText}; nothing new starts. ${when}` }
      : { tone: 'waiting', headline: 'Agents stopped for today', detail: when };
  }
  if (q.running > 0) return { tone: 'working', headline: 'Agents working', detail: `${runningText}${q.ready ? `, ${jobs(q.ready)} next in line` : ''}.` };
  // Jobs put off because no seat was usable count too: they are waiting for a seat, not resting.
  const pending = q.ready + q.waiting;
  const usable = seats.filter((s) => s.kind === 'working' || s.kind === 'free').length;
  if (pending > 0 && seats.length === 0) return { tone: 'waiting', headline: 'Agents cannot work', detail: `No subscription is switched on for the agents. ${jobs(pending)} waiting.` };
  if (pending > 0 && usable === 0) {
    const logins = seats.filter((s) => s.kind === 'login').length;
    if (logins === seats.length) return { tone: 'waiting', headline: 'Agents cannot work', detail: `Every subscription needs a new login on the worker. ${jobs(pending)} waiting.` };
    const back = seats.map((s) => s.until).filter((t): t is string => !!t).sort()[0];
    return {
      tone: 'waiting',
      headline: 'Agents waiting',
      detail: `Every subscription is used up${logins ? ` or needs a new login (${logins})` : ''}${back ? `. The first one is back ${georgianTime(back)}` : ''}. ${jobs(pending)} waiting.`,
    };
  }
  if (q.ready > 0) return { tone: 'working', headline: 'Agents working', detail: `${jobs(q.ready)} about to start.` };
  if (q.waiting > 0) return { tone: 'idle', headline: 'Agents resting', detail: `${jobs(q.waiting)} scheduled${q.nextAt ? `, the next ${georgianTime(q.nextAt)}` : ''}.` };
  return { tone: 'idle', headline: 'Nothing to do right now', detail: 'Every pool is being looked after; new work starts when something runs short.' };
}
