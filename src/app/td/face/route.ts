import type { NextRequest } from 'next/server';
import { WORKSPACE } from '@/lib/workspace';

/**
 * A ბარათონი card's SoFIFA face, served from the CMS's own origin (its CSP
 * loads images from itself only, and SoFIFA wants a referrer), as the game's
 * web app serves the bundled faces (apps/web/src/app/api/fifa-face). It takes
 * a SoFIFA player id and version only, so it says nothing about which players
 * are on cards.
 */
export const runtime = 'nodejs';

const ID_RE = /^\d{1,7}$/;
const VER_RE = /^\d{2}$/;
const UPSTREAM_TIMEOUT_MS = 5000;
const FACE_SIZE = 240;
const WEEK_S = 604_800;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function GET(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  const params = request.nextUrl.searchParams;
  const id = params.get('id') ?? '';
  const ver = params.get('v') ?? '';
  if (!ID_RE.test(id) || !VER_RE.test(ver)) return new Response('bad request', { status: 400 });
  const padded = id.padStart(6, '0');
  try {
    const upstream = await fetch(`https://cdn.sofifa.net/players/${padded.slice(0, -3)}/${padded.slice(-3)}/${ver}_${FACE_SIZE}.png`, {
      headers: {
        Referer: 'https://sofifa.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error',
      next: { revalidate: WEEK_S },
    });
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!upstream.ok || !IMAGE_TYPES.has(type)) return new Response('not found', { status: 404 });
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': type,
        // Served from our origin, so it must only ever be an inert image.
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': `public, max-age=${WEEK_S}, s-maxage=${WEEK_S}, immutable`,
      },
    });
  } catch {
    return new Response('upstream error', { status: 502 });
  }
}
