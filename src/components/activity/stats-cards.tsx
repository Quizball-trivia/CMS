'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  HelpCircle,
  Layers,
  CalendarDays,
  Flame,
  ArrowRightLeft,
  Trash2,
  Pencil,
  Upload,
} from 'lucide-react';
import type { DayActivity, ActivitySummary } from '@/types';

interface StatsCardsProps {
  summary: ActivitySummary;
  days: DayActivity[];
}

function calculateStreak(days: DayActivity[]): number {
  if (days.length === 0) return 0;

  // Build a set of active dates
  const activeDates = new Set(days.map((d) => d.date));

  // Walk backwards from today; allow skipping today (user may not have been active yet)
  let streak = 0;
  const date = new Date();
  const todayStr = date.toISOString().split('T')[0];
  if (!activeDates.has(todayStr)) {
    date.setDate(date.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const dateStr = date.toISOString().split('T')[0];
    if (activeDates.has(dateStr)) {
      streak++;
    } else {
      break;
    }
    date.setDate(date.getDate() - 1);
  }
  return streak;
}

const stats = [
  { key: 'questions', label: 'Questions Created', icon: HelpCircle, color: 'text-blue-600' },
  { key: 'categories', label: 'Categories Created', icon: Layers, color: 'text-green-600' },
  { key: 'published', label: 'Published', icon: ArrowRightLeft, color: 'text-purple-600' },
  { key: 'edits', label: 'Edits', icon: Pencil, color: 'text-sky-600' },
  { key: 'bulk_uploads', label: 'Bulk Uploads', icon: Upload, color: 'text-orange-500' },
  { key: 'deleted', label: 'Deleted', icon: Trash2, color: 'text-red-500' },
  { key: 'active_days', label: 'Active Days', icon: CalendarDays, color: 'text-indigo-600' },
  { key: 'streak', label: 'Current Streak', icon: Flame, color: 'text-amber-500' },
] as const;

export function StatsCards({ summary, days }: StatsCardsProps) {
  const streak = useMemo(() => calculateStreak(days), [days]);
  const actions = summary.actions ?? {};

  const values: Record<string, number> = {
    questions: summary.total_questions,
    categories: summary.total_categories,
    published: actions.status_change ?? 0,
    edits: actions.update ?? 0,
    bulk_uploads: actions.bulk_create ?? 0,
    deleted: actions.delete ?? 0,
    active_days: summary.active_days,
    streak,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.key} className="py-4">
            <CardContent className="flex items-center gap-4">
              <div className={`p-2 rounded-lg bg-gray-50 ${stat.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{values[stat.key]}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
