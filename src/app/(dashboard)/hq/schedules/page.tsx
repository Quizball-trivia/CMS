'use client';

import { CalendarClock, Loader2 } from 'lucide-react';
import { useHqMembers, useHqSchedules } from '@/hooks';
import { LoadErrorState, PageHeader, RefreshErrorBanner } from '../hq-ui';
import { SchedulesTable } from '../schedules-ui';

export default function HqAutomationsPage() {
  const schedulesQuery = useHqSchedules();
  // The agent picker needs the team: a failed load must not look like "no agents".
  const membersQuery = useHqMembers();
  const schedules = schedulesQuery.data;
  const members = membersQuery.data;

  const loading = (schedulesQuery.isLoading && !schedules) || (membersQuery.isLoading && !members);
  const failed = (!!schedulesQuery.error && !schedules) || (!!membersQuery.error && !members);
  const refreshFailed = (!!schedulesQuery.error && !!schedules) || (!!membersQuery.error && !!members);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<CalendarClock className="h-6 w-6 text-slate-700" />}
        title="Automations"
        description="Recurring work that runs on its own: each automation creates a task for its agent at the set time, even while you sleep."
      />
      {refreshFailed && <RefreshErrorBanner />}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : failed ? (
        <LoadErrorState
          error={schedulesQuery.error ?? membersQuery.error}
          fallback={!schedules ? 'Could not load automations.' : 'Could not load the team, so agents can’t be picked.'}
          onRetry={() => {
            if (schedulesQuery.error) void schedulesQuery.refetch();
            if (membersQuery.error) void membersQuery.refetch();
          }}
        />
      ) : (
        <SchedulesTable schedules={schedules ?? []} members={members ?? []} />
      )}
    </div>
  );
}
