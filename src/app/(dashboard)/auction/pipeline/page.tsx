'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  useAuctionPipelineStats,
  useAuctionPipelineWorkers,
  useRequeueAuctionPipelineTasks,
} from '@/hooks';
import { cn } from '@/lib/utils';
import type { AuctionPipelineFailureSample, AuctionPipelineWorker } from '@/types';
import { AuctionNav } from '../auction-ui';
import { PipelinePrompts } from './pipeline-prompts';

const STAGE_ORDER = [
  'queued',
  'generated',
  'verified',
  'translated',
  'ready',
  'published',
  'rejected',
  'failed',
] as const;

const STAGE_BAR: Record<string, string> = {
  queued: 'bg-slate-300',
  generated: 'bg-blue-400',
  verified: 'bg-indigo-400',
  translated: 'bg-violet-400',
  ready: 'bg-teal-400',
  published: 'bg-emerald-500',
  rejected: 'bg-amber-400',
  failed: 'bg-red-400',
};

const VARIANT_STYLE: Record<string, string> = {
  medium: 'border-blue-200 bg-blue-50 text-blue-700',
  hard: 'border-violet-200 bg-violet-50 text-violet-700',
};

// What a worker sitting in a given task stage is actually doing right now.
const STAGE_LABEL: Record<string, string> = {
  idle: 'waiting for work',
  queued: 'writing clues',
  generated: 'fact-checking',
  verified: 'judging',
  judged: 'judging',
  translated: 'translating',
  ready: 'publishing',
};

