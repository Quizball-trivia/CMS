'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArrowLeft, ExternalLink, Loader2, Pause, Play, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useHqMember, useHqMembers, useUpdateHqMember } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/hq-board';
import { departmentHref, departmentInfo } from '@/lib/hq-departments';
import type { HqMember, HqMemberDetail, HqMemberStatus } from '@/types';
import { EmptyState, HQ_LABEL, HQ_PAGE, MemberAvatar, PageHeader, Panel, RefreshErrorBanner, Section, Stat, TaskRow, errorMessage, useTaskSheet } from '../../hq-ui';
import { NewTaskDialog } from '../../new-task-dialog';
import { SchedulesTable } from '../../schedules-ui';
import { RunDetailDialog, RunsTable } from '../../task-sheet';
import { AgentSettingsFields, type AgentSettingsValue } from '../agent-settings-fields';
import { MemberState, lastActivityLabel } from '../member-card';

export default function HqMemberPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: member, isLoading, error } = useHqMember(id);

  if (isLoading) {
    return (
      <div className={HQ_PAGE}>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }
  if (!member) {
    return (
      <div className={HQ_PAGE}>
        <div className="space-y-3">
          <BackLink />
          <p className="text-sm text-red-600">{errorMessage(error, 'Member not found.')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className={HQ_PAGE}>
      {/* Keep the profile (and any unsaved settings draft) on a failed background refetch. */}
      {error && <RefreshErrorBanner />}
      <MemberProfile member={member} />
    </div>
  );
}

// Without a loaded member (not found, failed load) the page's own route says which list it came from.
function BackLink({ kind }: { kind?: HqMember['kind'] }) {
  const pathname = usePathname();
  const person = kind ? kind === 'human' : pathname?.startsWith('/hq/people/') === true;
  return (
    <Link href={person ? '/hq/people' : '/hq/team'} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
      <ArrowLeft className="h-4 w-4" /> {person ? 'People' : 'Agents'}
    </Link>
  );
}

function MemberProfile({ member }: { member: HqMemberDetail }) {
  const { openTask } = useTaskSheet();
  const { data: members = [] } = useHqMembers();
  const update = useUpdateHqMember();
  const [runId, setRunId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const isHqAgent = member.kind === 'agent' && member.runtime === 'hq';
  // The quiz-page pipeline is switched on and off from here too: its runner and its publishing obey this status.
  const canPause = isHqAgent || (member.kind === 'agent' && member.runtime === 'quiz_pages');

  const setStatus = (status: HqMemberStatus, msg: string) =>
    update.mutate(
      { id: member.id, data: { status } },
      { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e, 'Could not update')) }
    );

  const dept = departmentInfo(member.department);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackLink kind={member.kind} />
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <MemberAvatar member={member} size="md" />
              <span className="min-w-0 break-words">{member.name}</span>
            </span>
          }
          description={
            <>
              {member.title && <span>{member.title}</span>}
              {member.title && dept && <span> · </span>}
              {dept && (
                <Link href={departmentHref(member.department)} className="font-medium text-slate-700 hover:underline">
                  {dept.name}
                </Link>
              )}
            </>
          }
          actions={
            <>
              {/* Archived members aren't assignable (the backend rejects them): restore first. */}
              {member.status !== 'archived' && (
                <Button variant="outline" onClick={() => setNewTaskOpen(true)}>
                  <Plus className="h-4 w-4" /> Assign task
                </Button>
              )}
              {canPause && member.status === 'active' && (
                <Button variant="outline" onClick={() => setStatus('paused', `${member.name} paused`)}>
                  <Pause className="h-4 w-4" /> Pause
                </Button>
              )}
              {canPause && member.status !== 'active' && (
                <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus('active', `${member.name} is back to work`)}>
                  <Play className="h-4 w-4" /> {member.status === 'archived' ? 'Restore' : 'Resume'}
                </Button>
              )}
              {member.kind === 'agent' && member.status !== 'archived' && member.runtime === 'hq' && (
                <Button
                  variant="ghost"
                  className="text-slate-600"
                  onClick={() => {
                    if (window.confirm(`Archive ${member.name}? It stops working and disappears from the team (you can restore it).`)) {
                      setStatus('archived', `${member.name} archived`);
                    }
                  }}
                >
                  <Archive className="h-4 w-4" /> Archive
                </Button>
              )}
            </>
          }
        />
        <div className="space-y-2">
          {member.description && <p className="max-w-3xl text-sm text-slate-700">{member.description}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] tabular-nums text-slate-600">
            <MemberState member={member} busy={!!member.stats.currentTask} />
            <span className="font-mono">@{member.slug}</span>
            <span>{member.stats.openTasks} open tasks</span>
            {member.kind === 'agent' && (
              <>
                <span>{member.stats.runsToday} runs today</span>
                <span>{formatUsd(member.stats.costTodayCents)} today (est.)</span>
              </>
            )}
            <span>{lastActivityLabel(member)}</span>
          </div>
          {member.stats.currentTask && (
            <button
              type="button"
              onClick={() => openTask(member.stats.currentTask!.id)}
              className="inline-flex max-w-full items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-left text-[13px] font-medium text-blue-700 hover:bg-blue-100"
            >
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span className="min-w-0 break-words">
                Working on #{member.stats.currentTask.number} {member.stats.currentTask.title}
              </span>
            </button>
          )}
        </div>
      </div>

      {member.external && <ExternalStats member={member} />}

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-8">
          {isHqAgent && <AgentSettingsCard member={member} />}

          {isHqAgent && (
            <Section title="Schedules" count={member.schedules.length}>
              <SchedulesTable schedules={member.schedules} members={members} showMember={false} fixedMemberId={member.id} canCreate={member.status !== 'archived'} />
            </Section>
          )}

          {member.kind === 'agent' && (
            <Section title="Recent runs" count={member.recentRuns.length}>
              {member.recentRuns.length === 0 ? (
                <EmptyState>{isHqAgent ? 'No runs yet.' : 'This agent runs on its own pipeline. See its stats above.'}</EmptyState>
              ) : (
                <RunsTable runs={member.recentRuns} onOpen={setRunId} showTask />
              )}
            </Section>
          )}
        </div>

        <div className="min-w-0 space-y-8">
          <Section title="Open tasks" count={member.openTasks.length}>
            {member.openTasks.length === 0 ? (
              <EmptyState>Nothing open.</EmptyState>
            ) : (
              <div className="space-y-2">
                {member.openTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} />
                ))}
              </div>
            )}
          </Section>
          <Section title="Recent results" count={member.recentTasks.length}>
            {member.recentTasks.length === 0 ? (
              <EmptyState>No finished tasks yet.</EmptyState>
            ) : (
              <div className="space-y-2">
                {member.recentTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} showResultPreview />
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <RunDetailDialog runId={runId} onClose={() => setRunId(null)} />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} members={members} defaultAssigneeId={member.id} />
    </div>
  );
}

