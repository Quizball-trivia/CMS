/**
 * Server-side proxy for the backend's internal bot-tuning surface.
 *
 * WHY A PROXY AND NOT A DIRECT BROWSER CALL:
 *  1. Those routes authenticate with the ops shared secret in
 *     `x-ops-report-token`, NOT the CMS's Bearer session. Shipping that secret
 *     to the browser (NEXT_PUBLIC_*) would expose a production credential to
 *     anyone who opens devtools.
 *  2. The backend's cors() sets no `allowedHeaders`, so the preflight for a
 *     custom `x-ops-report-token` header would be rejected anyway.
 *
 * So the token stays in server-only env here and the browser talks same-origin.
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE = (process.env.BACKEND_API_URL ?? 'http://localhost:8001').replace(/\/+$/, '');
const TUNING_PREFIX = '/api/v1/internal/bots/tuning';

function missingTokenResponse(): NextResponse {
  return NextResponse.json(
    {
      code: 'OPS_TOKEN_UNSET',
      message:
        'OPS_REPORT_TOKEN is not set in the CMS environment. Add it to .env.local (it must match the backend value) and restart the dev server.',
      details: null,
      request_id: null,
    },
    { status: 500 }
  );
}

/**
 * The ops token authorizes the PROXY to the backend; this gate authorizes the
 * BROWSER to the proxy. Without it, anyone who can reach the CMS host could
 * tune bot difficulty. The caller must present their CMS Bearer session, and
 * the backend must confirm it belongs to an admin.
 */
async function assertAdminSession(request: NextRequest): Promise<NextResponse | null> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json(
      { code: 'UNAUTHENTICATED', message: 'Log in to the CMS first.', details: null, request_id: null },
      { status: 401 }
    );
  }
  // Validate against the backend that ISSUED the CMS session (the login
  // backend), which may differ from the tuning target backend.
  const sessionApiBase = (process.env.NEXT_PUBLIC_API_URL ?? `${BACKEND_BASE}/api/v1`).replace(/\/+$/, '');
  let me: Response;
  try {
    me = await fetch(`${sessionApiBase}/users/me`, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { code: 'BACKEND_UNREACHABLE', message: `Could not reach the backend at ${sessionApiBase} to verify the session.`, details: null, request_id: null },
      { status: 502 }
    );
  }
  if (!me.ok) {
    return NextResponse.json(
      { code: 'UNAUTHENTICATED', message: 'CMS session is invalid or expired. Log in again.', details: null, request_id: null },
      { status: 401 }
    );
  }
  const profile = (await me.json()) as { role?: string };
  if (profile.role !== 'admin') {
    return NextResponse.json(
      { code: 'FORBIDDEN', message: 'Bot tuning requires an admin account.', details: null, request_id: null },
      { status: 403 }
    );
  }
  return null;
}

async function forward(request: NextRequest, path: string[]): Promise<NextResponse> {
  const token = process.env.OPS_REPORT_TOKEN;
  if (!token) return missingTokenResponse();

  const denied = await assertAdminSession(request);
  if (denied) return denied;

  const suffix = path.length > 0 ? `/${path.join('/')}` : '';
  const search = request.nextUrl.search;
  const url = `${BACKEND_BASE}${TUNING_PREFIX}${suffix}${search}`;

  // Only read a body for methods that carry one.
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.text() : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'x-ops-report-token': token,
      },
      body: body && body.length > 0 ? body : undefined,
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      {
        code: 'BACKEND_UNREACHABLE',
        message: `Could not reach the backend at ${BACKEND_BASE}. Is it running?`,
        details: null,
        request_id: null,
      },
      { status: 502 }
    );
  }

  // Pass the backend's status and payload through untouched so the UI can
  // surface its rail-violation messages verbatim.
  const text = await response.text();
  if (!text) return new NextResponse(null, { status: response.status });

  return new NextResponse(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface RouteContext {
  params: Promise<{ path?: string[] }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return forward(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return forward(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return forward(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return forward(request, path);
}
