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
    // IHDR and IEND with no image data between them.
    const empty = new Uint8Array([...PNG.slice(0, 33), ...PNG.slice(PNG.length - 12)]);
    expect(await upload(empty)).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
  });

  it('PNG image data that is not what the header promises (a bad filter byte); excess data is ignored, as the API does', async () => {
    const { call } = mock();
    const upload = (data: Uint8Array<ArrayBuffer>) => call('editor', 'POST', '/admin/media/uploads', undefined, { data, type: 'image/png' });
    const png = async (width: number, height: number, raw: Uint8Array<ArrayBuffer>, depth = 8, colour = 2) => {
      const deflated = new Uint8Array(await new Response(new Response(raw).body!.pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
      const chunk = (type: string, data: Uint8Array) => {
        const out = new Uint8Array(12 + data.length);
        const view = new DataView(out.buffer);
        view.setUint32(0, data.length);
        out.set(new TextEncoder().encode(type), 4);
        out.set(data, 8);
        return out;
      };
      const header = new Uint8Array(13);
      new DataView(header.buffer).setUint32(0, width);
      new DataView(header.buffer).setUint32(4, height);
      header.set([depth, colour, 0, 0, 0], 8);
      return new Uint8Array([...PNG.slice(0, 8), ...chunk('IHDR', header), ...chunk('IDAT', deflated), ...chunk('IEND', new Uint8Array())]);
    };
    const rows = (filter: number) => new Uint8Array(Array.from({ length: 2 }, () => [filter, 1, 2, 3, 4, 5, 6]).flat());
    expect((await upload(await png(2, 2, rows(0)))).status).toBe(201);
    expect(await upload(await png(2, 2, rows(5)))).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
    // Inflating far past a 1×1 image: the API accepts it (the decoder stops at the image), and the mock reads no further either.
    expect(await upload(await png(1, 1, new Uint8Array(1_000_000)))).toMatchObject({ status: 201, body: { width: 1, height: 1 } });
    expect(await upload(await png(2, 2, new Uint8Array([0, 1, 2])))).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
    // A bit depth PNG does not have (255 bits a sample) is refused before anything is inflated.
    expect(await upload(await png(4096, 4096, new Uint8Array([0, 1, 2]), 255, 6))).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
    // A tiny file declaring 65,536² pixels is refused on its dimensions, with nothing allocated for it.
    expect(await upload(await png(65_536, 65_536, new Uint8Array([0, 1, 2])))).toMatchObject({ status: 422, body: { details: { reason: 'dimensions' } } });
  });

  it('a JPEG walked through its scan: data after the image is refused even when it ends in an end marker', async () => {
    const { call } = mock();
    // 16×9, encoded by macOS sips (the API decodes it too).
    const jpeg = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAACQAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACQAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8Akooor+Kz/UA//9k='), (c) => c.charCodeAt(0));
    const upload = (data: Uint8Array<ArrayBuffer>) => call('editor', 'POST', '/admin/media/uploads', undefined, { data, type: 'image/jpeg' });
    expect(await upload(jpeg)).toMatchObject({ status: 201, body: { width: 16, height: 9 } });
    expect(await upload(new Uint8Array([...jpeg, 1, 2, 0xff, 0xd9]))).toMatchObject({ status: 422, body: { details: { reason: 'trailing_data' } } });
    // A scan with no tables before it.
    const bare = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 8, 0, 8, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 0x12, 0xff, 0xd9]);
    expect(await upload(bare)).toMatchObject({ status: 422, body: { details: { reason: 'decode' } } });
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

  it('check a roll back again as it runs: a release that stops serving today fails', async () => {
    const storage = new MemoryStorage();
    // Just before Georgian midnight (sessions last 15 mock minutes, so this is where it signs in).
    let clock = Date.parse('2026-09-30T19:59:59.600Z');
    const server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => clock, blobs: memoryBlobStore(), lock: undefined });
    const login = await server(`${BASE}/admin/auth/login`, { method: 'POST', body: JSON.stringify({ email: 'publisher@demo.tablederby.test', password: MOCK_PASSWORD }) });
    const token = ((await login.json()) as { accessToken: string }).accessToken;
    const as = (method: string, path: string, body?: unknown) =>
      server(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) }).then((r) => r.json());
    // Make the old release current-able for today only, then let the day turn before it runs.
    const db = JSON.parse(storage.getItem('td_mock_db') ?? 'null') ?? (await as('GET', '/admin/releases'), JSON.parse(storage.getItem('td_mock_db')!));
    const old = db.releases.find((r: { id: string }) => r.id === 'r-00000000000000a1');
    old.dailies = Object.fromEntries(['footballLogic', 'putInOrder', 'careerPath'].map((g) => [g, { dates: { '2026-09-30': 'x' }, cycle: null, known: ['x'] }]));
    storage.setItem('td_mock_db', JSON.stringify(db));
    const started = await as('POST', '/admin/releases/r-00000000000000a1/rollback', { idemKey: 'rollback:day-turns' });
    expect(started.status).toBe('running');
    clock += 1_000;
    expect(await as('GET', `/admin/publications/${started.id}`)).toMatchObject({ status: 'failed', error: { code: 'release_unavailable' } });
  });

  it('refuse to roll back to a release that has no daily set for today', async () => {
    const { call } = mock();
    expect(await call('publisher', 'POST', '/admin/releases/r-00000000000000a1/rollback', { idemKey: 'rollback:old-one' })).toMatchObject({
      status: 409,
      body: { code: 'release_unrunnable' },
    });
  });
});

describe('mock corrections', () => {
  it('record the result’s rule as the rating delta; the floor only shapes the rating', async () => {
    const { call } = mock();
    const found = (await call('ops', 'GET', '/admin/players?q=Nika')).body.items[0];
    const match = (await call('ops', 'GET', `/admin/players/${found.id}/matches`)).body.items.find((m: { status: string }) => m.status === 'settled');
    const record = (await call('ops', 'GET', `/admin/matches/${match.matchId}`)).body;
    const loser = record.players.find((p: { outcome: string }) => p.outcome === 'loss');
    const out = await call('ops', 'POST', `/admin/matches/${match.matchId}/corrections`, { version: record.resultVersion, outcome: { kind: 'win', winner: loser.playerId }, reason: 'Wrong answer accepted' });
    expect(out.status).toBe(201);
    expect(out.body.players.map((p: { outcome: string; ratingDelta: number }) => [p.outcome, p.ratingDelta]).sort()).toEqual([
      ['loss', -10],
      ['win', 25],
    ]);
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
