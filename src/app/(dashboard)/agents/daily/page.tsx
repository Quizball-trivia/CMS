'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Play, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useSchedules, useScheduleRuns, useUpdateSchedule, useRunScheduleNow } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobStatusBadge, formatCents, formatRelativeTime, AgentNav } from '../agent-ui';
import type { AgentSchedule } from '@/types';

// Next fire time for a daily Tbilisi-hour schedule, shown in the admin's locale.
function nextFire(hourTbilisi: number): string {
  const now = new Date();
  // Tbilisi is UTC+4; compute the next UTC instant whose Tbilisi hour == target.
  const targetUtcHour = (hourTbilisi - 4 + 24) % 24;
  const next = new Date(now);
  next.setUTCHours(targetUtcHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function ScheduleCard({ schedule }: { schedule: AgentSchedule }) {
  const update = useUpdateSchedule();
  const runNow = useRunScheduleNow();
  const { data: runs, isLoading: runsLoading } = useScheduleRuns(schedule.id);
  const [hour, setHour] = useState(schedule.hourTbilisi);

  const p = schedule.params ?? {};
  const isRanked = schedule.jobType !== 'daily_challenge';
  const types = (Array.isArray(p.questionTypes) ? p.questionTypes : []) as string[];
  const rotation = (Array.isArray(p.rotation) ? p.rotation : []) as { categoryId: string; topic?: string }[];
  const categoriesPerDay = Number(p.categoriesPerDay ?? 1);
  const hasFixedCategory = Boolean(p.categoryId ?? p.category_id);

  const handleToggle = (enabled: boolean) => {
    update.mutate(
      { id: schedule.id, data: { enabled } },
      { onSuccess: () => toast.success(enabled ? 'Schedule enabled' : 'Schedule paused') }
    );
  };

  const handleHourSave = () => {
    if (hour === schedule.hourTbilisi) return;
    update.mutate(
      { id: schedule.id, data: { hourTbilisi: hour } },
      { onSuccess: () => toast.success(`Fire time set to ${String(hour).padStart(2, '0')}:00 Tbilisi`) }
    );
  };

  const handleRunNow = () => {
    runNow.mutate(schedule.id, {
      onSuccess: (job) => toast.success(`Daily set queued (job ${job.id.slice(0, 8)})`),
      onError: () => toast.error('Failed to run now'),
    });
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{schedule.label}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  schedule.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {schedule.enabled ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Fires daily at{' '}
              <span className="font-medium text-slate-700">{String(schedule.hourTbilisi).padStart(2, '0')}:00 Tbilisi</span>
              {schedule.enabled ? <> · next ~{nextFire(schedule.hourTbilisi)}</> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleToggle(!schedule.enabled)}
              disabled={update.isPending}
            >
              {schedule.enabled ? 'Pause' : 'Enable'}
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={runNow.isPending}>
              {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run now
            </Button>
          </div>
        </div>

        {/* config row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ConfigTile label={isRanked ? 'Qs / type / category' : 'Count'} value={String(p.count ?? '—')} />
          <ConfigTile label="Difficulty" value={String(p.difficulty ?? '—')} />
          <ConfigTile
            label={isRanked ? 'Types' : 'Type'}
            value={isRanked ? types.length ? types.join(', ') : '—' : String(p.questionType ?? 'mcq_single')}
          />
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fire hour (Tbilisi)</div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                className="w-14 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
              {hour !== schedule.hourTbilisi ? (
                <Button size="sm" variant="outline" onClick={handleHourSave} disabled={update.isPending}>
                  Save
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* what this schedule generates each run */}
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Each run:</span>{' '}
          {isRanked ? (
            <>
              generates {p.count ?? 25} questions per type ({types.join(', ') || '—'}) for {categoriesPerDay}{' '}
              categor{categoriesPerDay === 1 ? 'y' : 'ies'} = <b>{(Number(p.count ?? 25) * types.length * categoriesPerDay) || 0} questions</b>, rotating through {rotation.length} categories over ~
              {Math.ceil(rotation.length / Math.max(1, categoriesPerDay))} days.
            </>
          ) : (
            <>
              generates {p.count ?? 5} {String(p.questionType ?? 'mcq_single')} questions for one category
              {rotation.length ? <>, rotating through {rotation.length} categories.</> : hasFixedCategory ? '.' : '.'}
            </>
          )}
        </p>

        {/* only warn if there's genuinely no category source (no fixed + no rotation) */}
        {!hasFixedCategory && rotation.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            No category or rotation set — this schedule has nothing to generate against and will be skipped.
          </p>
        ) : null}

        {/* run history */}
        <div>
          <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Recent runs</h3>
          {runsLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !runs || runs.length === 0 ? (
            <p className="text-sm text-slate-400">No runs yet. Use “Run now” to generate a set immediately.</p>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {runs.slice(0, 12).map((job) => {
                const counts = (job.counts ?? {}) as Record<string, number>;
                return (
                  <Link
                    key={job.id}
                    href={`/agents/${job.id}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <JobStatusBadge status={job.status} />
                    <span className="text-slate-500">{formatRelativeTime(job.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {typeof job.params?.topic === 'string' ? job.params.topic : 'daily set'}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {counts.published ?? counts.approved ?? 0}/{counts.target ?? counts.generated ?? '?'} Qs
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{formatCents(job.spentCents)}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold capitalize text-slate-900">{value}</div>
    </div>
  );
}

export default function DailyChallengesPage() {
  const { data: schedules, isLoading } = useSchedules();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <CalendarClock className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Schedules</h1>
          <p className="text-sm text-slate-500">Recurring cron jobs that auto-generate questions — config, what they do, history, and manual run.</p>
        </div>
      </div>

      <AgentNav />

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading schedules…
        </div>
      ) : !schedules || schedules.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-slate-500">No schedules configured.</CardContent>
        </Card>
      ) : (
        schedules.map((s) => <ScheduleCard key={s.id} schedule={s} />)
      )}
    </div>
  );
}
