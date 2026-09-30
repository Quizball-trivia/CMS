/** Players, matches and corrections, the leaderboard and snapshots, the dashboard, settings and reviews. */
import type { AdminMatchRecord, MatchCorrectionRequest, Settings } from '../contract';
import { addDays, georgiaToday } from '../georgia';
import { actorOf, nowIso, type MockContext } from './content';
import type { MockDb, MockLedger, MockPlayer } from './db';
import { MockError, paginate, uuid } from './util';

const ledgerView = (l: MockLedger) => ({ id: l.id, delta: l.delta, reason: l.reason, ref: l.ref, balanceAfter: l.balanceAfter, createdAt: l.createdAt });

type Outcome = 'win' | 'loss' | 'noContest';

function aggregates(db: MockDb, player: MockPlayer) {
  const decided = db.matches
    .filter((m) => m.status === 'settled' || m.status === 'void')
    .flatMap((m) => m.players.filter((p) => p.playerId === player.id).map((p) => ({ at: m.settledAt ?? m.createdAt, outcome: p.outcome })))
    .sort((a, b) => a.at.localeCompare(b.at));
  let streak = 0;
  let bestStreak = 0;
  for (const d of decided) {
    streak = d.outcome === 'win' ? streak + 1 : d.outcome === 'loss' ? 0 : streak;
    bestStreak = Math.max(bestStreak, streak);
  }
  const count = (o: Outcome) => decided.filter((d) => d.outcome === o).length;
  return { games: count('win') + count('loss'), wins: count('win'), losses: count('loss'), noContests: count('noContest'), streak, bestStreak };
}

const summaryOf = (db: MockDb, p: MockPlayer) => ({
  id: p.id,
  displayName: p.displayName,
  provider: p.provider,
  partnerPlayerId: p.partnerPlayerId,
  status: p.status,
  rating: p.rating,
  games: aggregates(db, p).games,
  createdAt: p.createdAt,
});

export function searchPlayers(ctx: MockContext, query: { q: string; cursor?: string; limit?: string }) {
  const q = query.q.toLowerCase();
  const found = ctx.db.players
    .filter((p) => p.displayName.toLowerCase().startsWith(q) || p.partnerPlayerId === query.q || p.id === query.q)
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  const page = paginate(found, query, `players:${q}`);
  return { items: page.items.map((p) => summaryOf(ctx.db, p)), nextCursor: page.nextCursor };
}

function findPlayer(ctx: MockContext, id: string) {
  const player = ctx.db.players.find((p) => p.id === id);
  if (!player) throw new MockError(404, 'not_found', 'No such player');
  return player;
}

export function playerProfile(ctx: MockContext, id: string) {
  const p = findPlayer(ctx, id);
  const a = aggregates(ctx.db, p);
  const live = ctx.db.matches.find((m) => m.status === 'live' && m.players.some((s) => s.playerId === p.id));
  const seed = p.displayName.length;
  const games = { footballLogic: { attempts: seed + 2, completed: seed }, putInOrder: { attempts: seed, completed: seed - 1 }, careerPath: { attempts: 3, completed: 2 } };
  return {
    id: p.id,
    displayName: p.displayName,
    provider: p.provider,
    partnerPlayerId: p.partnerPlayerId,
    status: p.status,
    avatar: p.avatar,
    clubId: p.clubId,
    createdAt: p.createdAt,
    lastSeenAt: p.lastSeenAt,
    liveMatchId: live?.id ?? null,
    rating: { rating: p.rating, ratingVersion: p.ratingVersion, ...a },
    tickets: { balance: p.balance, perDay: p.ticketsPerDay, refilledOn: p.refilledOn },
    dailies: {
      attempts: games.footballLogic.attempts + games.putInOrder.attempts + games.careerPath.attempts,
      completed: games.footballLogic.completed + games.putInOrder.completed + games.careerPath.completed,
      lastDate: georgiaToday(ctx.now),
      games,
    },
    practice: { runs: seed, bestStreak: seed + 3, lastRunAt: p.lastSeenAt },
  };
}

