// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameImageSrc, gameWebOrigin } from '@/lib/td/game-images';

vi.mock('@/lib/workspace', () => ({ WORKSPACE: 'table-derby' }));
const { GET } = await import('../route');

const ask = (path: string) => GET(new NextRequest(`https://cms.test/td/game-image?p=${encodeURIComponent(path)}`));
const CREST = '/assets/daily/football-logic/real-madrid.webp';
const image = () => new Response(new Uint8Array([82, 73]), { headers: { 'content-type': 'image/webp' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the game image route', () => {
  it('fetches an image of the player app, uncached upstream, and serves it as an inert, cacheable image', async () => {
    vi.stubEnv('TD_WEB_URL', 'https://web.test/');
    const fetched = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => image());
    vi.stubGlobal('fetch', fetched);
    const res = await ask(CREST);
    expect(fetched.mock.calls[0]![0]).toBe(`https://web.test${CREST}`);
    expect(fetched.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([82, 73]));
    expect((await ask('/assets/clubs/dinamo-tbilisi.png')).status).toBe(200);
  });

  it('takes only an image path under /assets, and never serves or caches what is not an image', async () => {
    vi.stubEnv('TD_WEB_URL', 'https://web.test');
    const fetched = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetched);
    for (const bad of ['', 'a.png', '/a.png', 'assets/a.png', '/assets/../secret.png', '/assets/a/../../b.png', '/assets/a..b/c.png', '/assets//a.png', '/assets/.env.png', 'https://evil.test/assets/x.png', '//evil.test/assets/x.png', `${CREST}?x=1`, '/assets/notes.txt', '/api/assets/a.png']) {
      expect((await ask(bad)).status, bad).toBe(400);
    }
    expect(fetched).not.toHaveBeenCalled();
    const refused = await ask(CREST);
    expect(refused.status).toBe(404);
    expect(refused.headers.get('cache-control')).toBe('no-store');
  });

  it('serves nothing when the player app’s address is not set or is not usable', async () => {
    const fetched = vi.fn(async () => image());
    vi.stubGlobal('fetch', fetched);
    for (const address of [undefined, '', 'web.test', 'http://web.test', 'ftp://web.test']) {
      if (address === undefined) vi.unstubAllEnvs();
      else vi.stubEnv('TD_WEB_URL', address);
      const res = await ask(CREST);
      expect(res.status, String(address)).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('game image addresses', () => {
  it('shows a path of the game through the route, and nothing else', () => {
    expect(gameImageSrc(CREST)).toBe(`/td/game-image?p=${encodeURIComponent(CREST)}`);
    expect(gameImageSrc('https://example.com/a.png')).toBeNull();
    expect(gameImageSrc('/assets/../a.png')).toBeNull();
  });

  it('takes the player app’s origin from an https address, or http on this machine', () => {
    expect(gameWebOrigin('https://staging.web.test/some/page')).toBe('https://staging.web.test');
    expect(gameWebOrigin('http://localhost:3000')).toBe('http://localhost:3000');
    expect(gameWebOrigin('http://web.test')).toBeNull();
    expect(gameWebOrigin(undefined)).toBeNull();
  });
});
