'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAgentJob, useJobEvents, useJobTasks, useRetryTask } from '@/hooks';
import type { AgentTask, AgentTaskVerdicts } from '@/types';
import { getLocalizedText } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DecisionBadge,
  EventLevelDot,
  formatCents,
  formatTime,
  JobStatusBadge,
} from '../agent-ui';

interface JobPageProps {
  params: Promise<{ jobId: string }>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function verdictText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const reason = obj.reason ?? obj.message ?? obj.detail;
    if (typeof reason === 'string') return reason;
    return JSON.stringify(value);
  }
  return String(value);
}

function VerdictsPanel({ verdicts }: { verdicts: AgentTaskVerdicts | null }) {
  if (!verdicts) return null;
  const factcheck = verdictText(verdicts.factcheck);
  const criteria = verdictText(verdicts.criteria);
  const dedupe = verdictText(verdicts.dedupe);
  if (!factcheck && !criteria && !dedupe) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {factcheck ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fact check</div>
          <p className="mt-1 text-xs text-slate-600">{factcheck}</p>
        </div>
      ) : null}
      {criteria ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Criteria</div>
          <p className="mt-1 text-xs text-slate-600">{criteria}</p>
        </div>
      ) : null}
      {dedupe ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dedupe</div>
          <p className="mt-1 text-xs text-slate-600">{dedupe}</p>
        </div>
      ) : null}
    </div>
  );
}

function TaskDetail({ task }: { task: AgentTask }) {
  const draft = task.questionDraft;

  return (
    <div className="space-y-4 bg-slate-50 px-5 py-4">
      {draft ? (
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prompt</div>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {getLocalizedText(draft.prompt, '—')}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {draft.options.map((option, index) => (
              <div
                key={index}
                className={
                  option.is_correct
                    ? 'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2'
                    : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2'
                }
              >
                {option.is_correct ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-100 text-emerald-700">
                    Correct
                  </Badge>
                ) : null}
                <span className="text-sm text-slate-700">{getLocalizedText(option.text, '—')}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">No draft generated yet.</p>
      )}

      <VerdictsPanel verdicts={task.verdicts} />

      {task.warnings && task.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Warnings</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-700">
            {task.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {task.rejectReason ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <span className="font-semibold">Rejected: </span>
          {task.rejectReason}
        </div>
      ) : null}

      {task.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <span className="font-semibold">Error: </span>
          {task.error}
        </div>
      ) : null}
    </div>
  );
}

function TasksTable({ jobId }: { jobId: string }) {
  const { data: tasks, isLoading } = useJobTasks(jobId);
  const retryTask = useRetryTask();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (taskId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleRetry = async (event: React.MouseEvent, taskId: string) => {
    event.stopPropagation();
    try {
      await retryTask.mutateAsync({ taskId, jobId });
      toast.success('Task retry queued');
    } catch {
      toast.error('Failed to retry task');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pl-5" />
              <TableHead className="w-12">#</TableHead>
              <TableHead>Status / Stage</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead>Question</TableHead>
              <TableHead className="pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  Loading tasks…
                </TableCell>
              </TableRow>
            ) : !tasks || tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  No tasks yet.
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const isOpen = expanded.has(task.id);
                const failed = task.status === 'failed' || !!task.error;
                return (
                  <>
                    <TableRow
                      key={task.id}
                      className="cursor-pointer align-top"
                      onClick={() => toggle(task.id)}
                    >
                      <TableCell className="pl-5">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">{task.seq}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium capitalize text-slate-900">{task.status}</span>
                          {task.stage ? (
                            <span className="text-xs text-slate-500">{task.stage}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DecisionBadge decision={task.decision} />
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <span className="line-clamp-2 text-sm text-slate-700">
                          {task.questionDraft
                            ? getLocalizedText(task.questionDraft.prompt, '—')
                            : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <div className="flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                          {failed ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(event) => handleRetry(event, task.id)}
                              disabled={retryTask.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Retry
                            </Button>
                          ) : null}
                          {task.publishedQuestionId ? (
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/questions/${task.publishedQuestionId}`}>
                                <ExternalLink className="h-4 w-4" />
                                View
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow key={`${task.id}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={6} className="p-0">
                          <TaskDetail task={task} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EventsFeed({ jobId }: { jobId: string }) {
  const { data: events, isLoading } = useJobEvents(jobId);

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Events</h2>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading events…</p>
          ) : !events || events.length === 0 ? (
            <p className="text-sm text-slate-400">No events yet.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex gap-2 text-sm">
                <EventLevelDot level={event.level} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-slate-500">{event.type}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{formatTime(event.ts)}</span>
                  </div>
                  <p className="text-slate-700">{event.message}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function JobDetailPage({ params }: JobPageProps) {
  const { jobId } = use(params);
  const router = useRouter();
  const { data: job, isLoading, error } = useAgentJob(jobId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading job…
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.push('/agents')}>
          <ArrowLeft className="h-4 w-4" />
          Back to agents
        </Button>
        <Alert variant="destructive">
          <AlertDescription>Job not found or failed to load.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const counts = job.counts ?? {};
  const topic = typeof job.params?.topic === 'string' ? job.params.topic : 'Agent job';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => router.push('/agents')}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{topic}</h1>
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <StatTile label="Target" value={String(counts.target ?? 0)} />
            <StatTile label="Generated" value={String(counts.generated ?? 0)} />
            <StatTile label="Approved" value={String(counts.approved ?? 0)} />
            <StatTile label="Published" value={String(counts.published ?? 0)} />
            <StatTile label="Rejected" value={String(counts.rejected ?? 0)} />
            <StatTile label="Failed" value={String(counts.failed ?? 0)} />
            <StatTile label="Spend" value={formatCents(job.spentCents)} />
          </div>
          {job.error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{job.error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <TasksTable jobId={jobId} />
        <EventsFeed jobId={jobId} />
      </div>
    </div>
  );
}