export function playerMatches(ctx: MockContext, id: string, query: { cursor?: string; limit?: string }) {
  const p = findPlayer(ctx, id);
  const rows = ctx.db.matches
    .filter((m) => m.players.some((s) => s.playerId === p.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((m) => {
      const mine = m.players.find((s) => s.playerId === p.id)!;
      const theirs = m.players.find((s) => s.playerId !== p.id)!;
      return {
        matchId: m.id,
        status: m.status,
        createdAt: m.createdAt,
        settledAt: m.settledAt,
        decidedBy: m.decidedBy,
        resultVersion: m.resultVersion,
        seat: mine.seat,
        outcome: mine.outcome,
        ratingDelta: mine.ratingDelta,
        ticketRefunded: mine.ticketRefunded,
        score: m.score ? { mine: mine.seat === 'me' ? m.score.me : m.score.op, theirs: mine.seat === 'me' ? m.score.op : m.score.me } : null,
        opponent: { id: theirs.playerId, displayName: theirs.displayName },
      };
    });
  return paginate(rows, query, `matches:${id}`);
}

export function playerTickets(ctx: MockContext, id: string, query: { cursor?: string; limit?: string }) {
  const p = findPlayer(ctx, id);
  const rows = ctx.db.ledger
    .filter((l) => l.playerId === p.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || Number(b.id) - Number(a.id))
    .map(ledgerView);
  return paginate(rows, query, `tickets:${id}`);
}

export function matchRecord(ctx: MockContext, id: string): AdminMatchRecord {
  const match = ctx.db.matches.find((m) => m.id === id);
  if (!match) throw new MockError(404, 'not_found', 'No such match');
  return { ...match, reviews: ctx.db.reviews.filter((r) => r.matchId === id) };
}

export function correct(ctx: MockContext, id: string, body: MatchCorrectionRequest) {
  const { db } = ctx;
  const match = db.matches.find((m) => m.id === id);
  if (!match) throw new MockError(404, 'not_found', 'No such match');
  if (match.status !== 'settled' && match.status !== 'void') throw new MockError(409, 'match_not_decided', 'The match is not decided yet');
  if (body.version !== match.resultVersion)
    throw new MockError(409, 'revision_conflict', 'The match was corrected meanwhile; look again', { current: matchRecord(ctx, id) });
  const winner = body.outcome.kind === 'win' ? body.outcome.winner : null;
  if (winner && !match.players.some((p) => p.playerId === winner)) throw new MockError(400, 'invalid_request', 'The request is not valid');
  const currentWinner = match.players.find((p) => p.outcome === 'win')?.playerId ?? null;
  if ((body.outcome.kind === 'void' && match.status === 'void') || (winner && match.status === 'settled' && currentWinner === winner))
    throw new MockError(409, 'same_result', 'That is the result already');
  const at = nowIso(ctx);
  const correctionId = uuid();
  const ratingBefore = new Map(match.players.map((seat) => [seat.playerId, db.players.find((p) => p.id === seat.playerId)!.rating]));
  const snapshot = () => ({
    status: match.status as 'settled' | 'void',
    decidedBy: match.decidedBy ?? 'play',
    winner: match.players.find((p) => p.outcome === 'win')?.playerId ?? null,
    players: match.players.map((p) => ({ seat: p.seat, playerId: p.playerId, outcome: p.outcome ?? 'noContest', ratingDelta: p.ratingDelta ?? 0, ticketRefunded: Boolean(p.ticketRefunded) })),
  });
  const previous = snapshot();
  match.resultVersion += 1;
  match.status = body.outcome.kind === 'void' ? 'void' : 'settled';
  match.decidedBy = 'corrected';
  match.correctedAt = at;
  for (const seat of match.players) seat.outcome = body.outcome.kind === 'void' ? 'noContest' : seat.playerId === winner ? 'win' : 'loss';
  for (const seat of match.players) {
    const player = db.players.find((p) => p.id === seat.playerId)!;
    const outcome = seat.outcome as Outcome;
    const rule = outcome === 'win' ? 25 : outcome === 'loss' ? -10 : 0;
    // Recomputed from the history, as the API does: the zero floor makes subtracting the old delta wrong.
    const replayed = replayRating(db, player);
    const applied = replayed.rating - ratingBefore.get(player.id)!;
    player.rating = replayed.rating;
    player.ratingVersion += 1;
    seat.ratingEvents.push({ seq: player.ratingVersion, deltaRule: rule, appliedDelta: applied, ratingAfter: replayed.rating, correctionId, at });
    seat.ratingDelta = replayed.deltas.get(match.id) ?? 0;
    if (outcome === 'noContest' && !seat.ticketRefunded) {
      player.balance += 1;
      const refund: MockLedger = { id: String(900 + db.ledger.length), playerId: player.id, delta: 1, reason: 'refund', ref: `refund:${player.id}:match:${id}`, balanceAfter: player.balance, createdAt: at };
      db.ledger.push(refund);
      seat.tickets.push(ledgerView(refund));
      seat.ticketRefunded = true;
    }
    seat.deliveries.push({ resultVersion: match.resultVersion, createdAt: at, attempts: 0, ackedAt: null, supersededAt: null, result: { matchId: id, resultVersion: match.resultVersion, outcome } });
  }
  match.corrections.push({
    id: correctionId,
    resultVersion: match.resultVersion,
    kind: body.outcome.kind,
    reason: body.reason,
    staff: { id: ctx.staff.id, name: ctx.staff.name },
    createdAt: at,
    previous,
    result: snapshot(),
    penaltiesToReview: [],
  });
  for (const review of db.reviews)
    if (review.matchId === id && review.status === 'open')
      Object.assign(review, { status: 'corrected', closedAt: at, closedBy: { id: ctx.staff.id, name: ctx.staff.name }, closingCorrectionId: correctionId });
  return matchRecord(ctx, id);
}

/** A player's rating replayed over their decided matches in order, from where it started: +25, −10 floored at 0, 0 for no contest. */
export function replayRating(db: MockDb, player: MockPlayer): { rating: number; deltas: Map<string, number> } {
  const decided = db.matches
    .filter((m) => (m.status === 'settled' || m.status === 'void') && m.players.some((p) => p.playerId === player.id))
    .sort((a, b) => (a.settledAt ?? a.createdAt).localeCompare(b.settledAt ?? b.createdAt));
  let rating = player.startRating;
  const deltas = new Map<string, number>();
  for (const m of decided) {
    const outcome = m.players.find((p) => p.playerId === player.id)!.outcome;
    const next = outcome === 'win' ? rating + 25 : outcome === 'loss' ? Math.max(0, rating - 10) : rating;
    deltas.set(m.id, next - rating);
    rating = next;
  }
  return { rating, deltas };
}

/* ── leaderboard ──────────────────────────────────────────────────── */

function standings(db: MockDb) {
  return db.players
    .filter((p) => p.status === 'active' && aggregates(db, p).games > 0)
    .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))
    .map((p, i) => {
      const a = aggregates(db, p);
      return { rank: i + 1, playerId: p.id, partnerPlayerId: p.partnerPlayerId, displayName: p.displayName, rating: p.rating, games: a.games, wins: a.wins, losses: a.losses };
    });
}

