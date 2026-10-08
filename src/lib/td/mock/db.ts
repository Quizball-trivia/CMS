import type { TdContentStatus, TdContentType } from '../admin-api';
import { TD_CONTENT_TYPES } from '../admin-api';
import type { AdminMatchRecord, OpsReview, Publication, ReleaseDetail, ReleaseReport, Settings } from '../contract';
import type { DailyCycle } from '../georgia';
import { addDays, georgiaToday } from '../georgia';
import type { Data } from './model';
import { seedWebhooks, type MockWebhook } from './integration';
import { seedContent } from './seed-content';
import { MOCK_STAFF } from './staff';

/** Bumped whenever the stored shape or the seed changes: an older store is replaced. */
// 5: Football Logic's seeded pictures are files the game has (data kept from before named files it never had).
// 6: Football Logic's rows carry imageAKey and imageBKey (contract v9); no seeded question is without text and pictures.
export const MOCK_DB_SCHEMA = 6;

export interface Actor {
  id: string | null;
  name: string;
}

export const SYSTEM: Actor = { id: null, name: 'System' };

export interface MockRow {
  id: string;
  type: TdContentType;
  status: TdContentStatus;
  version: number;
  contentVersion: number;
  approvedVersion: number | null;
  position: number;
  approvedPosition: number | null;
  note: string;
  lastEditor: Actor;
  updatedBy: Actor;
  approvedBy: Actor | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  data: Data;
  approved: Data | null;
  batchId: string | null;
}

export interface MockAudit {
  id: number;
  rowId: string;
  type: TdContentType;
  at: string;
  actor: Actor;
  action: 'create' | 'edit' | 'edit.note' | 'ready' | 'approve' | 'archive' | 'restore' | 'delete' | 'seed';
  fromStatus: TdContentStatus | null;
  toStatus: TdContentStatus | null;
  version: number | null;
  contentVersion: number | null;
  batchId: string | null;
}

export interface MockBatchRow {
  index: number;
  type: TdContentType;
  id: string;
  label: string;
  contentVersion: number;
  outcome: 'created' | 'removed' | 'kept';
  reason: 'edited' | 'approved' | 'referenced' | 'published' | null;
}

export interface MockBatch {
  id: string;
  batchKey: string;
  payloadHash: string;
  status: 'applied' | 'partly_undone' | 'undone';
  itemCount: number;
  createdBy: Actor;
  createdAt: string;
  undoneAt: string | null;
  undoneBy: Actor | null;
  rows: MockBatchRow[];
}

export interface MockUpload {
  id: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: number;
  width: number;
  height: number;
  sha256: string;
  uploadedBy: Actor;
  createdAt: string;
  /** Made public by a publication (its renditions exist). */
  public: boolean;
}

export interface Member {
  type: TdContentType;
  id: string;
  label: string;
  contentVersion: number;
}

export type Manifest = ReleaseDetail['manifest'];

/** Per daily game: its dated sets, its cycle and the sets it holds, as the release has them. */
export type DailySnapshot = Record<'footballLogic' | 'putInOrder' | 'careerPath', { dates: Record<string, string>; cycle: DailyCycle | null; known: string[] }>;

/** What a release holds, fixed when it is made. */
export interface ReleaseSnapshot {
  members: Member[];
  manifest: Manifest;
  dailies: DailySnapshot;
  /** The uploads its images are (made public at publish). */
  uploads: string[];
}

export interface MockRelease {
  id: string;
  hash: string;
  formatVersion: number;
  status: 'available' | 'retired';
  createdAt: string;
  createdBy: Actor;
  members: Member[];
  /** Null for a release older than the CMS (published by the deploy, no recorded content). */
  manifest: Manifest | null;
  dailies: DailySnapshot | null;
  publicationId: string | null;
  /** The release current before this one was first made current (its diff baseline). */
  replaced: string | null;
}

