/**
 * The mock's `/admin/*` routes beyond sign-in. Who may call a route, and the
 * shape of its query and body, come from the pinned contract itself; the
 * handlers apply the API's rules. The store lives in localStorage (all tabs
 * share it) and every request reads, changes and writes it under its own
 * Web Lock, so two tabs never both accept the same revision.
 */
import type { TdContentType } from '../admin-api';
import { checkContract, matchContractRoute, type ContractRoute } from '../contract';
import type { TdRole } from '@/types/td';
import type { MockBlobStore } from './blob-store';
import * as content from './content';
import { MOCK_DB_SCHEMA, SEED_UPLOAD_ID, seedDb, type MockDb } from './db';
import * as imports from './imports';
import * as media from './media';
import * as ops from './ops';
import * as releases from './releases';
import { SEED_UPLOAD_PNG_BASE64 } from './seed-content';
import { clone, json, MockError, refuse } from './util';

export const MOCK_DB_KEY = 'td_mock_db';

export interface MockAdminRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
  raw: ArrayBuffer | null;
}

export interface MockAdminDeps {
  storage: () => Storage | null;
  blobs: MockBlobStore;
  now: () => number;
  /** Serialises requests across tabs; absent where there is only one page (tests). */
  lock?: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface MockStaff {
  id: string;
  name: string;
  role: TdRole;
}

export function browserMockLock(): MockAdminDeps['lock'] {
  if (typeof navigator === 'undefined' || !navigator.locks) return undefined;
  return (work) => navigator.locks.request('td-mock-db', work) as ReturnType<typeof work>;
}

function seedFile(): ArrayBuffer {
  const binary = atob(SEED_UPLOAD_PNG_BASE64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer;
}

export function createMockAdmin({ storage, blobs, now, lock }: MockAdminDeps) {
  let memory: MockDb | null = null;
  // Requests of this page run one at a time too (the Web Lock only orders tabs): each reads, changes and writes the whole store.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const load = (): MockDb => {
    const store = storage();
    if (store) {
      try {
        const stored = JSON.parse(store.getItem(MOCK_DB_KEY) ?? 'null') as MockDb | null;
        if (stored?.schema === MOCK_DB_SCHEMA) return stored;
      } catch {
        // Unreadable: start again from the seed.
      }
      return seedDb(now());
    }
    memory ??= seedDb(now());
    // A copy, so a refused request leaves nothing behind.
    return clone(memory);
  };
  const save = (db: MockDb) => {
    const store = storage();
    if (store) store.setItem(MOCK_DB_KEY, JSON.stringify(db));
    else memory = db;
  };

  async function dispatch(ctx: content.MockContext, route: ContractRoute, params: Record<string, string>, req: MockAdminRequest): Promise<Response> {
    const query = Object.fromEntries(req.query) as Record<string, string>;
    // The body was checked against the route's request schema before dispatch.
    const checked = <T,>(): T => req.body as T;
    const body = (req.body ?? {}) as Record<string, never>;
    const { db } = ctx;
    if (route.type && route.action) {
      const type = route.type as TdContentType;
      const id = params.id;
      switch (route.action) {
        case 'list':
          return json(200, content.list(db, type, query));
        case 'get':
          return json(200, content.rowView(content.findRow(db, type, id)));
        case 'history':
          return json(200, content.history(db, type, id, query));
        case 'create':
          return json(201, content.rowView(content.createRow(ctx, type, checked())));
        case 'edit':
          return json(200, content.rowView(content.editRow(ctx, type, id, checked())));
        case 'ready':
          return json(200, content.rowView(content.markReady(ctx, type, id, body.version)));
        case 'approve':
          return json(200, content.rowView(content.approve(ctx, type, id, body.version, body.children)));
        case 'archive':
          return json(200, content.rowView(content.archive(ctx, type, id, body.version)));
        case 'restore':
          return json(200, content.rowView(content.restore(ctx, type, id, body.version)));
      }
    }
    const csv = (text: string, name: string) =>
      new Response(text, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
    switch (`${route.method} ${route.path}`) {
      case 'POST /admin/content/imports/preview':
        return json(200, (await imports.preview(ctx, body.items)).report);
      case 'POST /admin/content/imports': {
        const out = await imports.apply(ctx, body.batchKey, body.items);
        return json(out.status, out.body);
      }
      case 'GET /admin/content/imports':
        return json(200, imports.listBatches(ctx, query));
      case 'GET /admin/content/imports/:id':
        return json(200, imports.batchView(imports.getBatch(ctx, params.id)));
      case 'POST /admin/content/imports/:id/undo':
        return json(200, imports.undo(ctx, params.id));
      case 'POST /admin/media/uploads':
        return json(201, media.uploadView(await media.upload(ctx, blobs, req.raw, req.headers.get('Content-Type'))));
      case 'GET /admin/media/uploads/:id':
        return json(200, media.uploadView(media.findUpload(ctx, params.id)));
      case 'GET /admin/media/uploads/:id/file': {
        const found = media.findUpload(ctx, params.id);
        const file = (await blobs.get(found.id)) ?? (found.id === SEED_UPLOAD_ID ? { bytes: seedFile(), contentType: 'image/png' } : null);
        if (!file) throw new MockError(404, 'not_found', 'The uploaded file is missing');
        return new Response(file.bytes, { status: 200, headers: { 'Content-Type': file.contentType } });
      }
      case 'DELETE /admin/media/uploads/:id':
        await media.removeUpload(ctx, blobs, params.id);
        return new Response(null, { status: 204 });
      case 'POST /admin/releases/validate':
        return json(200, await releases.validate(ctx));
      case 'POST /admin/releases/publish': {
        const out = await releases.publish(ctx, body.idemKey);
        return json(out.status, out.body);
      }
      case 'POST /admin/releases/:id/rollback': {
        const out = releases.rollback(ctx, params.id, body.idemKey);
        return json(out.status, out.body);
      }
      case 'GET /admin/releases':
        return json(200, releases.listReleases(ctx, query));
      case 'GET /admin/releases/:id':
        return json(200, releases.releaseDetail(ctx, params.id));
      case 'GET /admin/publications/:id':
        return json(200, releases.getPublication(ctx, params.id));
      case 'GET /admin/players':
        return json(200, ops.searchPlayers(ctx, query as { q: string }));
      case 'GET /admin/players/:id':
        return json(200, ops.playerProfile(ctx, params.id));
      case 'GET /admin/players/:id/matches':
        return json(200, ops.playerMatches(ctx, params.id, query));
      case 'GET /admin/players/:id/tickets':
        return json(200, ops.playerTickets(ctx, params.id, query));
      case 'GET /admin/matches/:id':
        return json(200, ops.matchRecord(ctx, params.id));
      case 'POST /admin/matches/:id/corrections':
        return json(201, ops.correct(ctx, params.id, checked()));
      case 'GET /admin/leaderboard':
        return json(200, ops.board(ctx, query));
      case 'GET /admin/leaderboard/export':
        return csv(ops.boardCsv(ctx), 'leaderboard');
      case 'GET /admin/leaderboard/snapshots':
        return json(200, ops.listSnapshots(ctx, query));
      case 'POST /admin/leaderboard/snapshots':
        return json(201, ops.takeSnapshot(ctx, body.label));
      case 'GET /admin/leaderboard/snapshots/:id':
        return json(200, ops.snapshotPage(ctx, params.id, query));
      case 'GET /admin/leaderboard/snapshots/:id/export':
        return csv(ops.snapshotCsv(ctx, params.id), `snapshot-${params.id}`);
      case 'GET /admin/dashboard':
        return json(200, ops.dashboard(ctx));
      case 'GET /admin/reviews':
        return json(200, ops.listReviews(ctx, query));
      case 'POST /admin/reviews/:id/dismiss':
        return json(200, ops.dismissReview(ctx, params.id, body.note));
      case 'GET /admin/settings':
        return json(200, ops.settings(ctx));
      case 'PATCH /admin/settings/tickets-per-day':
        return json(200, ops.setTicketsPerDay(ctx, body.version, body.value));
      case 'PATCH /admin/settings/maintenance':
        return json(200, ops.setMaintenance(ctx, body.version, body.enabled));
    }
    throw new MockError(404, 'not_found', `No mock for ${route.method} ${route.path}`);
  }

  return async function handleAdmin(req: MockAdminRequest, staff: MockStaff): Promise<Response> {
    const matched = matchContractRoute(req.method, req.path);
    if (!matched || matched.route.auth !== 'staff') return refuse(new MockError(404, 'not_found', 'No such route'));
    const { route, params } = matched;
    if (route.roles && !route.roles.includes(staff.role)) return refuse(new MockError(403, 'forbidden', 'Your role cannot do this'));
    if (route.query && checkContract(route.query, Object.fromEntries(req.query)).length)
      return refuse(new MockError(400, 'invalid_request', 'The query is not valid'));
    if (route.request) {
      const issues = checkContract(route.request, req.body);
      if (issues.length)
        return refuse(
          route.errors['422']?.includes('validation')
            ? new MockError(422, 'validation', 'The content is not valid', { issues: issues.slice(0, 20) })
            : new MockError(400, 'invalid_request', 'The request is not valid'),
        );
    }
    const run = async () => {
      const db = load();
      const ctx: content.MockContext = { db, staff, now: now() };
      releases.advance(db, ctx.now);
      try {
        const response = await dispatch(ctx, route, params, req);
        save(db);
        return response;
      } catch (error) {
        if (error instanceof MockError) return refuse(error);
        throw error;
      }
    };
    return serial(() => (lock ? lock(run) : run()));
  };
}
