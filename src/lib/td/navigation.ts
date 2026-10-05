import { t } from '@/lib/td/i18n';
import { TD_ROLES, type TdRole } from '@/types/td';
import { isTableDerbyPath, TD_ROOT } from '@/lib/workspace-guard';

export type TdTabKey =
  | 'dashboard'
  | 'questions'
  | 'categories'
  | 'dailies'
  | 'players'
  | 'leaderboard'
  | 'integration'
  | 'team'
  | 'settings';

export type TdTabGroup = 'analytics' | 'content' | 'competitions' | 'users' | 'settings';

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

// The Quizball CMS's sidebar groups (components/layout/sidebar.tsx), in its order.
export const TD_TAB_GROUP_LABELS: Record<TdTabGroup, string> = {
  analytics: t('Analytics'),
  content: t('Content'),
  competitions: t('Competitions'),
  users: t('Users'),
  settings: t('Settings'),
};

export const TD_TABS: readonly TdTab[] = [
  {
    key: 'dashboard',
    href: TD_ROOT,
    label: t('Dashboard'),
    description: t('Players, matches and dailies played: today, yesterday, the last 7 and the last 30 days.'),
    group: 'analytics',
    roles: ALL,
  },
  {
    key: 'categories',
    href: `${TD_ROOT}/categories`,
    label: t('Categories'),
    description: t('The categories of Round I (ბარათონი) and Round III (პაპა კარლოს ყუთი). A category is approved with its questions.'),
    group: 'content',
    roles: ALL,
  },
  {
    key: 'questions',
    href: `${TD_ROOT}/questions`,
    label: t('Questions'),
    description: t('The cards and questions of every game mode: search, edit, upload, approve.'),
    group: 'content',
    roles: ALL,
  },
  {
    key: 'dailies',
    href: `${TD_ROOT}/dailies`,
    label: t('Daily Challenges'),
    description: t('Football Logic, Put in Order and Career Path: their timing and the question categories they play.'),
    group: 'competitions',
    roles: ALL,
  },
  {
    key: 'players',
    href: `${TD_ROOT}/players`,
    label: t('Players'),
    description: t('Search by nickname or Betsson id, match history and replays, and corrections (void + refund) with a reason.'),
    group: 'users',
    roles: ADMINS,
  },
  {
    key: 'leaderboard',
    href: `${TD_ROOT}/leaderboard`,
    label: t('Leaderboard'),
    description: t('Standings, frozen snapshots and their export.'),
    group: 'users',
    roles: ADMINS,
  },
  {
    key: 'team',
    href: `${TD_ROOT}/team`,
    label: t('Team'),
    description: t('Invite editors and set roles.'),
    group: 'settings',
    roles: ADMINS,
  },
  {
    key: 'integration',
    href: `${TD_ROOT}/integration`,
    label: t('Integration'),
    description: t('Session inits, launches and webhook deliveries with their reason codes, retry and search.'),
    group: 'settings',
    roles: ADMINS,
  },
  {
    key: 'settings',
    href: `${TD_ROOT}/settings`,
    label: t('Settings'),
    description: t('Tickets per day and maintenance mode.'),
    group: 'settings',
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
