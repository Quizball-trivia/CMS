/**
 * Content rows and their workflow, as migrations 0013 and 0015 enforce them:
 * the revision check, allowed jumps, self-approval, approval of a category
 * with its children, dependencies, the editor archive rule, fixed
 * fields, unique keys, list filters and cursors, history.
 */
import type { TdContentType } from '../admin-api';
import type { TdRole } from '@/types/td';
import { SYSTEM, type Actor, type MockAudit, type MockDb, type MockRow } from './db';
import { CHILD_TYPE, DAILY_TYPE, MOCK_MODELS, type Data } from './model';
import { isPublisher } from './staff';
import { clone, equal, MockError, paginate, uuid, validation } from './util';

export interface MockContext {
  db: MockDb;
  staff: { id: string; name: string; role: TdRole };
  now: number;
}

export const actorOf = (ctx: MockContext): Actor => ({ id: ctx.staff.id, name: ctx.staff.name });
export const nowIso = (ctx: MockContext) => new Date(ctx.now).toISOString();

export function rowView(row: MockRow) {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    contentVersion: row.contentVersion,
    approvedVersion: row.approvedVersion,
    position: row.position,
    approvedPosition: row.approvedPosition,
    note: row.note,
    lastEditor: row.lastEditor,
    updatedBy: row.updatedBy,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    data: row.data,
    approved: row.approved,
  };
}

export function rowLabel(row: MockRow): string {
  return MOCK_MODELS[row.type].label(row.data);
}

export function audit(
  ctx: MockContext,
  row: MockRow,
  action: MockAudit['action'],
  fromStatus: MockRow['status'] | null,
  batchId: string | null = null,
  actor: Actor = actorOf(ctx),
) {
  ctx.db.audit.push({
    id: ++ctx.db.seq,
    rowId: row.id,
    type: row.type,
    at: nowIso(ctx),
    actor,
    action,
    fromStatus,
    toStatus: action === 'delete' ? null : row.status,
    version: action === 'delete' ? null : row.version,
    contentVersion: action === 'delete' ? null : row.contentVersion,
    batchId,
  });
}

export const rowsOf = (db: MockDb, type: TdContentType) => db.rows.filter((row) => row.type === type);
const live = (row: MockRow) => row.status !== 'archived';

export function findRow(db: MockDb, type: TdContentType, id: string): MockRow {
  const row = db.rows.find((r) => r.type === type && r.id === id);
  if (!row) throw new MockError(404, 'not_found', 'No such row');
  return row;
}

function checkVersion(row: MockRow, version: number) {
  if (row.version !== version)
    throw new MockError(409, 'revision_conflict', 'Someone changed this row since you read it', { current: rowView(row) });
}

function touch(ctx: MockContext, row: MockRow) {
  row.version += 1;
  row.updatedBy = actorOf(ctx);
  row.updatedAt = nowIso(ctx);
}

/* ── what refers to what ─────────────────────────────────────────── */

const findByKey = (db: MockDb, type: TdContentType, key: string) => rowsOf(db, type).find((row) => row.data.key === key);

/** An image a release can show: approved, not archived. */
function mediaReady(db: MockDb, key: string): boolean {
  const row = findByKey(db, 'media', key);
  return Boolean(row && live(row) && row.approvedVersion !== null);
}

const approvedLive = (row: MockRow | undefined) => Boolean(row && live(row) && row.approvedVersion !== null);

function puzzleHasApproved(db: MockDb, game: keyof typeof DAILY_TYPE, puzzle: string, except?: string): boolean {
  return rowsOf(db, DAILY_TYPE[game]).some((row) => row.id !== except && approvedLive(row) && row.approved?.puzzle === puzzle);
}

export type DependencyRef = { type: TdContentType; id?: string; key?: string; puzzle?: string; status?: string };

/** What an approval (or a restore, of the approved content) needs approved first. */
export function unapprovedRefs(db: MockDb, type: TdContentType, doc: Data | null): DependencyRef[] {
  if (!doc) return [];
  if (type === 'practice-questions' || type === 'cards' || type === 'clubs') {
    const key = doc[type === 'clubs' ? 'crestImageKey' : 'imageKey'];
    return typeof key === 'string' && !mediaReady(db, key) ? [{ type: 'media', key }] : [];
  }
  if (type === 'career-path') {
    const keys = [...new Set((doc.clubs as Data[]).map((club) => club.clubKey).filter((key): key is string => typeof key === 'string'))];
    return keys.filter((key) => !approvedLive(findByKey(db, 'clubs', key))).map((key) => ({ type: 'clubs' as const, key }));
  }
  if (type === 'daily-schedule' || type === 'daily-settings') {
    const game = doc.game as keyof typeof DAILY_TYPE;
    const puzzles = type === 'daily-schedule' ? [String(doc.puzzle)] : (((doc.cycle as { sets: string[] } | null)?.sets ?? []) as string[]);
    return puzzles.filter((p) => !puzzleHasApproved(db, game, p)).map((puzzle) => ({ type: DAILY_TYPE[game], puzzle }));
  }
  return [];
}