export function board(ctx: MockContext, query: { cursor?: string; limit?: string }) {
  const all = standings(ctx.db);
  return { asOf: nowIso(ctx), total: all.length, ...paginate(all, query, 'board') };
}

const cell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function csv(rows: ReturnType<typeof standings>): string {
  const header = ['rank', 'player_id', 'partner_player_id', 'display_name', 'rating', 'games', 'wins', 'losses'];
  const lines = rows.map((r) => [r.rank, r.playerId, r.partnerPlayerId, r.displayName, r.rating, r.games, r.wins, r.losses].map(cell).join(','));
  return `﻿${[header.join(','), ...lines].join('\r\n')}\r\n`;
}

export const boardCsv = (ctx: MockContext) => csv(standings(ctx.db));

const snapshotView = (s: MockDb['snapshots'][number]) => ({ id: s.id, label: s.label, takenAt: s.takenAt, takenBy: s.takenBy, players: s.rows.length });

export function listSnapshots(ctx: MockContext, query: { cursor?: string; limit?: string }) {
  const sorted = [...ctx.db.snapshots].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const page = paginate(sorted, query, 'snapshots');
  return { items: page.items.map(snapshotView), nextCursor: page.nextCursor };
}

export function takeSnapshot(ctx: MockContext, label: string) {
  if (ctx.db.snapshots.some((s) => s.label.toLowerCase() === label.toLowerCase()))
    throw new MockError(409, 'already_exists', 'A snapshot already has this label');
  const snapshot = { id: uuid(), label, takenAt: nowIso(ctx), takenBy: actorOf(ctx), rows: standings(ctx.db) };
  ctx.db.snapshots.push(snapshot);
  return snapshotView(snapshot);
}

function findSnapshot(ctx: MockContext, id: string) {
  const snapshot = ctx.db.snapshots.find((s) => s.id === id);
  if (!snapshot) throw new MockError(404, 'not_found', 'No such snapshot');
  return snapshot;
}

export function snapshotPage(ctx: MockContext, id: string, query: { cursor?: string; limit?: string }) {
  const snapshot = findSnapshot(ctx, id);
  return { snapshot: snapshotView(snapshot), ...paginate(snapshot.rows, query, `snapshot:${id}`) };
}

export const snapshotCsv = (ctx: MockContext, id: string) => csv(findSnapshot(ctx, id).rows);

