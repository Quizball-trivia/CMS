/** Import batches, as the API runs them: preview judges each item on its own; apply is all or none under a batch key. */
import type { TdContentType } from '../admin-api';
import { checkContract } from '../contract';
import type { MockBatch, MockRow } from './db';
import { actorOf, audit, createRow, inRelease, nowIso, rowLabel, type MockContext } from './content';
import { MOCK_MODELS, type Data } from './model';
import { isPublisher } from './staff';
import { canonicalJson, clone, MockError, paginate, sha256Hex, uuid } from './util';

type Issue = { code: 'invalid' | 'duplicate' | 'duplicate_in_batch' | 'missing_reference' | 'rule'; message: string; path: string };
type Item = { type: TdContentType; data: Data; position?: number; note?: string };

export async function preview(ctx: MockContext, items: unknown[]) {
  const rows: { index: number; type: string; label: string | null; action: 'create' | 'error'; issues: Issue[] }[] = [];
  const parsed: (Item | null)[] = [];
  items.forEach((raw, index) => {
    const type = raw && typeof raw === 'object' && typeof (raw as Item).type === 'string' ? (raw as Item).type : '';
    const shape = checkContract('ContentImportItem', raw);
    if (shape.length) {
      parsed.push(null);
      rows.push({ index, type, label: null, action: 'error', issues: shape.slice(0, 10).map((i) => ({ code: 'invalid', ...i })) });
      return;
    }
    const item = raw as Item;
    const model = MOCK_MODELS[item.type];
    parsed.push(item);
    rows.push({ index, type: item.type, label: model.label(item.data), action: 'create', issues: model.rules(item.data).map((i) => ({ code: 'rule', ...i })) });
  });
  const keys = new Map<TdContentType, Set<string>>();
  const known = (type: TdContentType) => {
    if (!keys.has(type)) keys.set(type, new Set(ctx.db.rows.filter((r) => r.type === type).map((r) => String(r.data.key))));
    return keys.get(type)!;
  };
  const seen = new Map<string, number>();
  parsed.forEach((item, index) => {
    if (!item) return;
    const row = rows[index];
    const model = MOCK_MODELS[item.type];
    const identity = model.identity(item.data);
    const earlier = seen.get(`${item.type}:${identity}`);
    if (ctx.db.rows.some((r) => r.type === item.type && model.identity(r.data) === identity))
      row.issues.push({ code: 'duplicate', message: `${identity} exists already`, path: 'data.key' });
    else if (earlier !== undefined)
      row.issues.push({ code: 'duplicate_in_batch', message: `${identity} is item ${earlier} of this import too`, path: 'data.key' });
    for (const ref of model.refs(item.data))
      if (!known(ref.type).has(ref.key))
        row.issues.push({ code: 'missing_reference', message: `no ${ref.type} ${ref.key} (here, or before this item)`, path: ref.path });
    seen.set(`${item.type}:${identity}`, index);
    if ('key' in item.data) known(item.type).add(String(item.data.key));
  });
  for (const row of rows) if (row.issues.length) row.action = 'error';
  const errors = rows.filter((row) => row.action === 'error').length;
  return {
    report: { payloadHash: await sha256Hex(canonicalJson(items)), counts: { items: items.length, create: items.length - errors, error: errors }, rows },
    parsed,
  };
}

export function batchView(batch: MockBatch, withRows = true) {
  const summary = {
    id: batch.id,
    batchKey: batch.batchKey,
    status: batch.status,
    itemCount: batch.itemCount,
    createdBy: batch.createdBy,
    createdAt: batch.createdAt,
    undoneAt: batch.undoneAt,
    undoneBy: batch.undoneBy,
    counts: {
      created: batch.rows.length,
      removed: batch.rows.filter((r) => r.outcome === 'removed').length,
      kept: batch.rows.filter((r) => r.outcome === 'kept').length,
    },
  };
  return withRows ? { ...summary, rows: batch.rows } : summary;
}

export async function apply(ctx: MockContext, batchKey: string, items: unknown[]) {
  const payloadHash = await sha256Hex(canonicalJson(items));
  const known = ctx.db.batches.find((b) => b.batchKey === batchKey);
  if (known) {
    if (known.payloadHash !== payloadHash) throw new MockError(409, 'conflict', 'This import key was used for other items');
    return { status: 200, body: { created: false, batch: batchView(known) } };
  }
  const { report, parsed } = await preview(ctx, items);
  if (report.counts.error) throw new MockError(422, 'validation', 'Some items cannot be imported', report);
  const batch: MockBatch = {
    id: uuid(),
    batchKey,
    payloadHash,
    status: 'applied',
    itemCount: items.length,
    createdBy: actorOf(ctx),
    createdAt: nowIso(ctx),
    undoneAt: null,
    undoneBy: null,
    rows: [],
  };
  parsed.forEach((item, index) => {
    const row = createRow(ctx, item!.type, { data: item!.data, position: item!.position, note: item!.note }, batch.id);
    batch.rows.push({ index, type: row.type, id: row.id, label: rowLabel(row), contentVersion: row.contentVersion, outcome: 'created', reason: null });
  });
  ctx.db.batches.push(batch);
  return { status: 201, body: { created: true, batch: batchView(batch) } };
}

export function listBatches(ctx: MockContext, query: { cursor?: string; limit?: string }) {
  const sorted = [...ctx.db.batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const page = paginate(sorted, query, 'imports');
  return { items: page.items.map((b) => batchView(b, false)), nextCursor: page.nextCursor };
}

export function getBatch(ctx: MockContext, id: string) {
  const batch = ctx.db.batches.find((b) => b.id === id);
  if (!batch) throw new MockError(404, 'not_found', 'No such import');
  return batch;
}

/** Why a row the batch made is kept, or null when it can go. */
function keepReason(ctx: MockContext, row: MockRow): MockBatch['rows'][number]['reason'] {
  if (inRelease(ctx.db, row.id)) return 'published';
  if (row.approvedVersion !== null) return 'approved';
  if (row.version !== 1) return 'edited';
  const key = row.data.key;
  const referrers = ctx.db.rows.filter((other) => {
    if (other.id === row.id) return false;
    return MOCK_MODELS[other.type].refs(other.data).some((ref) => ref.type === row.type && ref.key === key);
  });
  return referrers.length ? 'referenced' : null;
}

export function undo(ctx: MockContext, id: string) {
  const batch = getBatch(ctx, id);
  if (batch.createdBy.id !== ctx.staff.id && !isPublisher(ctx.staff.role))
    throw new MockError(403, 'forbidden', 'Your role cannot do this');
  if (batch.status !== 'applied') return batchView(batch);
  // Children before the rows they refer to.
  for (const entry of [...batch.rows].reverse()) {
    const row = ctx.db.rows.find((r) => r.id === entry.id);
    if (!row) continue;
    const reason = keepReason(ctx, row);
    if (reason) {
      entry.outcome = 'kept';
      entry.reason = reason;
    } else {
      ctx.db.rows = ctx.db.rows.filter((r) => r.id !== row.id);
      audit(ctx, clone(row), 'delete', row.status, batch.id);
      entry.outcome = 'removed';
    }
  }
  batch.status = batch.rows.some((r) => r.outcome === 'kept') ? 'partly_undone' : 'undone';
  batch.undoneAt = nowIso(ctx);
  batch.undoneBy = actorOf(ctx);
  return batchView(batch);
}
