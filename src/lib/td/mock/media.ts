/** Image uploads: checked by their bytes as the API does (type, signature, size, dimensions), kept in the blob store. */
import type { MockBlobStore } from './blob-store';
import { actorOf, nowIso, type MockContext } from './content';
import type { MockUpload } from './db';
import { isPublisher } from './staff';
import { MockError, sha256Hex, uuid } from './util';

export const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SIDE = 4096;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const refuse = (reason: string, message: string) => new MockError(422, 'invalid_image', message, { reason });

type Format = (typeof TYPES)[number];

function sniff(bytes: Uint8Array): Format | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Width and height from the image header; null when it cannot be read. */
export function imageSize(bytes: Uint8Array, format: Format): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (format === 'image/png') return { width: view.getUint32(16), height: view.getUint32(20) };
    if (format === 'image/webp') {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === 'VP8X') return { width: 1 + (view.getUint32(24, true) & 0xffffff), height: 1 + (view.getUint32(27, true) & 0xffffff) };
      if (chunk === 'VP8L') {
        const b = view.getUint32(21, true);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      return null;
    }
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      offset += 2 + length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The first `limit` zlib-inflated bytes (or all, when fewer): reading stops there, so a small file
 * cannot expand to fill memory; like the API's decoder, what inflates past the image is ignored.
 * Null when the data does not inflate, undefined when the runtime cannot inflate.
 */
async function inflate(data: Uint8Array, limit: number): Promise<Uint8Array | null | undefined> {
  if (typeof DecompressionStream === 'undefined') return undefined;
  const reader = new Response(data as Uint8Array<ArrayBuffer>).body!.pipeThrough(new DecompressionStream('deflate')).getReader();
  // Only what actually inflates is held, never what a header claims.
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      const kept = value.subarray(0, limit - total);
      chunks.push(kept);
      total += kept.length;
    }
    if (total >= limit) await reader.cancel();
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  chunks.reduce((offset, chunk) => (out.set(chunk, offset), offset + chunk.length), 0);
  return out;
}

const PNG_CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** The bit depths PNG allows for each colour type. */
const PNG_DEPTHS: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/**
 * What the API's decoder would refuse, read from the file's structure (the
 * mock has no decoder): a PNG walked chunk by chunk to its IEND, with image
 * data that inflates to what its header promises; a JPEG walked segment by
 * segment and through its scans to the end marker; a WebP by its RIFF size;
 * animation flags.
 */
export async function structureProblem(bytes: Uint8Array, format: Format): Promise<'trailing_data' | 'animated' | 'decode' | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
  if (format === 'image/png') {
    if (tag(12) !== 'IHDR') return 'decode';
    const data: Uint8Array[] = [];
    let at = 8;
    let ended = false;
    while (at + 12 <= bytes.length) {
      const length = view.getUint32(at);
      const type = tag(at + 4);
      if (at + 12 + length > bytes.length) return 'decode';
      if (type === 'acTL') return 'animated';
      if (type === 'IDAT') data.push(bytes.slice(at + 8, at + 8 + length));
      at += 12 + length;
      if (type === 'IEND') {
        if (at !== bytes.length) return 'trailing_data';
        ended = true;
        break;
      }
    }
    if (!ended || data.length === 0) return 'decode';
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    // Oversized or empty headers are refused on their dimensions (upload), before anything is inflated.
    if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
    if (!PNG_DEPTHS[bytes[25]]?.includes(bytes[24])) return 'decode';
    const bits = bytes[24] * PNG_CHANNELS[bytes[25]];
    const interlaced = bytes[28] === 1;
    const joined = new Uint8Array(data.reduce((n, d) => n + d.length, 0));
    data.reduce((offset, d) => (joined.set(d, offset), offset + d.length), 0);
    if (bits === 0) return 'decode';
    const rowBytes = 1 + Math.ceil((width * bits) / 8);
    const expected = height * rowBytes;
    // Interlaced rows come in seven passes of smaller rows; only non-interlaced images are sized here.
    const pixels = await inflate(joined, expected);
    if (pixels === undefined) return null;
    if (pixels === null || (!interlaced && pixels.length < expected)) return 'decode';
    // Every scanline starts with its filter type, 0 to 4.
    if (!interlaced) for (let row = 0; row < height; row++) if (pixels[row * rowBytes] > 4) return 'decode';
    return null;
  }
  if (format === 'image/webp') {
    const size = view.getUint32(4, true) + 8;
    if (size > bytes.length) return 'decode';
    if (size < bytes.length) return 'trailing_data';
    if (tag(12) === 'VP8X' && (bytes[20] & 0x02) !== 0) return 'animated';
    for (let at = 12; at + 8 <= bytes.length; at += 8 + view.getUint32(at + 4, true) + (view.getUint32(at + 4, true) % 2)) if (tag(at) === 'ANIM') return 'animated';
    return null;
  }
  // JPEG: segments carry their length; after a scan (SOS) comes entropy data, where 0xFF is followed by
  // 0x00 (a stuffed byte) or a restart marker; any other marker ends the scan, EOI the image.
  let at = 2;
  let scanned = false;
  let tables = false;
  let frame = false;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return 'decode';
    const marker = bytes[at + 1];
    if (marker === 0xd9) return !scanned ? 'decode' : at + 2 === bytes.length ? null : 'trailing_data';
    if (marker === 0xdb) tables = true;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) frame = true;
    // A scan needs its quantisation tables and a frame before it.
    if (marker === 0xda && !(tables && frame)) return 'decode';
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (at + 3 >= bytes.length) return 'decode';
    const length = view.getUint16(at + 2);
    at += 2 + length;
    if (marker !== 0xda) continue;
    scanned = true;
    while (at + 1 < bytes.length && !(bytes[at] === 0xff && bytes[at + 1] !== 0x00 && (bytes[at + 1] < 0xd0 || bytes[at + 1] > 0xd7))) at += 1;
  }
  return 'decode';
}

