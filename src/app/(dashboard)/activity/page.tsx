'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/providers';
import {
  useActivity,
  useActivityUsers,
  useActivityByCategory,
  useRecentActivity,
} from '@/hooks';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatsCards } from '@/components/activity/stats-cards';
import { ActivityChart } from '@/components/activity/activity-chart';
import { ContributionHeatmap } from '@/components/activity/contribution-heatmap';
import { CategoryBreakdown } from '@/components/activity/category-breakdown';
import { RecentActivityFeed } from '@/components/activity/recent-activity-feed';
import { Loader2 } from 'lucide-react';
import { ACTIVITY_ALLOWED_EMAIL } from '@/lib/constants';

type DateRange = '30d' | '90d' | '1y' | 'all';

function getDateRange(range: DateRange): { from: string; to: string } {
  const to = new Date().toISOString().split('T')[0];
  const from = new Date();

  switch (range) {
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case '1y':
      from.setFullYear(from.getFullYear() - 1);
      break;
    case 'all':
      from.setFullYear(2020, 0, 1);
      break;
  }

  return { from: from.toISOString().split('T')[0], to };
}

export default function ActivityPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange>('1y');

  const { from, to } = getDateRange(dateRange);

  // Access control
  useEffect(() => {
    if (!authLoading && user?.email !== ACTIVITY_ALLOWED_EMAIL) {
      router.push('/categories');
    }
  }, [authLoading, user, router]);

  const { data: usersData, isLoading: usersLoading } = useActivityUsers();
  const effectiveSelectedUserId = useMemo(
    () => selectedUserId || usersData?.users?.[0]?.id || '',
    [selectedUserId, usersData]
  );

  const { data: activityData, isLoading: activityLoading } = useActivity({
    from,
    to,
    user_id: effectiveSelectedUserId,
  });

  const { data: categoryData } = useActivityByCategory({
    user_id: effectiveSelectedUserId,
    from,
    to,
  });
  const { data: recentData } = useRecentActivity(effectiveSelectedUserId);

  if (authLoading || user?.email !== ACTIVITY_ALLOWED_EMAIL) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Activity Dashboard</h1>
        <div className="flex items-center gap-3">
          {/* User selector */}
          <Select value={effectiveSelectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={usersLoading ? 'Loading...' : 'Select user'} />
            </SelectTrigger>
            <SelectContent>
              {usersData?.users?.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date range selector */}
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {activityLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : activityData ? (
        <>
          {/* KPI cards */}
          <StatsCards summary={activityData.summary} days={activityData.days} />

          {/* Activity bar chart */}
          <ActivityChart days={activityData.days} />

          {/* GitHub-style heatmap (always shows last 365 days) */}
          <ContributionHeatmap days={activityData.days} />

          {/* Bottom row: category breakdown + recent activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <CategoryBreakdown categories={categoryData?.categories ?? []} />
            <div className="lg:sticky lg:top-6">
              <RecentActivityFeed items={recentData?.items ?? []} />
            </div>
          </div>
        </>
      ) : (
        <div className="text-center text-muted-foreground py-12">
          Select a user to view their activity
        </div>
      )}
    </div>
  );
}
