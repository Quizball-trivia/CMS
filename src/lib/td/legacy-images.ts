/** The images kept by URL from before uploads (practice questions) live in one
 *  public bucket. The CMS loads images from its own origin only (its CSP), so
 *  these are shown through /td/legacy-image, which fetches from this bucket
 *  and nowhere else. */
export const LEGACY_IMAGE_BASE = 'https://lfbwhxvwubzeqkztghok.supabase.co/storage/v1/object/public/imgs/';

const PATH_RE = /^[A-Za-z0-9_-][A-Za-z0-9_./-]{0,300}\.(?:jpe?g|png|webp)$/i;

/** A path inside the bucket that the route may fetch: no `..`, no query, an image extension. */
export function legacyImagePath(path: string): string | null {
  return PATH_RE.test(path) && !path.split('/').includes('..') ? path : null;
}

/** Where the CMS shows an image kept by URL, or null for a URL outside the bucket. */
export function legacyImageSrc(url: string): string | null {
  if (!url.startsWith(LEGACY_IMAGE_BASE)) return null;
  const path = legacyImagePath(url.slice(LEGACY_IMAGE_BASE.length));
  return path ? `/td/legacy-image?p=${encodeURIComponent(path)}` : null;
}
