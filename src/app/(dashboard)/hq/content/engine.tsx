'use client';

import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/hq-time';
import type { HarnessAccount, HarnessOverview } from '@/types';
import { EmptyState, Panel, Section } from '../hq-ui';

// The engine room: agents, model accounts and the work queue. Collapsed by
// default on the Content tab; it is for whoever looks after the system.

const JOB_LABEL: Record<string, string> = {
  plan: 'Planning',
  make: 'Writing',
  fact_check: 'Fact check',
  quality_judge: 'Quality check',
  localize: 'Translating',
  locale_check: 'Language check',
};

const TEAM_LABEL: Record<string, string> = {
  sensing: 'Sensing',
  suggesting: 'Suggesting',
  making: 'Making',
  checking: 'Checking',
  localization: 'Localization',
  foundation: 'Foundation',
  live: 'Live',
};

const TH = 'px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500';
const TD = 'px-4 py-2 align-top';

function usage(a: HarnessAccount): string {
  const parts = Object.entries(a.windows ?? {})
    .filter(([, w]) => typeof w.utilization === 'number')
    .map(([name, w]) => `${name.replace('_', '-')} ${Math.round((w.utilization as number) * 100)}%`);
  return parts.join(' · ') || 'no reading yet';
}

function accountState(a: HarnessAccount): { label: string; tone: string } {
  if (a.reservedForPeople) return { label: 'People only', tone: 'bg-slate-100 text-slate-700' };
  if (a.status === 'disabled') return { label: 'Off', tone: 'bg-slate-100 text-slate-600' };
  const now = Date.now();
  if (a.blockedUntil && Date.parse(a.blockedUntil) > now) {
    return { label: a.state === 'auth' ? 'Login problem' : 'At its limit', tone: 'bg-amber-100 text-amber-800' };
  }
  // Same rule as the worker's router: a window that hasn't reset yet and is refused or past the account's share.
  const full = Object.values(a.windows ?? {}).some(
    (w) =>
      !(w.resets_at && Date.parse(w.resets_at) <= now) &&
      (w.status === 'rejected' || (typeof w.utilization === 'number' && w.utilization * 100 >= a.softPct))
  );
  if (full) return { label: 'At its limit', tone: 'bg-amber-100 text-amber-800' };
  return { label: 'Ready', tone: 'bg-emerald-100 text-emerald-800' };
}

export function EngineRoom({ data }: { data: HarnessOverview }) {
  const activeJobs = (data.jobs ?? []).filter((j) => j.status === 'queued' || j.status === 'running');
  return (
    <div className="space-y-6">
            <Section title="Work in the queue" count={activeJobs.reduce((n, j) => n + j.count, 0)}>
        <Panel className="divide-y divide-slate-100">
          {activeJobs.length === 0 ? (
            <EmptyState className="px-4 py-3">Nothing waiting.</EmptyState>
          ) : (
            activeJobs.map((j) => (
              <div key={`${j.kind}-${j.status}`} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-700">
                  {JOB_LABEL[j.kind] ?? j.kind} <span className="text-slate-500">({j.status === 'running' ? 'running' : 'waiting'})</span>
                </span>
                <span className="font-semibold tabular-nums text-slate-950">{j.count}</span>
              </div>
            ))
          )}
        </Panel>
      </Section>
          <Section title="Agents" count={data.agents.length} description="Makers run on Claude, checkers on Codex, so no agent checks its own family's work.">
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className={TH}>Agent</th>
                    <th className={TH}>Team</th>
                    <th className={TH}>Model</th>
                    <th className={TH}>Account, then fallbacks</th>
                    <th className={cn(TH, 'text-right')}>Runs today</th>
                    <th className={TH}>Last run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.agents.map((a) => (
                    <tr key={a.slug}>
                      <td className={TD}>
                        <div className="font-medium text-slate-900">
                          {a.name}
                          {a.status === 'paused' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">paused</span>}
                        </div>
                        <div className="text-[13px] text-slate-600">{a.description}</div>
                      </td>
                      <td className={TD}>{TEAM_LABEL[a.team] ?? a.team}</td>
                      <td className={cn(TD, 'whitespace-nowrap')}>
                        {a.model}
                        {a.effort ? <span className="text-slate-500"> · {a.effort}</span> : null}
                      </td>
                      <td className={cn(TD, 'text-[13px]')}>{[a.primaryAccount, ...a.fallbackAccounts].join(' → ') || '—'}{a.fallbackAccounts.length === 0 && <span className="text-slate-500"> (waits, no fallback)</span>}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{a.runsToday}</td>
                      <td className={cn(TD, 'whitespace-nowrap text-slate-600')}>{formatRelative(a.lastRunAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>

          <Section title="Model accounts" description="The database stores only the name of each secret; the secrets stay on the worker.">
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-slate-200">
                  <tr>
                    <th className={TH}>Account</th>
                    <th className={TH}>Provider</th>
                    <th className={TH}>State</th>
                    <th className={TH}>Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.accounts.map((a) => {
                    const st = accountState(a);
                    return (
                      <tr key={a.id}>
                        <td className={TD}>
                          <div className="font-medium text-slate-900">{a.label}</div>
                          <div className="font-mono text-[12px] text-slate-500">{a.id}</div>
                        </td>
                        <td className={cn(TD, 'capitalize')}>{a.provider}</td>
                        <td className={TD}>
                          <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', st.tone)}>{st.label}</span>
                          {a.lastError && st.label !== 'Ready' && <div className="mt-1 max-w-xs truncate text-[12px] text-slate-500" title={a.lastError}>{a.lastError}</div>}
                        </td>
                        <td className={cn(TD, 'text-[13px] text-slate-600')}>{a.reservedForPeople ? 'never used by agents' : usage(a)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>

    </div>
  );
}
