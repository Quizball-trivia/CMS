'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Team covers two pages; this switch sits in their header. */
export function TeamTabs({ active }: { active: 'agents' | 'people' }) {
  const tab = (key: 'agents' | 'people', href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={cn('rounded px-2 py-0.5', active === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950')}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Team" className="inline-flex items-center gap-1 normal-case tracking-normal">
      <span className="mr-1">Team</span>
      {tab('agents', '/hq/team', 'Agents')}
      {tab('people', '/hq/people', 'People')}
    </nav>
  );
}
