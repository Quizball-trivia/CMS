'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutList } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUCTION_TABS = [
  { href: '/auction', label: 'Cards', icon: LayoutList },
  { href: '/auction/pipeline', label: 'Pipeline', icon: Activity },
] as const;

export function AuctionNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/auction') {
      const others = AUCTION_TABS.filter((tab) => tab.href !== '/auction').map((tab) => tab.href);
      return (
        pathname === '/auction' ||
        (pathname.startsWith('/auction/') && !others.some((other) => pathname.startsWith(other)))
      );
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
      {AUCTION_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
