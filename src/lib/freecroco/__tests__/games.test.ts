import { describe, expect, it } from 'vitest';
import type { PartnerGameConfig } from '@/types/freecroco';
import {
  buildGamesPayload,
  isGamesDirty,
  moveGame,
  normalizeOrder,
  PARTNER_GAME_IDS,
  updateGame,
  validateGames,
} from '../games';

const seed = (): PartnerGameConfig[] =>
  PARTNER_GAME_IDS.map((gameId, i) => ({
    gameId,
    enabled: true,
    order: i + 1,
    defaultLimit: gameId === 'ranked' ? 10 : 1,
    ready: false,
  }));

describe('games validation', () => {
  it('accepts the seeded configuration', () => {
    expect(validateGames(seed())).toEqual({ valid: true, rows: {} });
  });

  it.each([
    ['countdown', 11, false],
    ['countdown', 10, true],
    ['countdown', 0, true],
    ['countdown', -1, false],
    ['countdown', 1.5, false],
    ['countdown', NaN, false],
    ['ranked', 30, true],
    ['ranked', 31, false],
  ] as const)('checks the plays-per-day bound for %s = %s', (gameId, value, ok) => {
    const games = updateGame(seed(), gameId, { defaultLimit: value });
    const result = validateGames(games);
    expect(result.valid).toBe(ok);
    expect(Boolean(result.rows[gameId]?.defaultLimit)).toBe(!ok);
  });

  it('rejects a duplicate order on both rows', () => {
    const games = seed().map((g) => (g.gameId === 'countdown' ? { ...g, order: 1 } : g));
    const result = validateGames(games);
    expect(result.valid).toBe(false);
    expect(result.rows.ranked?.order).toBe('Order must be unique');
    expect(result.rows.countdown?.order).toBe('Order must be unique');
  });

  it('rejects an order outside 1..n', () => {
    const games = seed().map((g) => (g.gameId === 'quiz-board' ? { ...g, order: 12 } : g));
    expect(validateGames(games).rows['quiz-board']?.order).toMatch(/1 to 11/);
  });
});

describe('games editing', () => {
  it('moves a game up and down and keeps order gap-free and unique', () => {
    const moved = moveGame(seed(), 'true-false', -1);
    expect(moved.map((g) => g.gameId).slice(0, 3)).toEqual(['ranked', 'true-false', 'guess-the-goal']);
    expect(moved.map((g) => g.order)).toEqual(PARTNER_GAME_IDS.map((_, i) => i + 1));
    expect(validateGames(moved).valid).toBe(true);
    expect(moveGame(moved, 'true-false', 1).map((g) => g.gameId)).toEqual(PARTNER_GAME_IDS);
  });

  it('ignores a move past either end', () => {
    expect(moveGame(seed(), 'ranked', -1).map((g) => g.gameId)).toEqual(PARTNER_GAME_IDS);
    expect(moveGame(seed(), 'quiz-board', 1).map((g) => g.gameId)).toEqual(PARTNER_GAME_IDS);
  });

  it('renumbers an unsorted list', () => {
    const shuffled = seed().reverse().map((g, i) => ({ ...g, order: (i + 1) * 3 }));
    expect(normalizeOrder(shuffled).map((g) => g.order)).toEqual(PARTNER_GAME_IDS.map((_, i) => i + 1));
  });

  it('detects changes but not a no-op or a ready-only difference', () => {
    expect(isGamesDirty(seed(), seed())).toBe(false);
    expect(isGamesDirty(seed(), seed().map((g) => ({ ...g, ready: true })))).toBe(false);
    expect(isGamesDirty(seed(), updateGame(seed(), 'pick-em', { enabled: false }))).toBe(true);
    expect(isGamesDirty(seed(), moveGame(seed(), 'pick-em', -1))).toBe(true);
  });

  it('builds the PUT body with the loaded version and the whole config', () => {
    const payload = buildGamesPayload(7, moveGame(seed(), 'countdown', -1));
    expect(payload.version).toBe(7);
    expect(payload.games).toHaveLength(11);
    expect(payload.games[2].gameId).toBe('countdown');
  });
});
