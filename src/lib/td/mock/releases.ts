/**
 * The release report, publications (publish and roll back, phases advancing
 * with time as the API's worker runs them) and the release history. What a
 * release holds is taken as the API's envelope takes it and fixed when the
 * release is made, so history never changes with later edits.
 */
import type { TdContentType } from '../admin-api';
import { TD_CONTENT_TYPES } from '../admin-api';
import type { ReleaseReport } from '../contract';
import { daysFrom, georgiaToday, scheduledSet, type DailyCycle } from '../georgia';
import { actorOf, nowIso, rowLabel, type MockContext } from './content';
import type { DailySnapshot, Manifest, Member, MockDb, MockPublication, MockRow, ReleaseSnapshot } from './db';
import { DAILY_TYPE } from './model';
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

const imageField = (type: TdContentType) => (type === 'clubs' ? 'crestImageKey' : type === 'cards' || type === 'practice-questions' ? 'imageKey' : null);

/**
 * The rows a release published now holds, as the API's envelope takes them:
 * every approved, live row, but cards and box questions only through an
 * approved category, and only the images the release shows.
 */
export function releaseRows(db: MockDb): MockRow[] {
  const keys = (type: TdContentType) => new Set(approvedRows(db, type).map((row) => String(row.approved!.key)));
  const cardCategories = keys('card-categories');
  const boxCategories = keys('box-categories');
  const rows = approvedRows(db).filter((row) => {
    if (row.type === 'cards') return cardCategories.has(String(row.approved!.categoryKey));
    if (row.type === 'box-questions') return boxCategories.has(String(row.approved!.categoryKey));
    return row.type !== 'media';
  });
  const shown = new Set<string>();
  for (const row of rows) {
    const field = imageField(row.type);
    const key = field ? row.approved![field] : null;
    if (typeof key === 'string') shown.add(key);
  }
  return [...rows, ...approvedRows(db, 'media').filter((row) => shown.has(String(row.approved!.key)))];
}

const approvedOf = (rows: MockRow[], type: TdContentType) => rows.filter((row) => row.type === type).map((row) => row.approved!);

function dailiesOf(rows: MockRow[]): DailySnapshot {
  const out = {} as DailySnapshot;
  for (const game of GAMES) {
    const settings = approvedOf(rows, 'daily-settings').find((d) => d.game === game);
    out[game] = {
      dates: Object.fromEntries(approvedOf(rows, 'daily-schedule').filter((d) => d.game === game).map((d) => [String(d.date), String(d.puzzle)])),
      cycle: (settings?.cycle ?? null) as DailyCycle | null,
      known: [...new Set(approvedOf(rows, DAILY_TYPE[game]).map((d) => String(d.puzzle)))],
    };
  }
  return out;
}

function coverage(daily: DailySnapshot[keyof DailySnapshot], today: string) {
  const missing = daysFrom(today, COVERAGE_DAYS).filter((day) => {
    const set = scheduledSet(daily.dates[day], daily.cycle, day);
    return set === null || !daily.known.includes(set);
  });
  return { covered: COVERAGE_DAYS - missing.length, missing: missing.slice(0, 30) };
}

function manifestOf(rows: MockRow[], dailies: DailySnapshot, today: string): Manifest {
  const count = (type: TdContentType) => rows.filter((row) => row.type === type).length;
  const practice = approvedOf(rows, 'practice-questions');
  const daily = (game: (typeof GAMES)[number]) => ({
    sets: dailies[game].known.length,
    items: count(DAILY_TYPE[game]),
    scheduledDates: Object.keys(dailies[game].dates).length,
    cycle: dailies[game].cycle?.sets.length ?? 0,
    coveredDays: coverage(dailies[game], today).covered,
  });
  return {
    cards: { categories: count('card-categories'), cards: count('cards') },
    whoAmI: { subjects: count('whoami-subjects') },
    box: { categories: count('box-categories'), questions: count('box-questions') },
    penalties: { questions: count('penalty-questions') },
    dailies: { footballLogic: daily('footballLogic'), putInOrder: daily('putInOrder'), careerPath: daily('careerPath') },
    practice: { easy: practice.filter((d) => d.difficulty === 'easy').length, medium: practice.filter((d) => d.difficulty === 'medium').length, hard: practice.filter((d) => d.difficulty === 'hard').length },
    clubs: count('clubs'),
    media: count('media'),
  };
}

/** What a release made now holds: members, manifest, dailies and uploads. */
export function snapshotOf(db: MockDb, now: number): ReleaseSnapshot {
  const rows = releaseRows(db);
  const dailies = dailiesOf(rows);
  return {
    members: rows.map((row) => ({ type: row.type, id: row.id, label: rowLabel({ ...row, data: row.approved! }), contentVersion: row.approvedVersion! })),
    manifest: manifestOf(rows, dailies, georgiaToday(now)),
    dailies,
    uploads: approvedOf(rows, 'media').flatMap((d) => (typeof d.uploadId === 'string' ? [d.uploadId] : [])),
  };
}

