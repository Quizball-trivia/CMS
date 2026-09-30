/**
 * The release report, publications (publish and roll back, phases advancing
 * with time as the API's worker runs them) and the release history.
 */
import type { TdContentType } from '../admin-api';
import { TD_CONTENT_TYPES } from '../admin-api';
import type { ReleaseReport } from '../contract';
import { daysFrom, georgiaToday, scheduledSet, type DailyCycle } from '../georgia';
import { actorOf, nowIso, rowLabel, type MockContext } from './content';
import type { Member, MockDb, MockPublication, MockRow } from './db';
import { DAILY_TYPE, type Data } from './model';
import { canonicalJson, MockError, paginate, sha256Hex, uuid } from './util';

export const PHASES = ['snapshot', 'validate', 'media', 'artifact', 'available', 'pointer'] as const;
/** How long each mock phase takes. */
export const PHASE_MS = 500;
const NOTIFY_MS = 400;
const COVERAGE_DAYS = 30;
const MATCH = { deck: 12, subjects: 3, clues: 5, boxCategories: 10, boxQuestions: 2, penalties: 20 };
const PRACTICE_NEEDED = { easy: 5, medium: 10, hard: 1 };
const GAMES = ['footballLogic', 'putInOrder', 'careerPath'] as const;

type Issue = ReleaseReport['errors'][number];

const approvedRows = (db: MockDb, type?: TdContentType) =>
  db.rows.filter((row) => row.approvedVersion !== null && row.status !== 'archived' && (!type || row.type === type));

const members = (db: MockDb): Member[] =>
  approvedRows(db).map((row) => ({ type: row.type, id: row.id, label: rowLabel({ ...row, data: row.approved! }), contentVersion: row.approvedVersion! }));

/** The media a release shows: images the approved cards, practice questions and clubs name. */
function usedMedia(db: MockDb): MockRow[] {
  const keys = new Set<string>();
  for (const row of approvedRows(db)) {
    const key = row.approved?.[row.type === 'clubs' ? 'crestImageKey' : 'imageKey'];
    if ((row.type === 'cards' || row.type === 'practice-questions' || row.type === 'clubs') && typeof key === 'string') keys.add(key);
  }
  return approvedRows(db, 'media').filter((row) => keys.has(String(row.approved!.key)));
}

function coverage(db: MockDb, game: (typeof GAMES)[number], today: string) {
  const setting = approvedRows(db, 'daily-settings').find((row) => row.approved!.game === game);
  const cycle = (setting?.approved?.cycle ?? null) as DailyCycle | null;
  const dates = new Map(
    approvedRows(db, 'daily-schedule')
      .filter((row) => row.approved!.game === game)
      .map((row) => [String(row.approved!.date), String(row.approved!.puzzle)]),
  );
  const known = new Set(approvedRows(db, DAILY_TYPE[game]).map((row) => String(row.approved!.puzzle)));
  const missing = daysFrom(today, COVERAGE_DAYS).filter((day) => {
    const set = scheduledSet(dates.get(day), cycle, day);
    return set === null || !known.has(set);
  });
  return { setting, covered: COVERAGE_DAYS - missing.length, missing: missing.slice(0, 30) };
}

function changeCounts(before: Member[], after: Member[]) {
  const was = new Map(before.map((m) => [m.id, m]));
  const now = new Map(after.map((m) => [m.id, m]));
  return TD_CONTENT_TYPES.map((type) => ({
    type,
    added: after.filter((m) => m.type === type && !was.has(m.id)).length,
    changed: after.filter((m) => m.type === type && was.has(m.id) && was.get(m.id)!.contentVersion !== m.contentVersion).length,
    removed: before.filter((m) => m.type === type && !now.has(m.id)).length,
  })).filter((c) => c.added || c.changed || c.removed);
}

