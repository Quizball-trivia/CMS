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
} from 'recharts';
import type { DayActivity } from '@/types';

interface ActivityChartProps {
  days: DayActivity[];
}

type ViewMode = 'daily' | 'weekly';

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
    } else {
      weeks.set(weekKey, { ...day, date: weekKey });
    }
  }

  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
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
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
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
