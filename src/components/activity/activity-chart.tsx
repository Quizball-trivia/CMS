'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  type TooltipContentProps,
} from 'recharts';
import type { DayActivity } from '@/types';
import { Badge } from '@/components/ui/badge';
import type { DailyQuestionCategoryCount } from '@/types';

interface ActivityChartProps {
  days: DayActivity[];
}

type ViewMode = 'daily' | 'weekly';

function mergeCategoryCounts(categories: DailyQuestionCategoryCount[]): DailyQuestionCategoryCount[] {
  const merged = new Map<string, DailyQuestionCategoryCount>();

  for (const category of categories) {
    const key = category.name.trim().toLocaleLowerCase();
    const existing = merged.get(key);

    if (existing) {
      existing.count += category.count;
      if (!existing.id && category.id) existing.id = category.id;
    } else {
      merged.set(key, { ...category });
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name);
  });
}

function aggregateWeekly(days: DayActivity[]): DayActivity[] {
  const weeks = new Map<string, DayActivity>();

  for (const day of days) {
    const [y, m, d] = day.date.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    // Get Monday of the week
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const weekKey = monday.toISOString().split('T')[0];

    const existing = weeks.get(weekKey);
    if (existing) {
      existing.questions_created += day.questions_created;
      existing.categories_created += day.categories_created;
      existing.total += day.total;
      existing.question_categories = mergeCategoryCounts([
        ...existing.question_categories,
        ...day.question_categories,
      ]);
    } else {
      weeks.set(weekKey, {
        ...day,
        date: weekKey,
        question_categories: mergeCategoryCounts(day.question_categories),
      });
    }
  }

  return [...weeks.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((week) => ({
      ...week,
      question_categories: mergeCategoryCounts(week.question_categories),
    }));
}

function getDayFromTooltipPayload(
  payload: TooltipContentProps['payload']
): DayActivity | null {
  const candidate = payload?.[0]?.payload;

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const maybeDay = candidate as Partial<DayActivity>;
  if (
    typeof maybeDay.date !== 'string' ||
    typeof maybeDay.questions_created !== 'number' ||
    typeof maybeDay.categories_created !== 'number' ||
    typeof maybeDay.total !== 'number' ||
    !Array.isArray(maybeDay.question_categories)
  ) {
    return null;
  }

  return maybeDay as DayActivity;
}

function ActivityTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;

  const day = getDayFromTooltipPayload(payload);
  if (!day) return null;
  const categories = mergeCategoryCounts(day.question_categories);

  const [y, m, d] = String(label).split('-');
  const hiddenCount = Math.max(categories.length - 5, 0);

  return (
    <div className="min-w-[240px] rounded-xl border bg-white/95 p-3 shadow-xl backdrop-blur">
      <p className="text-sm font-semibold text-foreground">{`${Number(m)}/${Number(d)}/${y}`}</p>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Questions added</span>
          <span className="font-semibold text-blue-600">{day.questions_created}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Categories created</span>
          <span className="font-semibold text-emerald-600">{day.categories_created}</span>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Question Categories
            </p>
            <Badge variant="outline" className="text-[10px]">
              {categories.length} total
            </Badge>
          </div>
          <div className="space-y-1.5">
            {categories.slice(0, 5).map((category) => (
              <div key={`${label}-${category.name}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-foreground">{category.name}</span>
                <span className="font-semibold text-slate-700">{category.count}</span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p className="pt-1 text-[11px] text-muted-foreground">
                +{hiddenCount} more categories that day
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActivityChart({ days }: ActivityChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');

  const data = useMemo(
    () => (viewMode === 'weekly' ? aggregateWeekly(days) : days),
    [days, viewMode]
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Activity Over Time</CardTitle>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['daily', 'weekly'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? 'bg-white shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(val: string) => {
                  const [, m, d] = val.split('-');
                  return `${Number(m)}/${Number(d)}`;
                }}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(val) => {
                  const [y, m, d] = String(val).split('-');
                  return `${Number(m)}/${Number(d)}/${y}`;
                }}
                content={ActivityTooltip}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="questions_created"
                name="Questions"
                fill="#3b82f6"
                radius={[2, 2, 0, 0]}
                stackId="stack"
              />
              <Bar
                dataKey="categories_created"
                name="Categories"
                fill="#22c55e"
                radius={[2, 2, 0, 0]}
                stackId="stack"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
