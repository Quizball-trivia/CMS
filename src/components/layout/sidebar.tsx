'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Activity,
  Bot,
  CalendarDays,
  ChevronRight,
  CircleGauge,
  FileQuestion,
  FolderKanban,
  Gamepad2,
  Gavel,
  Megaphone,
  PanelsTopLeft,
  Settings2,
  SlidersHorizontal,
  Trophy,
  Users,
} from 'lucide-react';

type NavGroup = {
  title: string;
  href: string;
  icon: typeof Trophy;
  routes: string[];
  children: Array<{
    title: string;
    href: string;
    icon: typeof Trophy;
  }>;
};

const navGroups: NavGroup[] = [
  {
    title: 'Analytics',
    href: '/stats',
    icon: Activity,
    routes: ['/stats', '/activity'],
    children: [
      { title: 'Dashboard', href: '/stats', icon: CircleGauge },
      { title: 'Activity', href: '/activity', icon: Activity },
    ],
  },
  {
    title: 'Content',
    href: '/quiz-pages',
    icon: FolderKanban,
    routes: ['/categories', '/quiz-pages', '/questions', '/announcements', '/agents'],
    children: [
      { title: 'Categories', href: '/categories', icon: FolderKanban },
      { title: 'Quiz Pages', href: '/quiz-pages', icon: PanelsTopLeft },
      { title: 'Questions', href: '/questions', icon: FileQuestion },
      { title: 'Agents & VPS', href: '/agents', icon: Bot },
      { title: 'Announcements', href: '/announcements', icon: Megaphone },
    ],
  },
  {
    title: 'Competitions',
    href: '/weekend-league',
    icon: Gamepad2,
    routes: ['/weekend-league', '/daily-challenges', '/auction'],
    children: [
      { title: 'Weekend League', href: '/weekend-league', icon: Trophy },
      { title: 'Daily Challenges', href: '/daily-challenges', icon: CalendarDays },
      { title: 'Auction Cards', href: '/auction', icon: Gavel },
    ],
  },
  {
    title: 'Users',
    href: '/users',
    icon: Users,
    routes: ['/users'],
    children: [{ title: 'User accounts', href: '/users', icon: Users }],
  },
  {
    title: 'Settings',
    href: '/bot-tuning',
    icon: Settings2,
    routes: ['/bot-tuning'],
    children: [{ title: 'Bot tuning', href: '/bot-tuning', icon: SlidersHorizontal }],
  },
];

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-[100] flex h-screen w-20 shrink-0 flex-col border-r border-slate-200/80 bg-white lg:w-60">
      <Link href="/stats" className="flex h-20 items-center justify-center gap-3 border-b border-slate-100 px-4 lg:justify-start lg:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          <Trophy className="size-5" />
        </span>
        <span className="hidden text-xl font-black tracking-[-0.04em] text-slate-950 lg:block">QuizBall</span>
      </Link>

      <nav className="scrollbar-hide flex-1 space-y-1 overflow-y-auto px-3 py-5 lg:px-4" aria-label="CMS navigation">
        {navGroups.map((group) => {
          const isGroupActive = group.routes.some((route) => matches(pathname, route));
          const GroupIcon = group.icon;

          return (
            <div key={group.title} className="space-y-1">
              <Link
                href={group.href}
                className={cn(
                  'group flex h-12 items-center justify-center gap-3 rounded-xl px-3 text-sm font-bold transition lg:justify-start',
                  isGroupActive
                    ? 'bg-slate-950 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                )}
                title={group.title}
              >
                <GroupIcon className="size-5 shrink-0" />
                <span className="hidden min-w-0 flex-1 lg:block">{group.title}</span>
                {group.children.length > 1 && (
                  <ChevronRight className={cn('hidden size-4 transition lg:block', isGroupActive && 'rotate-90')} />
                )}
              </Link>

              {isGroupActive && (
                <div className="space-y-1 pb-2 pt-1 lg:hidden">
                  {group.children.map((item) => {
                    const isActive = matches(pathname, item.href);
                    const ItemIcon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.title}
                        aria-label={item.title}
                        className={cn(
                          'mx-auto grid size-10 place-items-center rounded-xl transition',
                          isActive
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                        )}
                      >
                        <ItemIcon className="size-4" />
                      </Link>
                    );
                  })}
                </div>
              )}

              {isGroupActive && (
                <div className="hidden space-y-1 pb-2 pl-4 pt-1 lg:block">
                  {group.children.map((item) => {
                    const isActive = matches(pathname, item.href);
                    const ItemIcon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex h-10 items-center gap-3 rounded-lg border-l-2 px-3 text-xs font-bold transition',
                          isActive
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-700',
                        )}
                      >
                        <ItemIcon className="size-4 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
