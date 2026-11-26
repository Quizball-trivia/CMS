// Plain-language helpers for the HQ home: one list of what needs a person
// across every department, and the product's pulse as two whole weeks compared.

import type { HarnessGames, HarnessOverview, HqAnalytics } from '@/types';
import { seatState } from './content/plain';
import { worthALook } from './games/games';

export interface NeedsYouItem {
  key: string;
  /** Which department it belongs to, shown as a small label. */
  area: 'Content' | 'Games' | 'Agents';
  text: string;
  href: string;
  action: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Everything that needs a person right now, most pressing first. Agents handle the rest by themselves. */
export function needsYou(o: HarnessOverview | undefined, games: HarnessGames | undefined, now: number = Date.now()): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  if (o) {
    const logins = o.accounts.filter((a) => seatState(a, now).kind === 'login');
    if (logins.length) {
      out.push({ key: 'logins', area: 'Agents', text: `${plural(logins.length, 'subscription needs', 'subscriptions need')} a new login (${logins.map((a) => a.label).join(', ')}). Agents cannot use ${logins.length === 1 ? 'it' : 'them'} until then.`, href: '/hq/content?tab=agents', action: 'See subscriptions' });
    }
    if (o.show?.pack?.status === 'ready') {
      out.push({ key: 'show', area: 'Content', text: `The Monday show pack for ${o.show.eventDate} is ready to read and approve.`, href: '/hq/content?tab=show', action: 'Review the pack' });
    } else if (o.show && !o.show.pack && !o.show.loaded && o.settings.paused) {
      out.push({ key: 'show-none', area: 'Content', text: `There is no pack for the Monday show on ${o.show.eventDate}, and the agents are paused.`, href: '/hq/content?tab=show', action: 'Open the show' });
    }
    const stuck = o.stages.filter((s) => s.stage === 'escalated').reduce((n, s) => n + s.count, 0);
    if (stuck > 0) out.push({ key: 'stuck', area: 'Content', text: `${plural(stuck, 'question is', 'questions are')} stuck after several tries and ${stuck === 1 ? 'needs' : 'need'} a decision.`, href: '/hq/content', action: 'Decide' });
    const short = o.runway.filter((r) => r.daysLeft < 14);
    if (short.length) {
      const names = short.slice(0, 4).map((r) => `${r.label} (${plural(r.daysLeft, 'day', 'days')})`).join(', ');
      out.push({ key: 'runway', area: 'Content', text: `${plural(short.length, 'daily game runs', 'daily games run')} out of content within two weeks: ${names}${short.length > 4 ? ' and more' : ''}.`, href: '/hq/content?tab=runway', action: 'See the runway' });
    }
  }
  if (games) {
    const flags = worthALook(games.games);
    if (flags.length) {
      const top = flags.slice(0, 3).map((f) => f.game.name).join(', ');
      out.push({ key: 'games', area: 'Games', text: `${plural(flags.length, 'game is', 'games are')} worth a look: ${top}${flags.length > 3 ? ' and more' : ''}.`, href: '/hq/games', action: 'Open Games' });
    }
  }
  return out;
}

export interface Pulse {
  /** The last 7 whole days against the 7 before (today is left out: it is not over). */
  newPlayers: { now: number; before: number };
  games: { now: number; before: number };
  from: string;
  to: string;
}

/** Two whole weeks from the daily series (oldest first, ending today), or null when there are too few days. */
export function pulse(a: Pick<HqAnalytics, 'series'> | undefined): Pulse | null {
  const days = a?.series ?? [];
  if (days.length < 15) return null;
  const recent = days.slice(-8, -1);
  const before = days.slice(-15, -8);
  const sum = (rows: typeof days, pick: (d: (typeof days)[number]) => number) => rows.reduce((n, d) => n + pick(d), 0);
  return {
    newPlayers: { now: sum(recent, (d) => d.newUsers), before: sum(before, (d) => d.newUsers) },
    games: { now: sum(recent, (d) => d.matches), before: sum(before, (d) => d.matches) },
    from: recent[0]!.date,
    to: recent[recent.length - 1]!.date,
  };
}