export async function report(db: MockDb, now: number): Promise<{ report: ReleaseReport; wouldBe: string }> {
  const today = georgiaToday(now);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const approvedOf = (type: TdContentType) => approvedRows(db, type).map((row) => row.approved!);
  const childCount = (parent: TdContentType, child: TdContentType, need: number) =>
    approvedOf(parent).filter((category) => approvedOf(child).filter((c) => c.categoryKey === category.key).length >= need).length;
  const practice = approvedOf('practice-questions');
  const byDifficulty = (d: string) => practice.filter((q) => q.difficulty === d).length;
  const pools: ReleaseReport['pools'] = {
    cardDecks: { ready: childCount('card-categories', 'cards', MATCH.deck), needed: 1, deckSize: MATCH.deck },
    whoAmI: { ready: approvedOf('whoami-subjects').filter((s) => (s.clues as unknown[]).length >= MATCH.clues).length, needed: MATCH.subjects, clues: MATCH.clues },
    box: { ready: childCount('box-categories', 'box-questions', MATCH.boxQuestions), needed: MATCH.boxCategories, questions: MATCH.boxQuestions },
    penalties: { ready: approvedOf('penalty-questions').length, needed: MATCH.penalties },
    practice: { easy: byDifficulty('easy'), medium: byDifficulty('medium'), hard: byDifficulty('hard'), needed: PRACTICE_NEEDED },
  };
  if (pools.cardDecks.ready < 1) errors.push({ code: 'pool', message: `a match needs a card category with ${MATCH.deck} approved cards` });
  if (pools.whoAmI.ready < MATCH.subjects) errors.push({ code: 'pool', message: `a match needs ${MATCH.subjects} subjects with ${MATCH.clues} clues; ${pools.whoAmI.ready} have them` });
  if (pools.box.ready < MATCH.boxCategories) errors.push({ code: 'pool', message: `a match needs ${MATCH.boxCategories} box categories with ${MATCH.boxQuestions} questions; ${pools.box.ready} have them` });
  if (pools.penalties.ready < MATCH.penalties) errors.push({ code: 'pool', message: `a match needs ${MATCH.penalties} penalty questions; ${pools.penalties.ready} are approved` });
  for (const d of ['easy', 'medium', 'hard'] as const)
    if (pools.practice[d] < PRACTICE_NEEDED[d]) errors.push({ code: 'practice', message: `practice opens with ${PRACTICE_NEEDED[d]} ${d} questions; ${pools.practice[d]} are approved` });
  const dailies = {} as ReleaseReport['dailies'];
  for (const game of GAMES) {
    const c = coverage(db, game, today);
    if (!c.setting) errors.push({ code: 'schema', message: `${game} has no approved settings` });
    if (c.missing.length) errors.push({ code: 'dailies', message: `${game} has no set for ${c.missing.length} of the next ${COVERAGE_DAYS} days, from ${c.missing[0]}` });
    dailies[game] = { covered: c.covered, missing: c.missing };
  }
  const media = usedMedia(db);
  const uploads = media.filter((row) => typeof row.approved!.uploadId === 'string');
  const external = media.filter((row) => typeof row.approved!.url === 'string');
  const noRights = media.filter((row) => ['author', 'license', 'source'].some((f) => !String(row.approved![f] ?? '').trim()));
  for (const row of noRights) warnings.push({ code: 'rights_missing', message: 'an image has no licence, credit or source', ref: { type: 'media', key: String(row.approved!.key) } });
  for (const row of external) warnings.push({ code: 'image_external', message: 'an image is kept by URL, not re-hosted', ref: { type: 'media', key: String(row.approved!.key) } });
  const pending = uploads.filter((row) => !db.uploads.find((u) => u.id === row.approved!.uploadId)?.public).length;
  const after = members(db);
  const wouldBe = `r-${(await sha256Hex(canonicalJson(approvedRows(db).map((row) => [row.type, row.approved, row.approvedPosition]).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))))).slice(0, 16)}`;
  const current = db.releases.find((r) => r.id === db.pointer.releaseId) ?? null;
  const releaseId = pending ? null : wouldBe;
  const out: ReleaseReport = {
    ok: errors.length === 0,
    releaseId,
    currentReleaseId: db.pointer.releaseId,
    unchanged: releaseId !== null && releaseId === db.pointer.releaseId,
    checkedAt: new Date(now).toISOString(),
    from: today,
    days: COVERAGE_DAYS,
    errors,
    warnings,
    pools,
    dailies,
    media: { images: media.length, uploaded: uploads.length, external: external.length, missingRights: noRights.length, pending },
    changes: { complete: current === null || current.members.length > 0, types: changeCounts(current?.members ?? [], after) },
  };
  return { report: out, wouldBe };
}

