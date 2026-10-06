import { ApiClientError } from '@/services/api-client';
import { addDays, dayNumber, georgiaToday } from '@/lib/td/georgia';
import type {
  CalendarOverride,
  DeliveryAttempt,
  DeliveryItem,
  PartnerDayStats,
  PartnerGameConfig,
  PartnerGameId,
  PartnerGameStats,
  PartnerPlayerView,
  PartnerStaffMember,
  PartnerStats,
  RankedPointsTable,
} from '@/types/freecroco';
import type { FreecrocoApi } from './api';
import { CALENDAR_HORIZON_DAYS, MAX_CHANGES_PER_SAVE } from './calendar';
import { isValidLimit, PARTNER_GAME_IDS, validateGames } from './games';
import { rankedMaxScore, validateRankedPoints } from './ranked-points';

const fail = (status: number, code: string, message: string) =>
  new ApiClientError({ code, message, details: null, request_id: null }, status);

const stale = () => fail(409, 'stale_version', 'Someone else saved first');

// Internal API section 3: every game on, default 1 (ranked 10), nothing ready until its stream ships.
function seedGames(): PartnerGameConfig[] {
  const readyDemo: PartnerGameId[] = ['ranked', 'true-false', 'countdown'];
  return PARTNER_GAME_IDS.map((gameId, i) => ({
    gameId,
    enabled: true,
    order: i + 1,
    defaultLimit: gameId === 'ranked' ? 10 : 1,
    ready: readyDemo.includes(gameId),
  }));
}

// Contract section 7.1: the seeded version 1.
function seedRankedPoints(): RankedPointsTable {
  return {
    margins: [
      { winner: 100, loser: 50 },
      { winner: 150, loser: 40 },
      { winner: 200, loser: 30 },
      { winner: 250, loser: 20 },
      { winner: 300, loser: 10 },
      { winner: 500, loser: 0 },
    ],
    penaltyWin: { winner: 100, loser: 50 },
    drawAfterPenalties: 60,
    leftNotAhead: 100,
  };
}

function seedDeliveries(now: number): DeliveryItem[] {
  const statuses: DeliveryItem['status'][] = ['sent', 'sent', 'sent', 'pending', 'dead', 'sent'];
  return Array.from({ length: 37 }, (_, i) => {
    const status = statuses[i % statuses.length];
    const gameId = PARTNER_GAME_IDS[i % PARTNER_GAME_IDS.length];
    const occurred = new Date(now - i * 47 * 60_000).toISOString();
    return {
      eventId: `evt_${String(1000 + i).padStart(6, '0')}`,
      playerId: `fc-${2000 + (i % 9)}`,
      gameId,
      score: 50 * ((i % 8) + 1),
      occurredAt: occurred,
      status,
      attempts: status === 'pending' ? 0 : status === 'dead' ? 6 : 1,
      lastAttemptAt: status === 'pending' ? null : new Date(now - i * 47 * 60_000 + 2_000).toISOString(),
      lastHttpStatus: status === 'pending' ? null : status === 'dead' ? 503 : 200,
      lastError: status === 'dead' ? 'Upstream returned 503' : null,
    };
  });
}

// Deterministic per day, so a range shows the same numbers on every load.
function mockDay(day: string): PartnerDayStats {
  const n = dayNumber(day) ?? 0;
  const wave = (k: number) => Math.abs(Math.sin(n * 0.7 + k));
  const activePlayers = 120 + Math.round(wave(1) * 180);
  const playsStarted = Math.round(activePlayers * (2.4 + wave(2)));
  const playsFinished = Math.round(playsStarted * 0.86);
  return {
    day,
    newPlayers: 10 + Math.round(wave(3) * 45),
    activePlayers,
    playsStarted,
    playsFinished,
    pointsSent: playsFinished * (180 + Math.round(wave(4) * 120)),
  };
}