export interface MockPointerMove {
  version: number;
  releaseId: string;
  previousReleaseId: string | null;
  movedAt: string;
  movedBy: Actor;
}

export interface MockPublication {
  id: string;
  idemKey: string;
  kind: Publication['kind'];
  status: Publication['status'];
  /** Phases done (0–6). */
  done: number;
  releaseId: string | null;
  previousReleaseId: string | null;
  expectedPointerVersion: number;
  pointerVersion: number | null;
  changed: boolean | null;
  requestedBy: Actor;
  requestedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: Publication['error'];
  report: ReleaseReport | null;
  /** A publish's snapshot of the approved content and the release id it makes. */
  snapshot: (ReleaseSnapshot & { releaseId: string }) | null;
  notify: Publication['notify'];
}

export interface MockPlayer {
  id: string;
  displayName: string;
  provider: 'demo' | 'betsson' | 'dev' | 'load';
  partnerPlayerId: string | null;
  status: 'active' | 'blocked' | 'self_excluded' | 'deleted';
  avatar: string | null;
  clubId: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  /** Where the rating history starts (seeded players did not start at 0). */
  startRating: number;
  rating: number;
  ratingVersion: number;
  ticketsPerDay: number;
  balance: number;
  refilledOn: string | null;
}

export interface MockLedger {
  id: string;
  playerId: string;
  delta: number;
  reason: 'refill' | 'spend' | 'refund' | 'reward' | 'admin';
  ref: string;
  balanceAfter: number;
  createdAt: string;
}

export interface MockSnapshot {
  id: string;
  label: string;
  takenAt: string;
  takenBy: Actor | null;
  rows: Array<{ rank: number; playerId: string; partnerPlayerId: string | null; displayName: string; rating: number; games: number; wins: number; losses: number }>;
}

export interface MockDb {
  schema: number;
  seq: number;
  rows: MockRow[];
  audit: MockAudit[];
  batches: MockBatch[];
  uploads: MockUpload[];
  releases: MockRelease[];
  pointer: { releaseId: string | null; version: number; movedAt: string | null; movedBy: Actor | null };
  pointerHistory: MockPointerMove[];
  publications: MockPublication[];
  players: MockPlayer[];
  matches: AdminMatchRecord[];
  ledger: MockLedger[];
  snapshots: MockSnapshot[];
  settings: Settings;
  reviews: OpsReview[];
  webhooks: MockWebhook[];
}

export const SEED_UPLOAD_ID = '00000000-0000-4000-8000-00000000f001';