const gameOfType = (type: TdContentType) =>
  (Object.entries(DAILY_TYPE).find(([, t]) => t === type)?.[0] ?? null) as keyof typeof DAILY_TYPE | null;

/** Whether the calendar or a cycle names `puzzle` and no other question would give it one. */
function puzzleNeeded(db: MockDb, type: TdContentType, puzzle: string, except: string): boolean {
  const game = gameOfType(type);
  if (!game) return false;
  const named =
    rowsOf(db, 'daily-schedule').some((s) => live(s) && s.data.game === game && (s.data.puzzle === puzzle || s.approved?.puzzle === puzzle)) ||
    rowsOf(db, 'daily-settings').some((s) => {
      const sets = (d: Data | null) => ((d?.cycle as { sets: string[] } | null)?.sets ?? []) as string[];
      return live(s) && s.data.game === game && (sets(s.data).includes(puzzle) || sets(s.approved).includes(puzzle));
    });
  return named && !puzzleHasApproved(db, game, puzzle, except);
}

/** Whether live content still uses a row (archive refuses it). */
function referenced(db: MockDb, row: MockRow): boolean {
  if (row.type === 'media') {
    const key = row.data.key;
    const uses = (type: TdContentType, field: string) =>
      rowsOf(db, type).some((r) => live(r) && (r.data[field] === key || r.approved?.[field] === key));
    return uses('practice-questions', 'imageKey') || uses('cards', 'imageKey') || uses('clubs', 'crestImageKey');
  }
  if (row.type === 'clubs') {
    const has = (d: Data | null) => ((d?.clubs as Data[] | undefined) ?? []).some((club) => club.clubKey === row.data.key);
    return rowsOf(db, 'career-path').some((r) => live(r) && (has(r.data) || has(r.approved)));
  }
  const puzzle = row.approved?.puzzle;
  return typeof puzzle === 'string' && puzzleNeeded(db, row.type, puzzle, row.id);
}

/** Every other staff member (or the seed) who ever wrote to the row. */
const writtenByOthers = (db: MockDb, row: MockRow, staffId: string) =>
  db.audit.some((entry) => entry.rowId === row.id && entry.actor.id !== staffId);

/* ── writes ───────────────────────────────────────────────────────── */

/** Rules beyond the shape, references that must exist, and the media rules of migration 0015. */
function checkWrite(db: MockDb, type: TdContentType, data: Data, before: MockRow | null) {
  const model = MOCK_MODELS[type];
  const issues = model.rules(data);
  if (issues.length) throw validation(issues);
  for (const ref of model.refs(data)) {
    if (!findByKey(db, ref.type, ref.key))
      throw validation([{ path: ref.path, message: 'This refers to content that does not exist' }]);
  }
  if (type === 'media') {
    if (data.url !== null && (before === null || data.url !== before.data.url))
      throw validation([{ path: 'data', message: 'new images are uploaded; an image by URL is kept only as it was' }]);
    const uploadId = data.uploadId;
    if (
      typeof uploadId === 'string' &&
      (before === null || uploadId !== before.data.uploadId || data.width !== before.data.width || data.height !== before.data.height)
    ) {
      const upload = db.uploads.find((u) => u.id === uploadId);
      if (!upload) throw validation([{ path: 'data.uploadId', message: 'This refers to content that does not exist' }]);
      if (upload.width !== data.width || upload.height !== data.height)
        throw validation([{ path: 'data', message: `the uploaded image is ${upload.width} × ${upload.height} pixels` }]);
    }
  }
}

export function createRow(
  ctx: MockContext,
  type: TdContentType,
  body: { data: Data; position?: number; note?: string },
  batchId: string | null = null,
): MockRow {
  const { db } = ctx;
  const model = MOCK_MODELS[type];
  checkWrite(db, type, body.data, null);
  const identity = model.identity(body.data);
  if (rowsOf(db, type).some((row) => model.identity(row.data) === identity)) throw new MockError(409, 'already_exists', 'This key is taken');
  const positions = rowsOf(db, type).map((row) => row.position);
  const actor = actorOf(ctx);
  const row: MockRow = {
    id: uuid(),
    type,
    status: 'draft',
    version: 1,
    contentVersion: 1,
    approvedVersion: null,
    position: body.position ?? (positions.length ? Math.max(...positions) + 1 : 0),
    approvedPosition: null,
    note: body.note ?? '',
    lastEditor: actor,
    updatedBy: actor,
    approvedBy: null,
    approvedAt: null,
    createdAt: nowIso(ctx),
    updatedAt: nowIso(ctx),
    data: clone(body.data),
    approved: null,
    batchId,
  };
  db.rows.push(row);
  audit(ctx, row, 'create', null, batchId);
  return row;
}

