'use client';

import Link from 'next/link';
import { Activity, ChevronRight, CircleGauge, FolderKanban, Rocket, Settings2, type LucideIcon } from 'lucide-react';
import { TD_TAB_GROUP_LABELS, tabsForRole, type TdTab, type TdTabGroup, type TdTabKey } from '@/lib/td/navigation';
import { cn } from '@/lib/utils';
import type { TdRole } from '@/types/td';
import { TD_TAB_ICONS } from './td-tab-icons';

const GROUP_ICONS: Record<TdTabGroup, LucideIcon> = {
  overview: CircleGauge,
  content: FolderKanban,
  publish: Rocket,
  operations: Activity,
  admin: Settings2,
};

function groupTabs(tabs: TdTab[]): Array<[TdTabGroup, TdTab[]]> {
  const groups = new Map<TdTabGroup, TdTab[]>();
  for (const tab of tabs) groups.set(tab.group, [...(groups.get(tab.group) ?? []), tab]);
  return [...groups.entries()];
}

/** The Quizball CMS's sidebar navigation (components/layout/sidebar.tsx): groups
 *  that open on their first page, the open group's pages listed under it, an
 *  icon rail below `lg`. */
export function TdNav({ role, activeKey }: { role: TdRole; activeKey: TdTabKey | null }) {
  return (
    <nav className="scrollbar-hide flex-1 space-y-1 overflow-y-auto px-3 py-5 lg:px-4" aria-label="Table Derby">
      {groupTabs(tabsForRole(role)).map(([group, tabs]) => {
        const groupActive = tabs.some((tab) => tab.key === activeKey);
        const GroupIcon = GROUP_ICONS[group];
        const title = TD_TAB_GROUP_LABELS[group];
        return (
          <div key={group} className="space-y-1">
            <Link
              href={tabs[0]!.href}
              title={title}
              className={cn(
                'group flex h-12 items-center justify-center gap-3 rounded-xl px-3 text-sm font-bold transition lg:justify-start',
                groupActive ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <GroupIcon className="size-5 shrink-0" />
              <span className="hidden min-w-0 flex-1 lg:block">{title}</span>
              {tabs.length > 1 && <ChevronRight className={cn('hidden size-4 transition lg:block', groupActive && 'rotate-90')} />}
            </Link>
            {groupActive && (
              <ul className="space-y-1 pb-2 pt-1 lg:pl-4">
                {tabs.map((tab) => {
                  const Icon = TD_TAB_ICONS[tab.key];
                  const active = tab.key === activeKey;
                  return (
                    <li key={tab.key}>
                      <Link
                        href={tab.href}
                        title={tab.hint ? `${tab.label} (${tab.hint})` : tab.label}
                        aria-label={tab.label}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'mx-auto grid size-10 place-items-center rounded-xl transition lg:mx-0 lg:flex lg:h-10 lg:w-auto lg:items-center lg:gap-3 lg:rounded-lg lg:border-l-2 lg:px-3 lg:text-xs lg:font-bold',
                          active
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100 lg:border-blue-600 lg:ring-0'
                            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700 lg:border-transparent',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="hidden min-w-0 flex-1 truncate lg:block">{tab.label}</span>
                        {tab.hint && <span className="hidden shrink-0 text-[10px] font-semibold text-slate-400 lg:inline">{tab.hint}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