/** The seeded current release holds the seed's content. */
export function completeSeed(db: MockDb, now: number) {
  const current = db.releases.find((r) => r.id === db.pointer.releaseId);
  if (current && current.manifest === null) Object.assign(current, snapshotOf(db, now));
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

export async function report(db: MockDb, now: number): Promise<{ report: ReleaseReport; releaseId: string; snapshot: ReleaseSnapshot }> {
  const today = georgiaToday(now);
  const rows = releaseRows(db);
  const snapshot = snapshotOf(db, now);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const childCount = (parent: TdContentType, child: TdContentType, need: number) =>
    approvedOf(rows, parent).filter((category) => approvedOf(rows, child).filter((c) => c.categoryKey === category.key).length >= need).length;
  const practice = snapshot.manifest.practice;
  const pools: ReleaseReport['pools'] = {
    cardDecks: { ready: childCount('card-categories', 'cards', MATCH.deck), needed: 1, deckSize: MATCH.deck },
    whoAmI: { ready: approvedOf(rows, 'whoami-subjects').filter((s) => (s.clues as unknown[]).length >= MATCH.clues).length, needed: MATCH.subjects, clues: MATCH.clues },
    box: { ready: childCount('box-categories', 'box-questions', MATCH.boxQuestions), needed: MATCH.boxCategories, questions: MATCH.boxQuestions },
    penalties: { ready: snapshot.manifest.penalties.questions, needed: MATCH.penalties },
    practice: { ...practice, needed: PRACTICE_NEEDED },
  };
  if (pools.cardDecks.ready < 1) errors.push({ code: 'pool', message: `a match needs a card category with ${MATCH.deck} approved cards` });
  if (pools.whoAmI.ready < MATCH.subjects) errors.push({ code: 'pool', message: `a match needs ${MATCH.subjects} subjects with ${MATCH.clues} clues; ${pools.whoAmI.ready} have them` });
  if (pools.box.ready < MATCH.boxCategories) errors.push({ code: 'pool', message: `a match needs ${MATCH.boxCategories} box categories with ${MATCH.boxQuestions} questions; ${pools.box.ready} have them` });
  if (pools.penalties.ready < MATCH.penalties) errors.push({ code: 'pool', message: `a match needs ${MATCH.penalties} penalty questions; ${pools.penalties.ready} are approved` });
  for (const d of ['easy', 'medium', 'hard'] as const)
    if (practice[d] < PRACTICE_NEEDED[d]) errors.push({ code: 'practice', message: `practice opens with ${PRACTICE_NEEDED[d]} ${d} questions; ${practice[d]} are approved` });
  const dailies = {} as ReleaseReport['dailies'];
  for (const game of GAMES) {
    if (!approvedOf(rows, 'daily-settings').some((d) => d.game === game)) errors.push({ code: 'schema', message: `${game} has no approved settings` });
    const c = coverage(snapshot.dailies[game], today);
    if (c.missing.length) errors.push({ code: 'dailies', message: `${game} has no set for ${c.missing.length} of the next ${COVERAGE_DAYS} days, from ${c.missing[0]}` });
    dailies[game] = c;
  }
  const shown = new Set(approvedOf(rows, 'media').map((d) => String(d.key)));
  for (const row of rows) {
    const field = imageField(row.type);
    const key = field ? row.approved![field] : null;
    if (typeof key === 'string' && !shown.has(key)) errors.push({ code: 'schema', message: `${row.type} ${String(row.approved!.key)}: its image ${key} is not approved`, ref: { type: row.type, key: String(row.approved!.key) } });
  }
  const media = approvedOf(rows, 'media');
  const uploads = media.filter((d) => typeof d.uploadId === 'string');
  const external = media.filter((d) => typeof d.url === 'string');
  // Contract 8: an image needs no rights; they are only counted.
  const noRights = media.filter((d) => ['author', 'license', 'source'].some((f) => !String(d[f] ?? '').trim()));
  for (const d of external) warnings.push({ code: 'image_external', message: 'an image is kept by URL, not re-hosted', ref: { type: 'media', key: String(d.key) } });
  const pending = uploads.filter((d) => !db.uploads.find((u) => u.id === d.uploadId)?.public).length;
  const releaseId = `r-${(await sha256Hex(canonicalJson(rows.map((row) => [row.type, row.approved, row.approvedPosition]).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))))).slice(0, 16)}`;
  const current = db.releases.find((r) => r.id === db.pointer.releaseId) ?? null;
  const changes = changeCounts(current?.members ?? [], snapshot.members);
  const shownId = pending ? null : releaseId;
  return {
    report: {
      ok: errors.length === 0,
      releaseId: shownId,
      currentReleaseId: db.pointer.releaseId,
      // The seeded releases' ids are not hashes of their content, so "no member changed" counts as the same release too.
      unchanged: shownId !== null && (shownId === db.pointer.releaseId || (current !== null && current.members.length > 0 && changes.length === 0)),
      checkedAt: new Date(now).toISOString(),
      from: today,
      days: COVERAGE_DAYS,
      errors,
      warnings,
      pools,
      dailies,
      media: { images: media.length, uploaded: uploads.length, external: external.length, missingRights: noRights.length, pending },
      changes: { complete: current === null || current.members.length > 0, types: changes },
    },
    releaseId,
    snapshot,
  };
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
      if (due >= 1) {
        // Checked again as it runs, as the API does: the Georgian day may have turned since it was asked.
        const target = db.releases.find((r) => r.id === p.releaseId);
        if (!target || unrunnableGame(target, georgiaToday(now))) {
          p.status = 'failed';
          p.error = { code: 'release_unavailable', message: 'The release no longer serves every daily game today' };
          p.finishedAt = new Date(now).toISOString();
        } else movePointer(db, p, now, p.releaseId!);
      }
      p.updatedAt = new Date(now).toISOString();
      continue;
    }
    const snapshot = p.snapshot!;
    while (p.status === 'running' && p.done < due) {
      const phase = PHASES[p.done];
      if (phase === 'validate' && !p.report?.ok) {
        p.status = 'failed';
        p.error = { code: 'validation_failed', message: 'The approved content did not validate' };
        p.finishedAt = new Date(now).toISOString();
        break;
      }
      if (phase === 'media') for (const upload of db.uploads) if (snapshot.uploads.includes(upload.id)) upload.public = true;
      if (phase === 'available') {
        if (!db.releases.some((r) => r.id === snapshot.releaseId))
          db.releases.push({
            id: snapshot.releaseId,
            hash: `${snapshot.releaseId.slice(2)}${'0'.repeat(48)}`,
            formatVersion: 2,
            status: 'available',
            createdAt: new Date(now).toISOString(),
            createdBy: p.requestedBy,
            members: snapshot.members,
            manifest: snapshot.manifest,
            dailies: snapshot.dailies,
            publicationId: p.id,
            replaced: db.pointer.releaseId,
          });
        p.releaseId = snapshot.releaseId;
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

/** A daily game the release has no set for on `today`, or null when it serves them all. */
function unrunnableGame(release: MockDb['releases'][number], today: string): string | null {
  return (
    GAMES.find((game) => {
      const daily = release.dailies?.[game];
      const set = daily ? scheduledSet(daily.dates[today], daily.cycle, today) : null;
      return set === null || !daily!.known.includes(set);
    }) ?? null
  );
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

const base = (ctx: MockContext) => ({
  id: uuid(),
  status: 'running' as const,
  previousReleaseId: ctx.db.pointer.releaseId,
  expectedPointerVersion: ctx.db.pointer.version,
  pointerVersion: null,
  changed: null,
  requestedBy: actorOf(ctx),
  requestedAt: nowIso(ctx),
  updatedAt: nowIso(ctx),
  finishedAt: null,
  error: null,
  notify: { state: 'none' as const, attempts: 0, at: null },
});

export async function publish(ctx: MockContext, idemKey: string) {
  const found = byKey(ctx.db, idemKey, 'publish', null);
  if (found) return { status: 200, body: publicationView(found) };
  holdSlot(ctx.db);
  const made = await report(ctx.db, ctx.now);
  const p: MockPublication = { ...base(ctx), idemKey, kind: 'publish', done: 0, releaseId: null, report: made.report, snapshot: { ...made.snapshot, releaseId: made.releaseId } };
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
  // It must still give every daily game a set today (the API's rollbackGaps).
  const gap = unrunnableGame(release, georgiaToday(ctx.now));
  if (gap) throw new MockError(409, 'release_unrunnable', `This release has no ${gap} set for today`);
  holdSlot(ctx.db);
  const p: MockPublication = { ...base(ctx), idemKey, kind: 'rollback', done: PHASES.length - 1, releaseId: target, report: null, snapshot: null };
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

const EMPTY_DAILY = { sets: 0, items: 0, scheduledDates: 0, cycle: 0, coveredDays: 0 };
const EMPTY_MANIFEST: Manifest = {
  cards: { categories: 0, cards: 0 },
  whoAmI: { subjects: 0 },
  box: { categories: 0, questions: 0 },
  penalties: { questions: 0 },
  dailies: { footballLogic: EMPTY_DAILY, putInOrder: EMPTY_DAILY, careerPath: EMPTY_DAILY },
  practice: { easy: 0, medium: 0, hard: 0 },
  clubs: 0,
  media: 0,
};

export function releaseDetail(ctx: MockContext, id: string) {
  const { db } = ctx;
  const release = db.releases.find((r) => r.id === id);
  if (!release) throw new MockError(404, 'not_found', 'No such release');
  const against = release.replaced ? db.releases.find((r) => r.id === release.replaced) : undefined;
  const ref = (m: Member) => ({ type: m.type, id: m.id, label: m.label, contentVersion: m.contentVersion });
  return {
    release: summary(db, id),
    manifest: release.manifest ?? EMPTY_MANIFEST,
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
