/**
 * The Integration tab's webhooks, as the API's IntegrationService has them
 * (apps/api/src/ops/integration.ts): the partner's result events with their
 * delivery attempts, a search by event, session or player, and "retry now"
 * for ops (refused when delivered, while being sent, or bound to an earlier
 * address without retarget; 60 retries per member an hour). A small
 * dispatcher stands in for the partner: each event knows whether its next
 * delivery succeeds.
 */
import type { WebhookAttempt, WebhookEvent, WebhookEventDetail } from '../contract';
import type { MockContext } from './content';
import type { MockDb, MockPlayer } from './db';
import { MockError, paginate } from './util';

export const MOCK_WEBHOOK_DESTINATION = 'https://hooks.betsson.example#3f9a1c07b2d4';
const EARLIER_DESTINATION = 'https://old-hooks.betsson.example#81c2d93e0a4f';
const RETRIES_PER_HOUR = 60;
const ATTEMPTS_SHOWN = 200;
const RETRY_WINDOW_MS = 24 * 3_600_000;
const EVENT_ID = /^[A-Za-z0-9._:-]{1,128}$/;

type RawAttempt = Omit<WebhookAttempt, 'delivered' | 'reason'>;

export interface MockWebhook {
  seq: number;
  eventId: string;
  type: WebhookEvent['type'];
  userId: string;
  payload: WebhookEventDetail['payload'];
  occurredAt: string;
  enqueuedAt: string;
  status: WebhookEvent['status'];
  attempts: number;
  nextAttemptAt: string;
  /** While a delivery is on its way (a live lease), until this time. */
  sendingUntil: string | null;
  sentAt: string | null;
  deadAt: string | null;
  revivedAt: string | null;
  lastError: string | null;
  destination: string | null;
  log: RawAttempt[];
  /** What the partner answers the next delivery with (the mock's stand-in for the far side). */
  next: 'ok' | 'fail';
}

const TYPES: WebhookEvent['type'][] = ['match.settled', 'score', 'daily.completed', 'practice.completed', 'match.settled', 'match.corrected', 'match.voided'];

function dataFor(type: WebhookEvent['type'], i: number, matchId: string, georgiaDate: string): unknown {
  switch (type) {
    case 'score':
      return { matchId, score: { player: i % 4, opponent: (i + 1) % 3 } };
    case 'match.settled':
      return { matchId, resultVersion: 1, outcome: i % 2 ? 'win' : 'loss', ratingDelta: i % 2 ? 12 : -9, ticketRefunded: false, score: { player: 3, opponent: 1 }, decidedBy: 'play' };
    case 'match.corrected':
    case 'match.voided':
      return { matchId, resultVersion: 2, outcome: 'noContest', ratingDelta: 0, ticketRefunded: true, score: { player: 2, opponent: 3 }, decidedBy: 'void' };
    case 'daily.completed':
      return { game: 'footballLogic', georgiaDate, solved: true, seconds: 40 + (i % 50) };
    case 'practice.completed':
      return { correct: 6 + (i % 5), total: 10 };
  }
}

const failed = (startedAt: number, attempt: number): RawAttempt =>
  attempt % 3 === 1
    ? { attempt, startedAt: new Date(startedAt).toISOString(), latencyMs: 10_000, httpStatus: null, error: 'timeout', responseSnippet: null }
    : { attempt, startedAt: new Date(startedAt).toISOString(), latencyMs: 180 + (attempt % 7) * 20, httpStatus: 503, error: null, responseSnippet: '<html><body>Service Unavailable</body></html>' };

const backoff = (attempts: number) => Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);

