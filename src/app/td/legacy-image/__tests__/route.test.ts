// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_IMAGE_BASE, legacyImageSrc } from '@/lib/td/legacy-images';

vi.mock('@/lib/workspace', () => ({ WORKSPACE: 'table-derby' }));
const { GET } = await import('../route');

const ask = (path: string) => GET(new NextRequest(`https://cms.test/td/legacy-image?p=${encodeURIComponent(path)}`));
const QUESTION = 'question-images/world-cup-germany-2006/0ef6d89f-9ac9-4bbd-8bb8-6863cc600742.webp';
const RELEASE = `releases/${'a'.repeat(64)}/${'b'.repeat(64)}.jpg`;

afterEach(() => vi.unstubAllGlobals());

describe('the legacy image route', () => {
  it('fetches an image of the bucket, uncached upstream, and serves it as an inert, cacheable image', async () => {
    const fetched = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(new Uint8Array([82, 73]), { headers: { 'content-type': 'image/webp' } }));
    vi.stubGlobal('fetch', fetched);
    const res = await ask(QUESTION);
    expect(fetched.mock.calls[0]![0]).toBe(`${LEGACY_IMAGE_BASE}${QUESTION}`);
    expect(fetched.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([82, 73]));
    for (const ok of [RELEASE, 'wl-photo-quiz/aug28b-031.jpg']) expect((await ask(ok)).status, ok).toBe(200);
  });

  it('takes only the path shapes of those images, and never serves or caches what is not an image', async () => {
    const fetched = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetched);
    for (const bad of ['', 'a.png', '../secret.png', 'question-images/x/../../a.webp', `/${QUESTION}`, 'https://evil.test/x.png', `${QUESTION}?x=1`, 'wl-photo-quiz/a/b.jpg', 'notes.txt']) {
      expect((await ask(bad)).status, bad).toBe(400);
    }
    expect(fetched).not.toHaveBeenCalled();
    const refused = await ask(QUESTION);
    expect(refused.status).toBe(404);
    expect(refused.headers.get('cache-control')).toBe('no-store');
  });

  it('stops reading an image larger than 5 MB, declared or not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(1), { headers: { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) } })));
    expect((await ask(RELEASE)).status).toBe(404);
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(endless, { headers: { 'content-type': 'image/png' } })));
    const res = await ask(RELEASE);
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(pulled).toBeLessThanOrEqual(8);
  });
});

describe('legacyImageSrc', () => {
  it('shows an image of the bucket through the route, and nothing else', () => {
    expect(legacyImageSrc(`${LEGACY_IMAGE_BASE}${RELEASE}`)).toBe(`/td/legacy-image?p=${encodeURIComponent(RELEASE)}`);
    expect(legacyImageSrc(`https://elsewhere.test/storage/v1/object/public/imgs/${RELEASE}`)).toBeNull();
    expect(legacyImageSrc(`${LEGACY_IMAGE_BASE}../other-bucket/a.jpg`)).toBeNull();
  });
});
