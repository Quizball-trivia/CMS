'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ACTIVITY_ALLOWED_EMAIL } from '@/lib/constants';
import { useAuth } from '@/providers';
import {
  Layers,
  HelpCircle,
  Trophy,
  Activity,
  CalendarDays,
  Users,
  Megaphone,
} from 'lucide-react';

const navItems = [
  {
    title: 'Categories',
    href: '/categories',
    icon: Layers,
  },
  {
    title: 'Questions',
    href: '/questions',
    icon: HelpCircle,
  },
  {
    title: 'Daily Challenges',
    href: '/daily-challenges',
    icon: CalendarDays,
  },
  {
    title: 'Users',
    href: '/users',
    icon: Users,
  },
  {
    title: 'Announcements',
    href: '/announcements',
    icon: Megaphone,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const allNavItems = [
    ...navItems,
    ...(user?.email === ACTIVITY_ALLOWED_EMAIL
      ? [{ title: 'Activity', href: '/activity', icon: Activity }]
      : []),
  ];

  return (
    <aside className="w-20 bg-[#f8f9fb] border-r border-gray-200/50 flex flex-col h-screen sticky top-0 z-[100]">
      {/* Header */}
      <div className="p-4 flex items-center justify-center h-16 mb-4">
        <div className="bg-white rounded-2xl p-2.5 shadow-sm border border-gray-200/50 flex-shrink-0">
          <Trophy className="w-6 h-6 text-foreground" />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-4 py-2">
        {allNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-200',
                isActive
                  ? 'bg-white text-foreground shadow-sm border border-gray-200/50'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              )}
              title={item.title}
            >
              <Icon className={cn(
                "w-5 h-5 transition-transform duration-200",
                !isActive && "group-hover:scale-110"
              )} />
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