/** 56 events of the Betsson players over the last three days: most delivered, some retrying, some given up. */
export function seedWebhooks(now: number, players: MockPlayer[], matchIds: string[]): MockWebhook[] {
  const partnered = players.filter((p) => p.partnerPlayerId !== null);
  const iso = (t: number) => new Date(t).toISOString();
  return Array.from({ length: 56 }, (_, i) => {
    const player = partnered[i % partnered.length];
    const type = TYPES[i % TYPES.length];
    const occurred = now - (56 - i) * 75 * 60_000;
    const enqueued = occurred + 120;
    const matchId = type.startsWith('match') || type === 'score' ? matchIds[i % matchIds.length] : null;
    const sessionId = `7c1d2e3f-4a5b-4c6d-8e7f-${(0x9a0b1c2d3e00 + partnered.indexOf(player)).toString(16)}`;
    const base: MockWebhook = {
      seq: i + 1,
      eventId: `td-evt-${String(i + 1).padStart(4, '0')}`,
      type,
      userId: player.id,
      payload: {
        eventId: `td-evt-${String(i + 1).padStart(4, '0')}`,
        type,
        occurredAt: iso(occurred),
        sessionId,
        playerId: player.partnerPlayerId!,
        gameId: 'table-derby',
        data: dataFor(type, i, matchId ?? '', iso(occurred + 4 * 3_600_000).slice(0, 10)),
      },
      occurredAt: iso(occurred),
      enqueuedAt: iso(enqueued),
      status: 'sent',
      attempts: 1,
      nextAttemptAt: iso(enqueued),
      sendingUntil: null,
      sentAt: iso(enqueued + 260),
      deadAt: null,
      revivedAt: null,
      lastError: null,
      destination: MOCK_WEBHOOK_DESTINATION,
      log: [{ attempt: 1, startedAt: iso(enqueued + 60), latencyMs: 140 + (i % 9) * 25, httpStatus: 200, error: null, responseSnippet: '{"received":true}' }],
      next: 'ok',
    };
    const giveUp = (next: 'ok' | 'fail', destination = MOCK_WEBHOOK_DESTINATION): MockWebhook => {
      let at = enqueued + 60;
      const log = Array.from({ length: 31 }, (_, a) => {
        const attempt = failed(at, a + 1);
        at += backoff(a + 1);
        return attempt;
      });
      return { ...base, status: 'dead', attempts: 31, sentAt: null, deadAt: iso(enqueued + RETRY_WINDOW_MS), lastError: 'webhook_http_503', destination, log, next };
    };
    const retrying = (next: 'ok' | 'fail'): MockWebhook => {
      const log = [failed(enqueued + 60, 1), failed(enqueued + 30_060, 2), failed(enqueued + 90_060, 3)];
      return { ...base, status: 'pending', attempts: 3, sentAt: null, nextAttemptAt: iso(now + 15 * 60_000), lastError: 'webhook_http_503', log, next };
    };
    if (i === 3) return giveUp('fail');
    if (i === 9) return giveUp('ok', EARLIER_DESTINATION);
    if (i === 17) return giveUp('ok');
    if (i === 50) return retrying('ok');
    if (i === 53) return retrying('fail');
    if (i === 55)
      return { ...base, status: 'pending', attempts: 1, sentAt: null, log: [], sendingUntil: iso(now + 20 * 60_000), nextAttemptAt: iso(enqueued) };
    return base;
  });
}

function view(w: MockWebhook): WebhookEvent {
  const data = w.payload.data as { matchId?: unknown } | null;
  return {
    eventId: w.eventId,
    type: w.type,
    partner: 'betsson',
    environment: 'sandbox',
    playerId: w.payload.playerId,
    userId: w.userId,
    sessionId: w.payload.sessionId,
    matchId: typeof data?.matchId === 'string' && data.matchId !== '' ? data.matchId : null,
    occurredAt: w.occurredAt,
    enqueuedAt: w.enqueuedAt,
    status: w.status,
    attempts: w.attempts,
    nextAttemptAt: w.status === 'pending' ? w.nextAttemptAt : null,
    sending: w.sendingUntil !== null,
    sentAt: w.sentAt,
    deadAt: w.deadAt,
    revivedAt: w.revivedAt,
    lastError: w.lastError,
    destination: w.destination,
    destinationCurrent: w.destination === null || w.destination === MOCK_WEBHOOK_DESTINATION,
  };
}

function detail(w: MockWebhook): WebhookEventDetail {
  return {
    event: view(w),
    payload: w.payload,
    attempts: w.log.slice(-ATTEMPTS_SHOWN).map((a) => {
      const delivered = a.httpStatus !== null && a.httpStatus >= 200 && a.httpStatus < 300;
      return { ...a, delivered, reason: a.httpStatus !== null && !delivered ? `webhook_http_${a.httpStatus}` : a.error === 'timeout' ? 'webhook_timeout' : null };
    }),
  };
}

