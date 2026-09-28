import type { Workspace } from './workspace';

export const TD_ROOT = '/td';

export type WorkspaceRouteDecision =
  | { type: 'allow' }
  | { type: 'redirect'; location: string }
  | { type: 'not-found' };

const ALLOW: WorkspaceRouteDecision = { type: 'allow' };
const NOT_FOUND: WorkspaceRouteDecision = { type: 'not-found' };

// Pages-router data URLs (/_next/data/<build>/<page>.json). An App Router app
// without a proxy answers them 404; with a proxy, Next would render the page
// behind them, bypassing path checks. So they stay 404 in both workspaces.
const NEXT_DATA_PREFIX = '/_next/data/';

export function isTableDerbyPath(pathname: string): boolean {
  return pathname === TD_ROOT || pathname.startsWith(`${TD_ROOT}/`);
}

function isFrameworkPath(pathname: string): boolean {
  return pathname.startsWith('/_next/') || pathname.startsWith('/__nextjs');
}

function safeDecode(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

/**
 * Which workspace owns a path. Quizball mode only refuses `/td/*`; Table Derby
 * mode serves nothing but `/td/*` and sends `/` there. `dataRequest` is set when
 * Next has already rewritten a data URL to its page path.
 */
export function decideWorkspaceRoute(
  pathname: string,
  workspace: Workspace,
  { dataRequest = false }: { dataRequest?: boolean } = {},
): WorkspaceRouteDecision {
  // Checked decoded too, so `/%74d/team` cannot slip past the prefix check.
  const decoded = safeDecode(pathname);
  if (dataRequest || pathname.startsWith(NEXT_DATA_PREFIX) || decoded?.startsWith(NEXT_DATA_PREFIX)) return NOT_FOUND;

  if (workspace === 'quizball') {
    return isTableDerbyPath(pathname) || (decoded !== null && isTableDerbyPath(decoded)) ? NOT_FOUND : ALLOW;
  }

  if (decoded === null) return NOT_FOUND;
  if (isFrameworkPath(decoded)) return ALLOW;
  if (decoded === '/') return { type: 'redirect', location: TD_ROOT };
  // Encoded dot segments (`/td/%2E%2E/questions`) would otherwise pass the prefix check.
  if (decoded.split('/').some((segment) => segment === '.' || segment === '..')) return NOT_FOUND;
  return isTableDerbyPath(decoded) ? ALLOW : NOT_FOUND;
}
