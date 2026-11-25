'use client';

import { useMemo, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHarnessOverview, useSetHarnessPolicy, useUpdateHarnessSettings } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { cn } from '@/lib/utils';
import type { HarnessAccount, HarnessOverview, HarnessReleaseStatus } from '@/types';
import { EmptyState, errorMessage, HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, Section, Stat } from '../hq-ui';

// HQ → Content: the agent harness that keeps game content full, first slice
// Classic ranked. People only steer here (pause, run caps, release mode);
// agents and code do the work.

/** Item stages in pipeline order, with plain names. */
const STAGES: Array<{ key: string; label: string }> = [
  { key: 'draft', label: 'Being written' },
  { key: 'validated', label: 'Being checked' },
  { key: 'verified', label: 'Being translated' },
  { key: 'localized', label: 'Language check' },
  { key: 'approved', label: 'Released as draft' },
  { key: 'live', label: 'Live in ranked' },
  { key: 'escalated', label: 'Stuck (needs the Arbiter)' },
  { key: 'rejected', label: 'Rejected' },
];

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
  if (a.blockedUntil && Date.parse(a.blockedUntil) > Date.now()) {
    return { label: a.state === 'auth' ? 'Login problem' : 'At its limit', tone: 'bg-amber-100 text-amber-800' };
  }
  return { label: 'Ready', tone: 'bg-emerald-100 text-emerald-800' };
}

function releaseStatus(o: HarnessOverview): HarnessReleaseStatus {
  return o.policies.find((p) => p.key === 'classic.release_status')?.value === 'published' ? 'published' : 'draft';
}

function Controls({ data }: { data: HarnessOverview }) {
  const update = useUpdateHarnessSettings();
  const setPolicy = useSetHarnessPolicy();
  const paused = data.settings.paused;
  const toggle = () =>
    update.mutate(
      { paused: !paused, pausedReason: paused ? null : 'Paused from the CMS' },
      {
        onSuccess: () => toast.success(paused ? 'Agents switched on' : 'Agents paused'),
        onError: (e) => toast.error(errorMessage(e, 'Could not change the pause switch')),
      }
    );
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>New questions go</span>
        <Select
          value={releaseStatus(data)}
          onValueChange={(v) =>
            setPolicy.mutate(
              { key: 'classic.release_status', value: v },
              {
                onSuccess: () => toast.success(v === 'published' ? 'New questions now go straight into ranked' : 'New questions now wait in the draft queue'),
                onError: (e) => toast.error(errorMessage(e, 'Could not change where new questions go')),
              }
            )
          }
          disabled={setPolicy.isPending}
        >
          <SelectTrigger id="harness-release-status" className="h-9 w-[200px]" aria-label="Where new questions go">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">to the draft queue</SelectItem>
            <SelectItem value="published">straight into ranked</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={toggle} disabled={update.isPending} variant={paused ? 'default' : 'outline'}>
        {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
        {paused ? 'Switch agents on' : 'Pause agents'}
      </Button>
    </>
  );
}

