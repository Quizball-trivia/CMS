'use client';

import Link from 'next/link';
import { Activity, Loader2, ChevronRight } from 'lucide-react';
import { useAgentActivity } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AgentNav } from '../agent-ui';
import type { AgentLiveSession } from '@/types';

const ROLE_STYLE: Record<string, string> = {
  generator: 'border-violet-200 bg-violet-50 text-violet-700',
  factcheck: 'border-blue-200 bg-blue-50 text-blue-700',
  criteria: 'border-amber-200 bg-amber-50 text-amber-700',
  dedupe: 'border-slate-200 bg-slate-100 text-slate-600',
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// The stage a role represents in the pipeline — shown so you know what a
// long-running session is actually doing.
const ROLE_STAGE: Record<string, string> = {
  generator: 'writing questions',
  factcheck: 'web fact-checking',
  criteria: 'quality check',
  dedupe: 'duplicate check',
};

function SessionRow({ s }: { s: AgentLiveSession }) {
  const slow = s.durationSeconds > 120; // flag sessions running unusually long
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <Badge variant="outline" className={`shrink-0 capitalize ${ROLE_STYLE[s.role] ?? ROLE_STYLE.dedupe}`}>
        {s.role}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">
          {s.question || s.topic || '—'}
        </p>
        <p className="text-xs text-slate-500">
          {ROLE_STAGE[s.role] ?? 'working'}
          {s.topic ? ` · ${s.topic}` : ''}
          {s.taskSeq != null ? ` · Q#${s.taskSeq}` : ''}
          {s.model ? ` · ${s.model}` : ''}
        </p>
      </div>
      <span className={`shrink-0 font-mono text-sm tabular-nums ${slow ? 'font-semibold text-amber-600' : 'text-slate-600'}`}>
        {fmtDuration(s.durationSeconds)}
      </span>
      {s.jobId ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
    </div>
  );
  // Clicking a session opens its job detail (tasks, stages, verdicts, events).
  return s.jobId ? (
    <Link href={`/agents/${s.jobId}`} className="block border-b border-slate-100 last:border-0 hover:bg-slate-50">
      {inner}
    </Link>
  ) : (
    <div className="border-b border-slate-100 last:border-0">{inner}</div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone ?? 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

export default function ActivityPage() {
  const { data, isLoading } = useAgentActivity();
  const running = data?.running ?? [];
  const recent = data?.recent;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <Activity className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Live Activity</h1>
          <p className="text-sm text-slate-500">What the agents are doing right now. Auto-refreshes.</p>
        </div>
      </div>

      <AgentNav />

      {recent ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={`Generated (${recent.windowHours}h)`} value={recent.generated} />
          <Stat label="Approved" value={recent.approved} tone="text-emerald-600" />
          <Stat label="Rejected" value={recent.rejected} tone="text-red-600" />
          <Stat label="Failed" value={recent.failed} tone="text-amber-600" />
        </div>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Running now {running.length > 0 ? `(${running.length})` : ''}
            </h2>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
          </div>
          {running.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              No agents running right now. Spawn a job and it will appear here live.
            </div>
          ) : (
            running.map((s) => <SessionRow key={s.id} s={s} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
