'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CategoryBreakdownItem } from '@/types';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CategoryBreakdownProps {
  categories: CategoryBreakdownItem[];
}

function formatDateTime(value: string | null): string {
  if (!value) return 'No activity';

  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

  const totalQuestions = categories.reduce((sum, category) => sum + category.question_count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>Question Adds by Category</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Shows where this admin added questions in the selected range.
            </p>
          </div>
          <Badge variant="outline">{totalQuestions} questions</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="w-[120px] text-right">Questions</TableHead>
              <TableHead className="w-[90px] text-right">Share</TableHead>
              <TableHead className="w-[170px]">Last Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => {
              const share = totalQuestions === 0 ? 0 : Math.round((category.question_count / totalQuestions) * 100);
              return (
                <TableRow key={category.id}>
                  <TableCell className="max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          category.is_active ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                        title={category.is_active ? 'Active' : 'Inactive'}
                      />
                      <span className="truncate font-medium" title={category.name}>
                        {category.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {category.question_count}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {share}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(category.last_question_created_at)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
