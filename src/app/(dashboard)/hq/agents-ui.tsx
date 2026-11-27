'use client';

import { Check, CircleDashed, Sparkles } from 'lucide-react';
import { useHqClock } from '@/hooks';
import { agentsOf, atWork, departmentOfAgent, type SuggestedAgent } from '@/lib/hq-agents';
import { DEPARTMENT_LOOK } from '@/lib/hq-departments';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessAgent, HqDepartmentKey } from '@/types';
import { EmptyState, Section } from './hq-ui';

// Agent cards, the same on a department's page and on the company-wide Agents
// page: the ones running (live from the harness) and the ones suggested.

/** "Claude Opus", "GPT": which AI an agent runs on, without the version string. */
export function modelName(model: string): string {
  if (model.startsWith('claude-')) {
    const family = model.split('-')[1] ?? '';
    return `Claude ${family.charAt(0).toUpperCase()}${family.slice(1)}`;
  }
  return model.startsWith('gpt') ? 'GPT' : model;
}

/** `allPaused`: the pause switch for every agent is on, whatever this agent's own switch says. */
export function RunningAgent({ a, now, allPaused = false }: { a: HarnessAgent; now: number; allPaused?: boolean }) {
  const look = DEPARTMENT_LOOK[agentDepartment(a)];
  const paused = allPaused || a.status !== 'active';
  return (
    <article className="hq-card flex flex-col gap-2 p-4" aria-label={a.name}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl font-display text-sm font-semibold', look.tint)} aria-hidden>
          {initials(a.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-slate-950">{a.name}</h3>
          <p className="text-[12px] text-slate-500">
            {modelName(a.model)}
            {a.altModel ? `, then ${modelName(a.altModel)}` : ''}
          </p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', paused ? 'bg-amber-50 text-amber-800' : 'bg-brand-soft text-brand-deep')}>
          {!paused && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
          {paused ? 'Paused' : 'Running'}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{a.description}</p>
      <p className="mt-auto pt-1 text-[12px] tabular-nums text-slate-500">
        {a.runsToday.toLocaleString()} {a.runsToday === 1 ? 'run' : 'runs'} today
        {a.lastRunAt ? ` · last ${formatRelative(a.lastRunAt, now)}` : ' · has not run yet'}
      </p>
    </article>
  );
}

export function SuggestedAgentCard({ s }: { s: SuggestedAgent }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[0.875rem] border border-dashed border-slate-300 bg-white/70 p-4" aria-label={s.name}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-dashed border-slate-300 font-display text-sm font-semibold text-slate-500" aria-hidden>
          {initials(s.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-semibold tracking-tight text-slate-950">{s.name}</h3>
          <p className="text-[12px] text-slate-500">Suggested</p>
        </div>
        {s.needs ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-medium text-slate-600">
            <CircleDashed className="size-3" aria-hidden /> Needs one thing
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand-deep">
            <Check className="size-3" aria-hidden /> Can start now
          </span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-slate-800">{s.does}</p>
      <dl className="mt-auto space-y-1.5 border-t border-slate-200/70 pt-2.5 text-[12.5px] leading-relaxed">
        <Line label="You get" text={s.gives} />
        {s.needs && <Line label="Needs first" text={s.needs} tone="attention" />}
        <Line label="Your part" text={s.person} />
      </dl>
    </article>
  );
}

function Line({ label, text, tone }: { label: string; text: string; tone?: 'attention' }) {
  return (
    <div className="flex gap-2">
      <dt className={cn('w-[5.25rem] shrink-0 font-medium', tone === 'attention' ? 'text-amber-700' : 'text-slate-500')}>{label}</dt>
      <dd className="min-w-0 text-slate-700">{text}</dd>
    </div>
  );
}

/** A department's agents: the ones at work, then the ones suggested. */
export function AgentRoster({ department, agents, loading, allPaused = false }: { department: HqDepartmentKey; agents: HarnessAgent[] | undefined; loading?: boolean; allPaused?: boolean }) {
  const now = useHqClock().getTime();
  const team = agentsOf(department, agents);
  return (
    <>
      <Section
        title="Agents at work"
        count={atWork(team.running, allPaused).on}
        description={allPaused ? 'Every agent is paused right now. Nothing new starts until someone switches them on in Content.' : "Their names, what they run on and today's work come live from HQ."}
      >
        {team.running.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.running.map((a) => (
              <RunningAgent key={a.slug} a={a} now={now} allPaused={allPaused} />
            ))}
          </div>
        ) : (
          <EmptyState>{loading ? 'Checking which agents are running…' : 'No agent works for this department yet. The ones below are where it could start.'}</EmptyState>
        )}
      </Section>
      {/* Which agents are still only suggestions is known once the running ones are. */}
      {agents && team.suggested.length > 0 && (
        <Section
          title={
            <>
              <Sparkles className="size-4 text-slate-400" aria-hidden /> Suggested agents
            </>
          }
          count={team.suggested.length}
          description="What HQ could run here next. Say which ones you want; the ones marked Can start now need nothing from us first."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {team.suggested.map((s) => (
              <SuggestedAgentCard key={s.slug} s={s} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function agentDepartment(a: HarnessAgent): HqDepartmentKey {
  return departmentOfAgent(a.slug);
}