const STRUCTURE_MESSAGES = { trailing_data: 'The file carries data after the image', animated: 'Animated images are not accepted', decode: 'The image could not be decoded' };

export async function upload(ctx: MockContext, blobs: MockBlobStore, body: ArrayBuffer | null, contentType: string | null): Promise<MockUpload> {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!body || !TYPES.includes(type as Format)) throw refuse('type', 'Images are JPEG, PNG or WebP');
  if (body.byteLength > UPLOAD_MAX_BYTES) throw new MockError(413, 'too_large', 'An image is at most 2 MB');
  const bytes = new Uint8Array(body);
  const format = sniff(bytes);
  if (format === null) throw refuse('signature', 'The file is not a JPEG, PNG or WebP image');
  if (format !== type) throw refuse('type', 'The file is not the type its Content-Type says');
  const problem = await structureProblem(bytes, format);
  if (problem) throw refuse(problem, STRUCTURE_MESSAGES[problem]);
  const size = imageSize(bytes, format);
  if (!size || size.width < 1 || size.height < 1) throw refuse('decode', 'The image could not be decoded');
  if (size.width > MAX_SIDE || size.height > MAX_SIDE) throw refuse('dimensions', 'An image is at most 4096 pixels a side');
  const record: MockUpload = {
    id: uuid(),
    contentType: format,
    bytes: body.byteLength,
    width: size.width,
    height: size.height,
    sha256: await sha256Hex(body),
    uploadedBy: actorOf(ctx),
    createdAt: nowIso(ctx),
    public: false,
  };
  await blobs.put(record.id, body, format);
  ctx.db.uploads.push(record);
  return record;
}

export const uploadView = (u: MockUpload) => ({
  id: u.id,
  contentType: u.contentType,
  bytes: u.bytes,
  width: u.width,
  height: u.height,
  sha256: u.sha256,
  uploadedBy: u.uploadedBy,
  createdAt: u.createdAt,
});

export function findUpload(ctx: MockContext, id: string): MockUpload {
  const found = ctx.db.uploads.find((u) => u.id === id);
  if (!found) throw new MockError(404, 'not_found', 'No such upload');
  return found;
}

export async function removeUpload(ctx: MockContext, blobs: MockBlobStore, id: string) {
  const found = findUpload(ctx, id);
  if (found.uploadedBy.id !== ctx.staff.id && !isPublisher(ctx.staff.role))
    throw new MockError(403, 'forbidden', 'Your role cannot do this');
  // A running publication only uses uploads an approved media row names, so this covers it too.
  const used = ctx.db.rows.some((row) => row.type === 'media' && (row.data.uploadId === id || row.approved?.uploadId === id));
  if (used) throw new MockError(409, 'in_use', 'Live content still uses this');
  ctx.db.uploads = ctx.db.uploads.filter((u) => u.id !== id);
  await blobs.delete(id);
}
