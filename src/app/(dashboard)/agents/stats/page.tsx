'use client';

import { BarChart3, Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useAgentStats } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { AgentNav } from '../agent-ui';
import { formatCents } from '../agent-ui';

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

export default function StatsPage() {
  const { data, isLoading } = useAgentStats();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <BarChart3 className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Stats</h1>
          <p className="text-sm text-slate-500">How the agents are performing over the last {data?.days ?? 7} days.</p>
        </div>
      </div>

      <AgentNav />

      {isLoading || !data ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading stats…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Approved" value={String(data.totals.approved)} />
            <Stat label="Rejected" value={String(data.totals.rejected)} />
            <Stat label="Approval rate" value={`${data.totals.approvalRate}%`} />
            <Stat label="Spend" value={formatCents(data.totals.costCents)} sub={`last ${data.days} days`} />
          </div>

          <Panel title="Approved vs rejected per day">
            {data.daily.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No data yet.</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="approved" name="Approved" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="rejected" name="Rejected" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Rejections by stage">
              {data.rejections.length === 0 ? (
                <p className="py-4 text-sm text-slate-400">No rejections in this window.</p>
              ) : (
                <div className="space-y-2">
                  {data.rejections.map((r) => {
                    const max = Math.max(...data.rejections.map((x) => x.count));
                    return (
                      <div key={r.stage} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-sm capitalize text-slate-600">{r.stage}</span>
                        <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                          <div
                            className="h-full rounded bg-red-400"
                            style={{ width: `${max ? (r.count / max) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-medium text-slate-700">{r.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Avg time per agent role">
              {data.timings.length === 0 ? (
                <p className="py-4 text-sm text-slate-400">No runs in this window.</p>
              ) : (
                <div className="space-y-2">
                  {data.timings.map((t) => (
                    <div key={t.role} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
                      <span className="text-sm capitalize text-slate-700">{t.role}</span>
                      <span className="text-sm text-slate-500">
                        <span className="font-mono font-medium text-slate-800">{t.avgSeconds}s</span>
                        <span className="ml-2 text-xs text-slate-400">{t.runs} runs</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