function mockStats(today: string, from: string, to: string): PartnerStats {
  const span = (dayNumber(to) ?? 0) - (dayNumber(from) ?? 0) + 1;
  const daily = Array.from({ length: span }, (_, i) => mockDay(addDays(from, i)));
  const sum = (pick: (d: PartnerDayStats) => number) => daily.reduce((total, d) => total + pick(d), 0);
  const plays = sum((d) => d.playsStarted);
  const finished = sum((d) => d.playsFinished);
  const weights = PARTNER_GAME_IDS.map((_, i) => (i === 0 ? 4 : 1 + ((i * 7) % 5) / 2));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const games: PartnerGameStats[] = PARTNER_GAME_IDS.map((gameId, i) => {
    const gamePlays = Math.round((plays * weights[i]) / weightTotal);
    const gameFinished = Math.round((finished * weights[i]) / weightTotal);
    return {
      gameId,
      plays: gamePlays,
      finished: gameFinished,
      averageScore: gameFinished > 0 ? 80 + i * 23.5 : null,
      maxScore: gameFinished > 0 ? 300 + i * 140 : null,
      uniquePlayers: Math.round(gamePlays / (2 + (i % 3))),
    };
  });
  const rankedPlays = games[0].plays;
  const matches = Math.round(rankedPlays * 0.62);
  return {
    from,
    to,
    today,
    totals: {
      playersEver: 4200 + sum((d) => d.newPlayers),
      newPlayers: sum((d) => d.newPlayers),
      activeToday: mockDay(today).activePlayers,
      activeYesterday: mockDay(addDays(today, -1)).activePlayers,
      activeLast7Days: Math.round(mockDay(today).activePlayers * 3.1),
      activeInRange: Math.round(sum((d) => d.activePlayers) * 0.45),
    },
    todayStats: mockDay(today),
    yesterdayStats: mockDay(addDays(today, -1)),
    daily,
    games,
    ranked: {
      plays: rankedPlays,
      matches,
      vsPlayers: Math.round(matches * 0.7),
      vsBots: matches - Math.round(matches * 0.7),
      settled: Math.round(rankedPlays * 0.9),
      cancelled: Math.round(rankedPlays * 0.07),
      returned: Math.round(rankedPlays * 0.05),
      open: 3,
    },
    delivery: {
      sent: finished - 9,
      pending: 6,
      dead: 3,
      pendingNow: 6,
      deadNow: 3,
      oldestPendingSeconds: 42,
    },
  };
}

function seedStaff(now: number): PartnerStaffMember[] {
  return [
    {
      userId: '7c0f6b2e-1d4a-4c55-9a51-0f1f6f3b2a01',
      email: 'ops@freecroco.example',
      role: 'editor',
      addedAt: new Date(now - 12 * 86_400_000).toISOString(),
      addedBy: { userId: '00000000-0000-4000-8000-00000000a001', email: 'admin@quizball.io' },
      lastSignInAt: new Date(now - 3 * 3_600_000).toISOString(),
    },
    {
      userId: '7c0f6b2e-1d4a-4c55-9a51-0f1f6f3b2a02',
      email: 'analyst@freecroco.example',
      role: 'viewer',
      addedAt: new Date(now - 5 * 86_400_000).toISOString(),
      addedBy: null,
      lastSignInAt: null,
    },
  ];
}

export interface FreecrocoMock extends FreecrocoApi {
  /** Test/demo hook: another editor saves games, the calendar and the ranked points, so the next save sees a stale
   *  version. */
  simulateOtherEditor(): void;
}

