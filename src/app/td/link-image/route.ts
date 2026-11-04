import type { NextRequest } from 'next/server';
import { resolveTdConfig } from '@/lib/td/env';
import { fetchLinkImage } from '@/lib/td/link-image';
import { WORKSPACE } from '@/lib/workspace';

/**
 * The picture at a link an upload file gives, downloaded by the server (the
 * browser cannot read another site's picture) for the upload to save as its
 * own copy. It fetches any public link, so it answers a signed-in member only:
 * the API confirms the session (/admin/me) before anything is fetched.
 */
export const runtime = 'nodejs';

const AUTH_TIMEOUT_MS = 5000;

const noStore = { 'Cache-Control': 'no-store' };
const refuse = (status: number, reason: string) => Response.json({ reason }, { status, headers: noStore });

async function signedIn(request: NextRequest): Promise<boolean> {
  const config = resolveTdConfig({
    NEXT_PUBLIC_CMS_WORKSPACE: process.env.NEXT_PUBLIC_CMS_WORKSPACE,
    NEXT_PUBLIC_CMS_ENV: process.env.NEXT_PUBLIC_CMS_ENV,
    NEXT_PUBLIC_TD_API_URL: process.env.NEXT_PUBLIC_TD_API_URL,
    NEXT_PUBLIC_TD_API_MOCK: process.env.NEXT_PUBLIC_TD_API_MOCK,
    VERCEL: process.env.VERCEL,
  });
  const authorization = request.headers.get('authorization') ?? '';
  if (!/^Bearer \S{1,4096}$/.test(authorization)) return false;
  // The mock API lives in the browser (local development only: resolveTdConfig refuses it anywhere else).
  if (config.mock) return true;
  if (!config.apiUrl) return false;
  try {
    const me = await fetch(`${config.apiUrl}/admin/me`, { headers: { Authorization: authorization, Accept: 'application/json' }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(AUTH_TIMEOUT_MS) });
    await me.body?.cancel().catch(() => {});
    return me.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  if (!(await signedIn(request))) return refuse(401, 'unauthorized');
  let link: unknown;
  try {
    link = ((await request.json()) as { url?: unknown } | null)?.url;
  } catch {
    link = undefined;
  }
  if (typeof link !== 'string') return refuse(400, 'bad_link');
  const result = await fetchLinkImage(link);
  if (!result.ok) return refuse(422, result.reason);
  return new Response(new Uint8Array(result.bytes), {
    status: 200,
    headers: { ...noStore, 'Content-Type': result.type, 'Content-Security-Policy': "default-src 'none'; sandbox", 'X-Content-Type-Options': 'nosniff' },
  });
}