function deliver(w: MockWebhook, now: number) {
  const startedAt = new Date(now).toISOString();
  if (w.next === 'ok') {
    w.log.push({ attempt: w.attempts, startedAt, latencyMs: 210, httpStatus: 200, error: null, responseSnippet: '{"received":true}' });
    Object.assign(w, { status: 'sent', sentAt: startedAt, lastError: null, sendingUntil: null });
    return;
  }
  w.log.push(failed(now, w.attempts));
  w.lastError = w.log.at(-1)!.httpStatus === null ? 'webhook_timeout' : `webhook_http_${w.log.at(-1)!.httpStatus}`;
  if (now - Date.parse(w.revivedAt ?? w.enqueuedAt) >= RETRY_WINDOW_MS) Object.assign(w, { status: 'dead', deadAt: startedAt });
  else w.nextAttemptAt = new Date(now + backoff(w.attempts)).toISOString();
}

/** The dispatcher: a due event gets its next attempt, a delivery on its way lands. */
export function advance(db: MockDb, now: number) {
  for (const w of db.webhooks) {
    if (w.sendingUntil !== null) {
      if (Date.parse(w.sendingUntil) <= now) deliver(w, now);
      continue;
    }
    if (w.status !== 'pending' || Date.parse(w.nextAttemptAt) > now) continue;
    w.attempts += 1;
    deliver(w, now);
  }
}

function hits(db: MockDb, w: MockWebhook, q: string): boolean {
  if (w.eventId === q || w.payload.sessionId === q || w.userId === q) return true;
  // The partner's player id, through the player it names (as the API looks it up in users).
  return db.players.some((p) => p.id === w.userId && p.partnerPlayerId === q);
}

export function list(ctx: MockContext, query: { q?: string; status?: WebhookEvent['status']; cursor?: string; limit?: string }) {
  const rows = ctx.db.webhooks
    .filter((w) => (query.q === undefined || hits(ctx.db, w, query.q)) && (query.status === undefined || w.status === query.status))
    .sort((a, b) => b.seq - a.seq);
  const page = paginate(rows, query, `webhooks:${query.q ?? ''}:${query.status ?? ''}`);
  return { items: page.items.map(view), nextCursor: page.nextCursor };
}

function find(ctx: MockContext, eventId: string): MockWebhook {
  const found = EVENT_ID.test(eventId) ? ctx.db.webhooks.find((w) => w.eventId === eventId) : undefined;
  if (!found) throw new MockError(404, 'not_found', 'No such event');
  return found;
}

export const get = (ctx: MockContext, eventId: string) => detail(find(ctx, eventId));

/**
 * Hand retries per member (their times), kept apart from the store as the API keeps its limiter in Redis:
 * a refused retry is counted too, and nothing rolls it back.
 */
export type RetryLimiter = Map<string, number[]>;

export function retry(ctx: MockContext, eventId: string, retarget: boolean, limiter: RetryLimiter) {
  const recent = (limiter.get(ctx.staff.id) ?? []).filter((t) => t > ctx.now - 3_600_000);
  if (recent.length >= RETRIES_PER_HOUR) throw new MockError(429, 'rate_limited', 'Too many requests; try again later');
  limiter.set(ctx.staff.id, [...recent, ctx.now]);
  const w = find(ctx, eventId);
  if (w.status === 'sent') throw new MockError(409, 'conflict', 'This event was delivered already');
  if (w.sendingUntil !== null) throw new MockError(409, 'conflict', 'This event is being sent now; look again in a moment');
  const moved = w.destination !== null && w.destination !== MOCK_WEBHOOK_DESTINATION;
  if (moved && !retarget)
    throw new MockError(409, 'conflict', 'This event went to an earlier webhook address; retry it with retarget to send it to the current one');
  const at = new Date(ctx.now).toISOString();
  Object.assign(w, { status: 'pending', nextAttemptAt: at, revivedAt: at, destination: moved ? MOCK_WEBHOOK_DESTINATION : w.destination });
  return detail(w);
}
