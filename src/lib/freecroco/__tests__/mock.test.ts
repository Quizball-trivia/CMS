import { describe, expect, it } from 'vitest';
import { ApiClientError } from '@/services/api-client';
import { isNotResendable, isStaleVersion } from '../errors';
import { createFreecrocoMock } from '../mock';
import { buildGamesPayload, moveGame } from '../games';

const TODAY = '2026-10-05';
const make = () => createFreecrocoMock({ today: TODAY, delayMs: 0 });

describe('freecroco mock backend', () => {
  it('serves the seeded defaults', async () => {
    const { games, version } = await make().getGames();
    expect(version).toBe(1);
    expect(games).toHaveLength(11);
    expect(games.find((g) => g.gameId === 'ranked')?.defaultLimit).toBe(10);
  });

  it('bumps the version on save and rejects the old one with stale_version', async () => {
    const mock = make();
    const loaded = await mock.getGames();
    const saved = await mock.putGames(buildGamesPayload(loaded.version, moveGame(loaded.games, 'countdown', -1)));
    expect(saved.version).toBe(loaded.version + 1);

    const error = await mock.putGames(buildGamesPayload(loaded.version, loaded.games)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(isStaleVersion(error)).toBe(true);
  });

  it('turns the next save stale after another editor saves', async () => {
    const mock = make();
    const calendar = await mock.getCalendar('2026-10-01', '2026-10-31');
    mock.simulateOtherEditor();
    const error = await mock
      .putCalendar({ version: calendar.version, changes: [{ date: '2026-10-06', gameId: 'ranked', limit: 5 }] })
      .catch((e: unknown) => e);
    expect(isStaleVersion(error)).toBe(true);
  });

  it('applies calendar changes, including removals', async () => {
    const mock = make();
    const { version } = await mock.getCalendar('2026-10-01', '2026-10-31');
    const saved = await mock.putCalendar({
      version,
      changes: [
        { date: '2026-10-06', gameId: 'ranked', limit: 0 },
        { date: '2026-10-07', gameId: 'true-false', limit: null },
      ],
    });
    expect(saved.overrides).toContainEqual({ date: '2026-10-06', gameId: 'ranked', limit: 0 });
    expect(saved.overrides.find((o) => o.date === '2026-10-07' && o.gameId === 'true-false')).toBeUndefined();
  });

  it('rejects past dates server-side too', async () => {
    const mock = make();
    const { version } = await mock.getCalendar('2026-10-01', '2026-10-31');
    await expect(
      mock.putCalendar({ version, changes: [{ date: '2026-10-04', gameId: 'ranked', limit: 1 }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('pages deliveries by cursor and filters', async () => {
    const mock = make();
    const first = await mock.listDeliveries({});
    expect(first.items).toHaveLength(10);
    expect(first.nextCursor).not.toBeNull();
    const second = await mock.listDeliveries({ cursor: first.nextCursor! });
    expect(second.items[0].eventId).not.toBe(first.items[0].eventId);
    const dead = await mock.listDeliveries({ status: 'dead' });
    expect(dead.items.every((d) => d.status === 'dead')).toBe(true);
  });

  it('resends a delivery back to pending and 404s an unknown player', async () => {
    const mock = make();
    const { items } = await mock.listDeliveries({ status: 'dead' });
    await mock.resendDelivery(items[0].eventId);
    const after = await mock.listDeliveries({ status: 'pending' });
    expect(after.items.some((d) => d.eventId === items[0].eventId)).toBe(true);
    await expect(mock.getPlayer('nobody')).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to resend anything that is not dead, with not_resendable', async () => {
    const mock = make();
    const { items } = await mock.listDeliveries({ status: 'sent' });
    const error = await mock.resendDelivery(items[0].eventId).catch((e: unknown) => e);
    expect(isNotResendable(error)).toBe(true);
    expect(isStaleVersion(error)).toBe(false);
  });

  it('returns attempts in the documented shape', async () => {
    const mock = make();
    const { items } = await mock.listDeliveries({ status: 'dead' });
    const attempts = await mock.listAttempts(items[0].eventId);
    expect(attempts[0]).toEqual({
      attempt: 1,
      attemptedAt: expect.any(String),
      latencyMs: expect.any(Number),
      httpStatus: 503,
      error: 'Upstream returned 503',
    });
  });
});
