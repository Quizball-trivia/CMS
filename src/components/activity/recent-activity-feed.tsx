'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Upload, Pencil, ArrowRightLeft, Trash2, Layers } from 'lucide-react';
import type { RecentActivityItem } from '@/types';

interface RecentActivityFeedProps {
  items: RecentActivityItem[];
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const ACTION_CONFIG: Record<string, { icon: typeof Plus; bg: string; text: string }> = {
  create: { icon: Plus, bg: 'bg-green-50 text-green-600', text: 'Created' },
  bulk_create: { icon: Upload, bg: 'bg-orange-50 text-orange-600', text: 'Bulk uploaded' },
  update: { icon: Pencil, bg: 'bg-blue-50 text-blue-600', text: 'Updated' },
  status_change: { icon: ArrowRightLeft, bg: 'bg-purple-50 text-purple-600', text: 'Changed status of' },
  delete: { icon: Trash2, bg: 'bg-red-50 text-red-600', text: 'Deleted' },
};

const DEFAULT_CONFIG = { icon: Plus, bg: 'bg-gray-50 text-gray-600', text: 'Action on' };

function getTitle(item: RecentActivityItem): string {
  const config = ACTION_CONFIG[item.action] ?? DEFAULT_CONFIG;
  const meta = item.metadata;
  const title = (meta?.title as string) ?? (meta?.name as string) ?? '';
  const entityLabel = item.entity_type;

  if (item.action === 'bulk_create') {
    const count = (meta?.successful as number) ?? (meta?.count as number) ?? 0;
    const failed = (meta?.failed as number) ?? 0;
    const failedText = failed > 0 ? `, ${failed} failed` : '';
    return `${config.text} ${count} questions${failedText}`;
  }

  if (item.action === 'status_change') {
    const oldStatus = (meta?.old_status as string) ?? '';
    const newStatus = (meta?.new_status as string) ?? '';
    if (newStatus === 'published') {
      return title ? `Published "${title}"` : `Published ${entityLabel}`;
    }
    const label = oldStatus && newStatus ? `${oldStatus} → ${newStatus}` : config.text;
    return title ? `${label}: "${title}"` : `${config.text} ${entityLabel}`;
  }

  if (item.action === 'update' && meta?.changed_fields) {
    const fields = (meta.changed_fields as string[]).join(', ');
    return title
      ? `${config.text} "${title}" (${fields})`
      : `${config.text} ${entityLabel} (${fields})`;
  }

  return title
    ? `${config.text} ${entityLabel} "${title}"`
    : `${config.text} ${entityLabel}`;
}

function getSubtitle(item: RecentActivityItem): string | null {
  const meta = item.metadata;
  const categoryName = (meta?.category_name as string) ?? null;

  if (item.action === 'create' && item.entity_type === 'question' && categoryName) {
    return `in ${categoryName}`;
  }

  if (item.action === 'bulk_create' && categoryName) {
    return `in ${categoryName}`;
  }

  if (item.action === 'delete' && item.entity_type === 'question' && categoryName) {
    return `from ${categoryName}`;
  }

  if (item.action === 'delete' && item.entity_type === 'category') {
    const deletedQuestions = (meta?.deleted_questions as number) ?? 0;
    if (deletedQuestions > 0) {
      return `cascade deleted ${deletedQuestions} questions`;
    }
  }

  if (item.action === 'create' && item.entity_type === 'category') {
    const slug = (meta?.slug as string) ?? null;
    return slug ? `slug: ${slug}` : null;
  }

  return null;
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  // Group items by day
  const grouped = useMemo(() => {
    const map = new Map<string, RecentActivityItem[]>();
    for (const item of items) {
      const dayKey = new Date(item.created_at).toISOString().split('T')[0];
      if (!map.has(dayKey)) map.set(dayKey, []);
      map.get(dayKey)!.push(item);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-[600px] overflow-y-auto space-y-4 pr-2">
          {grouped.map(([day, dayItems]) => (
            <div key={day}>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {formatRelativeDate(day)}
              </p>
              <div className="space-y-2">
                {dayItems.map((item) => {
                  const config = ACTION_CONFIG[item.action] ?? DEFAULT_CONFIG;
                  const Icon = config.icon;
                  const subtitle = getSubtitle(item);

                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className={`p-1.5 rounded-md mt-0.5 ${config.bg}`}>
                        {item.entity_type === 'category' && item.action === 'create' ? (
                          <Layers className="w-3.5 h-3.5" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">
                          {getTitle(item)}
                        </p>
                        {subtitle && (
                          <p className="text-xs text-muted-foreground">{subtitle}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(item.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
