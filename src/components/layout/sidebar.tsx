'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers';
import { cmsRole, FREECROCO_ROOT, navGroupsForRole, navItemsForRole } from '@/lib/freecroco/access';
import { fcLangForRole, fcText } from '@/lib/freecroco/i18n';
import { HQ_DEPARTMENTS, toolsForUser, withoutHiddenRealData } from '@/lib/hq-departments';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import type { HqDepartmentKey } from '@/types';
import {
  BarChart3,
  ChevronRight,
  Gamepad2,
  Handshake,
  LayoutDashboard,
  PenLine,
  Settings2,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  title: string;
  href: string;
  icon?: LucideIcon;
  /** Active only on this exact path, for an item whose href is a prefix of a sibling's. */
  exact?: boolean;
  /** What the page is for, shown on hover. */
  hint?: string;
  /** Other routes that light this item up (Team covers Agents and People). */
  alsoActive?: string[];
};

type DepartmentGroup = {
  key: HqDepartmentKey;
  title: string;
  icon: LucideIcon;
  /** Access rule: every route must be allowed for the group to show (see navGroupsForRole). */
  routes: string[];
  children: NavItem[];
};

type NavSection = { title: string; items: NavItem[] };

// The two pages that look across the whole company. Everything else belongs to a department.
const hqSections: NavSection[] = [
  {
    title: '',
    items: [
      { title: 'Home', href: '/hq', icon: LayoutDashboard, exact: true, hint: 'How we are doing, what the agents are doing, what needs a person' },
      { title: 'Analytics', href: '/hq/analytics', icon: BarChart3, hint: 'Players, growth, retention and games' },
    ],
  },
];

// Browser preferences (e.g. showing real-data pages); not part of any department.
const footerItems: NavItem[] = [{ title: 'Preferences', href: '/settings', icon: Settings2 }];

const DEPARTMENT_ICONS: Record<HqDepartmentKey, LucideIcon> = {
  content: PenLine,
  games: Gamepad2,
  competitions: Trophy,
  growth: TrendingUp,
  partners: Handshake,
};

/** A department's top-level tool routes — sub-pages of another tool (e.g. /freecroco/staff) are left out. */
function rootRoutes(hrefs: string[]): string[] {
  return hrefs.filter((href) => !hrefs.some((other) => other !== href && href.startsWith(`${other}/`)));
}

// One group per department: its own HQ page first (where its agents and numbers live), then the CMS tools it owns.
// `routes` (the group's access rule) lists the top-level tools, so the Partners group stays visible to partner staff
// (just /freecroco) while the links they may not open are filtered per item.
function departmentGroups(email: string | null | undefined, showRealData: boolean, t: (s: string) => string = (s) => s): DepartmentGroup[] {
  return HQ_DEPARTMENTS.map((d) => ({
    key: d.key,
    title: t(d.name),
    icon: DEPARTMENT_ICONS[d.key] ?? LayoutDashboard,
    routes: d.tools.length > 0 ? rootRoutes(d.tools.map((t) => t.href)) : d.home ? [d.home] : [],
    children: [
      ...(d.home ? [{ title: t('Overview'), href: d.home, exact: false }] : []),
      // Real-data pages stay out of sight unless enabled in Preferences; some tools are
      // limited to specific accounts (e.g. Player activity).
      ...withoutHiddenRealData(toolsForUser(d, email), showRealData).map((tool) => ({ title: t(tool.title), href: tool.href, icon: tool.icon, exact: tool.exact })),
    ],
  }));
}

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.alsoActive?.some((r) => matches(pathname, r))) return true;
  return item.exact ? pathname === item.href : matches(pathname, item.href);
}