type SectionKey = 'workers' | 'prompts' | 'failures' | 'stages';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'workers', label: 'Live' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'failures', label: 'Failures' },
  { key: 'stages', label: 'Stages' },
];

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className={cn('mt-0.5 text-lg font-bold', tone ?? 'text-slate-900')}>{value}</div>
      {sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function WorkerRow({ worker }: { worker: AuctionPipelineWorker }) {
  const stale = worker.is_stale;
  const idle = !worker.player_name;

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {!stale && !idle ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        ) : null}
        <span
          className={cn(
            'relative inline-flex h-2.5 w-2.5 rounded-full',
            stale ? 'bg-amber-500' : idle ? 'bg-slate-300' : 'bg-emerald-500'
          )}
        />
      </span>

      {worker.variant_key ? (
        <Badge
          variant="outline"
          className={cn('shrink-0', VARIANT_STYLE[worker.variant_key] ?? VARIANT_STYLE.medium)}
        >
          {worker.variant_key}
        </Badge>
      ) : (
        <Badge variant="outline" className="shrink-0 border-slate-200 bg-slate-50 text-slate-500">
          idle
        </Badge>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {worker.player_name ?? 'Waiting for a task'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {STAGE_LABEL[worker.stage ?? 'idle'] ?? worker.stage ?? 'working'}
          {` · ${worker.hostname}`}
        </p>
      </div>

      <span
        className={cn(
          'shrink-0 font-mono text-xs tabular-nums',
          stale ? 'font-semibold text-amber-600' : 'text-slate-500'
        )}
      >
        {stale
          ? `stale ${formatAgo(worker.seconds_since_heartbeat)}`
          : formatAgo(worker.seconds_since_heartbeat)}
      </span>
    </div>
  );
}

function FailureRow({
  failure,
  onRequeue,
  requeueing,
}: {
  failure: AuctionPipelineFailureSample;
  onRequeue: (taskId: string) => void;
  requeueing: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
      <Badge
        variant="outline"
        className={cn(
          'mt-0.5 shrink-0',
          failure.status === 'failed'
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        )}
      >
        {failure.status}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {failure.error_class ?? 'unclassified'}
        </p>
        <p className="truncate text-xs text-slate-500">
          {failure.task_stage}
          {failure.external_call ? ` · ${failure.external_call}` : ''}
          {` · ${formatDateTime(failure.created_at)}`}
        </p>
        {failure.error_message ? (
          <p className="mt-1 line-clamp-2 break-words font-mono text-[11px] text-slate-500">
            {failure.error_message}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => onRequeue(failure.task_id)}
        disabled={requeueing}
      >
        <RotateCcw className="h-4 w-4" />
        Requeue
      </Button>
    </div>
  );
}

export default function AuctionPipelinePage() {
  const [section, setSection] = useState<SectionKey>('workers');
  const { data, isLoading, isError } = useAuctionPipelineStats();
  const { data: workerData } = useAuctionPipelineWorkers();
  const requeue = useRequeueAuctionPipelineTasks();

  const workers = workerData?.workers ?? [];
  const liveCount = workerData?.live ?? 0;
  const staleCount = workerData?.stale ?? 0;

  const handleRequeueTask = async (taskId: string) => {
    try {
      const result = await requeue.mutateAsync({ taskIds: [taskId] });
      toast.success(`Requeued ${result.requeued} task${result.requeued === 1 ? '' : 's'}`);
    } catch {
      toast.error('Failed to requeue task');
    }
  };

  const handleRequeueAll = async (filter: 'failed' | 'rejected') => {
    const count =
      filter === 'failed' ? data?.totals.failed_families : data?.totals.rejected_families;
    const ok = window.confirm(
      `Requeue all ${formatNumber(count ?? 0)} ${filter} tasks? They go back to 'queued' and the runner retries them from generation.`
    );
    if (!ok) return;
    try {
      const result = await requeue.mutateAsync({ filter });
      toast.success(`Requeued ${formatNumber(result.requeued)} ${filter} tasks`);
    } catch {
      toast.error(`Failed to requeue ${filter} tasks`);
    }
  };

  const orderedStages = data
    ? [...data.stages].sort(
        (a, b) => STAGE_ORDER.indexOf(a.stage as never) - STAGE_ORDER.indexOf(b.stage as never)
      )
    : [];
  const maxStageCount = data ? Math.max(...data.stages.map((entry) => entry.count), 1) : 1;
  const maxErrorCount = data
    ? Math.max(...data.attempts_24h.by_error_class.map((entry) => entry.count), 1)
    : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <Activity className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            generate → fact-check → judge → translate → publish. Live view of the card factory.
          </p>
        </div>
      </div>

      <AuctionNav />

      {isError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Failed to load pipeline stats.
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">
              {liveCount} worker{liveCount === 1 ? '' : 's'} running
              {staleCount > 0 ? (
                <span className="ml-2 font-normal text-amber-600">{staleCount} stale</span>
              ) : null}
            </h2>
            <span className="text-xs text-slate-400">refreshes every 3s</span>
          </div>
          {workers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No workers are heartbeating. The runner reports in once it is relaunched with the
              heartbeat build.
            </div>
          ) : (
            workers.map((worker) => <WorkerRow key={worker.worker_id} worker={worker} />)
          )}
        </CardContent>
      </Card>

      {isLoading || !data ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading stats…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Published"
            value={formatNumber(data.cards.published)}
            sub={`${formatNumber(data.cards.published_families)} families`}
            tone="text-emerald-600"
          />
          <Stat label="Pass rate" value={formatPercent(data.totals.pass_rate)} />
          <Stat
            label="Players done"
            value={formatNumber(data.totals.players_done)}
            sub={formatPercent(data.totals.completion_rate)}
          />
          <Stat label="Remaining" value={formatNumber(data.totals.players_remaining)} />
          <Stat
            label="Rejected"
            value={formatNumber(data.totals.rejected_families)}
            tone="text-amber-600"
          />
          <Stat
            label="Failed"
            value={formatNumber(data.totals.failed_families)}
            tone={data.totals.failed_families > 0 ? 'text-red-600' : undefined}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {SECTIONS.map((entry) => {
          const active = section === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSection(entry.key)}
              className={cn(
                active
                  ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white'
                  : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
              )}
            >
              {entry.label}
              {entry.key === 'failures' && data ? (
                <span className={cn('ml-1.5', active ? 'text-slate-300' : 'text-slate-400')}>
                  {data.recent_failures.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {section === 'workers' ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Attempts (last 24h)</h2>
            {!data ? (
              <p className="py-4 text-center text-sm text-slate-400">No data yet.</p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <Stat
                    label="Success"
                    value={formatNumber(data.attempts_24h.success)}
                    tone="text-emerald-600"
                  />
                  <Stat
                    label="Rejected"
                    value={formatNumber(data.attempts_24h.rejected)}
                    tone="text-amber-600"
                  />
                  <Stat
                    label="Failed"
                    value={formatNumber(data.attempts_24h.failed)}
                    tone="text-red-600"
                  />
                </div>
                {data.attempts_24h.by_error_class.length === 0 ? (
                  <p className="py-3 text-center text-sm text-slate-400">
                    No errors in the last 24h.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {data.attempts_24h.by_error_class.map((entry) => (
                      <div key={entry.error_class} className="flex items-center gap-2">
                        <span className="w-40 shrink-0 truncate text-xs text-slate-500">
                          {entry.error_class}
                        </span>
                        <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded bg-red-400"
                            style={{ width: `${(entry.count / maxErrorCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right font-mono text-xs font-medium text-slate-700">
                          {formatNumber(entry.count)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === 'prompts' ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <PipelinePrompts />
          </CardContent>
        </Card>
      ) : null}

      {section === 'failures' ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Recent failures</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRequeueAll('failed')}
                  disabled={requeue.isPending || !data?.totals.failed_families}
                >
                  <RotateCcw className="h-4 w-4" />
                  Requeue all failed
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRequeueAll('rejected')}
                  disabled={requeue.isPending || !data?.totals.rejected_families}
                >
                  <RotateCcw className="h-4 w-4" />
                  Requeue all rejected
                </Button>
              </div>
            </div>
            {!data || data.recent_failures.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No recent failures.</div>
            ) : (
              data.recent_failures.map((failure) => (
                <FailureRow
                  key={failure.id}
                  failure={failure}
                  onRequeue={handleRequeueTask}
                  requeueing={requeue.isPending}
                />
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === 'stages' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Stage breakdown</h2>
              {orderedStages.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No tasks yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {orderedStages.map((entry) => (
                    <div key={entry.stage} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-xs text-slate-500">{entry.stage}</span>
                      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                        <div
                          className={cn('h-full rounded', STAGE_BAR[entry.stage] ?? 'bg-slate-400')}
                          style={{ width: `${(entry.count / maxStageCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right font-mono text-xs font-medium text-slate-700">
                        {formatNumber(entry.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Variants &amp; snapshot</h2>
              <div className="space-y-1">
                {(data?.variants ?? []).map((variant) => (
                  <div
                    key={variant.variant_key}
                    className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"
                  >
                    <span className="text-slate-600">{variant.variant_key}</span>
                    <span className="font-mono text-xs text-slate-500">
                      <span className="font-medium text-slate-800">
                        {formatNumber(variant.published)}
                      </span>{' '}
                      / {formatNumber(variant.count)}
                    </span>
                  </div>
                ))}
              </div>
              {data?.latest_snapshot ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Latest snapshot
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      {data.latest_snapshot.status}
                    </Badge>
                    <span className="text-xs text-slate-600">{data.latest_snapshot.source}</span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {formatNumber(data.latest_snapshot.player_row_count)} players ·{' '}
                    {formatNumber(data.latest_snapshot.valuation_row_count)} valuations ·{' '}
                    {formatDateTime(data.latest_snapshot.created_at)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
