'use client';

import { Loader2 } from 'lucide-react';
import { useHqMembers, useHqSchedules } from '@/hooks';
import { LoadErrorState, RefreshErrorBanner } from '../hq-ui';
import { SchedulesTable } from '../schedules-ui';

export default function HqSchedulesPage() {
  const { data: schedules, isLoading, error, refetch } = useHqSchedules();
  const { data: members = [] } = useHqMembers();

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Every schedule creates a task for its agent at the given time (Tbilisi time unless set otherwise). Agents run while you sleep.
      </p>
      {error && schedules && <RefreshErrorBanner />}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !schedules ? (
        <LoadErrorState error={error} fallback="Could not load schedules." onRetry={() => void refetch()} />
      ) : (
        <SchedulesTable schedules={schedules} members={members} />
      )}
    </div>
  );
}
