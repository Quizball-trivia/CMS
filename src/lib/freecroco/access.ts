// Role-aware access for the dashboard. The server enforces the same split; this is UX so a partner
// staff member never lands on (or sees links to) screens that would only answer 403.

export type CmsRole = 'admin' | 'partner_staff' | 'none';

export const PARTNER_STAFF_ROLE = 'partner_staff';
export const FREECROCO_ROOT = '/freecroco';
/** Staff accounts are granted by Quizball admins; a partner editor must never grant access. */
export const FREECROCO_STAFF = `${FREECROCO_ROOT}/staff`;
export const ADMIN_HOME = '/categories';

/** Quizball admins see everything, partner staff only their section; any other account (e.g. a removed staff
 *  member, now a plain user) has no CMS access at all. */
export function cmsRole(role: string | null | undefined): CmsRole {
  if (role === 'admin') return 'admin';
  return role === PARTNER_STAFF_ROLE ? 'partner_staff' : 'none';
}

interface RouteRule {
  route: string;
  roles: readonly CmsRole[];
}

// One map for the sidebar and the layout guard. A route is a path prefix on segment boundaries;
// the longest match wins, and anything unlisted is admin-only.
export const ROUTE_ROLES: readonly RouteRule[] = [
  { route: FREECROCO_ROOT, roles: ['admin', 'partner_staff'] },
  { route: FREECROCO_STAFF, roles: ['admin'] },
];
const DEFAULT_ROLES: readonly CmsRole[] = ['admin'];

function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function rolesForPath(pathname: string): readonly CmsRole[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const rule = ROUTE_ROLES.filter((r) => matchesRoute(path, r.route)).sort((a, b) => b.route.length - a.route.length)[0];
  return rule?.roles ?? DEFAULT_ROLES;
}

export function canAccessPath(role: string | null | undefined, pathname: string): boolean {
  return rolesForPath(pathname).includes(cmsRole(role));
}

export const NO_ACCESS = '/no-access';

export function homeForRole(role: string | null | undefined): string {
  const r = cmsRole(role);
  return r === 'partner_staff' ? FREECROCO_ROOT : r === 'admin' ? ADMIN_HOME : NO_ACCESS;
}

/** Where the layout guard sends the user, or null when the path is theirs to see. */
export function guardRedirect(role: string | null | undefined, pathname: string): string | null {
  return canAccessPath(role, pathname) ? null : homeForRole(role);
}

/** Sidebar groups the role may open: every route of the group must be allowed. */
export function navGroupsForRole<T extends { routes: readonly string[] }>(groups: readonly T[], role: string | null | undefined): T[] {
  return groups.filter((group) => group.routes.every((route) => canAccessPath(role, route)));
}

/** A group's links the role may open (a partner staff member never sees the Staff link). */
export function navItemsForRole<T extends { href: string }>(items: readonly T[], role: string | null | undefined): T[] {
  return items.filter((item) => canAccessPath(role, item.href));
}

/** Resending a delivery re-sends player scores to the partner: Quizball admins only. */
export function canResendDeliveries(role: string | null | undefined): boolean {
  return cmsRole(role) === 'admin';
}

/** The ranked points table is what Freecroco is sent per match, agreed between the companies: Quizball admins only. */
export function canEditRankedPoints(role: string | null | undefined): boolean {
  return cmsRole(role) === 'admin';
}

export function canManageStaff(role: string | null | undefined): boolean {
  return cmsRole(role) === 'admin';
}