export function createFreecrocoMock(options: { today?: string; delayMs?: number } = {}): FreecrocoMock {
  const today = options.today ?? georgiaToday();
  const delayMs = options.delayMs ?? 250;
  const now = Date.parse(`${today}T08:00:00Z`);

  let gamesVersion = 1;
  let games = seedGames();
  let calendarVersion = 1;
  let overrides: CalendarOverride[] = [
    { date: addDays(today, 2), gameId: 'true-false', limit: 3 },
    { date: addDays(today, 2), gameId: 'ranked', limit: 20 },
    { date: addDays(today, 5), gameId: 'countdown', limit: 0 },
  ];
  let rankedPointsVersion = 1;
  let rankedPoints = seedRankedPoints();
  let deliveries = seedDeliveries(now);
  let staff = seedStaff(now);
  let staffSeq = 0;
  const players = new Map<string, PartnerPlayerView>(
    Array.from({ length: 9 }, (_, i) => {
      const playerId = `fc-${2000 + i}`;
      return [
        playerId,
        {
          playerId,
          displayName: `Player ${2000 + i}`,
          status: i === 7 ? 'blocked' : 'active',
          firstSeenAt: new Date(now - 20 * 86_400_000).toISOString(),
          lastSeenAt: new Date(now - i * 3_600_000).toISOString(),
          today: [
            { gameId: 'ranked', playsUsed: i % 4, playsLimit: 10 },
            { gameId: 'true-false', playsUsed: i % 2, playsLimit: 1 },
          ],
        } satisfies PartnerPlayerView,
      ];
    }),
  );

  const wait = () => (delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve());
  const copyGames = () => ({ version: gamesVersion, games: games.map((g) => ({ ...g })) });
  const copyCalendar = () => ({ version: calendarVersion, overrides: overrides.map((o) => ({ ...o })) });
  const copyTable = (t: RankedPointsTable): RankedPointsTable => ({
    ...t,
    margins: t.margins.map((p) => ({ ...p })),
    penaltyWin: { ...t.penaltyWin },
  });
  const copyRankedPoints = () => ({
    version: rankedPointsVersion,
    points: copyTable(rankedPoints),
    maxScore: rankedMaxScore(rankedPoints),
  });

  return {
    async getGames() {
      await wait();
      return copyGames();
    },

    async putGames(config) {
      await wait();
      if (config.version !== gamesVersion) throw stale();
      if (!validateGames(config.games).valid) throw fail(400, 'validation_error', 'Invalid games configuration');
      // `ready` is owned by Quizball ops; a client cannot change it.
      games = config.games.map((g) => ({ ...g, ready: games.find((s) => s.gameId === g.gameId)?.ready ?? false }));
      gamesVersion += 1;
      return copyGames();
    },

    async getCalendar(from, to) {
      await wait();
      return { version: calendarVersion, overrides: overrides.filter((o) => o.date >= from && o.date <= to).map((o) => ({ ...o })) };
    },

    async putCalendar(update) {
      await wait();
      if (update.version !== calendarVersion) throw stale();
      if (update.changes.length > MAX_CHANGES_PER_SAVE) throw fail(400, 'too_many_changes', 'At most 100 changes per save');
      for (const change of update.changes) {
        if (change.date < today || change.date > addDays(today, CALENDAR_HORIZON_DAYS)) {
          throw fail(400, 'date_out_of_range', `${change.date} is outside the editable window`);
        }
        if (change.limit !== null && !isValidLimit(change.gameId, change.limit)) {
          throw fail(400, 'validation_error', 'Invalid plays per day');
        }
      }
      for (const change of update.changes) {
        overrides = overrides.filter((o) => !(o.date === change.date && o.gameId === change.gameId));
        if (change.limit !== null) overrides.push({ date: change.date, gameId: change.gameId, limit: change.limit });
      }
      calendarVersion += 1;
      return copyCalendar();
    },

    async getRankedPoints() {
      await wait();
      return copyRankedPoints();
    },

    async putRankedPoints(update) {
      await wait();
      if (update.version !== rankedPointsVersion) throw stale();
      if (update.points.margins.length !== 6 || !validateRankedPoints(update.points).valid) {
        throw fail(400, 'invalid_request', 'Invalid ranked points');
      }
      rankedPoints = copyTable(update.points);
      rankedPointsVersion += 1;
      return copyRankedPoints();
    },

    async listDeliveries(query) {
      await wait();
      const pageSize = 10;
      const filtered = deliveries.filter(
        (d) =>
          (!query.status || d.status === query.status) &&
          (!query.gameId || d.gameId === query.gameId) &&
          (!query.playerId || d.playerId === query.playerId) &&
          (!query.from || d.occurredAt.slice(0, 10) >= query.from) &&
          (!query.to || d.occurredAt.slice(0, 10) <= query.to),
      );
      const start = query.cursor ? Number(query.cursor) : 0;
      const end = start + pageSize;
      return { items: filtered.slice(start, end), nextCursor: end < filtered.length ? String(end) : null };
    },

    async listAttempts(eventId) {
      await wait();
      const item = deliveries.find((d) => d.eventId === eventId);
      if (!item) throw fail(404, 'not_found', 'Unknown delivery');
      return Array.from({ length: item.attempts }, (_, i): DeliveryAttempt => {
        const last = i === item.attempts - 1;
        const ok = item.status === 'sent' && last;
        return {
          attempt: i + 1,
          attemptedAt: new Date(Date.parse(item.occurredAt) + (i + 1) * 60_000).toISOString(),
          latencyMs: 120 + i * 35,
          httpStatus: ok ? 200 : 503,
          error: ok ? null : 'Upstream returned 503',
        };
      });
    },

    async resendDelivery(eventId) {
      await wait();
      const item = deliveries.find((d) => d.eventId === eventId);
      if (!item) throw fail(404, 'not_found', 'Unknown delivery');
      if (item.status !== 'dead') throw fail(409, 'not_resendable', 'Only dead deliveries can be resent');
      deliveries = deliveries.map((d) => (d.eventId === eventId ? { ...d, status: 'pending', attempts: 0, lastAttemptAt: null, lastHttpStatus: null, lastError: null } : d));
    },

    async getPlayer(playerId) {
      await wait();
      const player = players.get(playerId);
      if (!player) throw fail(404, 'not_found', 'No player with that id');
      return { ...player, today: player.today.map((t) => ({ ...t })) };
    },

    async getStats(from, to) {
      await wait();
      const span = (dayNumber(to) ?? 0) - (dayNumber(from) ?? 0) + 1;
      if (span < 1 || span > 92) throw fail(400, 'invalid_request', 'from must be on or before to, at most 92 days in all');
      return mockStats(today, from, to);
    },

    async listStaff() {
      await wait();
      return { items: staff.map((m) => ({ ...m })) };
    },

    async addStaff({ email, role }) {
      await wait();
      const normalized = email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw fail(400, 'invalid_request', 'email: Invalid email');
      if (normalized.endsWith('@quizball.io')) {
        throw fail(409, 'staff_not_eligible', 'This is a Quizball admin account; admins already see the Freecroco section');
      }
      if (staff.some((m) => m.email === normalized)) throw fail(409, 'staff_exists', 'This person is already a staff member');
      staffSeq += 1;
      const member: PartnerStaffMember = {
        userId: `7c0f6b2e-1d4a-4c55-9a51-${String(staffSeq).padStart(12, '0')}`,
        email: normalized,
        role,
        addedAt: new Date().toISOString(),
        addedBy: { userId: '00000000-0000-4000-8000-00000000a001', email: 'admin@quizball.io' },
        lastSignInAt: null,
      };
      staff = [...staff, member];
      return { member: { ...member }, account: 'invited', inviteSent: true };
    },

    async updateStaffRole(userId, role) {
      await wait();
      const member = staff.find((m) => m.userId === userId);
      if (!member) throw fail(404, 'not_found', 'Not a staff member');
      staff = staff.map((m) => (m.userId === userId ? { ...m, role } : m));
      return { ...member, role };
    },

    async removeStaff(userId) {
      await wait();
      if (!staff.some((m) => m.userId === userId)) throw fail(404, 'not_found', 'Not a staff member');
      staff = staff.filter((m) => m.userId !== userId);
    },

    simulateOtherEditor() {
      gamesVersion += 1;
      calendarVersion += 1;
      rankedPointsVersion += 1;
    },
  };
}

let singleton: FreecrocoMock | null = null;

export function getFreecrocoMock(): FreecrocoMock {
  singleton ??= createFreecrocoMock();
  return singleton;
}
