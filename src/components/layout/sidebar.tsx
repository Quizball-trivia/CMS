'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers';
import { useHqOverview } from '@/hooks';
import { cmsRole, FREECROCO_ROOT, navGroupsForRole, navItemsForRole } from '@/lib/freecroco/access';
import { HQ_DEPARTMENTS, departmentHref, toolsForUser, withoutHiddenRealData } from '@/lib/hq-departments';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import type { HqDepartment, HqDepartmentKey } from '@/types';
import {
  Activity,
  BarChart3,
  Bot,
  CalendarClock,
  ChevronRight,
  Compass,
  Hammer,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings2,
  Sunrise,
  Target,
  Users,
  type LucideIcon,
  FileSearch,
} from 'lucide-react';

type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  /** Active only on this exact path, for an item whose href is a prefix of a sibling's. */
  exact?: boolean;
};

type DepartmentGroup = {
  key: HqDepartmentKey;
  title: string;
  emoji: string;
  /** Access rule: every route must be allowed for the group to show (see navGroupsForRole). */
  routes: string[];
  children: NavItem[];
};

const companyItems: NavItem[] = [
  { title: 'Director', href: '/hq/director', icon: Compass },
  { title: 'Builds', href: '/hq/builds', icon: Hammer },
  { title: 'Standup', href: '/hq', icon: Sunrise, exact: true },
  { title: 'Goals', href: '/hq/goals', icon: Target },
  { title: 'Analytics', href: '/hq/analytics', icon: BarChart3 },
  { title: 'Agents', href: '/hq/team', icon: Bot },
  { title: 'People', href: '/hq/people', icon: Users },
  { title: 'Work', href: '/hq/board', icon: KanbanSquare },
];

// Less-used HQ pages, kept small at the bottom.
const moreItems: NavItem[] = [
  { title: 'Inbox', href: '/hq/inbox', icon: Inbox },
  { title: 'Content gaps', href: '/hq/content-gaps', icon: FileSearch },
  { title: 'Automations', href: '/hq/schedules', icon: CalendarClock },
  { title: 'Activity', href: '/hq/activity', icon: Activity },
  // Browser preferences (e.g. showing real-data pages); not part of any department.
  { title: 'Preferences', href: '/settings', icon: Settings2 },
];

/** A department's top-level tool routes — sub-pages of another tool (e.g. /freecroco/staff) are left out. */
function rootRoutes(hrefs: string[]): string[] {
  return hrefs.filter((href) => !hrefs.some((other) => other !== href && href.startsWith(`${other}/`)));
}

