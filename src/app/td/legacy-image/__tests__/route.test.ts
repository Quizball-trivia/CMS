// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_IMAGE_BASE, legacyImageSrc } from '@/lib/td/legacy-images';

vi.mock('@/lib/workspace', () => ({ WORKSPACE: 'table-derby' }));
const { GET } = await import('../route');

const ask = (query: string) => GET(new NextRequest(`https://cms.test/td/legacy-image${query}`));

afterEach(() => vi.unstubAllGlobals());

describe('the legacy image route', () => {
  it('fetches an image of the bucket and serves it as an inert image', async () => {
    const fetched = vi.fn(async (url: string) => {
      expect(url).toBe(`${LEGACY_IMAGE_BASE}question-images/world-cup/0ef6.webp`);
      return new Response(new Uint8Array([82, 73]), { headers: { 'content-type': 'image/webp' } });
    });
    vi.stubGlobal('fetch', fetched);
    const res = await ask(`?p=${encodeURIComponent('question-images/world-cup/0ef6.webp')}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
  });

  it('takes a path inside the bucket only, and never serves what is not an image', async () => {
    const fetched = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetched);
    for (const bad of ['', '../secret.png', 'a/../../b.png', '/abs.png', 'https://evil.test/x.png', 'a.png?x=1', 'notes.txt', '//evil.test/x.png']) {
      expect((await ask(`?p=${encodeURIComponent(bad)}`)).status, bad).toBe(400);
    }
    expect(fetched).not.toHaveBeenCalled();
    expect((await ask('?p=a.png')).status).toBe(404);
  });

  it('refuses an image larger than 5 MB', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(1), { headers: { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) } })));
    expect((await ask('?p=big.png')).status).toBe(404);
  });
});

describe('legacyImageSrc', () => {
  it('shows an image of the bucket through the route, and nothing else', () => {
    expect(legacyImageSrc(`${LEGACY_IMAGE_BASE}releases/abc/def.jpg`)).toBe(`/td/legacy-image?p=${encodeURIComponent('releases/abc/def.jpg')}`);
    expect(legacyImageSrc('https://elsewhere.test/storage/v1/object/public/imgs/a.jpg')).toBeNull();
    expect(legacyImageSrc(`${LEGACY_IMAGE_BASE}../other-bucket/a.jpg`)).toBeNull();
  });
});
