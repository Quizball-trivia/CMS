import type { PartnerGameConfig, PartnerGameId, PartnerGamesConfig } from '@/types/freecroco';

export const PARTNER_GAME_IDS: readonly PartnerGameId[] = [
  'ranked',
  'guess-the-goal',
  'true-false',
  'countdown',
  'pick-em',
  'career-path',
  'higher-lower',
  'card-detective',
  'road-to-goal',
  'trivia-mines',
  'quiz-board',
];

export const GAME_LABELS: Record<PartnerGameId, string> = {
  ranked: 'Ranked',
  'guess-the-goal': 'Guess the Goal',
  'true-false': 'True / False',
  countdown: 'Countdown',
  'pick-em': "Pick 'em",
  'career-path': 'Career Path',
  'higher-lower': 'Higher / Lower',
  'card-detective': 'Card Detective',
  'road-to-goal': 'Road to Goal',
  'trivia-mines': 'Trivia Mines',
  'quiz-board': 'Quiz Board',
};

export const MAX_DEFAULT_LIMIT = 10;
export const MAX_RANKED_LIMIT = 30;

export function maxLimitFor(gameId: PartnerGameId): number {
  return gameId === 'ranked' ? MAX_RANKED_LIMIT : MAX_DEFAULT_LIMIT;
}

export function isValidLimit(gameId: PartnerGameId, value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maxLimitFor(gameId);
}

export interface GameRowErrors {
  order?: string;
  defaultLimit?: string;
}

export interface GamesValidation {
  valid: boolean;
  rows: Partial<Record<PartnerGameId, GameRowErrors>>;
}

/** Order must be a unique 1..n; limits are whole numbers within the game's bound. */
export function validateGames(games: readonly PartnerGameConfig[]): GamesValidation {
  const rows: GamesValidation['rows'] = {};
  const count = games.length;
  const seen = new Map<number, PartnerGameId>();

  for (const game of games) {
    const errors: GameRowErrors = {};
    if (!Number.isInteger(game.order) || game.order < 1 || game.order > count) {
      errors.order = `Order must be a whole number from 1 to ${count}`;
    } else if (seen.has(game.order)) {
      errors.order = 'Order must be unique';
      rows[seen.get(game.order)!] = { ...rows[seen.get(game.order)!], order: 'Order must be unique' };
    } else {
      seen.set(game.order, game.gameId);
    }
    if (!isValidLimit(game.gameId, game.defaultLimit)) {
      errors.defaultLimit = `Plays per day must be a whole number from 0 to ${maxLimitFor(game.gameId)}`;
    }
    if (errors.order || errors.defaultLimit) rows[game.gameId] = { ...rows[game.gameId], ...errors };
  }

  return { valid: Object.keys(rows).length === 0, rows };
}

export function sortByOrder(games: readonly PartnerGameConfig[]): PartnerGameConfig[] {
  return [...games].sort((a, b) => a.order - b.order);
}

/** Sorts by order and renumbers 1..n, so the saved order is always gap-free. */
export function normalizeOrder(games: readonly PartnerGameConfig[]): PartnerGameConfig[] {
  return sortByOrder(games).map((game, index) => ({ ...game, order: index + 1 }));
}

export function moveGame(games: readonly PartnerGameConfig[], gameId: PartnerGameId, direction: -1 | 1): PartnerGameConfig[] {
  const sorted = normalizeOrder(games);
  const from = sorted.findIndex((game) => game.gameId === gameId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= sorted.length) return sorted;
  [sorted[from], sorted[to]] = [sorted[to], sorted[from]];
  // Renumber by position; sorting by the old order numbers again would undo the swap.
  return sorted.map((game, index) => ({ ...game, order: index + 1 }));
}

export function updateGame(
  games: readonly PartnerGameConfig[],
  gameId: PartnerGameId,
  patch: Partial<Pick<PartnerGameConfig, 'enabled' | 'defaultLimit'>>,
): PartnerGameConfig[] {
  return games.map((game) => (game.gameId === gameId ? { ...game, ...patch } : game));
}

/** `ready` is set by Quizball ops and never changes from this screen. */
export function isGamesDirty(saved: readonly PartnerGameConfig[], draft: readonly PartnerGameConfig[]): boolean {
  const a = normalizeOrder(saved);
  const b = normalizeOrder(draft);
  return (
    a.length !== b.length ||
    a.some((game, i) => {
      const other = b[i];
      return game.gameId !== other.gameId || game.enabled !== other.enabled || game.defaultLimit !== other.defaultLimit;
    })
  );
}

/** The PUT body: the whole config with the version that was loaded. */
export function buildGamesPayload(version: number, draft: readonly PartnerGameConfig[]): PartnerGamesConfig {
  return { version, games: normalizeOrder(draft) };
}
