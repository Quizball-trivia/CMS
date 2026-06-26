'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, DollarSign, Loader2, Pause, Play, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAgentBudget,
  useAgentJobs,
  useAgentMonitor,
  useCancelJob,
  useCategories,
  useSetBudget,
  useSpawnJob,
} from '@/hooks';
import type { AgentDifficulty, AgentJob } from '@/types';
import { getLocalizedText } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatCents,
  formatRelativeTime,
  isActiveJobStatus,
  JobStatusBadge,
} from './agent-ui';

const DIFFICULTIES: { value: AgentDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

function SpawnCard() {
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const spawnJob = useSpawnJob();

  const [categoryId, setCategoryId] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<AgentDifficulty>('medium');
  const [count, setCount] = useState(10);
  const [budgetDollars, setBudgetDollars] = useState('');

  const sortedCategories = useMemo(
    () =>
      [...(categories ?? [])].sort((a, b) =>
        getLocalizedText(a.name, a.slug).localeCompare(getLocalizedText(b.name, b.slug))
      ),
    [categories]
  );

  const handleCategoryChange = (value: string) => {
    setCategoryId(value);
    const category = sortedCategories.find((c) => c.id === value);
    if (category) {
      setTopic(getLocalizedText(category.name, category.slug));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!categoryId) {
      toast.error('Select a category first');
      return;
    }
    if (count < 1) {
      toast.error('Count must be at least 1');
      return;
    }

    const budgetCents = budgetDollars.trim()
      ? Math.round(Number(budgetDollars) * 100)
      : undefined;
    if (budgetCents !== undefined && (!Number.isFinite(budgetCents) || budgetCents < 0)) {
      toast.error('Budget must be a positive amount');
      return;
    }

    try {
      const job = await spawnJob.mutateAsync({
        type: 'mcq_generate',
        categoryId,
        topic: topic.trim(),
        difficulty,
        count,
        ...(budgetCents !== undefined ? { budgetCents } : {}),
      });
      toast.success('Agent job spawned', {
        description: `Generating ${count} ${difficulty} question${count === 1 ? '' : 's'}.`,
      });
      setBudgetDollars('');
      void job;
    } catch {
      toast.error('Failed to spawn agent job');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">Spawn generation job</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2 xl:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Category
              </Label>
              <Select value={categoryId} onValueChange={handleCategoryChange}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue placeholder={categoriesLoading ? 'Loading…' : 'Select category'} />
                </SelectTrigger>
                <SelectContent>
                  {sortedCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {getLocalizedText(category.name, category.slug)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 xl:col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Topic
              </Label>
              <Input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Topic prompt"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Difficulty
              </Label>
              <Select value={difficulty} onValueChange={(value) => setDifficulty(value as AgentDifficulty)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Count
              </Label>
              <Input
                type="number"
                min={1}
                value={count}
                onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))}
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Budget ($, optional)
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={budgetDollars}
                onChange={(event) => setBudgetDollars(event.target.value)}
                placeholder="No cap"
                className="h-10"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={spawnJob.isPending || !categoryId}>
              {spawnJob.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Spawn agents
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MonitorStrip() {
  const { data: monitor } = useAgentMonitor();
  const total = monitor?.total ?? 0;
  const running = monitor?.running ?? [];

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-slate-100 p-2.5">
            <Bot className="h-5 w-5 text-slate-700" />
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">
              {total} agent{total === 1 ? '' : 's'} running
            </div>
            <div className="text-xs text-slate-500">Live worker activity</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running.length === 0 ? (
            <span className="text-sm text-slate-400">Idle</span>
          ) : (
            running.map((role) => (
              <Badge key={role.role} variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                {role.role} · {role.count}
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BudgetWidget() {
  const { data: budget } = useAgentBudget();
  const setBudget = useSetBudget();

  const spent = budget?.spentTodayCents ?? 0;
  const limit = budget?.limitCents ?? 0;
  const paused = budget?.paused ?? false;
  const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;

  const handleTogglePause = async () => {
    try {
      const next = await setBudget.mutateAsync({ paused: !paused });
      toast.success(next.paused ? 'Agents paused' : 'Agents resumed');
    } catch {
      toast.error('Failed to update budget');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-900">Daily budget</span>
          </div>
          {paused ? (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              Paused
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Active
            </Badge>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-bold text-slate-900">{formatCents(spent)}</span>
            <span className="text-slate-500">of {formatCents(limit)}</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={pct >= 100 ? 'h-full bg-red-500' : 'h-full bg-slate-900'}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleTogglePause}
          disabled={setBudget.isPending}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {paused ? 'Resume agents' : 'Pause agents'}
        </Button>
      </CardContent>
    </Card>
  );
}

function jobTopic(job: AgentJob): string {
  const params = job.params ?? {};
  const topic = params.topic;
  return typeof topic === 'string' && topic.length > 0 ? topic : '—';
}

function jobDifficulty(job: AgentJob): string {
  const params = job.params ?? {};
  const difficulty = params.difficulty;
  return typeof difficulty === 'string' ? difficulty : '—';
}

function jobProgress(job: AgentJob): string {
  const counts = job.counts ?? {};
  const approved = counts.approved ?? 0;
  const target = counts.target ?? (typeof job.params?.count === 'number' ? job.params.count : 0);
  return `${approved}/${target} approved`;
}

function JobsTable() {
  const router = useRouter();
  const { data: jobs, isLoading } = useAgentJobs({ limit: 50 });
  const cancelJob = useCancelJob();

  const handleCancel = async (event: React.MouseEvent, jobId: string) => {
    event.stopPropagation();
    try {
      await cancelJob.mutateAsync(jobId);
      toast.success('Job cancelled');
    } catch {
      toast.error('Failed to cancel job');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Status</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Spend</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  Loading jobs…
                </TableCell>
              </TableRow>
            ) : !jobs || jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  No agent jobs yet. Spawn one above to get started.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const active = isActiveJobStatus(job.status);
                return (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/agents/${job.id}`)}
                  >
                    <TableCell className="pl-5">
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-medium text-slate-900">
                      {jobTopic(job)}
                    </TableCell>
                    <TableCell className="capitalize text-slate-600">{jobDifficulty(job)}</TableCell>
                    <TableCell className="text-slate-600">{jobProgress(job)}</TableCell>
                    <TableCell className="text-slate-600">{formatCents(job.spentCents)}</TableCell>
                    <TableCell className="text-slate-500">{formatRelativeTime(job.createdAt)}</TableCell>
                    <TableCell className="pr-5 text-right">
                      {active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={(event) => handleCancel(event, job.id)}
                          disabled={cancelJob.isPending}
                        >
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <Bot className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agents</h1>
          <p className="text-sm text-slate-500">Spawn and monitor question-generation agents.</p>
        </div>
      </div>

      <SpawnCard />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <MonitorStrip />
        <BudgetWidget />
      </div>

      <JobsTable />
    </div>
  );
}
