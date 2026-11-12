'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpdateHqMember } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/hq-board';
import { departmentHref, type HqDepartmentInfo } from '@/lib/hq-departments';
import type { HqMember, HqMemberStatus } from '@/types';
import { CountPill, EmptyState, HQ_LABEL, MemberAvatar, Panel, errorMessage, memberHref, useTaskSheet } from '../hq-ui';
import { MemberState, RUNTIME_LABELS } from './member-card';

const COLUMNS = 'md:grid-cols-[minmax(0,2fr)_5.5rem_minmax(0,2fr)_6rem_4.5rem_7rem]';

type StateFilter = 'all' | 'on' | 'paused' | 'archived';
const FILTER_LABELS: Record<StateFilter, string> = { all: 'All', on: 'On', paused: 'Paused', archived: 'Archived' };
const matchesFilter = (m: HqMember, f: StateFilter) => f === 'all' || (f === 'on' ? m.status === 'active' : m.status === f);

/**
 * The operational view of the agents: one row per agent, grouped by department. State, what it is
 * working on, when it last ran, and the same Pause / Resume the profile page has.
 */
export function AgentRoster({ groups }: { groups: Array<{ dept: HqDepartmentInfo; members: HqMember[] }> }) {
  const { openTask } = useTaskSheet();
  const update = useUpdateHqMember();
  const [filter, setFilter] = useState<StateFilter>('all');

  // Same call, same messages as the Pause / Resume buttons on the agent's profile.
  const setStatus = (m: HqMember, status: HqMemberStatus, msg: string) =>
    update.mutate({ id: m.id, data: { status } }, { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e, 'Could not update')) });

  const all = groups.flatMap((g) => g.members);
  const counts: Record<StateFilter, number> = {
    all: all.length,
    on: all.filter((m) => matchesFilter(m, 'on')).length,
    paused: all.filter((m) => matchesFilter(m, 'paused')).length,
    archived: all.filter((m) => matchesFilter(m, 'archived')).length,
  };
  const filters = (['all', 'on', 'paused', 'archived'] as const).filter((f) => f !== 'archived' || counts.archived > 0);
  // A filter that no longer applies (e.g. archived agents were hidden again) falls back to All.
  const active = filters.includes(filter) ? filter : 'all';
  const visible = groups.map((g) => ({ ...g, members: g.members.filter((m) => matchesFilter(m, active)) })).filter((g) => g.members.length > 0);

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap rounded-md border border-slate-200 bg-white p-0.5" role="radiogroup" aria-label="Filter by state">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={active === f}
            onClick={() => setFilter(f)}
            className={cn('rounded px-3 py-1 text-sm font-medium tabular-nums transition', active === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900')}
          >
            {FILTER_LABELS[f]} {counts[f]}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState>No agents are {FILTER_LABELS[active].toLowerCase()} right now.</EmptyState>
      ) : (
        <Panel className="overflow-hidden">
          <div className={cn(HQ_LABEL, 'hidden gap-x-4 border-b border-slate-200 px-4 py-2 md:grid', COLUMNS)}>
            <span>Agent</span>
            <span>State</span>
            <span>Working on</span>
            <span>Last run</span>
            <span>Runs today</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {visible.map(({ dept, members }) => (
              <li key={dept.key}>
                <div className={cn(HQ_LABEL, 'flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-slate-700')}>
                  <Link href={departmentHref(dept.key)} className="hover:underline">
                    {dept.name}
                  </Link>
                  <CountPill n={members.length} />
                </div>
                <ul className="divide-y divide-slate-100">
                  {members.map((m) => {
                    const task = m.stats.currentTask;
                    const canPause = m.runtime === 'hq' || m.runtime === 'quiz_pages';
                    const pending = update.isPending && update.variables?.id === m.id;
                    return (
                      <li
                        key={m.id}
                        className={cn('flex flex-col gap-1.5 px-4 py-2.5 text-[13px] text-slate-600 md:grid md:items-center md:gap-x-4', COLUMNS, m.status === 'archived' && 'opacity-60')}
                      >
                        <Link href={memberHref(m)} className="flex min-w-0 items-center gap-2.5">
                          <MemberAvatar member={m} size="sm" />
                          <span className="min-w-0">
                            <span className="block break-words text-sm font-semibold leading-snug text-slate-950 hover:underline">{m.name}</span>
                            <span className="block break-words text-[13px] leading-snug text-slate-600">{m.title || RUNTIME_LABELS[m.runtime]}</span>
                          </span>
                        </Link>
                        <div>
                          <MemberState member={m} busy={!!task} />
                        </div>
                        <div className="min-w-0">
                          {task ? (
                            <button type="button" onClick={() => openTask(task.id)} className="break-words text-left text-blue-700 hover:underline">
                              #{task.number} {task.title}
                            </button>
                          ) : (
                            <span className="text-slate-500">No active task</span>
                          )}
                        </div>
                        <div className="tabular-nums">
                          <span className="md:hidden">Last run </span>
                          {m.stats.lastRun ? formatRelative(m.stats.lastRun.startedAt) : 'never'}
                        </div>
                        <div className="tabular-nums">
                          {m.stats.runsToday}
                          <span className="md:hidden"> runs today</span>
                        </div>
                        <div className="md:text-right">
                          {/* Neutral on purpose: the state column carries the colour, not the button. */}
                          {canPause && m.status === 'active' && (
                            <Button size="sm" variant="outline" className="w-[6.5rem] justify-center" disabled={pending} aria-label={`Pause ${m.name}`} onClick={() => setStatus(m, 'paused', `${m.name} paused`)}>
                              <Pause className="h-4 w-4" /> Pause
                            </Button>
                          )}
                          {canPause && m.status !== 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-[6.5rem] justify-center"
                              disabled={pending}
                              aria-label={`${m.status === 'archived' ? 'Restore' : 'Resume'} ${m.name}`}
                              onClick={() => setStatus(m, 'active', `${m.name} is back to work`)}
                            >
                              <Play className="h-4 w-4" /> {m.status === 'archived' ? 'Restore' : 'Resume'}
                            </Button>
                          )}
                          {!canPause && <span className="text-slate-500">Runs outside HQ</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