// One group per department: its HQ overview page, then the existing tools it owns.
// `routes` (the group's access rule) lists the top-level tools — or the department
// page when there are none — so the Partners group stays visible to partner staff
// (just /freecroco) while its admin-only Overview and Staff links are filtered per item.
function departmentGroups(email: string | null | undefined, showRealData: boolean): DepartmentGroup[] {
  return HQ_DEPARTMENTS.map((d) => ({
    key: d.key,
    title: d.name,
    emoji: d.emoji,
    routes: d.tools.length > 0 ? rootRoutes(d.tools.map((t) => t.href)) : [departmentHref(d.key)],
    children: [
      { title: 'Overview', href: departmentHref(d.key), exact: true },
      // Real-data pages stay out of sight unless enabled in Preferences; some tools are
      // limited to specific accounts (e.g. Player activity).
      ...withoutHiddenRealData(toolsForUser(d, email), showRealData).map((t) => ({ title: t.title, href: t.href, icon: t.icon, exact: t.exact })),
    ],
  }));
}

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isItemActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : matches(pathname, item.href);
}

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = cmsRole(user?.role) === 'admin';
  // Live signals (approvals, who's working) for admins only — partner staff can't read HQ.
  const { data: overview } = useHqOverview({ enabled: isAdmin, refetchInterval: 60_000 });
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const company = navItemsForRole(companyItems, user?.role);
  const more = navItemsForRole(moreItems, user?.role);
  const showRealData = useRealAnalyticsVisible();
  const groups = navGroupsForRole(departmentGroups(user?.email, showRealData), user?.role)
    .map((group) => ({ ...group, children: navItemsForRole(group.children, user?.role) }))
    .filter((group) => group.children.length > 0);

  const inboxCount = overview ? (overview.countsByStatus?.needs_approval ?? overview.needsApproval.length) + overview.inboxUnread : 0;
  const deptSignals = new Map<string, HqDepartment>((overview?.departments ?? []).map((d) => [d.key, d]));

  return (
    <aside className="sticky top-0 z-[100] flex h-screen w-20 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:w-64">
      <Link
        href={cmsRole(user?.role) === 'partner_staff' ? FREECROCO_ROOT : '/hq'}
        aria-label="QuizBall HQ home"
        className="flex h-20 items-center justify-center gap-3 border-b border-slate-100 px-3 lg:justify-start lg:px-5"
      >
        <Image
          src="/assets/brand/quizball-logo.webp"
          alt="QuizBall"
          width={181}
          height={148}
          priority
          className="h-11 w-auto object-contain"
        />
        <span className="hidden leading-tight lg:block">
          <span className="block text-base font-extrabold tracking-tight text-slate-900">QuizBall HQ</span>
          <span className="block text-[11px] font-medium text-slate-400">{isAdmin ? 'Company workspace' : 'Partner workspace'}</span>
        </span>
      </Link>

      <nav className="scrollbar-hide flex-1 space-y-6 overflow-y-auto px-3 py-5 lg:px-4" aria-label="CMS navigation">
        {company.length > 0 && (
          <div className="space-y-1">
            <SectionHeading>Company</SectionHeading>
            {company.map((item) => (
              <NavLink key={item.href} item={item} active={isItemActive(pathname, item)} size="lg" />
            ))}
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-1">
            <SectionHeading>Departments</SectionHeading>
            {groups.map((group) => {
              const containsActive = group.children.some((c) => isItemActive(pathname, c)) || group.routes.some((r) => matches(pathname, r));
              const expanded = openGroups[group.key] ?? containsActive;
              const signal = deptSignals.get(group.key);
              const working = (signal?.working.length ?? 0) > 0;
              const approvals = signal?.counts.needsApproval ?? 0;
              const headerHref = group.children[0].href;

              return (
                <div key={group.key}>
                  <div
                    className={cn(
                      'group flex h-10 items-center rounded-lg transition',
                      containsActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    )}
                  >
                    <Link
                      href={headerHref}
                      title={group.title}
                      className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 px-3 text-sm font-semibold lg:justify-start"
                    >
                      <span className="relative text-base leading-none" aria-hidden>
                        {group.emoji}
                        {working && (
                          <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulse rounded-full bg-blue-500 ring-2 ring-white lg:hidden" />
                        )}
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate lg:block">{group.title}</span>
                      {working && (
                        <span title="An agent is working right now" aria-label="working" className="hidden h-2 w-2 animate-pulse rounded-full bg-blue-500 lg:inline-block" />
                      )}
                      {approvals > 0 && (
                        <span
                          title={`${approvals} waiting for approval`}
                          className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800 lg:inline-flex"
                        >
                          {approvals}
                        </span>
                      )}
                    </Link>
                    <button
                      type="button"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.title}`}
                      aria-expanded={expanded}
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [group.key]: !expanded }))}
                      className="mr-1 hidden h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 lg:grid"
                    >
                      <ChevronRight className={cn('size-4 transition', expanded && 'rotate-90')} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-0.5 hidden space-y-0.5 pb-1 pl-5 lg:block">
                      {group.children.map((item) => {
                        const active = isItemActive(pathname, item);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              'flex h-8 items-center gap-2.5 rounded-md border-l-2 px-3 text-[13px] font-medium transition',
                              active
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-slate-100 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                            )}
                          >
                            {item.icon ? <item.icon className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0 text-center text-[10px]">•</span>}
                            <span className="truncate">{item.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Collapsed rail (< lg): the active group's pages as icons. */}
                  {containsActive && (
                    <div className="space-y-1 pb-2 pt-1 lg:hidden">
                      {group.children.map((item) => {
                        const active = isItemActive(pathname, item);
                        const Icon = item.icon ?? LayoutDashboard;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            title={item.title}
                            aria-label={item.title}
                            className={cn(
                              'mx-auto grid size-9 place-items-center rounded-lg transition',
                              active ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'
                            )}
                          >
                            <Icon className="size-4" />
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {more.length > 0 && (
          <div className="space-y-0.5">
            <SectionHeading>More</SectionHeading>
            {more.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isItemActive(pathname, item)}
                badge={item.href === '/hq/inbox' ? inboxCount : 0}
              />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mb-1 hidden px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 lg:block">{children}</div>
  );
}

function NavLink({ item, active, badge = 0, size = 'sm' }: { item: NavItem; active: boolean; badge?: number; size?: 'sm' | 'lg' }) {
  const Icon = item.icon ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      title={item.title}
      aria-label={badge ? `${item.title} (${badge})` : item.title}
      className={cn(
        'relative flex items-center justify-center gap-3 rounded-xl px-3 transition lg:justify-start',
        size === 'lg' ? 'h-11 text-[15px] font-bold' : 'h-9 text-sm font-medium',
        active ? 'bg-slate-950 text-white shadow-sm' : size === 'lg' ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
      )}
    >
      <Icon className={cn('shrink-0', size === 'lg' ? 'size-5' : 'size-4')} />
      <span className="hidden min-w-0 flex-1 truncate lg:block">{item.title}</span>
      {badge > 0 && (
        <span
          className={cn(
            'absolute right-1.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold lg:static lg:h-5 lg:min-w-5 lg:text-[11px]',
            active ? 'bg-white text-slate-900' : 'bg-amber-500 text-white'
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
