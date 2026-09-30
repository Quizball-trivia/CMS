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

export async function upload(ctx: MockContext, blobs: MockBlobStore, body: ArrayBuffer | null, contentType: string | null): Promise<MockUpload> {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!body || !TYPES.includes(type as Format)) throw refuse('type', 'Images are JPEG, PNG or WebP');
  if (body.byteLength > UPLOAD_MAX_BYTES) throw new MockError(413, 'too_large', 'An image is at most 2 MB');
  const bytes = new Uint8Array(body);
  const format = sniff(bytes);
  if (format === null) throw refuse('signature', 'The file is not a JPEG, PNG or WebP image');
  if (format !== type) throw refuse('type', 'The file is not the type its Content-Type says');
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
