'use client';

import { Activity, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuctionPipelineStats } from '@/hooks';
import { cn } from '@/lib/utils';
import type { AuctionPipelineFailureSample } from '@/types';
import { AuctionNav } from '../auction-ui';

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

const STAGE_COLORS: Record<string, string> = {
  queued: 'bg-slate-300',
  generated: 'bg-blue-400',
  verified: 'bg-indigo-400',
  translated: 'bg-violet-400',
  ready: 'bg-teal-400',
  published: 'bg-emerald-500',
  rejected: 'bg-amber-400',
  failed: 'bg-red-400',
};

const ATTEMPT_STATUS_STYLES: Record<string, string> = {
  rejected: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

const SNAPSHOT_STATUS_STYLES: Record<string, string> = {
  staging: 'border-slate-200 bg-slate-100 text-slate-600',
  validated: 'border-blue-200 bg-blue-50 text-blue-700',
  promoted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function FailureRow({ failure }: { failure: AuctionPipelineFailureSample }) {
  return (
    <li className="border-b border-slate-100 py-2.5 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            'text-[11px]',
            ATTEMPT_STATUS_STYLES[failure.status] ?? 'border-slate-200 bg-slate-100 text-slate-600'
          )}
        >
          {failure.status}
        </Badge>
        <span className="font-mono text-xs font-medium text-slate-800">
          {failure.error_class ?? 'unclassified'}
        </span>
        <span className="text-xs text-slate-400">
          {failure.task_stage}
          {failure.external_call ? ` · ${failure.external_call}` : ''}
        </span>
        <span className="ml-auto text-xs text-slate-400">{formatDateTime(failure.created_at)}</span>
      </div>
      {failure.error_message ? (
        <p className="mt-1 break-words font-mono text-xs text-slate-500">{failure.error_message}</p>
      ) : null}
    </li>
  );
}

export default function AuctionPipelinePage() {
  const { data, isLoading, isError } = useAuctionPipelineStats();

  const maxStageCount = data ? Math.max(...data.stages.map((entry) => entry.count), 1) : 1;
  const orderedStages = data
    ? [...data.stages].sort(
        (a, b) => STAGE_ORDER.indexOf(a.stage as never) - STAGE_ORDER.indexOf(b.stage as never)
      )
    : [];
  const maxErrorCount = data
    ? Math.max(...data.attempts_24h.by_error_class.map((entry) => entry.count), 1)
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <Activity className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">
            Card generation status across the eligible player pool. Refreshes every 30s.
          </p>
        </div>
      </div>

      <AuctionNav />

      {isError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Failed to load pipeline stats.
        </div>
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading pipeline stats…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Published cards"
              value={formatNumber(data.cards.published)}
              sub={`${formatNumber(data.cards.published_families)} families`}
            />
            <Stat
              label="Pass rate"
              value={formatPercent(data.totals.pass_rate)}
              sub={`${formatNumber(data.totals.published_families)} of ${formatNumber(data.totals.terminal_families)} terminal`}
            />
            <Stat
              label="Players done"
              value={formatNumber(data.totals.players_done)}
              sub={`${formatPercent(data.totals.completion_rate)} of ${formatNumber(data.totals.eligible_players)}`}
            />
            <Stat
              label="Players remaining"
              value={formatNumber(data.totals.players_remaining)}
              sub={`${formatNumber(data.totals.total_tasks)} tasks total`}
            />
            <Stat
              label="Needs review"
              value={formatNumber(data.cards.needs_review)}
              sub={`${formatNumber(data.cards.superseded)} superseded`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Stage breakdown">
              {orderedStages.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No tasks yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {orderedStages.map((entry) => (
                    <div key={entry.stage} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-slate-500">{entry.stage}</span>
                      <div className="h-5 flex-1 rounded bg-slate-100">
                        <div
                          className={cn(
                            'h-5 rounded',
                            STAGE_COLORS[entry.stage] ?? 'bg-slate-400'
                          )}
                          style={{ width: `${(entry.count / maxStageCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-xs font-medium text-slate-800">
                        {formatNumber(entry.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Attempts (last 24h)">
              <div className="mb-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                    Success
                  </div>
                  <div className="text-lg font-bold text-emerald-700">
                    {formatNumber(data.attempts_24h.success)}
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                    Rejected
                  </div>
                  <div className="text-lg font-bold text-amber-700">
                    {formatNumber(data.attempts_24h.rejected)}
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-red-600">
                    Failed
                  </div>
                  <div className="text-lg font-bold text-red-700">
                    {formatNumber(data.attempts_24h.failed)}
                  </div>
                </div>
              </div>
              {data.attempts_24h.by_error_class.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No errors in the last 24h.</p>
              ) : (
                <div className="space-y-1.5">
                  {data.attempts_24h.by_error_class.map((entry) => (
                    <div key={entry.error_class} className="flex items-center gap-2">
                      <span className="w-40 shrink-0 truncate text-xs text-slate-500">
                        {entry.error_class}
                      </span>
                      <div className="h-5 flex-1 rounded bg-slate-100">
                        <div
                          className="h-5 rounded bg-red-400"
                          style={{ width: `${(entry.count / maxErrorCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-xs font-medium text-slate-800">
                        {formatNumber(entry.count)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Variants">
              {data.variants.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No variant tasks yet.</p>
              ) : (
                <div className="space-y-1">
                  {data.variants.map((variant) => (
                    <div
                      key={variant.variant_key}
                      className="flex items-center justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"
                    >
                      <span className="text-slate-600">{variant.variant_key}</span>
                      <span className="font-mono text-xs text-slate-500">
                        <span className="font-medium text-slate-800">
                          {formatNumber(variant.published)}
                        </span>{' '}
                        published / {formatNumber(variant.count)} tasks
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Latest snapshot">
              {!data.latest_snapshot ? (
                <p className="py-8 text-center text-sm text-slate-400">No snapshots yet.</p>
              ) : (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[11px]',
                        SNAPSHOT_STATUS_STYLES[data.latest_snapshot.status] ??
                          'border-slate-200 bg-slate-100 text-slate-600'
                      )}
                    >
                      {data.latest_snapshot.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">Source</span>
                    <span className="text-slate-800">{data.latest_snapshot.source}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">Players / valuations</span>
                    <span className="font-mono text-xs text-slate-800">
                      {formatNumber(data.latest_snapshot.player_row_count)} /{' '}
                      {formatNumber(data.latest_snapshot.valuation_row_count)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500">Created</span>
                    <span className="text-xs text-slate-800">
                      {formatDateTime(data.latest_snapshot.created_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-slate-500">ID</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {data.latest_snapshot.id}
                    </span>
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Recent failures">
            {data.recent_failures.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No recent failures.</p>
            ) : (
              <ul>
                {data.recent_failures.map((failure) => (
                  <FailureRow key={failure.id} failure={failure} />
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
