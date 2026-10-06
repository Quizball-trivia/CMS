import type { NextRequest } from 'next/server';
import { LEGACY_IMAGE_BASE, legacyImagePath } from '@/lib/td/legacy-images';
import { WORKSPACE } from '@/lib/workspace';

/**
 * An image kept by URL from before uploads, served from the CMS's own origin
 * (its CSP loads images from itself only). It fetches from the one public
 * bucket those images live in (lib/td/legacy-images.ts), never another host.
 */
export const runtime = 'nodejs';

const UPSTREAM_TIMEOUT_MS = 5000;
const MAX_BYTES = 5 * 1024 * 1024;
const WEEK_S = 604_800;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function GET(request: NextRequest) {
  if (WORKSPACE !== 'table-derby') return new Response('not found', { status: 404 });
  const path = legacyImagePath(request.nextUrl.searchParams.get('p') ?? '');
  if (!path) return new Response('bad request', { status: 400 });
  try {
    const upstream = await fetch(`${LEGACY_IMAGE_BASE}${path}`, {
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error',
      next: { revalidate: WEEK_S },
    });
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!upstream.ok || !IMAGE_TYPES.has(type) || Number(upstream.headers.get('content-length') ?? 0) > MAX_BYTES) {
      return new Response('not found', { status: 404 });
    }
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return new Response('not found', { status: 404 });
    return new Response(body, {
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
