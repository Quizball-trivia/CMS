'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, ArrowLeft, ExternalLink, Loader2, Pause, Play, Plus, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useHqMember, useHqMembers, useUpdateHqMember } from '@/hooks';
import { formatRelative, formatUsd } from '@/lib/hq-board';
import { departmentHref, departmentInfo } from '@/lib/hq-departments';
import type { HqMemberDetail, HqMemberStatus } from '@/types';
import { EmptyState, MemberAvatar, MemberStatusDot, RefreshErrorBanner, SectionTitle, TaskRow, errorMessage, useTaskSheet } from '../../hq-ui';
import { NewTaskDialog } from '../../new-task-dialog';
import { SchedulesTable } from '../../schedules-ui';
import { RunDetailDialog, RunsTable } from '../../task-sheet';
import { AgentSettingsFields, type AgentSettingsValue } from '../agent-settings-fields';

export default function HqMemberPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data: member, isLoading, error } = useHqMember(id);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!member) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-red-600">{errorMessage(error, 'Member not found.')}</p>
      </div>
    );
  }
  return (
    <>
      {/* Keep the profile (and any unsaved settings draft) on a failed background refetch. */}
      {error && <RefreshErrorBanner className="mb-3" />}
      <MemberProfile member={member} />
    </>
  );
}

function BackLink() {
  return (
    <Link href="/hq/team" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" /> Team
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

  const setStatus = (status: HqMemberStatus, msg: string) =>
    update.mutate(
      { id: member.id, data: { status } },
      { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e, 'Could not update')) }
    );

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <MemberAvatar member={member} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{member.name}</h2>
            <MemberStatusDot status={member.status} busy={!!member.stats.currentTask} />
            <span className="font-mono text-xs text-slate-400">@{member.slug}</span>
            {member.status !== 'active' && (
              <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-500">
                {member.status}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            {member.title && <span>{member.title}</span>}
            {departmentInfo(member.department) && (
              <Link
                href={departmentHref(member.department)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900"
              >
                {departmentInfo(member.department)!.emoji} {departmentInfo(member.department)!.name}
              </Link>
            )}
          </div>
          {member.description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{member.description}</p>}
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>{member.stats.openTasks} open tasks</span>
            {member.kind === 'agent' && (
              <>
                <span>{member.stats.runsToday} runs today</span>
                <span>{formatUsd(member.stats.costTodayCents)} today (est.)</span>
                <span>last active {formatRelative(member.lastActiveAt)}</span>
              </>
            )}
          </div>
          {member.stats.currentTask && (
            <button
              type="button"
              onClick={() => openTask(member.stats.currentTask!.id)}
              className="mt-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Loader2 className="h-3 w-3 animate-spin" /> Working on #{member.stats.currentTask.number} {member.stats.currentTask.title}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNewTaskOpen(true)}>
            <Plus className="h-4 w-4" /> Assign task
          </Button>
          {isHqAgent && member.status === 'active' && (
            <Button variant="outline" onClick={() => setStatus('paused', `${member.name} paused`)}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {isHqAgent && member.status !== 'active' && (
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => setStatus('active', `${member.name} is back to work`)}>
              <Play className="h-4 w-4" /> {member.status === 'archived' ? 'Restore' : 'Resume'}
            </Button>
          )}
          {member.kind === 'agent' && member.status !== 'archived' && member.runtime === 'hq' && (
            <Button
              variant="ghost"
              className="text-slate-500"
              onClick={() => {
                if (window.confirm(`Archive ${member.name}? It stops working and disappears from the team (you can restore it).`)) {
                  setStatus('archived', `${member.name} archived`);
                }
              }}
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
        </div>
      </div>

      {member.external && <ExternalStats member={member} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          {isHqAgent && <AgentSettingsCard member={member} />}

          {isHqAgent && (
            <section>
              <SectionTitle count={member.schedules.length}>Automations</SectionTitle>
              <SchedulesTable schedules={member.schedules} members={members} showMember={false} fixedMemberId={member.id} />
            </section>
          )}

          {member.kind === 'agent' && (
            <section>
              <SectionTitle count={member.recentRuns.length}>Recent runs</SectionTitle>
              {member.recentRuns.length === 0 ? (
                <EmptyState>{isHqAgent ? 'No runs yet.' : 'This agent runs on its own pipeline — see its stats above.'}</EmptyState>
              ) : (
                <RunsTable runs={member.recentRuns} onOpen={setRunId} showTask />
              )}
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section>
            <SectionTitle count={member.openTasks.length}>Open tasks</SectionTitle>
            {member.openTasks.length === 0 ? (
              <EmptyState>Nothing open.</EmptyState>
            ) : (
              <div className="space-y-2">
                {member.openTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} />
                ))}
              </div>
            )}
          </section>
          <section>
            <SectionTitle count={member.recentTasks.length}>Recent results</SectionTitle>
            {member.recentTasks.length === 0 ? (
              <EmptyState>No finished tasks yet.</EmptyState>
            ) : (
              <div className="space-y-2">
                {member.recentTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={openTask} showResultPreview />
                ))}
              </div>
            )}
          </section>
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
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Job description &amp; settings</CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Name</span>
            <Input value={value.name} onChange={(e) => edit({ name: e.target.value })} maxLength={80} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Title</span>
            <Input value={value.title} onChange={(e) => edit({ title: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Description</span>
            <Input value={value.description} onChange={(e) => edit({ description: e.target.value })} />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-500">Instructions</span>
          <Textarea rows={14} value={value.instructions} onChange={(e) => edit({ instructions: e.target.value })} className="font-mono text-xs" />
        </label>
        <AgentSettingsFields value={value.settings} onChange={(settings) => edit({ settings })} />
      </CardContent>
    </Card>
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
      : [
          ['Reports (7d)', ext.reports7d],
          ['PRs opened', ext.prsOpened7d],
          ['Needs info', ext.needsInfo7d],
        ];
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{ext.kind === 'question_agents' ? 'Question pipeline — last 7 days' : 'Bug triage — last 7 days'}</CardTitle>
        {ext.kind === 'question_agents' && (
          <Link href="/agents" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
            Open Agents &amp; VPS <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-slate-200 p-3">
              <div className="text-2xl font-bold text-slate-900">{value as number}</div>
              <div className="text-xs text-slate-500">{label as string}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
