import type { NextRequest } from 'next/server';
import { proxiedImage } from '@/lib/td/image-proxy';
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
const FACE_SIZE = 240;
const MAX_BYTES = 512 * 1024;

export async function GET(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  const params = request.nextUrl.searchParams;
  const id = params.get('id') ?? '';
  const ver = params.get('v') ?? '';
  if (!ID_RE.test(id) || !VER_RE.test(ver)) return new Response('bad request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const padded = id.padStart(6, '0');
  return proxiedImage(`https://cdn.sofifa.net/players/${padded.slice(0, -3)}/${padded.slice(-3)}/${ver}_${FACE_SIZE}.png`, MAX_BYTES, {
    Referer: 'https://sofifa.com/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
}
