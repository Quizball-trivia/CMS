'use client';

import { useSyncExternalStore } from 'react';
import { CalendarDays, Gamepad2, Users } from 'lucide-react';
import { TdEmptyState, TdSection } from './td-page';

const GEORGIA_TIME_ZONE = 'Asia/Tbilisi';

const METRICS = [
  { key: 'players', label: 'Players', icon: Users },
  { key: 'matches', label: 'Matches', icon: Gamepad2 },
  { key: 'dailies', label: 'Dailies played', icon: CalendarDays },
] as const;

function georgiaDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: GEORGIA_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

const noSubscription = () => () => {};

export function TdDashboard() {
  // Client-only (null while prerendering), or the static page would carry its build date.
  const today = useSyncExternalStore(noSubscription, () => georgiaDate(0), () => null);
  const yesterday = useSyncExternalStore(noSubscription, () => georgiaDate(-1), () => null);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {METRICS.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-(--td-text-2)">
              <Icon className="size-4 text-primary" />
              {label}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-(--td-text-3)">Today{today && ` · ${today}`}</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums">—</dd>
              </div>
              <div>
                <dt className="text-xs text-(--td-text-3)">Yesterday{yesterday && ` · ${yesterday}`}</dt>
                <dd className="mt-1 text-3xl font-bold tabular-nums text-(--td-text-2)">—</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <TdSection title="Activity" description="All figures use Georgia time (Asia/Tbilisi).">
        <TdEmptyState icon={Gamepad2} title="No activity yet">
          Numbers appear once the Table Derby API reports them.
        </TdEmptyState>
      </TdSection>
    </>
  );
}