/* ── dashboard ────────────────────────────────────────────────────── */

export function dashboard(ctx: MockContext) {
  const { db } = ctx;
  const day = (date: string, offset: number) => {
    const from = new Date(Date.parse(`${date}T00:00:00Z`) - 4 * 3_600_000).toISOString();
    const to = new Date(Date.parse(from) + 86_400_000).toISOString();
    const within = (iso: string | null) => iso !== null && iso >= from && iso < to;
    const matches = db.matches.filter((m) => within(m.createdAt));
    const active = new Set(matches.flatMap((m) => m.players.map((p) => p.playerId)));
    const base = 40 - offset * 7;
    return {
      date,
      from,
      to,
      players: { new: db.players.filter((p) => within(p.createdAt)).length, active: active.size },
      matches: {
        created: matches.length,
        settled: db.matches.filter((m) => within(m.settledAt) && m.status === 'settled').length,
        voided: db.matches.filter((m) => within(m.settledAt) && m.status === 'void').length,
        corrected: db.matches.flatMap((m) => m.corrections).filter((c) => within(c.createdAt)).length,
      },
      dailies: {
        footballLogic: { attempts: base, completed: base - 6 },
        putInOrder: { attempts: base - 9, completed: base - 12 },
        careerPath: { attempts: base - 14, completed: base - 20 },
      },
      practice: { runs: base + 11 },
    };
  };
  const today = georgiaToday(ctx.now);
  return {
    timezone: 'Asia/Tbilisi' as const,
    generatedAt: nowIso(ctx),
    penaltiesToReview: db.reviews.filter((r) => r.status === 'open').length,
    today: day(today, 0),
    yesterday: day(addDays(today, -1), 1),
  };
}

/* ── settings ─────────────────────────────────────────────────────── */

export function settings(ctx: MockContext): Settings {
  const s = ctx.db.settings;
  const today = georgiaToday(ctx.now);
  const inForce = s.ticketsPerDay.effectiveFrom !== null && s.ticketsPerDay.effectiveFrom <= today;
  return { ...s, ticketsPerDay: { ...s.ticketsPerDay, today: inForce ? s.ticketsPerDay.value : s.ticketsPerDay.today } };
}

const MIDNIGHT_GUARD_MS = 5 * 60_000;

export function setTicketsPerDay(ctx: MockContext, version: number, value: number) {
  const current = settings(ctx);
  if (current.ticketsPerDay.version !== version)
    throw new MockError(409, 'revision_conflict', 'The setting changed meanwhile; look again', { current });
  const ofDay = (ctx.now + 4 * 3_600_000) % 86_400_000;
  if (ofDay < MIDNIGHT_GUARD_MS || ofDay > 86_400_000 - MIDNIGHT_GUARD_MS)
    throw new MockError(409, 'too_close_to_midnight', 'Tickets per day cannot change within five minutes of midnight');
  ctx.db.settings.ticketsPerDay = {
    value,
    effectiveFrom: addDays(georgiaToday(ctx.now), 1),
    today: current.ticketsPerDay.today,
    version: version + 1,
    updatedAt: nowIso(ctx),
    updatedBy: { id: ctx.staff.id, name: ctx.staff.name },
  };
  return settings(ctx);
}

export function setMaintenance(ctx: MockContext, version: number, enabled: boolean) {
  const current = settings(ctx);
  if (current.maintenance.version !== version)
    throw new MockError(409, 'revision_conflict', 'The setting changed meanwhile; look again', { current });
  ctx.db.settings.maintenance = { enabled, version: version + 1, updatedAt: nowIso(ctx), updatedBy: { id: ctx.staff.id, name: ctx.staff.name } };
  return settings(ctx);
}

/* ── reviews ──────────────────────────────────────────────────────── */

export function listReviews(ctx: MockContext, query: { status?: 'open' | 'all'; cursor?: string; limit?: string }) {
  const status = query.status ?? 'open';
  const rows = ctx.db.reviews.filter((r) => status === 'all' || r.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(rows, query, `reviews:${status}`);
}

export function dismissReview(ctx: MockContext, id: string, note: string) {
  const review = ctx.db.reviews.find((r) => r.id === id);
  if (!review) throw new MockError(404, 'not_found', 'No such review');
  if (review.status !== 'open') throw new MockError(409, 'conflict', 'This review is closed already');
  Object.assign(review, { status: 'dismissed', closedAt: nowIso(ctx), closedBy: { id: ctx.staff.id, name: ctx.staff.name }, note });
  return review;
}
