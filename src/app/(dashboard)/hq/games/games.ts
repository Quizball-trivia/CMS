// Plain-language helpers for the Games hub: what each number means for the
// person looking after the games, and which games deserve a look first.

import type { HarnessCounted, HarnessGame, HarnessGameGroup } from '@/types';

export const GROUPS: Array<{ key: HarnessGameGroup; title: string; description: string }> = [
  { key: 'match', title: 'The match', description: 'Head-to-head games with matchmaking.' },
  { key: 'daily', title: 'Daily games', description: 'One new board a day. Most can also be played with friends in a room.' },
  { key: 'party', title: 'With friends', description: 'Games that only exist in a room or as a duel.' },
  { key: 'solo', title: 'Solo coin games', description: 'Short games played alone for coins.' },
  { key: 'live', title: 'Live', description: 'Hosted events at a set time.' },
  { key: 'partner', title: 'Partners', description: 'Games built for a partner’s own site.' },
];

/** The site that serves the previews (the staging site only). */
export const PREVIEW_SITE = (process.env.NEXT_PUBLIC_GAME_PREVIEW_URL || 'https://staging.quizball.io').replace(/\/+$/, '');

/** The page to show in the frame for a game's preview. */
export function previewUrl(game: Pick<HarnessGame, 'preview'>): string | null {
  const p = game.preview;
  if (!p) return null;
  if (p.kind === 'playground') return `${PREVIEW_SITE}/dev/games?game=${encodeURIComponent(p.game)}&locale=en`;
  return p.slug ? `${PREVIEW_SITE}/demos/${encodeURIComponent(p.slug)}` : `${PREVIEW_SITE}/demos`;
}

/** How the last 7 days compare with the 7 before: "+12%", "−36%", "new", or null when there is nothing to compare. */
export function change(c: HarnessCounted | null): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (!c || (c.now === 0 && c.before === 0)) return null;
  if (c.before === 0) return { text: 'new', tone: 'up' };
  const pct = Math.round(((c.now - c.before) / c.before) * 100);
  if (pct === 0) return { text: 'no change', tone: 'flat' };
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, tone: pct > 0 ? 'up' : 'down' };
}

/** Of the players who started a daily in the last 7 days, the share who finished it (0-100), or null. */
export function finishRate(game: Pick<HarnessGame, 'stats'>): number | null {
  const { started, finished } = game.stats;
  if (!started || !finished || started.now === 0) return null;
  return Math.round((finished.now / started.now) * 100);
}

/** The one number a game is sized by: daily starts if it has a daily, otherwise what was played. */
export function size(game: Pick<HarnessGame, 'stats'>): number {
  return (game.stats.started?.now ?? 0) + (game.stats.played?.now ?? 0);
}

/** Enough plays for a percentage to mean something. */
const ENOUGH = 200;
const LOW_FINISH = 40;
const BIG_DROP = -30;

export interface Flag {
  game: HarnessGame;
  reason: string;
}

/**
 * Games worth a look first, worst first: most players who start do not finish, or plays fell by a third in a week.
 * Only games that are on and have enough plays for the number to mean something.
 */
export function worthALook(games: HarnessGame[]): Flag[] {
  const out: Array<Flag & { weight: number }> = [];
  for (const g of games) {
    if (g.state !== 'on' && g.state !== 'beta') continue;
    const rate = finishRate(g);
    if (rate !== null && rate < LOW_FINISH && (g.stats.started?.now ?? 0) >= ENOUGH) {
      out.push({ game: g, reason: `Only ${rate}% of the players who start a day finish it.`, weight: 100 - rate });
      continue;
    }
    const main = g.stats.started ?? g.stats.played;
    if (main && main.before >= ENOUGH) {
      const pct = Math.round(((main.now - main.before) / main.before) * 100);
      if (pct <= BIG_DROP) out.push({ game: g, reason: `Plays fell ${Math.abs(pct)}% in a week (${main.before.toLocaleString()} to ${main.now.toLocaleString()}).`, weight: Math.abs(pct) });
    }
  }
  return out.sort((a, b) => b.weight - a.weight).map(({ game, reason }) => ({ game, reason }));
}
