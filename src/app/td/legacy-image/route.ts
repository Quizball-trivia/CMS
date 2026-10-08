import type { NextRequest } from 'next/server';
import { proxiedImage } from '@/lib/td/image-proxy';
import { LEGACY_IMAGE_BASE, legacyImagePath } from '@/lib/td/legacy-images';
import { WORKSPACE } from '@/lib/workspace';

/**
 * An image kept by URL from before uploads, served from the CMS's own origin
 * (its CSP loads images from itself only). It fetches from the one public
 * bucket those images live in, by the shapes of their paths only
 * (lib/td/legacy-images.ts), never another host.
 */
export const runtime = 'nodejs';

const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  const path = legacyImagePath(request.nextUrl.searchParams.get('p') ?? '');
  if (!path) return new Response('bad request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  return proxiedImage(`${LEGACY_IMAGE_BASE}${path}`, MAX_BYTES);
}
