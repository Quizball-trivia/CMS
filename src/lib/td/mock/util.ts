import type { TdAdminErrorCode } from '../contract';
import { canonicalJson, sha256Hex } from '../hash';

/** A refusal the mock answers with, in the contract's error shape. */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: TdAdminErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
  });
}

export const refuse = (error: MockError) =>
  json(error.status, error.details === undefined ? { code: error.code, message: error.message } : { code: error.code, message: error.message, details: error.details });

export const validation = (issues: { path: string; message: string }[]) =>
  new MockError(422, 'validation', 'The content is not valid', { issues });

export function uuid(): string {
  return crypto.randomUUID();
}

export function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function equal(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export { canonicalJson, sha256Hex };

/** Opaque page cursors: base64url of the offset and what the list was sorted by. */
export function encodeCursor(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor<T>(cursor: string): T | null {
  try {
    return JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/'))) as T;
  } catch {
    return null;
  }
}

/** A page of `items` after the cursor's offset; `key` ties the cursor to its list. */
export function paginate<T>(items: T[], query: { cursor?: string; limit?: string }, key: string) {
  const limit = query.limit ? Number(query.limit) : 50;
  let offset = 0;
  if (query.cursor !== undefined) {
    const decoded = decodeCursor<{ k: string; o: number }>(query.cursor);
    if (!decoded || decoded.k !== key || !Number.isInteger(decoded.o) || decoded.o < 0)
      throw new MockError(400, 'invalid_request', 'The cursor is not for this list');
    offset = decoded.o;
  }
  const page = items.slice(offset, offset + limit);
  return { items: page, nextCursor: offset + limit < items.length ? encodeCursor({ k: key, o: offset + limit }) : null };
}