export default function HqContentPage() {
  const { data, error, isLoading, refetch } = useHarnessOverview();
  const [showAll, setShowAll] = useState(false);

  const categories = useMemo(() => {
    const rows = [...(data?.classic.categories ?? [])].sort((a, b) => b.shortage - a.shortage || b.views30d - a.views30d);
    return showAll ? rows : rows.slice(0, 15);
  }, [data, showAll]);
  const stageCount = (key: string) => data?.stages.filter((s) => s.mode === 'classic' && s.stage === key).reduce((n, s) => n + s.count, 0) ?? 0;
  const activeJobs = (data?.jobs ?? []).filter((j) => j.status === 'queued' || j.status === 'running');

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="HQ"
        title="Content"
        description="Agents keep every game's content full, checked and translated. First up: the Classic ranked question pools."
        actions={data ? <Controls data={data} /> : undefined}
      />

      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the content agents" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {data.settings.paused && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>Agents are paused.</b> {data.settings.pausedReason ?? ''} Nothing new starts until someone switches them on.
            </div>
          )}

          <Panel className="grid grid-cols-2 divide-slate-200 sm:grid-cols-4 sm:divide-x">
            <Stat label="Status" value={data.settings.paused ? 'Paused' : 'Running'} tone={data.settings.paused ? 'attention' : 'good'} hint={`up to ${data.settings.maxConcurrentRuns} at once`} />
            <Stat
              label="Classic gap"
              value={data.classic.totalShortage}
              tone={data.classic.totalShortage > 0 ? 'attention' : 'good'}
              hint={`questions short in ${data.classic.shortCategories} categories`}
            />
            <Stat label="Agent runs today" value={data.today.runs} hint={`limit ${data.settings.dailyRunLimit} a day`} />
            <Stat label="Failed today" value={data.today.failed} tone={data.today.failed > 0 ? 'attention' : 'neutral'} />
          </Panel>

          <Section
            title="Classic ranked pools"
            count={data.classic.shortCategories}
            countTone="attention"
            description={`Each category needs one question per ${data.classic.viewCap} ranked showings a month, so players rarely see a repeat.`}
            actions={
              data.classic.categories.length > 15 ? (
                <button type="button" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show the top 15' : `Show all ${data.classic.categories.length}`}
                </button>
              ) : undefined
            }
          >
            <Panel className="overflow-x-auto">
              {categories.length === 0 ? (
                <EmptyState>No ranked play in the last 30 days.</EmptyState>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b border-slate-200">
                    <tr>
                      <th className={TH}>Category</th>
                      <th className={cn(TH, 'text-right')}>Showings (30 days)</th>
                      <th className={cn(TH, 'text-right')}>Live</th>
                      <th className={cn(TH, 'text-right')}>Being made</th>
                      <th className={cn(TH, 'text-right')}>Needed</th>
                      <th className={cn(TH, 'text-right')}>Short</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {categories.map((c) => (
                      <tr key={c.categoryId}>
                        <td className={cn(TD, 'font-medium text-slate-900')}>{c.slug}</td>
                        <td className={cn(TD, 'text-right')}>{c.views30d.toLocaleString()}</td>
                        <td className={cn(TD, 'text-right')}>{c.pool}</td>
                        <td className={cn(TD, 'text-right')}>{c.inPipeline}</td>
                        <td className={cn(TD, 'text-right')}>{c.needed}</td>
                        <td className={cn(TD, 'text-right font-semibold', c.shortage > 0 ? 'text-amber-600' : 'text-emerald-600')}>{c.shortage > 0 ? c.shortage : '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Questions in the pipeline" description="Every new question moves through these steps.">
              <Panel className="divide-y divide-slate-100">
                {STAGES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className={cn('text-slate-700', s.key === 'escalated' && stageCount(s.key) > 0 && 'font-medium text-amber-700')}>{s.label}</span>
                    <span className="font-semibold tabular-nums text-slate-950">{stageCount(s.key)}</span>
                  </div>
                ))}
              </Panel>
            </Section>
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
          </div>

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

          <Section title="Recent activity">
            <Panel className="divide-y divide-slate-100">
              {data.events.length === 0 ? (
                <EmptyState className="px-4 py-3">No activity yet.</EmptyState>
              ) : (
                data.events.slice(0, 25).map((e) => (
                  <div key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                    <span className={cn('w-20 shrink-0 text-[12px] text-slate-500', HQ_LABEL)}>{formatRelative(e.createdAt)}</span>
                    <span className={cn('min-w-0 flex-1', e.level === 'error' ? 'text-red-700' : e.level === 'warn' ? 'text-amber-700' : 'text-slate-800')}>{e.message}</span>
                  </div>
                ))
              )}
            </Panel>
          </Section>
        </>
      )}
    </div>
  );
}