interface AgentDraft {
  name: string;
  title: string;
  description: string;
  instructions: string;
  settings: AgentSettingsValue;
}

function draftFromMember(member: HqMemberDetail): AgentDraft {
  return {
    name: member.name,
    title: member.title,
    description: member.description,
    instructions: member.instructions,
    settings: {
      avatar: member.avatar,
      color: member.color,
      model: member.model ?? '',
      tools: member.tools,
      autonomy: member.autonomy,
      maxTurns: member.maxTurns,
      department: member.department,
    },
  };
}

function AgentSettingsCard({ member }: { member: HqMemberDetail }) {
  const update = useUpdateHqMember();
  // null = not editing: show live server values (they refresh while polling).
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const value = draft ?? draftFromMember(member);
  const edit = (patch: Partial<AgentDraft>) => setDraft({ ...value, ...patch });

  const save = () => {
    if (!draft) return;
    if (!draft.name.trim()) return toast.error('Name is required');
    if (!draft.instructions.trim()) return toast.error('Instructions are required');
    const s = draft.settings;
    update.mutate(
      {
        id: member.id,
        data: {
          name: draft.name.trim(),
          title: draft.title.trim(),
          description: draft.description.trim(),
          instructions: draft.instructions.trim(),
          avatar: s.avatar || '🤖',
          color: s.color,
          model: s.model.trim() || null,
          tools: s.tools,
          autonomy: s.autonomy,
          maxTurns: s.maxTurns,
          department: s.department,
        },
      },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success('Saved — applies from the next run');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not save')),
      }
    );
  };

  return (
    <Section
      title="Job description & settings"
      actions={
        <div className="flex gap-2">
          {draft && (
            <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
              Discard
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={!draft || update.isPending}>
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      }
    >
      <Panel className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className={HQ_LABEL}>Name</span>
            <Input value={value.name} onChange={(e) => edit({ name: e.target.value })} maxLength={80} />
          </label>
          <label className="space-y-1">
            <span className={HQ_LABEL}>Title</span>
            <Input value={value.title} onChange={(e) => edit({ title: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className={HQ_LABEL}>Description</span>
            <Input value={value.description} onChange={(e) => edit({ description: e.target.value })} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className={HQ_LABEL}>Instructions</span>
          <Textarea rows={14} value={value.instructions} onChange={(e) => edit({ instructions: e.target.value })} className="font-mono text-xs" />
        </label>
        <AgentSettingsFields value={value.settings} onChange={(settings) => edit({ settings })} />
      </Panel>
    </Section>
  );
}

function ExternalStats({ member }: { member: HqMemberDetail }) {
  const ext = member.external!;
  const stats =
    ext.kind === 'question_agents'
      ? [
          ['Jobs (7d)', ext.jobs7d],
          ['Accepted', ext.accepted7d],
          ['Rejected', ext.rejected7d],
          ['Failed', ext.failed7d],
        ]
      : ext.kind === 'quiz_pages'
        ? [
            ['Published (7d)', ext.published7d],
            ['Refreshed (7d)', ext.refreshed7d],
            ['Waiting to build (now)', ext.queued],
            ['Stuck (now)', ext.held],
          ]
        : [
            ['Reports (7d)', ext.reports7d],
            ['PRs opened', ext.prsOpened7d],
            ['Needs info', ext.needsInfo7d],
          ];
  // The quiz-page card mixes 7-day totals with current counts, so its labels carry the period instead of the title.
  const title = { question_agents: 'Question pipeline — last 7 days', quiz_pages: 'Quiz pages', bug_triage: 'Bug triage — last 7 days' }[ext.kind];
  return (
    <Section
      title={title}
      actions={
        <>
          {ext.kind === 'quiz_pages' && (
            <Link href="/quiz-pages" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
              Open quiz pages <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {ext.kind === 'question_agents' && (
            <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
              Open Agents &amp; VPS <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </>
      }
    >
      <Panel
        className={cn(
          'grid grid-cols-2 gap-px overflow-hidden bg-slate-200 [&>*:last-child:nth-child(odd)]:col-span-2',
          stats.length === 3 ? 'sm:grid-cols-3 sm:[&>*:last-child:nth-child(odd)]:col-span-1' : 'sm:grid-cols-4'
        )}
      >
        {stats.map(([label, value]) => (
          <div key={label as string} className="bg-white">
            <Stat label={label as string} value={value as number} />
          </div>
        ))}
      </Panel>
    </Section>
  );
}
