'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DayActivity } from '@/types';

interface ContributionHeatmapProps {
  days: DayActivity[];
}

const CELL_SIZE = 13;
const CELL_GAP = 3;
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getColor(count: number): string {
  if (count === 0) return '#ebedf0';
  if (count <= 2) return '#9be9a8';
  if (count <= 5) return '#40c463';
  if (count <= 9) return '#30a14e';
  return '#216e39';
}

export function ContributionHeatmap({ days }: ContributionHeatmapProps) {
  const { grid, monthPositions } = useMemo(() => {
    // Build a map of date -> activity
    const activityMap = new Map<string, DayActivity>();
    for (const day of days) {
      activityMap.set(day.date, day);
    }

    // Generate 52 weeks of dates ending today
    const today = new Date();
    const cells: { date: string; count: number; col: number; row: number }[] = [];
    const months: { label: string; col: number }[] = [];

    // Find the Sunday that starts our grid (52 weeks ago)
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);
    // Move to previous Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    let lastMonth = -1;

    const current = new Date(startDate);
    while (current <= today) {
      const dateStr = current.toISOString().split('T')[0];
      const dayOfWeek = current.getDay();
      const weekIndex = Math.floor(
        (current.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );

      const activity = activityMap.get(dateStr);
      const count = activity?.total ?? 0;

      cells.push({
        date: dateStr,
        count,
        col: weekIndex,
        row: dayOfWeek,
      });

      // Track month labels
      const month = current.getMonth();
      if (month !== lastMonth) {
        months.push({ label: MONTH_LABELS[month], col: weekIndex });
        lastMonth = month;
      }

      current.setDate(current.getDate() + 1);
    }

    return { grid: cells, monthPositions: months };
  }, [days]);

  const svgWidth = 53 * (CELL_SIZE + CELL_GAP) + 30;
  const svgHeight = 7 * (CELL_SIZE + CELL_GAP) + 25;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contribution Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg
            width={svgWidth}
            height={svgHeight}
            className="block"
          >
            {/* Day labels */}
            {DAY_LABELS.map((label, i) =>
              label ? (
                <text
                  key={i}
                  x={0}
                  y={i * (CELL_SIZE + CELL_GAP) + 22 + CELL_SIZE / 2}
                  fontSize={9}
                  fill="#767676"
                  dominantBaseline="middle"
                >
                  {label}
                </text>
              ) : null
            )}

            {/* Month labels */}
            {monthPositions.map((m, i) => (
              <text
                key={i}
                x={m.col * (CELL_SIZE + CELL_GAP) + 30}
                y={10}
                fontSize={9}
                fill="#767676"
              >
                {m.label}
              </text>
            ))}

            {/* Cells */}
            {grid.map((cell) => {
              const x = cell.col * (CELL_SIZE + CELL_GAP) + 30;
              const y = cell.row * (CELL_SIZE + CELL_GAP) + 18;
              return (
                <rect
                  key={cell.date}
                  x={x}
                  y={y}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  rx={2}
                  fill={getColor(cell.count)}
                >
                  <title>{`${cell.date}: ${cell.count} contribution${cell.count !== 1 ? 's' : ''}`}</title>
                </rect>
              );
            })}
          </svg>

          {/* Color legend */}
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground justify-end">
            <span>Less</span>
            {[0, 2, 5, 9, 10].map((count) => (
              <div
                key={count}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: getColor(count) }}
              />
            ))}
            <span>More</span>
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
