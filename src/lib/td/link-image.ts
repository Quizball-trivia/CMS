/** Downloads the picture at a link an upload file gives (server only): the CMS
 *  keeps its own copy, so the game never depends on the other site. Any link
 *  is fetched, so only a public address is ever connected to (checked on the
 *  address actually dialled, each redirect again), and only an image of the
 *  size an upload takes comes back. */
import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

/** The upload's own limit (td-media uploadProblem). */
export const LINK_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 1500;
const MAX_LINK = 2048;
const USER_AGENT = 'TableDerbyCMS/1.0 (picture import)';

export type LinkImageFailure = 'bad_link' | 'blocked' | 'unreachable' | 'busy' | 'not_found' | 'too_big' | 'not_image';
export type LinkImageResult = { ok: true; bytes: Buffer; type: 'image/jpeg' | 'image/png' | 'image/webp' } | { ok: false; reason: LinkImageFailure };

// Every range that is not the public internet: private, loopback, link-local, shared, documentation, multicast, reserved.
const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) PRIVATE.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) PRIVATE.addSubnet(net, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 4) return !PRIVATE.check(address, 'ipv4');
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1, ::ffff:a00:1) is judged as the IPv4 one.
  const short = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(short);
  if (mapped) {
    const [high, low] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)];
    return !PRIVATE.check(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`, 'ipv4');
  }
  return !PRIVATE.check(address, 'ipv6');
}

class Blocked extends Error {}

/** Resolves as usual, then refuses unless every address is public: the socket dials only what this returns. */
const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as Array<{ address: string; family: number }>;
    if (list.length === 0 || !list.every((entry) => isPublicAddress(entry.address))) return callback(new Blocked('blocked'), '', 0);
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

/** The link as fetched, or null: http(s) only, no user name or password, the usual ports. */
export function linkUrl(raw: string): URL | null {
  if (raw.length > MAX_LINK || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  // A literal address is checked here too (the lookup is skipped for one).
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) return null;
  return url;
}

/** What the bytes are, by their first bytes (the answer's Content-Type is not trusted). */
export function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

type Hop = { redirect: string } | LinkImageResult;

function fetchOnce(url: URL, signal: AbortSignal): Promise<Hop> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(
      url,
      { agent: false, lookup: publicLookup, signal, headers: { 'User-Agent': USER_AGENT, Accept: 'image/webp,image/png,image/jpeg;q=0.9,*/*;q=0.5' } },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          return resolve({ redirect: response.headers.location });
        }
        if (status !== 200) {
          response.resume();
          // A site that asks to slow down (Wikimedia does, for several pictures at once) is asked again shortly.
          return resolve({ ok: false, reason: status === 429 || status === 503 ? 'busy' : 'not_found' });
        }
        if (Number(response.headers['content-length'] ?? 0) > LINK_IMAGE_MAX_BYTES) {
          response.destroy();
          return resolve({ ok: false, reason: 'too_big' });
        }
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > LINK_IMAGE_MAX_BYTES) {
            response.destroy();
            return resolve({ ok: false, reason: 'too_big' });
          }
          chunks.push(chunk);
        });
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          const type = sniffImage(bytes);
          resolve(type ? { ok: true, bytes, type } : { ok: false, reason: 'not_image' });
        });
        response.on('error', () => resolve({ ok: false, reason: 'unreachable' }));
      },
    );
    request.on('error', (error) => resolve({ ok: false, reason: error instanceof Blocked || (error as { cause?: unknown }).cause instanceof Blocked ? 'blocked' : 'unreachable' }));
  });
}

export async function fetchLinkImage(raw: string): Promise<LinkImageResult> {
  let url = linkUrl(raw);
  if (!url) return { ok: false, reason: 'bad_link' };
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let busy = 0;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await fetchOnce(url, signal);
    if (!('redirect' in result) && !result.ok && result.reason === 'busy' && busy < BUSY_RETRIES && !signal.aborted) {
      await new Promise((done) => setTimeout(done, BUSY_WAIT_MS * ++busy));
      hop--;
      continue;
    }
    if (!('redirect' in result)) return result;
    let next: URL | null;
    try {
      next = linkUrl(new URL(result.redirect, url).href);
    } catch {
      next = null;
    }
    if (!next) return { ok: false, reason: 'blocked' };
    url = next;
  }
  return { ok: false, reason: 'unreachable' };
}
