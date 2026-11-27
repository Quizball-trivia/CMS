'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useHarnessOverview, useHqClock } from '@/hooks';
import { agentsOf, readyToStart, SUGGESTED_AGENTS } from '@/lib/hq-agents';
import { DEPARTMENT_LOOK, HQ_DEPARTMENTS } from '@/lib/hq-departments';
import { cn } from '@/lib/utils';
import { RunningAgent, SuggestedAgentCard } from '../agents-ui';
import { agentsNow } from '../content/plain';
import { Seats } from '../content/seats';
import { Hero, HeroStat, HQ_PAGE, LoadErrorState, RefreshErrorBanner } from '../hq-ui';

// Every agent in the company on one page: the subscriptions they run on, then
// each department's agents, the ones at work and the ones suggested.

export default function AgentsPage() {
  const { data, error, isLoading, refetch } = useHarnessOverview();
  const now = useHqClock().getTime();
  const running = data?.agents ?? [];
  const known = new Set(running.map((a) => a.slug));
  const suggested = SUGGESTED_AGENTS.filter((s) => !known.has(s.slug));
  const status = data ? agentsNow(data, now) : null;

  return (
    <div className={HQ_PAGE}>
      <Hero eyebrow="The whole company" title="Agents" description="Everyone who works here that is not a person: what each agent does, which ones are running, and which ones we could add next.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <HeroStat label="At work" value={data ? (data.settings.paused ? 0 : running.filter((a) => a.status === 'active').length) : '…'} note={status?.headline} tone={data && !data.settings.paused ? 'good' : undefined} />
          <HeroStat label="Runs today" value={data ? data.today.runs.toLocaleString() : '…'} note={data?.today.failed ? `${data.today.failed} failed` : undefined} />
          <HeroStat label="Suggested" value={data ? suggested.length : '…'} note="across all departments" />
          <HeroStat label="Can start now" value={data ? readyToStart(suggested).length : '…'} note="need nothing from us" />
        </div>
      </Hero>

      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the agents" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the agents…
        </div>
      ) : (
        <>
          {error && <RefreshErrorBanner />}
          <Seats data={data} />
        </>
      )}

      {/* Which agents are still only suggestions is known once the running ones are. */}
      {data && HQ_DEPARTMENTS.map((d) => {
        const team = agentsOf(d.key, data?.agents);
        const look = DEPARTMENT_LOOK[d.key];
        const Icon = look.icon;
        if (team.running.length + team.suggested.length === 0) return null;
        return (
          <section key={d.key} className="space-y-3" aria-label={`${d.name} agents`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', look.tint)} aria-hidden>
                <Icon className="size-4" />
              </span>
              <h2 className="font-display text-lg font-semibold tracking-tight text-slate-950">{d.name}</h2>
              <p className="text-sm text-slate-500">
                {team.running.length} {data.settings.paused ? 'paused' : 'at work'} · {team.suggested.length} suggested
              </p>
              <Link href={d.home} className="ml-auto text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
                Open {d.name}
              </Link>
            </div>
            {team.running.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {team.running.map((a) => (
                  <RunningAgent key={a.slug} a={a} now={now} allPaused={data?.settings.paused} />
                ))}
              </div>
            )}
            {team.suggested.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {team.suggested.map((s) => (
                  <SuggestedAgentCard key={s.slug} s={s} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
