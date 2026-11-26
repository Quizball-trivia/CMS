'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers';
import { cmsRole, FREECROCO_ROOT, navGroupsForRole, navItemsForRole } from '@/lib/freecroco/access';
import { fcLangForRole, fcText } from '@/lib/freecroco/i18n';
import { DEPARTMENT_LOOK, HQ_ANALYTICS_TOOLS, HQ_DEPARTMENTS, canSeeTool, toolsForUser } from '@/lib/hq-departments';
import type { HqDepartmentKey } from '@/types';
import { BarChart3, Bot, ChevronRight, LayoutDashboard, LogOut, type LucideIcon } from 'lucide-react';

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
  /** The department's colour, on its icon. */
  tint: string;
  /** Access rule: every route must be allowed for the group to show (see navGroupsForRole). */
  routes: string[];
  children: NavItem[];
};

// The pages that look across the whole company. Everything else belongs to a department.
const hqItems: NavItem[] = [
  { title: 'Home', href: '/hq', icon: LayoutDashboard, exact: true, hint: 'How we are doing, what the agents are doing, what needs a person' },
  { title: 'Analytics', href: '/hq/analytics', icon: BarChart3, hint: 'Players, growth, retention and games' },
  { title: 'Agents', href: '/hq/agents', icon: Bot, hint: 'Every agent in the company, running and suggested, and the subscriptions they run on' },
];

/** A department's top-level tool routes — sub-pages of another tool (e.g. /freecroco/staff) are left out. */
function rootRoutes(hrefs: string[]): string[] {
  return hrefs.filter((href) => !hrefs.some((other) => other !== href && href.startsWith(`${other}/`)));
}

