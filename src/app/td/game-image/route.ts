import type { NextRequest } from 'next/server';
import { gameImagePath, gameWebOrigin } from '@/lib/td/game-images';
import { proxiedImage } from '@/lib/td/image-proxy';
import { WORKSPACE } from '@/lib/workspace';

/**
 * An image kept by a path of the game, served from the CMS's own origin (its
 * CSP loads images from itself only). It fetches from the player app
 * (TD_WEB_URL), by a path under /assets only (lib/td/game-images.ts), never
 * another host.
 */
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  const path = gameImagePath(request.nextUrl.searchParams.get('p') ?? '');
  if (!path) return new Response('bad request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const origin = gameWebOrigin(process.env.TD_WEB_URL);
  if (!origin) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return proxiedImage(`${origin}${path}`, MAX_BYTES);
}
