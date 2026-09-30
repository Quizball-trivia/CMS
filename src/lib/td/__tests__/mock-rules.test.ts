import { describe, expect, it } from 'vitest';
import { memoryBlobStore } from '../mock/blob-store';
import { seedDb, type MockDb, type MockPlayer } from '../mock/db';
import { replayRating } from '../mock/ops';
import { createMockTdApi, MOCK_PASSWORD, MOCK_STAFF } from '../mock-api';
import { MemoryStorage } from './helpers';

const BASE = 'https://td-api.mock';

function mock() {
  const storage = new MemoryStorage();
  let clock = Date.parse('2026-09-30T08:00:00Z');
  const server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => clock, blobs: memoryBlobStore(), lock: undefined });
  const tokens = new Map<string, string>();
  const call = async (role: string, method: string, path: string, body?: unknown, raw?: { data: Uint8Array<ArrayBuffer>; type: string }) => {
    if (!tokens.has(role)) {
      const email = MOCK_STAFF.find((s) => s.role === role && s.status === 'active')!.email;
      const res = await server(`${BASE}/admin/auth/login`, { method: 'POST', body: JSON.stringify({ email, password: MOCK_PASSWORD }) });
      tokens.set(role, ((await res.json()) as { accessToken: string }).accessToken);
    }
    const res = await server(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tokens.get(role)}`, ...(raw ? { 'Content-Type': raw.type } : {}) },
      body: raw ? new Blob([raw.data]) : body === undefined ? undefined : JSON.stringify(body),
    });
    const type = res.headers.get('Content-Type') ?? '';
    return { status: res.status, body: type.includes('json') ? await res.json() : null };
  };
  return { call, advance: (ms: number) => void (clock += ms) };
}

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

describe('mock uploads refuse what the API’s decoder refuses', () => {
  it('a header-only PNG, trailing bytes, an animated PNG', async () => {
    const { call } = mock();
    const upload = (data: Uint8Array<ArrayBuffer>) => call('editor', 'POST', '/admin/media/uploads', undefined, { data, type: 'image/png' });
    expect((await upload(PNG)).status).toBe(201);
    expect(await upload(PNG.slice(0, 24))).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
    expect(await upload(new Uint8Array([...PNG, 1, 2, 3]))).toMatchObject({ status: 422, body: { details: { reason: 'trailing_data' } } });
    const actl = new Uint8Array([0, 0, 0, 8, ...new TextEncoder().encode('acTL'), 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    const animated = new Uint8Array([...PNG.slice(0, 33), ...actl, ...PNG.slice(33)]);
    expect(await upload(animated)).toMatchObject({ status: 422, body: { details: { reason: 'animated' } } });
  });
});

describe('mock imports', () => {
  it('names a row the store refuses at apply in the import report, as the API does', async () => {
    const { call } = mock();
    const item = { type: 'media', data: { key: 'ghost', url: null, uploadId: '0f8c6f0e-2c1a-4b7e-9d0a-5a1f3c2b7e01', width: 10, height: 10, author: null, license: null, source: null } };
    expect((await call('editor', 'POST', '/admin/content/imports/preview', { items: [item] })).body).toMatchObject({ counts: { error: 0 } });
    const applied = await call('editor', 'POST', '/admin/content/imports', { batchKey: 'test:ghost-image', items: [item] });
    expect(applied).toMatchObject({ status: 422, body: { code: 'validation', details: { counts: { error: 1 }, rows: [{ action: 'error', issues: [{ code: 'rule', path: 'data.uploadId' }] }] } } });
  });
});

describe('mock releases', () => {
  it('hold only the images they show, and keep their own history', async () => {
    const { call, advance } = mock();
    const up = await call('editor', 'POST', '/admin/media/uploads', undefined, { data: PNG, type: 'image/png' });
    const image = await call('editor', 'POST', '/admin/content/media', { data: { key: 'unused', url: null, uploadId: up.body.id, width: 16, height: 9, author: 'A', license: 'CC0', source: 'S' } });
    const ready = await call('editor', 'POST', `/admin/content/media/${image.body.id}/ready`, { version: 1 });
    expect((await call('publisher', 'POST', `/admin/content/media/${image.body.id}/approve`, { version: ready.body.version })).status).toBe(200);
    // An approved image nothing shows is no release change.
    expect((await call('editor', 'POST', '/admin/releases/validate')).body).toMatchObject({ unchanged: true, changes: { types: [] } });

    const list = await call('editor', 'GET', '/admin/releases');
    const current = list.body.pointer.releaseId;
    const before = (await call('editor', 'GET', `/admin/releases/${current}`)).body.manifest.practice;
    const practice = (await call('editor', 'GET', '/admin/content/practice-questions?q=practice-01')).body.items[0];
    const edited = await call('editor', 'PATCH', `/admin/content/practice-questions/${practice.id}`, { version: practice.version, data: { ...practice.data, difficulty: 'hard' } });
    const again = await call('editor', 'POST', `/admin/content/practice-questions/${practice.id}/ready`, { version: edited.body.version });
    expect((await call('publisher', 'POST', `/admin/content/practice-questions/${practice.id}/approve`, { version: again.body.version })).status).toBe(200);
    expect((await call('editor', 'GET', `/admin/releases/${current}`)).body.manifest.practice).toEqual(before);
    advance(0);
  });

  it('refuse to roll back to a release that has no daily set for today', async () => {
    const { call } = mock();
    expect(await call('publisher', 'POST', '/admin/releases/r-00000000000000a1/rollback', { idemKey: 'rollback:old-one' })).toMatchObject({
      status: 409,
      body: { code: 'release_unrunnable' },
    });
  });
});

describe('mock ratings', () => {
  it('replays the history with the zero floor instead of subtracting', () => {
    const db: MockDb = seedDb(Date.parse('2026-09-30T08:00:00Z'));
    const player: MockPlayer = { ...db.players[0], id: 'p-test', startRating: 0, rating: 0 };
    const opponent = db.players[1];
    const outcomes: Array<'win' | 'loss' | 'noContest'> = ['win', 'loss', 'loss', 'loss', 'win'];
    db.matches = outcomes.map((outcome, i) => ({
      ...db.matches[0],
      id: `m${i}`,
      status: 'settled' as const,
      settledAt: `2026-09-30T0${i}:00:00.000Z`,
      players: [
        { ...db.matches[0].players[0], playerId: player.id, outcome },
        { ...db.matches[0].players[1], playerId: opponent.id },
      ],
    }));
    expect(replayRating(db, player).rating).toBe(25);
    db.matches[0].players[0].outcome = 'noContest';
    // Voiding the first win: 0 → 0 → 0 → 0 → 25, still 25 (subtracting would give 0).
    expect(replayRating(db, player).rating).toBe(25);
  });
});
