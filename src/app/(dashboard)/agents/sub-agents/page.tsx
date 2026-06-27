'use client';

import Link from 'next/link';
import { ArrowLeft, Bot, CircleCheck, CircleX, Loader2, Pencil, Activity } from 'lucide-react';
import { useAgentRoster } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function fmtCents(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SubAgentsPage() {
  const { data, isLoading } = useAgentRoster();
  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/agents" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Back to jobs
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Bot className="h-6 w-6 text-slate-400" /> Sub-agents
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The four specialist agents that generate and vet every question. Edit a prompt to change how it behaves.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/agents/prompts">
            <Pencil className="h-4 w-4" /> Edit prompts
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((a) => (
            <Card key={a.role} className="border-slate-200 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">{a.label}</h2>
                      {a.runningNow > 0 ? (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700">
                          <Activity className="mr-1 h-3 w-3" />
                          {a.runningNow} running
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-500">{a.description}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 font-mono text-[11px]">
                    {a.model}
                  </Badge>
                </div>

                {/* live stats */}
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Runs today" value={String(a.runsToday)} />
                  <Stat label="Passed" value={String(a.succeededToday)} tone="ok" />
                  <Stat label="Failed" value={String(a.failedToday)} tone={a.failedToday > 0 ? 'bad' : undefined} />
                  <Stat label="Avg cost" value={fmtCents(a.avgCostCents)} />
                </div>

                {/* prompt preview */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Prompt {a.promptVersion ? `· v${a.promptVersion}` : ''}
                    </span>
                    <Link href="/agents/prompts" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                      <Pencil className="h-3 w-3" /> Edit
                    </Link>
                  </div>
                  <p className="line-clamp-3 break-words text-xs text-slate-600">
                    {a.promptPreview ?? 'No prompt set (uses code default).'}
                  </p>
                </div>

                <div className="text-xs text-slate-400">Last run {fmtAgo(a.lastRunAt)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-slate-900';
  const Icon = tone === 'ok' ? CircleCheck : tone === 'bad' ? CircleX : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-center">
      <div className={`flex items-center justify-center gap-1 text-lg font-bold ${color}`}>
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
