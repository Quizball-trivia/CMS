'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CategoryBreakdownItem } from '@/types';

interface CategoryBreakdownProps {
  categories: CategoryBreakdownItem[];
}

export function CategoryBreakdown({ categories }: CategoryBreakdownProps) {
  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Questions by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...categories.map((c) => c.question_count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Questions by Category (Top 10)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3">
              <div className="w-32 text-sm text-right truncate shrink-0 flex items-center justify-end gap-1.5" title={cat.name}>
                <span className="truncate">{cat.name}</span>
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    cat.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                  title={cat.is_active ? 'Active' : 'Inactive'}
                />
              </div>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    cat.is_active ? 'bg-blue-500' : 'bg-gray-400'
                  }`}
                  style={{ width: `${(cat.question_count / maxCount) * 100}%` }}
                />
              </div>
              <div className="w-10 text-sm font-medium text-right tabular-nums">
                {cat.question_count}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            Active
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-300" />
            Inactive
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
