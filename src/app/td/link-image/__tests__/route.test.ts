// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace', async (actual) => ({ ...(await actual<typeof import('@/lib/workspace')>()), WORKSPACE: 'table-derby' }));
const fetched = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('@/lib/td/link-image', () => ({ fetchLinkImage: (url: string) => fetched.fn(url) }));
const { POST } = await import('../route');

const ask = (body: unknown, token: string | null = 'access-1') =>
  POST(new NextRequest('https://cms.test/td/link-image', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } }));
const LINK = 'https://upload.wikimedia.org/a/Camp_Nou.jpg';

function realApi(meStatus: number) {
  vi.stubEnv('NEXT_PUBLIC_CMS_WORKSPACE', 'table-derby');
  vi.stubEnv('NEXT_PUBLIC_CMS_ENV', 'STAGING');
  vi.stubEnv('NEXT_PUBLIC_TD_API_URL', 'https://api.td.test');
  vi.stubEnv('NEXT_PUBLIC_TD_API_MOCK', '');
  vi.stubEnv('VERCEL', '1');
  const me = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: meStatus }));
  vi.stubGlobal('fetch', me);
  return me;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetched.fn.mockReset();
});

describe('the link picture route', () => {
  it('downloads nothing for a request the API does not confirm as a signed-in member', async () => {
    const me = realApi(401);
    expect((await ask({ url: LINK })).status).toBe(401);
    expect(me.mock.calls[0]![0]).toBe('https://api.td.test/admin/me');
    expect(new Headers(me.mock.calls[0]![1].headers).get('authorization')).toBe('Bearer access-1');
    expect((await ask({ url: LINK }, null)).status).toBe(401);
    expect(me).toHaveBeenCalledTimes(1);
    expect(fetched.fn).not.toHaveBeenCalled();
  });

  it('answers a member with the picture, inert and uncached, or with why it could not be downloaded', async () => {
    realApi(200);
    fetched.fn.mockResolvedValueOnce({ ok: true, bytes: Buffer.from([0x89, 0x50]), type: 'image/png' });
    const res = await ask({ url: LINK });
    expect(fetched.fn).toHaveBeenCalledWith(LINK);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0x89, 0x50]));

    fetched.fn.mockResolvedValueOnce({ ok: false, reason: 'not_image' });
    const refused = await ask({ url: LINK });
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ reason: 'not_image' });
    expect((await ask({ link: LINK })).status).toBe(400);
  });
});