/** `rail`: the persistent sidebar (md and up). `drawer`: the same navigation, full width, inside the phone menu. */
export function Sidebar({ variant = 'rail' }: { variant?: 'rail' | 'drawer' }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = cmsRole(user?.role) === 'admin';
  // Freecroco staff read Georgian; everyone else sees the menu in English.
  const { t } = fcText(fcLangForRole(user?.role));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const sections = hqSections
    .map((section) => ({ ...section, items: navItemsForRole(section.items, user?.role) }))
    .filter((section) => section.items.length > 0);
  const footer = navItemsForRole(footerItems, user?.role);
  const showRealData = useRealAnalyticsVisible();
  const groups = navGroupsForRole(departmentGroups(user?.email, showRealData, t), user?.role)
    .map((group) => ({ ...group, children: navItemsForRole(group.children, user?.role) }))
    .filter((group) => group.children.length > 0);

  return (
    <aside
      data-nav-wide={variant === 'drawer' ? '' : undefined}
      className={cn(
        'flex flex-col bg-white',
        variant === 'drawer' ? 'h-full w-full' : 'sticky top-0 z-[100] hidden h-screen w-20 shrink-0 border-r border-slate-200 md:flex navwide:w-64'
      )}
    >
      <Link
        href={cmsRole(user?.role) === 'partner_staff' ? FREECROCO_ROOT : '/hq'}
        aria-label="QuizBall HQ home"
        className="flex h-16 items-center justify-center gap-3 border-b border-slate-200 px-3 navwide:justify-start navwide:px-5"
      >
        <Image
          src="/assets/brand/quizball-logo.webp"
          alt="QuizBall"
          width={181}
          height={148}
          priority
          className="h-9 w-auto object-contain"
        />
        <span className="hidden leading-tight navwide:block">
          <span className="block text-sm font-semibold tracking-tight text-slate-950">QuizBall HQ</span>
          <span className="block text-[11px] font-medium text-slate-500">{isAdmin ? 'Company workspace' : t('Partner workspace')}</span>
        </span>
      </Link>

      <nav className="scrollbar-hide flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-label="CMS navigation">
        {sections.map((section) => {
          // A titled section folds away (closed by default, open while one of its pages is showing); the rail
          // (< navwide) always shows its icons.
          const containsActive = section.items.some((item) => isItemActive(pathname, item));
          const open = !section.title || (openGroups[`section:${section.title}`] ?? containsActive);
          return (
            <div key={section.title || 'main'} className="space-y-0.5">
              {section.title && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [`section:${section.title}`]: !open }))}
                  className="mb-0.5 hidden min-h-11 w-full items-center gap-1 rounded-md px-3 md:min-h-9 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 navwide:flex"
                >
                  <ChevronRight className={cn('size-3 transition', open && 'rotate-90')} />
                  {section.title}
                </button>
              )}
              <div className={cn('space-y-0.5', !open && 'navwide:hidden')}>
                {section.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isItemActive(pathname, item)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {groups.length > 0 && (() => {
          // Folded like "More": open while one of their pages is showing; the rail always shows the icons.
          const deptActive = groups.some((g) => g.children.some((c) => isItemActive(pathname, c)) || g.routes.some((r) => matches(pathname, r)));
          const deptOpen = openGroups['section:Departments'] ?? deptActive;
          return (
          <div className="space-y-0.5">
            <button
              type="button"
              aria-expanded={deptOpen}
              onClick={() => setOpenGroups((prev) => ({ ...prev, 'section:Departments': !deptOpen }))}
              className="mb-0.5 hidden min-h-11 w-full items-center gap-1 rounded-md px-3 md:min-h-9 text-[13px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 navwide:flex"
            >
              <ChevronRight className={cn('size-3 transition', deptOpen && 'rotate-90')} />
              {t('Departments')}
            </button>
            <div className={cn('space-y-0.5', !deptOpen && 'navwide:hidden')}>
            {groups.map((group) => {
              const containsActive = group.children.some((c) => isItemActive(pathname, c)) || group.routes.some((r) => matches(pathname, r));
              const expanded = openGroups[group.key] ?? containsActive;
              const headerHref = group.children[0].href;

              return (
                <div key={group.key}>
                  <div
                    className={cn(
                      'group flex h-11 items-center rounded-md transition md:h-9',
                      containsActive ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    )}
                  >
                    <Link
                      href={headerHref}
                      title={group.title}
                      className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 px-3 text-sm font-medium navwide:justify-start"
                    >
                      <group.icon className="size-4 shrink-0" aria-hidden />
                      <span className="hidden min-w-0 flex-1 truncate navwide:block">{group.title}</span>
                    </Link>
                    <button
                      type="button"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.title}`}
                      aria-expanded={expanded}
                      onClick={() => setOpenGroups((prev) => ({ ...prev, [group.key]: !expanded }))}
                      className="mr-1 hidden h-11 w-11 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white hover:text-slate-700 md:h-7 md:w-7 navwide:grid"
                    >
                      <ChevronRight className={cn('size-4 transition', expanded && 'rotate-90')} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="mt-0.5 hidden space-y-0.5 pb-1 pl-5 navwide:block">
                      {group.children.map((item) => {
                        const active = isItemActive(pathname, item);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              'flex h-11 items-center gap-2.5 rounded-md border-l-2 px-3 text-[13px] font-medium transition md:h-8',
                              active
                                ? 'border-slate-950 bg-slate-100 font-semibold text-slate-950'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900'
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
                    <div className="space-y-1 pb-2 pt-1 navwide:hidden">
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
          </div>
          );
        })()}
        {footer.length > 0 && (
          <div className="space-y-0.5 border-t border-slate-100 pt-4">
            {footer.map((item) => (
              <NavLink key={item.href} item={item} active={isItemActive(pathname, item)} />
            ))}
          </div>
        )}
      </nav>
    </aside>
  );
}

function NavLink({ item, active, badge = 0 }: { item: NavItem; active: boolean; badge?: number }) {
  const Icon = item.icon ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      title={item.hint ? `${item.title} — ${item.hint}` : item.title}
      aria-label={badge ? `${item.title} (${badge})` : item.title}
      className={cn(
        // 44px rows in the phone drawer, 36px in the desktop rail.
        'relative flex h-11 items-center justify-center gap-3 rounded-md px-3 text-sm font-medium transition md:h-9 navwide:justify-start',
        active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="hidden min-w-0 flex-1 truncate navwide:block">{item.title}</span>
      {badge > 0 && (
        <span
          className={cn(
            'absolute right-1.5 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums navwide:static navwide:h-5 navwide:min-w-5 navwide:text-[11px]',
            active ? 'bg-white text-slate-950' : 'bg-amber-500 text-white'
          )}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
