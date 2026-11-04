/** Serves an image fetched from elsewhere from the CMS's own origin (its CSP
 *  loads images from itself only). Nothing is cached until it is checked: the
 *  upstream fetch is not cached, the body is read only up to `maxBytes`, and
 *  only a checked image goes out with cache headers (a refusal is never cached). */

const UPSTREAM_TIMEOUT_MS = 5000;
const WEEK_S = 604_800;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const refuse = (status: number, text: string) => new Response(text, { status, headers: { 'Cache-Control': 'no-store' } });

export async function proxiedImage(url: string, maxBytes: number, headers?: Record<string, string>): Promise<Response> {
  try {
    const upstream = await fetch(url, { headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const type = (upstream.headers.get('content-type') ?? '').split(';')[0]!.trim();
    if (!upstream.ok || !upstream.body || !IMAGE_TYPES.has(type) || Number(upstream.headers.get('content-length') ?? 0) > maxBytes) {
      await upstream.body?.cancel().catch(() => {});
      return refuse(404, 'not found');
    }
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return refuse(404, 'not found');
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    chunks.reduce((offset, chunk) => (body.set(chunk, offset), offset + chunk.byteLength), 0);
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
    return refuse(502, 'upstream error');
  }
}
