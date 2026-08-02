/**
 * Base-path proxy for GET/PUT of the tuning params themselves. The [...path]
 * catch-all sibling does not match a zero-segment path, so this file handles
 * `/api/bot-tuning` while that one handles `/roster`, `/governor/...` etc.
 * Both delegate to the same forwarder.
 */

import type { NextRequest } from 'next/server';
import { GET as forwardGet, PUT as forwardPut } from './[...path]/route';

const emptyParams = { params: Promise.resolve({ path: [] as string[] }) };

export async function GET(request: NextRequest) {
  return forwardGet(request, emptyParams);
}

export async function PUT(request: NextRequest) {
  return forwardPut(request, emptyParams);
}
