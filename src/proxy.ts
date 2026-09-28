import { NextResponse, type NextRequest } from 'next/server';
import { WORKSPACE } from '@/lib/workspace';
import { decideWorkspaceRoute } from '@/lib/workspace-guard';

// Underscore folders are private in the App Router, so this path can never
// match a route and the rewrite always renders the 404 page.
const NOT_FOUND_PATH = '/_workspace-not-found';

export function proxy(request: NextRequest) {
  const decision = decideWorkspaceRoute(request.nextUrl.pathname, WORKSPACE);
  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }
  if (decision.type === 'not-found') {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
