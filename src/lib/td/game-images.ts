/** Images kept by a path of the game (Football Logic's pairs, as
 *  /assets/daily/football-logic/real-madrid.webp) are files of the player app.
 *  The CMS loads images from its own origin only (its CSP), so these are shown
 *  through /td/game-image, which fetches from the player app (TD_WEB_URL) and
 *  nowhere else. */

// Folders and a file name under /assets, nothing that climbs out of it.
const NAME = '[A-Za-z0-9][A-Za-z0-9._-]{0,120}';
const PATH_RE = new RegExp(String.raw`^/assets/(?:${NAME}/){0,6}${NAME}\.(?:webp|jpe?g|png)$`);

/** A path of the game that the route may fetch, or null. */
export function gameImagePath(path: string): string | null {
  return PATH_RE.test(path) && !path.includes('..') ? path : null;
}

/** Where the CMS shows an image kept by a path of the game, or null for anything else. */
export function gameImageSrc(src: string): string | null {
  const path = gameImagePath(src);
  return path ? `/td/game-image?p=${encodeURIComponent(path)}` : null;
}

/** The player app's origin from TD_WEB_URL (https, or http on a developer's machine), or null when it is not set or not usable. */
export function gameWebOrigin(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
  return url.origin;
}
