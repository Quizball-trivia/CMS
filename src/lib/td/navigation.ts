import { TD_ROLES, type TdRole } from '@/types/td';
import { isTableDerbyPath, TD_ROOT } from '@/lib/workspace-guard';

export type TdTabKey =
  | 'dashboard'
  | 'questions'
  | 'categories'
  | 'dailies'
  | 'clubs'
  | 'media'
  | 'import'
  | 'releases'
  | 'players'
  | 'leaderboard'
  | 'integration'
  | 'team'
  | 'settings';

export type TdTabGroup = 'overview' | 'content' | 'publish' | 'operations' | 'admin';

export interface TdTab {
  key: TdTabKey;
  href: string;
  label: string;
  /** Secondary name shown under the label (round number or Georgian name). */
  hint?: string;
  description: string;
  group: TdTabGroup;
  roles: readonly TdRole[];
}

const ALL = TD_ROLES;
// Plan §13.2: player data, leaderboard exports, integration logs and team
// management are Betsson admin + Quizball ops; settings are ops only.
const ADMINS: readonly TdRole[] = ['betsson_admin', 'ops'];
const OPS: readonly TdRole[] = ['ops'];

export const TD_TAB_GROUP_LABELS: Record<TdTabGroup, string> = {
  overview: 'Overview',
  content: 'Content',
  publish: 'Publish',
  operations: 'Operations',
  admin: 'Admin',
};

export const TD_TABS: readonly TdTab[] = [
  {
    key: 'dashboard',
    href: TD_ROOT,
    label: 'Dashboard',
    description: 'Players, matches and dailies played, today and yesterday in Georgia time.',
    group: 'overview',
    roles: ALL,
  },
  {
    key: 'questions',
    href: `${TD_ROOT}/questions`,
    label: 'Questions',
    description: 'The cards and questions of every game mode: search, edit, upload, approve.',
    group: 'content',
    roles: ALL,
  },
  {
    key: 'categories',
    href: `${TD_ROOT}/categories`,
    label: 'Categories',
    description: 'The categories of Round I (ბარათონი) and Round III (პაპა კარლოს ყუთი). A category is approved with its questions.',
    group: 'content',
    roles: ALL,
  },
  {
    key: 'dailies',
    href: `${TD_ROOT}/dailies`,
    label: 'Dailies',
    description: 'Football Logic, Put in Order and Career Path, each on a calendar with one puzzle per Georgia date.',
    group: 'content',
    roles: ALL,
  },
  {
    key: 'clubs',
    href: `${TD_ROOT}/clubs`,
    label: 'Clubs',
    description: 'Clubs and crests used by Career Path, onboarding and cards.',
    group: 'content',
    roles: ALL,
  },
  {
    key: 'media',
    href: `${TD_ROOT}/media`,
    label: 'Media',
    description: 'Upload and preview images, record their rights (licence, credit, source) and approve them.',
    group: 'content',
    roles: ALL,
  },
  {
    key: 'import',
    href: `${TD_ROOT}/import`,
    label: 'Upload',
    description: 'Upload questions in bulk from a spreadsheet file: check, preview, import as drafts, and undo a batch.',
    group: 'publish',
    roles: ALL,
  },
  {
    key: 'releases',
    href: `${TD_ROOT}/releases`,
    label: 'Releases',
    description:
      'Changes since the last release, the validation report (pool sizes, missing images, rights, 30 days of dailies), publish and roll back.',
    group: 'publish',
    // Editors see the validation report; publish and roll back stay publisher+ in the API.
    roles: ALL,
  },
  {
    key: 'players',
    href: `${TD_ROOT}/players`,
    label: 'Players',
    description: 'Search by nickname or Betsson id, match history and replays, and corrections (void + refund) with a reason.',
    group: 'operations',
    roles: ADMINS,
  },
  {
    key: 'leaderboard',
    href: `${TD_ROOT}/leaderboard`,
    label: 'Leaderboard',
    description: 'Standings, frozen snapshots and their export.',
    group: 'operations',
    roles: ADMINS,
  },
  {
    key: 'integration',
    href: `${TD_ROOT}/integration`,
    label: 'Integration',
    description: 'Session inits, launches and webhook deliveries with their reason codes, retry and search.',
    group: 'operations',
    roles: ADMINS,
  },
  {
    key: 'team',
    href: `${TD_ROOT}/team`,
    label: 'Team',
    description: 'Invite editors and set roles.',
    group: 'admin',
    roles: ADMINS,
  },
  {
    key: 'settings',
    href: `${TD_ROOT}/settings`,
    label: 'Settings',
    description: 'Tickets per day and maintenance mode.',
    group: 'admin',
    roles: OPS,
  },
];

export function getTab(key: TdTabKey): TdTab {
  const tab = TD_TABS.find((candidate) => candidate.key === key);
  if (!tab) throw new Error(`Unknown Table Derby tab: ${key}`);
  return tab;
}

export function canAccessTab(tab: TdTab, role: TdRole): boolean {
  return tab.roles.includes(role);
}

export function tabsForRole(role: TdRole): TdTab[] {
  return TD_TABS.filter((tab) => canAccessTab(tab, role));
}

/**
 * The tab for the console layout's active child segment (useSelectedLayoutSegment:
 * resolved from the route tree, not the URL, so framework aliases cannot change it).
 * Unknown segments get null and the console fails closed.
 */
export function tabForSegment(segment: string | null): TdTab | null {
  const href = segment === null ? TD_ROOT : `${TD_ROOT}/${segment}`;
  return TD_TABS.find((tab) => tab.href === href) ?? null;
}

const PARSE_BASE = 'https://td.invalid';

/** Post-login destination: only a Table Derby path on this origin, never the login page itself. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return TD_ROOT;
  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return TD_ROOT;
  }
  if (url.origin !== PARSE_BASE || !isTableDerbyPath(url.pathname)) return TD_ROOT;
  if (url.pathname === `${TD_ROOT}/login` || url.pathname.startsWith(`${TD_ROOT}/login/`)) return TD_ROOT;
  return `${url.pathname}${url.search}`;
}