export async function validate(ctx: MockContext) {
  return (await report(ctx.db, ctx.now)).report;
}

/* ── publications ─────────────────────────────────────────────────── */

export function publicationView(p: MockPublication) {
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    phases: PHASES.map((name, i) => {
      let state: 'pending' | 'done' | 'skipped' | 'failed';
      if (p.kind === 'rollback' && name !== 'pointer') state = 'skipped';
      else if (i < p.done) state = 'done';
      else if (i === p.done && (p.status === 'failed' || p.status === 'failing')) state = 'failed';
      else state = 'pending';
      return { name, state };
    }),
    releaseId: p.releaseId,
    previousReleaseId: p.previousReleaseId,
    pointerVersion: p.pointerVersion,
    changed: p.changed,
    requestedBy: p.requestedBy,
    requestedAt: p.requestedAt,
    updatedAt: p.updatedAt,
    finishedAt: p.finishedAt,
    attempts: p.done > 0 ? 1 : 0,
    error: p.error,
    report: p.report,
    notify: p.notify,
  };
}

function movePointer(db: MockDb, p: MockPublication, now: number, target: string) {
  const at = new Date(now).toISOString();
  if (db.pointer.version !== p.expectedPointerVersion) {
    p.status = 'failed';
    p.error = { code: 'pointer_moved', message: 'The current release moved while this ran; the release stays stored' };
    p.finishedAt = at;
    return;
  }
  if (db.pointer.releaseId === target) {
    p.changed = false;
  } else {
    const previous = db.pointer.releaseId;
    db.pointer = { releaseId: target, version: db.pointer.version + 1, movedAt: at, movedBy: p.requestedBy };
    db.pointerHistory.unshift({ version: db.pointer.version, releaseId: target, previousReleaseId: previous, movedAt: at, movedBy: p.requestedBy });
    p.changed = true;
    p.pointerVersion = db.pointer.version;
  }
  p.done = PHASES.length;
  p.status = 'published';
  p.finishedAt = at;
  p.notify = { state: 'pending', attempts: 0, at: null };
}

/** Runs every publication's phases up to `now`, as the server's worker would have. */
export function advance(db: MockDb, now: number) {
  for (const p of db.publications) {
    if (p.status === 'published' && p.notify.state === 'pending' && now - Date.parse(p.finishedAt!) >= NOTIFY_MS) {
      p.notify = { state: 'sent', attempts: 1, at: new Date(now).toISOString() };
      p.updatedAt = p.notify.at!;
    }
    if (p.status !== 'running') continue;
    const due = Math.min(PHASES.length, Math.floor((now - Date.parse(p.requestedAt)) / PHASE_MS));
    if (p.kind === 'rollback') {
      if (due >= 1) movePointer(db, p, now, p.releaseId!);
      p.updatedAt = new Date(now).toISOString();
      continue;
    }
    while (p.status === 'running' && p.done < due) {
      const phase = PHASES[p.done];
      if (phase === 'validate' && !p.report?.ok) {
        p.status = 'failed';
        p.error = { code: 'validation_failed', message: 'The approved content did not validate' };
        p.finishedAt = new Date(now).toISOString();
        break;
      }
      if (phase === 'media') {
        const used = new Set(p.members.filter((m) => m.type === 'media').map((m) => db.rows.find((r) => r.id === m.id)?.approved?.uploadId));
        for (const upload of db.uploads) if (used.has(upload.id)) upload.public = true;
      }
      if (phase === 'available') {
        const id = p.wouldBe!;
        if (!db.releases.some((r) => r.id === id))
          db.releases.push({ id, hash: `${id.slice(2)}${'0'.repeat(48)}`, formatVersion: 2, status: 'available', createdAt: new Date(now).toISOString(), createdBy: p.requestedBy, members: p.members, publicationId: p.id, replaced: db.pointer.releaseId });
        p.releaseId = id;
      }
      if (phase === 'pointer') {
        movePointer(db, p, now, p.releaseId!);
        break;
      }
      p.done += 1;
    }
    p.updatedAt = new Date(now).toISOString();
  }
}

