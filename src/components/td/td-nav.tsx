'use client';

import Link from 'next/link';
import { TD_TAB_GROUP_LABELS, tabsForRole, type TdTab, type TdTabGroup, type TdTabKey } from '@/lib/td/navigation';
import { cn } from '@/lib/utils';
import type { TdRole } from '@/types/td';
import { TD_TAB_ICONS } from './td-tab-icons';

function groupTabs(tabs: TdTab[]): Array<[TdTabGroup, TdTab[]]> {
  const groups = new Map<TdTabGroup, TdTab[]>();
  for (const tab of tabs) groups.set(tab.group, [...(groups.get(tab.group) ?? []), tab]);
  return [...groups.entries()];
}

export function TdNav({ role, activeKey, onNavigate }: { role: TdRole; activeKey: TdTabKey | null; onNavigate?: () => void }) {

  return (
    <nav aria-label="Table Derby" className="flex flex-col gap-5">
      {groupTabs(tabsForRole(role)).map(([group, tabs]) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-(--td-text-3)">
            {TD_TAB_GROUP_LABELS[group]}
          </p>
          <ul className="flex flex-col gap-0.5">
            {tabs.map((tab) => {
              const Icon = TD_TAB_ICONS[tab.key];
              const active = tab.key === activeKey;
              return (
                <li key={tab.key}>
                  <Link
                    href={tab.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-card font-semibold text-foreground'
                        : 'text-(--td-text-2) hover:bg-card/60 hover:text-foreground',
                    )}
                  >
                    {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />}
                    <Icon className={cn('size-[18px] shrink-0', active ? 'text-primary' : 'text-(--td-text-3) group-hover:text-foreground')} />
                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                    {tab.hint && <span className="shrink-0 text-[11px] font-medium text-(--td-text-3)">{tab.hint}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