/** Deterministic ids for seeded records (valid v4 UUIDs). */
export const seedId = (group: number, n: number) =>
  `${group.toString(16).padStart(8, '0')}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const staffActor = (role: string): Actor => {
  const member = MOCK_STAFF.find((s) => s.role === role)!;
  return { id: member.id, name: member.name };
};

/** The demo store as it starts: approved seed content, two releases, players and matches. */
export function seedDb(now: number): MockDb {
  const at = (days: number, hours = 0) => new Date(now - days * 86_400_000 - hours * 3_600_000).toISOString();
  const seededAt = at(30);
  const content = seedContent();
  const rows: MockRow[] = [];
  const audit: MockAudit[] = [];
  let n = 0;
  for (const type of TD_CONTENT_TYPES) {
    (content[type] as Data[]).forEach((data, position) => {
      const id = seedId(0x1000 + TD_CONTENT_TYPES.indexOf(type), position + 1);
      rows.push({
        id,
        type,
        status: 'approved',
        version: 1,
        contentVersion: 1,
        approvedVersion: 1,
        position,
        approvedPosition: position,
        note: '',
        lastEditor: SYSTEM,
        updatedBy: SYSTEM,
        approvedBy: SYSTEM,
        approvedAt: seededAt,
        createdAt: seededAt,
        updatedAt: seededAt,
        data,
        approved: JSON.parse(JSON.stringify(data)) as Data,
        batchId: null,
      });
      audit.push({ id: ++n, rowId: id, type, at: seededAt, actor: SYSTEM, action: 'seed', fromStatus: null, toStatus: 'approved', version: 1, contentVersion: 1, batchId: null });
    });
  }

  // Work in progress, so the workflow has something to show.
  const editor = staffActor('editor');
  const drafts: Array<[TdContentType, Data, TdContentStatus]> = [
    ['penalty-questions', { key: 'p99', q: 'Who scored the Euro 2024 opener for Georgia?', display: 'Georges Mikautadze', aliases: ['mikautadze', 'მიქაუტაძე'] }, 'ready'],
    ['cards', { categoryKey: 'legends', key: 'guruli', value: 3, lines: ['Georgia', 'Dinamo Tbilisi'], display: 'Aleksandre Guruli', aliases: ['guruli'], photo: null, imageKey: null }, 'draft'],
  ];
  drafts.forEach(([type, data, status], i) => {
    const id = seedId(0x2000, i + 1);
    const position = rows.filter((r) => r.type === type).length;
    rows.push({
      id,
      type,
      status,
      version: status === 'ready' ? 2 : 1,
      contentVersion: 1,
      approvedVersion: null,
      position,
      approvedPosition: null,
      note: '',
      lastEditor: editor,
      updatedBy: editor,
      approvedBy: null,
      approvedAt: null,
      createdAt: at(1, 3),
      updatedAt: at(1, 2),
      data,
      approved: null,
      batchId: null,
    });
    audit.push({ id: ++n, rowId: id, type, at: at(1, 3), actor: editor, action: 'create', fromStatus: null, toStatus: 'draft', version: 1, contentVersion: 1, batchId: null });
    if (status === 'ready')
      audit.push({ id: ++n, rowId: id, type, at: at(1, 2), actor: editor, action: 'ready', fromStatus: 'draft', toStatus: 'ready', version: 2, contentVersion: 1, batchId: null });
  });

  const older = 'r-00000000000000a1';
  const current = 'r-00000000000000b2';
  // The current release's content is filled in from the seed by the router (completeSeed).
  const releases: MockRelease[] = [
    { id: older, hash: 'a1'.repeat(32), formatVersion: 1, status: 'available', createdAt: at(30), createdBy: SYSTEM, members: [], manifest: null, dailies: null, publicationId: null, replaced: null },
    { id: current, hash: 'b2'.repeat(32), formatVersion: 2, status: 'available', createdAt: at(20), createdBy: staffActor('publisher'), members: [], manifest: null, dailies: null, publicationId: null, replaced: older },
  ];

  const { players, matches, ledger } = seedPlay(now);
  const standings = [...players].filter((p) => p.status === 'active').sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id));
  const today = georgiaToday(now);
  return {
    schema: MOCK_DB_SCHEMA,
    seq: n,
    rows,
    audit,
    batches: [],
    uploads: [
      { id: SEED_UPLOAD_ID, contentType: 'image/png', bytes: 77, width: 16, height: 9, sha256: 'c0'.repeat(32), uploadedBy: staffActor('editor'), createdAt: seededAt, public: true },
    ],
    releases,
    pointer: { releaseId: current, version: 2, movedAt: at(20), movedBy: staffActor('publisher') },
    pointerHistory: [
      { version: 2, releaseId: current, previousReleaseId: older, movedAt: at(20), movedBy: staffActor('publisher') },
      { version: 1, releaseId: older, previousReleaseId: null, movedAt: at(30), movedBy: SYSTEM },
    ],
    publications: [],
    players,
    matches,
    ledger,
    snapshots: [
      {
        id: seedId(0x5000, 1),
        label: 'Week 39 prizes',
        takenAt: at(2),
        takenBy: staffActor('betsson_admin'),
        rows: standings.slice(0, 8).map((p, i) => ({ rank: i + 1, playerId: p.id, partnerPlayerId: p.partnerPlayerId, displayName: p.displayName, rating: p.rating - 10, games: 6, wins: 4, losses: 2 })),
      },
    ],
    settings: {
      ticketsPerDay: { value: 5, effectiveFrom: null, today: 5, version: 0, updatedAt: null, updatedBy: null },
      maintenance: { enabled: false, version: 0, updatedAt: null, updatedBy: null },
    },
    webhooks: seedWebhooks(now, players, matches.filter((m) => m.status === 'settled').map((m) => m.id)),
    reviews: [
      {
        id: seedId(0x6000, 1),
        kind: 'penalty',
        playerId: players[2].id,
        matchId: matches[3].id,
        georgiaDate: addDays(today, -1),
        source: 'correction',
        correctionId: null,
        countedThen: 4,
        countedNow: 3,
        createdAt: at(1),
        status: 'open',
        closedAt: null,
        closedBy: null,
        closingCorrectionId: null,
        note: null,
      },
    ],
  };
}

const NICKNAMES = ['Nino', 'Luka', 'Giorgi', 'Mariam', 'Dato', 'Ana', 'Saba', 'Tamar', 'Levan', 'Keti', 'Nika', 'Elene'];

/** Players and a few decided matches between them, with their rating events and tickets. */
function seedPlay(now: number) {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();
  const players: MockPlayer[] = NICKNAMES.map((displayName, i) => ({
    id: seedId(0x3000, i + 1),
    displayName,
    provider: i < 10 ? 'betsson' : 'demo',
    partnerPlayerId: i < 10 ? `bet-${40017 + i * 13}` : null,
    status: i === 11 ? 'blocked' : 'active',
    avatar: null,
    clubId: i % 3 === 0 ? 'dinamo-tbilisi' : null,
    createdAt: at(60 * 24 * (20 - i)),
    lastSeenAt: at(30 + i * 45),
    startRating: 200,
    rating: 200,
    ratingVersion: 0,
    ticketsPerDay: 5,
    balance: 5,
    refilledOn: georgiaToday(now),
  }));
  const matches: AdminMatchRecord[] = [];
  const ledger: MockLedger[] = [];
  let ledgerId = 800;
  const pairs: Array<[number, number, number, number]> = [
    [0, 1, 3, 1], [2, 3, 2, 4], [4, 5, 5, 2], [0, 2, 1, 2], [6, 7, 3, 3], [1, 3, 4, 0],
    [8, 9, 2, 1], [5, 0, 0, 3], [7, 4, 2, 2], [9, 6, 1, 4], [3, 8, 3, 2], [10, 11, 2, 0],
  ];
  pairs.forEach(([a, b, goalsA, goalsB], i) => {
    const id = seedId(0x4000, i + 1);
    const createdAt = at(60 * 30 - i * 150);
    const settledAt = at(60 * 30 - i * 150 - 7);
    const tie = goalsA === goalsB;
    const winner = tie ? (i % 2 === 0 ? a : b) : goalsA > goalsB ? a : b;
    const seats = [a, b].map((p, seat) => {
      const player = players[p];
      const won = p === winner;
      const delta = won ? 25 : player.rating >= 10 ? -10 : -player.rating;
      player.rating += delta;
      player.ratingVersion += 1;
      const spend: MockLedger = { id: String(++ledgerId), playerId: player.id, delta: -1, reason: 'spend', ref: `spend:${player.id}:match:${id}`, balanceAfter: 4, createdAt };
      ledger.push(spend);
      return {
        seat: (seat === 0 ? 'me' : 'op') as 'me' | 'op',
        playerId: player.id,
        displayName: player.displayName,
        partnerPlayerId: player.partnerPlayerId,
        outcome: (won ? 'win' : 'loss') as 'win' | 'loss',
        ratingDelta: delta,
        ticketRefunded: false,
        earlyForfeit: null,
        ratingEvents: [{ seq: player.ratingVersion, deltaRule: won ? 25 : -10, appliedDelta: delta, ratingAfter: player.rating, correctionId: null, at: settledAt }],
        tickets: [{ id: spend.id, delta: -1, reason: 'spend' as const, ref: spend.ref, balanceAfter: 4, createdAt }],
        deliveries: [],
      };
    });
    for (const seat of seats) {
      seat.deliveries = [
        {
          resultVersion: 1,
          createdAt: settledAt,
          attempts: 1,
          ackedAt: settledAt,
          supersededAt: null,
          result: { matchId: id, resultVersion: 1, winner: seat.outcome === 'win' ? 'me' : 'op', decidedBy: tie ? 'penalties' : 'play' },
        },
      ] as never;
    }
    const t0 = Date.parse(createdAt);
    matches.push({
      id,
      status: 'settled',
      createdAt,
      settledAt,
      decidedBy: tie ? 'penalties' : 'play',
      score: { me: goalsA, op: goalsB },
      roundsCompleted: 3,
      releaseId: 'r-00000000000000b2',
      rulesVersion: 3,
      stateSchema: 5,
      dev: false,
      forfeitDay: null,
      resultVersion: 1,
      correctedAt: null,
      inputs: {
        kept: i !== 4,
        entries:
          i === 4
            ? null
            : // As the match queue keeps them: `<stamp µs>|<input JSON>`.
              (
                [
                  [2_000, { kind: 'ready', seat: 'me' }],
                  [2_400, { kind: 'ready', seat: 'op' }],
                  [9_100, { kind: 'command', seat: 'op', command: { id: 'c1', seat: 'op', kind: 'draw', slot: 3, roundId: 1, step: 1 } }],
                  [15_800, { kind: 'command', seat: 'op', command: { id: 'c2', seat: 'op', kind: 'submit', text: 'messi', roundId: 1, step: 2 } }],
                  [24_000, { kind: 'presence', seat: 'me', connected: false }],
                  [26_500, { kind: 'presence', seat: 'me', connected: true }],
                  [31_200, { kind: 'command', seat: 'me', command: { id: 'c3', seat: 'me', kind: 'buzz', roundId: 2, step: 1 } }],
                  [33_900, { kind: 'command', seat: 'me', command: { id: 'c4', seat: 'me', kind: 'submit', text: 'kaladze', roundId: 2, step: 1 } }],
                  [61_000, { kind: 'command', seat: 'me', command: { id: 'c5', seat: 'me', kind: 'open', slot: 4, roundId: 3, step: 1 } }],
                ] as const
              ).map(([ms, input]) => `${(t0 + ms) * 1000}|${JSON.stringify(input)}`),
        missing: i === 4 ? 'not_recorded' : null,
      },
      players: seats,
      corrections: [],
      reviews: [],
    });
  });
  // One match still being played.
  const live = seedId(0x4000, 99);
  players[1].balance = 4;
  matches.push({
    id: live,
    status: 'live',
    createdAt: at(4),
    settledAt: null,
    decidedBy: null,
    score: null,
    roundsCompleted: null,
    releaseId: 'r-00000000000000b2',
    rulesVersion: 3,
    stateSchema: 5,
    dev: false,
    forfeitDay: null,
    resultVersion: 1,
    correctedAt: null,
    inputs: { kept: false, entries: null, missing: null },
    players: [1, 4].map((p, seat) => ({
      seat: seat === 0 ? ('me' as const) : ('op' as const),
      playerId: players[p].id,
      displayName: players[p].displayName,
      partnerPlayerId: players[p].partnerPlayerId,
      outcome: null,
      ratingDelta: null,
      ticketRefunded: null,
      earlyForfeit: null,
      ratingEvents: [],
      tickets: [],
      deliveries: [],
    })),
    corrections: [],
    reviews: [],
  });
  return { players, matches, ledger };
}