export function editRow(
  ctx: MockContext,
  type: TdContentType,
  id: string,
  body: { version: number; data: Data; position?: number; note?: string },
): MockRow {
  const row = findRow(ctx.db, type, id);
  checkVersion(row, body.version);
  if (row.status === 'archived') throw new MockError(403, 'forbidden_transition', 'an archived row is restored before it is edited');
  for (const field of MOCK_MODELS[type].fixed) {
    if (!equal(body.data[field], row.data[field])) throw validation([{ path: 'data', message: `${field} never changes` }]);
  }
  checkWrite(ctx.db, type, body.data, row);
  const position = body.position ?? row.position;
  const substantive = !equal(body.data, row.data) || position !== row.position;
  const from = row.status;
  if (substantive) {
    row.data = clone(body.data);
    row.position = position;
    row.contentVersion += 1;
    row.lastEditor = actorOf(ctx);
    if (row.status === 'ready' || row.status === 'approved') row.status = 'draft';
  }
  if (body.note !== undefined) row.note = body.note;
  touch(ctx, row);
  audit(ctx, row, substantive ? 'edit' : 'edit.note', from);
  return row;
}

export function markReady(ctx: MockContext, type: TdContentType, id: string, version: number): MockRow {
  const row = findRow(ctx.db, type, id);
  checkVersion(row, version);
  if (row.status !== 'draft')
    throw new MockError(403, 'forbidden_transition', `only a draft is marked ready (this one is ${row.status})`);
  row.status = 'ready';
  touch(ctx, row);
  audit(ctx, row, 'ready', 'draft');
  return row;
}

function approveRow(ctx: MockContext, row: MockRow) {
  if (row.status !== 'ready')
    throw new MockError(403, 'forbidden_transition', `only a ready row is approved (${row.type} ${row.id} is ${row.status})`);
  const refs = unapprovedRefs(ctx.db, row.type, row.data);
  if (refs.length) throw new MockError(409, 'dependency_unapproved', 'Approve what this refers to first', { refs });
  const moved = row.approved?.puzzle;
  if (typeof moved === 'string' && moved !== row.data.puzzle && puzzleNeeded(ctx.db, row.type, moved, row.id))
    throw new MockError(409, 'in_use', 'Live content still uses this');
  row.status = 'approved';
  row.approvedVersion = row.contentVersion;
  row.approved = clone(row.data);
  row.approvedPosition = row.position;
  row.approvedBy = actorOf(ctx);
  row.approvedAt = nowIso(ctx);
  touch(ctx, row);
  audit(ctx, row, 'approve', 'ready');
}

export function approve(
  ctx: MockContext,
  type: TdContentType,
  id: string,
  version: number,
  children: { id: string; version: number }[] = [],
): MockRow {
  const { db } = ctx;
  const row = findRow(db, type, id);
  checkVersion(row, version);
  const childType = CHILD_TYPE[type];
  if (!childType) {
    if (children.length) throw validation([{ path: 'data', message: `${type} rows have no children to approve with them` }]);
  } else {
    const kids = rowsOf(db, childType).filter((kid) => kid.data.categoryKey === row.data.key);
    for (const listed of [...children].sort((a, b) => a.id.localeCompare(b.id))) {
      const kid = kids.find((k) => k.id === listed.id);
      if (!kid) throw new MockError(404, 'not_found', `${childType} ${listed.id} is not one of this category's`);
      if (kid.version !== listed.version)
        throw new MockError(409, 'revision_conflict', 'Someone changed this row since you read it', {
          child: { type: childType, id: kid.id },
          current: rowView(row),
        });
      approveRow(ctx, kid);
    }
    const pending = kids.filter((kid) => kid.status !== 'approved' && kid.status !== 'archived');
    if (pending.length)
      throw new MockError(409, 'dependency_unapproved', 'Approve what this refers to first', {
        refs: pending.map((kid) => ({ type: childType, id: kid.id, key: String(kid.data.key), status: kid.status })),
      });
    if (!kids.some((kid) => kid.status === 'approved'))
      throw new MockError(409, 'dependency_unapproved', 'Approve what this refers to first', { refs: [{ type: childType }] });
  }
  approveRow(ctx, row);
  return row;
}

