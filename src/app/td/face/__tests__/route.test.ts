// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace', () => ({ WORKSPACE: 'table-derby' }));
const { GET } = await import('../route');

const ask = (query: string) => GET(new NextRequest(`https://cms.test/td/face${query}`));

afterEach(() => vi.unstubAllGlobals());

describe('the card face route', () => {
  it('fetches a SoFIFA face with a referrer and serves it as an inert image', async () => {
    const fetched = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://cdn.sofifa.net/players/158/023/24_240.png');
      expect((init.headers as Record<string, string>).Referer).toBe('https://sofifa.com/');
      return new Response(new Uint8Array([137, 80]), { headers: { 'content-type': 'image/png' } });
    });
    vi.stubGlobal('fetch', fetched);
    const res = await ask('?id=158023&v=24');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(fetched).toHaveBeenCalledOnce();
  });

  it('takes a numeric id and a two-digit version only, and never serves what is not an image', async () => {
    const fetched = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetched);
    expect((await ask('?id=abc&v=24')).status).toBe(400);
    expect((await ask('?id=1&v=2024')).status).toBe(400);
    expect((await ask('?id=1/../x&v=24')).status).toBe(400);
    expect(fetched).not.toHaveBeenCalled();
    expect((await ask('?id=1&v=24')).status).toBe(404);
  });
});