function byKey(db: MockDb, idemKey: string, kind: MockPublication['kind'], target: string | null) {
  const found = db.publications.find((p) => p.idemKey === idemKey);
  if (!found) return null;
  if (found.kind !== kind || (kind === 'rollback' && found.releaseId !== target))
    throw new MockError(409, 'idempotency_conflict', 'This key was used for another request');
  return found;
}

function holdSlot(db: MockDb) {
  const active = db.publications.find((p) => p.status === 'running' || p.status === 'failing');
  if (active) throw new MockError(409, 'publication_in_progress', 'Another publish or rollback is under way', { publicationId: active.id });
}

export async function publish(ctx: MockContext, idemKey: string) {
  const found = byKey(ctx.db, idemKey, 'publish', null);
  if (found) return { status: 200, body: publicationView(found) };
  holdSlot(ctx.db);
  const snapshot = await report(ctx.db, ctx.now);
  const p: MockPublication = {
    id: uuid(),
    idemKey,
    kind: 'publish',
    status: 'running',
    done: 0,
    releaseId: null,
    previousReleaseId: ctx.db.pointer.releaseId,
    expectedPointerVersion: ctx.db.pointer.version,
    pointerVersion: null,
    changed: null,
    requestedBy: actorOf(ctx),
    requestedAt: nowIso(ctx),
    updatedAt: nowIso(ctx),
    finishedAt: null,
    error: null,
    report: snapshot.report,
    members: members(ctx.db),
    wouldBe: snapshot.wouldBe,
    notify: { state: 'none', attempts: 0, at: null },
  };
  ctx.db.publications.push(p);
  return { status: 202, body: publicationView(p) };
}

export function rollback(ctx: MockContext, target: string, idemKey: string) {
  const found = byKey(ctx.db, idemKey, 'rollback', target);
  if (found) return { status: 200, body: publicationView(found) };
  const release = ctx.db.releases.find((r) => r.id === target);
  if (!release) throw new MockError(404, 'not_found', 'No such release');
  const was = ctx.db.pointerHistory.some((move) => move.releaseId === target);
  if (release.status !== 'available' || !was || ctx.db.pointer.releaseId === target)
    throw new MockError(409, 'not_rollback_target', 'Only an available release that was current before, and is not now');
  holdSlot(ctx.db);
  const p: MockPublication = {
    id: uuid(),
    idemKey,
    kind: 'rollback',
    status: 'running',
    done: PHASES.length - 1,
    releaseId: target,
    previousReleaseId: ctx.db.pointer.releaseId,
    expectedPointerVersion: ctx.db.pointer.version,
    pointerVersion: null,
    changed: null,
    requestedBy: actorOf(ctx),
    requestedAt: nowIso(ctx),
    updatedAt: nowIso(ctx),
    finishedAt: null,
    error: null,
    report: null,
    members: [],
    wouldBe: null,
    notify: { state: 'none', attempts: 0, at: null },
  };
  ctx.db.publications.push(p);
  return { status: 202, body: publicationView(p) };
}

export function getPublication(ctx: MockContext, id: string) {
  const found = ctx.db.publications.find((p) => p.id === id);
  if (!found) throw new MockError(404, 'not_found', 'No such publication');
  return publicationView(found);
}

