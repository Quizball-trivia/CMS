'use client';

import { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHqEvents, useHqMembers } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi } from '@/lib/hq-board';
import type { HqEvent } from '@/types';
import { EmptyState, LoadErrorState, MemberAvatar, PageHeader, RefreshErrorBanner, useTaskSheet } from '../hq-ui';

const ALL = '__all__';

const TYPE_STYLES: Record<string, string> = {
  task_created: 'bg-slate-100 text-slate-700',
  task_updated: 'bg-slate-100 text-slate-600',
  task_status: 'bg-indigo-50 text-indigo-700',
  run_started: 'bg-blue-50 text-blue-700',
  run_finished: 'bg-emerald-50 text-emerald-700',
  message: 'bg-sky-50 text-sky-700',
  handoff: 'bg-violet-50 text-violet-700',
  schedule_fired: 'bg-amber-50 text-amber-700',
  member_updated: 'bg-pink-50 text-pink-700',
  settings: 'bg-red-50 text-red-700',
};

export default function HqActivityPage() {
  const [memberId, setMemberId] = useState<string>(ALL);
  const { data: members = [] } = useHqMembers();
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useHqEvents(
    memberId === ALL ? undefined : { memberId }
  );
  const { openTask } = useTaskSheet();
  const events = data?.pages.flat() ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<Activity className="h-6 w-6 text-slate-700" />}
        title="Activity"
        description="A live log of everything that happens in HQ: tasks created and finished, agent runs, hand-offs and messages."
      />
      <div className="flex items-center gap-3">
        <div className="w-64">
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.avatar} {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      </div>

      {error && data && <RefreshErrorBanner />}
      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load activity." onRetry={() => void refetch()} />
      ) : events.length === 0 && !isLoading ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {events.map((e) => (
            <EventRow key={e.id} event={e} onOpenTask={openTask} />
          ))}
        </ol>
      )}

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

function EventRow({ event: e, onOpenTask }: { event: HqEvent; onOpenTask: (id: string) => void }) {
  return (
    <li
      className={cn(
        'flex items-start gap-3 px-4 py-2.5',
        e.level === 'error' && 'bg-red-50/50',
        e.level === 'warn' && 'bg-amber-50/40'
      )}
    >
      <MemberAvatar member={e.member} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-800">{e.member?.name ?? 'System'}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', TYPE_STYLES[e.type] ?? 'bg-slate-100 text-slate-600')}>
            {e.type.replace(/_/g, ' ')}
          </span>
          {e.level !== 'info' && (
            <span className={cn('text-[10px] font-bold uppercase', e.level === 'error' ? 'text-red-600' : 'text-amber-600')}>{e.level}</span>
          )}
          {e.taskId && (
            <button type="button" onClick={() => onOpenTask(e.taskId!)} className="font-mono text-slate-500 hover:text-slate-900 hover:underline">
              #{e.taskNumber ?? '…'}
            </button>
          )}
          <span className="ml-auto text-slate-400" title={formatTbilisi(e.ts)}>
            {formatRelative(e.ts)}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-slate-700">{e.message}</p>
      </div>
    </li>
  );
}