// One group per department: its own HQ page first (where its agents and numbers live), then the CMS tools it owns.
// `routes` (the group's access rule) lists the top-level tools, so the Partners group stays visible to partner staff
// (just /freecroco) while the links they may not open are filtered per item.
function departmentGroups(email: string | null | undefined, t: (s: string) => string = (s) => s): DepartmentGroup[] {
  return HQ_DEPARTMENTS.map((d) => ({
    key: d.key,
    title: t(d.name),
    icon: DEPARTMENT_LOOK[d.key].icon,
    tint: DEPARTMENT_LOOK[d.key].onInk,
    routes: d.tools.length > 0 ? rootRoutes(d.tools.map((t) => t.href.split('?')[0]!).filter((href) => !href.startsWith('/hq/'))) : [d.home],
    children: [
      { title: t('Overview'), href: d.home, exact: true },
      // Some tools are limited to specific accounts (e.g. Player activity).
      ...toolsForUser(d, email).map((tool) => ({ title: t(tool.title), href: tool.href, icon: tool.icon, exact: tool.exact })),
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

const ROW = 'flex h-11 items-center rounded-lg text-sm font-medium transition md:h-9';
const ROW_IDLE = 'text-slate-400 hover:bg-white/5 hover:text-white';
const ROW_ACTIVE = 'bg-white/10 text-white';
const GROUP_LABEL = 'hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 navwide:block';

/** `rail`: the persistent sidebar (md and up). `drawer`: the same navigation, full width, inside the phone menu. */
export function Sidebar({ variant = 'rail' }: { variant?: 'rail' | 'drawer' }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = cmsRole(user?.role) === 'admin';
  // Freecroco staff read Georgian; everyone else sees the menu in English.
  const { t } = fcText(fcLangForRole(user?.role));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const top = navItemsForRole(hqItems, user?.role);
  const analyticsTools = navItemsForRole(
    HQ_ANALYTICS_TOOLS.filter((tool) => canSeeTool(tool, user?.email)).map((tool) => ({ title: tool.title, href: tool.href, icon: tool.icon })),
    user?.role
  );
  const groups = navGroupsForRole(departmentGroups(user?.email, t), user?.role)
    .map((group) => ({ ...group, children: navItemsForRole(group.children, user?.role) }))
    .filter((group) => group.children.length > 0);
  // Analytics opens its player pages under it while one of them (or Analytics itself) is showing.
  const inAnalytics = matches(pathname, '/hq/analytics') || analyticsTools.some((i) => isItemActive(pathname, i));
  const name = user?.nickname || user?.email || 'Signed in';
  const initial = (user?.nickname || user?.email || '?').trim()[0]?.toUpperCase() ?? '?';

  return (
    <aside
      data-nav-wide={variant === 'drawer' ? '' : undefined}
      className={cn('flex flex-col bg-ink text-slate-300', variant === 'drawer' ? 'h-full w-full' : 'sticky top-0 z-[100] hidden h-screen w-20 shrink-0 md:flex navwide:w-64')}
    >
      <Link
        href={cmsRole(user?.role) === 'partner_staff' ? FREECROCO_ROOT : '/hq'}
        aria-label="QuizBall HQ home"
        className="flex h-16 shrink-0 items-center justify-center gap-3 px-3 navwide:justify-start navwide:px-5"
      >
        <Image src="/assets/brand/quizball-logo.webp" alt="QuizBall" width={181} height={148} priority className="h-9 w-auto object-contain" />
        <span className="hidden leading-tight navwide:block">
          <span className="block font-display text-[15px] font-semibold tracking-tight text-white">QuizBall HQ</span>
          <span className="block text-[11px] font-medium text-slate-500">{isAdmin ? 'Run by agents, steered by us' : t('Partner workspace')}</span>
        </span>
      </Link>

      <nav className="scrollbar-hide flex-1 overflow-y-auto px-3 pb-4" aria-label="CMS navigation">
        {top.length > 0 && (
          <div className="space-y-0.5 pt-2">
            {top.map((item) => (
              <div key={item.href}>
                <NavLink item={item} active={item.href === '/hq/analytics' ? inAnalytics && matches(pathname, '/hq/analytics') : isItemActive(pathname, item)} />
                {item.href === '/hq/analytics' && inAnalytics && analyticsTools.length > 0 && (
                  <div className="mt-0.5 hidden space-y-0.5 pb-1 pl-5 navwide:block">
                    {analyticsTools.map((sub) => (
                      <SubLink key={sub.href} item={sub} active={isItemActive(pathname, sub)} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {groups.length > 0 && (
          <div className="space-y-0.5">
            {isAdmin ? <p className={GROUP_LABEL}>{t('Departments')}</p> : <div className="pt-2" />}
            {groups.map((group) => {
              const containsActive = group.children.some((c) => isItemActive(pathname, c)) || group.routes.some((r) => matches(pathname, r));
              const expanded = openGroups[group.key] ?? containsActive;
              const headerHref = group.children[0].href;

              return (
                <div key={group.key}>
                  <div className={cn('group', ROW, containsActive ? ROW_ACTIVE : ROW_IDLE)}>
                    <Link href={headerHref} title={group.title} className="flex h-full min-w-0 flex-1 items-center justify-center gap-3 px-3 navwide:justify-start">
                      <group.icon className={cn('size-4 shrink-0', group.tint)} aria-hidden />
                      <span className="hidden min-w-0 flex-1 truncate navwide:block">{group.title}</span>
                    </Link>
                    {group.children.length > 1 && (
                      <button
                        type="button"
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.title}`}
                        aria-expanded={expanded}
                        onClick={() => setOpenGroups((prev) => ({ ...prev, [group.key]: !expanded }))}
                        className="mr-1 hidden h-11 w-11 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white/10 hover:text-white md:h-7 md:w-7 navwide:grid"
                      >
                        <ChevronRight className={cn('size-4 transition', expanded && 'rotate-90')} />
                      </button>
                    )}
                  </div>

                  {expanded && group.children.length > 1 && (
                    <div className="mt-0.5 hidden space-y-0.5 pb-1 pl-5 navwide:block">
                      {group.children.map((item) => (
                        <SubLink key={item.href} item={item} active={isItemActive(pathname, item)} />
                      ))}
                    </div>
                  )}

                  {/* Collapsed rail (< lg): the active group's pages as icons. */}
                  {containsActive && group.children.length > 1 && (
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
                            className={cn('mx-auto grid size-9 place-items-center rounded-lg transition', active ? 'bg-white/15 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-white')}
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
      </nav>

      {/* Who is signed in, and the way out. */}
      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-white/10 px-3 py-3 navwide:justify-start navwide:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand" aria-hidden>
          {initial}
        </span>
        <span className="hidden min-w-0 flex-1 leading-tight navwide:block">
          <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
          <span className="block truncate text-[11px] text-slate-500">{isAdmin ? 'Admin' : t('Freecroco staff member')}</span>
        </span>
        <button
          type="button"
          onClick={() => logout()}
          title={t('Log out')}
          aria-label={t('Log out')}
          className="hidden size-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-white/10 hover:text-white navwide:grid"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </aside>
  );
}

function SubLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex h-11 items-center gap-2.5 rounded-md border-l px-3 text-[13px] font-medium transition md:h-8',
        active ? 'border-brand bg-white/10 text-white' : 'border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'
      )}
    >
      {item.icon ? <item.icon className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0 text-center text-[10px]">•</span>}
      <span className="truncate">{item.title}</span>
    </Link>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      title={item.hint ? `${item.title} — ${item.hint}` : item.title}
      aria-label={item.title}
      className={cn('relative justify-center gap-3 px-3 navwide:justify-start', ROW, active ? ROW_ACTIVE : ROW_IDLE)}
    >
      {active && <span className="absolute inset-y-2 left-0 hidden w-0.5 rounded-full bg-brand navwide:block" aria-hidden />}
      <Icon className={cn('size-4 shrink-0', active && 'text-brand')} />
      <span className="hidden min-w-0 flex-1 truncate navwide:block">{item.title}</span>
    </Link>
  );
}