function summary(db: MockDb, id: string) {
  const r = db.releases.find((release) => release.id === id)!;
  return {
    id: r.id,
    hash: r.hash,
    formatVersion: r.formatVersion,
    status: r.status,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    current: db.pointer.releaseId === r.id,
    wasCurrent: db.pointerHistory.some((move) => move.releaseId === r.id),
    members: r.members.length,
    publicationId: r.publicationId,
  };
}

export function listReleases(ctx: MockContext, query: { cursor?: string; limit?: string }) {
  const { db } = ctx;
  const sorted = [...db.releases].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = paginate(sorted, query, 'releases');
  const active = db.publications.find((p) => p.status === 'running' || p.status === 'failing');
  return {
    pointer: db.pointer,
    active: active ? publicationView(active) : null,
    items: page.items.map((r) => summary(db, r.id)),
    nextCursor: page.nextCursor,
    history: db.pointerHistory.slice(0, 20),
  };
}

export function releaseDetail(ctx: MockContext, id: string) {
  const { db } = ctx;
  const release = db.releases.find((r) => r.id === id);
  if (!release) throw new MockError(404, 'not_found', 'No such release');
  const count = (type: TdContentType) => release.members.filter((m) => m.type === type).length;
  const dataOf = (m: Member): Data | null => db.rows.find((r) => r.id === m.id)?.approved ?? null;
  const practice = release.members.filter((m) => m.type === 'practice-questions').map(dataOf);
  const daily = (game: (typeof GAMES)[number]) => {
    const items = release.members.filter((m) => m.type === DAILY_TYPE[game]);
    const settings = release.members.map(dataOf).find((d) => d?.game === game && 'seconds' in d);
    return {
      sets: new Set(items.map((m) => dataOf(m)?.puzzle)).size,
      items: items.length,
      scheduledDates: release.members.filter((m) => m.type === 'daily-schedule' && dataOf(m)?.game === game).length,
      cycle: ((settings?.cycle as DailyCycle | null)?.sets ?? []).length,
      coveredDays: items.length ? coverage(db, game, georgiaToday(ctx.now)).covered : 0,
    };
  };
  const against = release.replaced ? db.releases.find((r) => r.id === release.replaced) : undefined;
  const ref = (m: Member) => ({ type: m.type, id: m.id, label: m.label, contentVersion: m.contentVersion });
  return {
    release: summary(db, id),
    manifest: {
      cards: { categories: count('card-categories'), cards: count('cards') },
      whoAmI: { subjects: count('whoami-subjects') },
      box: { categories: count('box-categories'), questions: count('box-questions') },
      penalties: { questions: count('penalty-questions') },
      dailies: { footballLogic: daily('footballLogic'), putInOrder: daily('putInOrder'), careerPath: daily('careerPath') },
      practice: {
        easy: practice.filter((d) => d?.difficulty === 'easy').length,
        medium: practice.filter((d) => d?.difficulty === 'medium').length,
        hard: practice.filter((d) => d?.difficulty === 'hard').length,
      },
      clubs: count('clubs'),
      media: count('media'),
    },
    members: release.members.map(ref),
    diff: against
      ? {
          against: against.id,
          complete: against.members.length > 0 && release.members.length > 0,
          types: TD_CONTENT_TYPES.map((type) => {
            const was = new Map(against.members.filter((m) => m.type === type).map((m) => [m.id, m]));
            const now = release.members.filter((m) => m.type === type);
            const ids = new Set(now.map((m) => m.id));
            return {
              type,
              added: now.filter((m) => !was.has(m.id)).map(ref),
              changed: now
                .filter((m) => was.has(m.id) && was.get(m.id)!.contentVersion !== m.contentVersion)
                .map((m) => ({ type, id: m.id, label: m.label, from: was.get(m.id)!.contentVersion, to: m.contentVersion })),
              removed: [...was.values()].filter((m) => !ids.has(m.id)).map(ref),
            };
          }).filter((t) => t.added.length || t.changed.length || t.removed.length),
        }
      : null,
  };
}