export function archive(ctx: MockContext, type: TdContentType, id: string, version: number): MockRow {
  const row = findRow(ctx.db, type, id);
  checkVersion(row, version);
  if (row.status === 'archived') throw new MockError(403, 'forbidden_transition', 'already archived');
  if (!isPublisher(ctx.staff.role) && (row.approvedVersion !== null || writtenByOthers(ctx.db, row, ctx.staff.id)))
    throw new MockError(403, 'forbidden', 'Your role cannot do this');
  if (referenced(ctx.db, row)) throw new MockError(409, 'in_use', 'Live content still uses this');
  const from = row.status;
  row.status = 'archived';
  touch(ctx, row);
  audit(ctx, row, 'archive', from);
  return row;
}

export function restore(ctx: MockContext, type: TdContentType, id: string, version: number): MockRow {
  const row = findRow(ctx.db, type, id);
  checkVersion(row, version);
  if (row.status !== 'archived') throw new MockError(403, 'forbidden_transition', 'only an archived row is restored');
  if (row.approvedVersion !== null) {
    const refs = unapprovedRefs(ctx.db, type, row.approved);
    if (refs.length) throw new MockError(409, 'dependency_unapproved', 'Approve what this refers to first', { refs });
  }
  row.status = row.approvedVersion === row.contentVersion ? 'approved' : 'draft';
  touch(ctx, row);
  audit(ctx, row, 'restore', 'archived');
  return row;
}

/* ── reads ────────────────────────────────────────────────────────── */

export interface ListQuery {
  status?: string;
  q?: string;
  category?: string;
  puzzle?: string;
  game?: string;
  from?: string;
  to?: string;
  sort?: 'natural' | 'updated' | 'created';
  dir?: 'asc' | 'desc';
  cursor?: string;
  limit?: string;
}

export function list(db: MockDb, type: TdContentType, query: ListQuery) {
  const model = MOCK_MODELS[type];
  const statuses = query.status ? query.status.split(',') : ['draft', 'ready', 'approved'];
  const filter = (name: 'category' | 'puzzle' | 'game', value: string | undefined) => {
    if (value === undefined) return () => true;
    const field = model.filters[name];
    if (!field) throw new MockError(400, 'invalid_request', `${type} has no ${name} to filter by`);
    return (row: MockRow) => row.data[field] === value;
  };
  if ((query.from !== undefined || query.to !== undefined) && !model.filters.date)
    throw new MockError(400, 'invalid_request', `${type} has no dates to filter by`);
  const tests = [filter('category', query.category), filter('puzzle', query.puzzle), filter('game', query.game)];
  const needle = query.q?.toLowerCase();
  const sort = query.sort ?? 'natural';
  const dir = query.dir === 'desc' ? -1 : 1;
  const value = (row: MockRow) =>
    sort === 'natural' ? model.natural(row.data, row.position) : sort === 'updated' ? row.updatedAt : row.createdAt;
  const rows = rowsOf(db, type)
    .filter((row) => statuses.includes(row.status))
    .filter((row) => tests.every((test) => test(row)))
    .filter((row) => (query.from === undefined || String(row.data.date) >= query.from) && (query.to === undefined || String(row.data.date) <= query.to))
    .filter((row) => !needle || JSON.stringify(row.data).toLowerCase().includes(needle))
    .sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : a.id.localeCompare(b.id)) * dir;
    });
  const page = paginate(rows, query, `${type}:${sort}:${query.dir ?? 'asc'}`);
  return { items: page.items.map(rowView), nextCursor: page.nextCursor };
}

export function history(db: MockDb, type: TdContentType, id: string, query: { cursor?: string; limit?: string }) {
  const entries = db.audit.filter((entry) => entry.rowId === id && entry.type === type).sort((a, b) => b.id - a.id);
  if (!entries.length && !db.rows.some((row) => row.id === id && row.type === type)) throw new MockError(404, 'not_found', 'No such row');
  const page = paginate(entries, query, `history:${id}`);
  return {
    items: page.items.map((entry) => ({
      id: String(entry.id),
      at: entry.at,
      actor: entry.actor.id === null ? SYSTEM : entry.actor,
      action: entry.action,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      version: entry.version,
      contentVersion: entry.contentVersion,
      batchId: entry.batchId,
    })),
    nextCursor: page.nextCursor,
  };
}

/** Whether a row is a member of any stored release (such rows are never deleted). */
export const inRelease = (db: MockDb, rowId: string) => db.releases.some((release) => release.members.some((m) => m.id === rowId));
