/** The images kept by URL from before uploads (practice questions) live in one
 *  public bucket. The CMS loads images from its own origin only (its CSP), so
 *  these are shown through /td/legacy-image, which fetches from this bucket
 *  and nowhere else. */
export const LEGACY_IMAGE_BASE = 'https://lfbwhxvwubzeqkztghok.supabase.co/storage/v1/object/public/imgs/';

// The three shapes of the paths of those images (every one on file fits one), so nothing else is fetched.
const IMAGE = String.raw`\.(?:webp|jpe?g|png)`;
const PATH_RE = new RegExp(
  `^(?:question-images/[a-z0-9-]{1,80}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}${IMAGE}` +
    `|releases/[0-9a-f]{64}/[0-9a-f]{64}${IMAGE}` +
    `|wl-photo-quiz/[a-z0-9-]{1,40}${IMAGE})$`,
);

/** A path of the bucket that the route may fetch, or null. */
export function legacyImagePath(path: string): string | null {
  return PATH_RE.test(path) ? path : null;
}

/** Where the CMS shows an image kept by URL, or null for a URL outside the bucket. */
export function legacyImageSrc(url: string): string | null {
  if (!url.startsWith(LEGACY_IMAGE_BASE)) return null;
  const path = legacyImagePath(url.slice(LEGACY_IMAGE_BASE.length));
  return path ? `/td/legacy-image?p=${encodeURIComponent(path)}` : null;
}
