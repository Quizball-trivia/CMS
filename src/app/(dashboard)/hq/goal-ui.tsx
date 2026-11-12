'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqGoal, useDeleteHqGoal, useUpdateHqGoal } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/hq-board';
import { HQ_DEPARTMENTS, departmentInfo } from '@/lib/hq-departments';
import {
  GOAL_METRIC_LABELS,
  formatPeriod,
  goalProgressLabel,
  goalProgressPct,
  periodFor,
  tbilisiDate,
  type PeriodPreset,
} from '@/lib/hq-standup';
import type { HqDepartmentKey, HqGoal, HqGoalHorizon, HqGoalMetric, HqGoalStatus } from '@/types';
import { errorMessage } from './hq-ui';

export const HORIZON_LABELS: Record<HqGoalHorizon, string> = { north_star: 'North Star', week: 'This week', day: 'Today' };

// ── Progress bar ──

function ProgressBar({ pct }: { pct: number | null }) {
  return (
    <div className="h-1.5 overflow-hidden rounded bg-slate-100">
      <div className={cn('h-full rounded transition-all', (pct ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-blue-600')} style={{ width: `${pct ?? 0}%` }} />
    </div>
  );
}

// ── Cards ──

/** The company's one big goal: a compact strip with the live number and a progress bar. */
export function NorthStarCard({ goal, onEdit, onCreate, now }: { goal: HqGoal | null; onEdit: (g: HqGoal) => void; onCreate: () => void; now: Date }) {
  if (!goal) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className="flex w-full items-center gap-4 rounded-lg border border-dashed border-slate-300 bg-white px-5 py-4 text-left transition hover:border-slate-400 hover:bg-slate-50"
      >
        <Target className="h-5 w-5 shrink-0 text-slate-500" />
        <span>
          <span className="block text-sm font-semibold text-slate-950">Set your North Star</span>
          <span className="mt-0.5 block text-sm text-slate-500">The one big goal every agent works toward — e.g. “5,000 daily active players”.</span>
        </span>
      </button>
    );
  }
  const pct = goalProgressPct(goal);
  return (
    <section aria-label="North Star" className="rounded-lg bg-slate-950 px-5 py-4 text-white">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[14rem] flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">North Star</div>
          <h2 className="mt-1 text-lg font-semibold leading-snug tracking-tight">{goal.title}</h2>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="whitespace-nowrap text-2xl font-semibold tabular-nums tracking-tight">{goalProgressLabel(goal)}</span>
          {goal.metric && (
            <span className="text-sm text-slate-400">
              {(GOAL_METRIC_LABELS[goal.metric] ?? goal.metric).toLowerCase()}
              {/* The backend's windows (hq.goals.service): DAU is the last full day, active players the last 7 days. */}
              {goal.metric === 'daily_active_players' ? ' · yesterday' : goal.metric === 'active_players' ? ' · last 7 days' : ''}
            </span>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => onEdit(goal)} aria-label="Edit North Star" className="text-slate-400 hover:bg-white/10 hover:text-white">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className={cn('h-full rounded-full', (pct ?? 0) >= 100 ? 'bg-emerald-400' : 'bg-white')} style={{ width: `${Math.max(pct ?? 0, pct ? 1 : 0)}%` }} />
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-slate-300">
          <span className="font-semibold text-white">{pct === null ? 'No progress yet' : `${pct}%`}</span> · by {formatPeriod(goal.periodEnd, goal.periodEnd, now)}
        </span>
      </div>
    </section>
  );
}

/** Still open, but its last day (Tbilisi date) has passed: someone should close it or give it new dates. */
export function isGoalEnded(goal: Pick<HqGoal, 'status' | 'periodEnd'>, now: Date): boolean {
  return goal.status === 'active' && goal.periodEnd < tbilisiDate(now);
}

function goalFacts(goal: HqGoal, now: Date) {
  const dept = departmentInfo(goal.department);
  return {
    ended: isGoalEnded(goal, now),
    pct: goalProgressPct(goal),
    where: `${formatPeriod(goal.periodStart, goal.periodEnd, now)} · ${dept ? dept.name : 'Whole company'}`,
    endedOn: formatPeriod(goal.periodEnd, goal.periodEnd, now),
    // The backend computes progress for metric goals and sends no measured-at time, so only manual goals show when they were last edited.
    measuredBy: goal.metric
      ? `Measured automatically from ${(GOAL_METRIC_LABELS[goal.metric] ?? goal.metric).toLowerCase()}`
      : `Manual: update it yourself · edited ${formatRelative(goal.updatedAt, now.getTime())}`,
  };
}

/** One goal as a row, for lists inside a single panel (the Goals page). */
export function GoalRow({ goal, onEdit, now }: { goal: HqGoal; onEdit: (g: HqGoal) => void; now: Date }) {
  const { ended, pct, where, endedOn, measuredBy } = goalFacts(goal, now);
  return (
    <div className={cn('flex flex-wrap items-start gap-x-6 gap-y-3 border-l-2 px-4 py-3', goal.status === 'achieved' ? 'border-emerald-400' : ended ? 'border-amber-400' : 'border-transparent')}>
      <div className="min-w-0 flex-1 basis-64">
        <h3 className="text-[15px] font-semibold leading-snug text-slate-950">
          {goal.status === 'achieved' && <Check className="mr-1 inline h-4 w-4 -translate-y-px text-emerald-600" aria-label="Achieved" />}
          {goal.title}
        </h3>
        <div className="mt-1 space-y-0.5 text-[13px] text-slate-600">
          <div>
            {ended && <span className="font-medium text-amber-700">Ended {endedOn} · </span>}
            {where}
          </div>
          <div>{measuredBy}</div>
        </div>
      </div>
      <div className="w-full basis-56 space-y-1.5 sm:w-64 sm:flex-none">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-semibold tabular-nums text-slate-950">{pct === null ? '—' : `${pct}%`}</span>
          <span className="text-[13px] tabular-nums text-slate-600">{goalProgressLabel(goal)}</span>
        </div>
        <ProgressBar pct={pct} />
      </div>
      <button
        type="button"
        onClick={() => onEdit(goal)}
        aria-label={`Edit goal: ${goal.title}`}
        className="-my-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

/** The "add a goal" row at the foot of a goals panel. */
export function AddGoalRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );
}

// ── Create / edit dialog ──

const MANUAL = '__manual__';
const NO_DEPT = '__none__';

export function GoalDialog({
  open,
  onOpenChange,
  goal,
  defaultHorizon = 'week',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when set. */
  goal?: HqGoal | null;
  defaultHorizon?: HqGoalHorizon;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        {open && <GoalForm key={goal?.id ?? `new-${defaultHorizon}`} goal={goal ?? null} defaultHorizon={defaultHorizon} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function defaultPreset(h: HqGoalHorizon): PeriodPreset {
  return h === 'north_star' ? 'next_90_days' : h === 'week' ? 'this_week' : 'today';
}

function GoalForm({ goal, defaultHorizon, onDone }: { goal: HqGoal | null; defaultHorizon: HqGoalHorizon; onDone: () => void }) {
  const create = useCreateHqGoal();
  const update = useUpdateHqGoal();
  const remove = useDeleteHqGoal();
  const [now] = useState(() => new Date());
  const initialHorizon = goal?.horizon ?? defaultHorizon;
  const initialPeriod = goal ? { periodStart: goal.periodStart, periodEnd: goal.periodEnd } : periodFor(defaultPreset(initialHorizon), now);

  const [horizon, setHorizon] = useState<HqGoalHorizon>(initialHorizon);
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [metric, setMetric] = useState<string>(goal?.metric ?? MANUAL);
  const [target, setTarget] = useState(goal?.target !== null && goal?.target !== undefined ? String(goal.target) : '');
  const [manual, setManual] = useState(goal?.manualProgress ?? 0);
  const [periodStart, setPeriodStart] = useState(initialPeriod.periodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.periodEnd);
  const [department, setDepartment] = useState<string>(goal?.department ?? NO_DEPT);
  const [status, setStatus] = useState<HqGoalStatus>(goal?.status ?? 'active');

  const pending = create.isPending || update.isPending || remove.isPending;
  const isMetric = metric !== MANUAL;

  const applyPreset = (preset: PeriodPreset) => {
    const p = periodFor(preset, now);
    setPeriodStart(p.periodStart);
    setPeriodEnd(p.periodEnd);
  };

  const submit = () => {
    if (!title.trim()) return toast.error('Give the goal a title');
    if (isMetric && (!target.trim() || !Number.isFinite(Number(target)))) return toast.error('Set a number to reach');
    if (periodEnd < periodStart) return toast.error('The end date is before the start date');
    const data = {
      horizon,
      title: title.trim(),
      description: description.trim(),
      metric: isMetric ? (metric as HqGoalMetric) : null,
      target: isMetric ? Number(target) : null,
      manualProgress: isMetric ? null : manual,
      periodStart,
      periodEnd,
      department: department === NO_DEPT ? null : (department as HqDepartmentKey),
      ...(goal ? { status } : {}),
    };
    const done = {
      onSuccess: () => {
        toast.success(goal ? 'Goal saved' : 'Goal set');
        onDone();
      },
      onError: (e: unknown) => toast.error(errorMessage(e, 'Could not save the goal')),
    };
    if (goal) update.mutate({ id: goal.id, data }, done);
    else create.mutate(data, done);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Target className="h-5 w-5" /> {goal ? 'Edit goal' : 'New goal'}
        </DialogTitle>
        <DialogDescription>Agents read these goals every morning and propose ideas to move them.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Horizon">
          {(Object.keys(HORIZON_LABELS) as HqGoalHorizon[]).map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={horizon === h}
              onClick={() => {
                setHorizon(h);
                if (!goal) applyPreset(defaultPreset(h));
              }}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition',
                horizon === h ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              )}
            >
              {HORIZON_LABELS[h]}
            </button>
          ))}
        </div>

        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 5,000 daily active players" maxLength={200} />
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why it matters (optional)" />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Measure progress by</span>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL}>I’ll update it myself</SelectItem>
                {(Object.keys(GOAL_METRIC_LABELS) as HqGoalMetric[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {GOAL_METRIC_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {isMetric ? (
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Target</span>
              <Input
                type="number"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={metric === 'd7_retention' ? 'e.g. 25 (%)' : metric === 'avg_rating' ? 'e.g. 4.5' : 'e.g. 10000'}
              />
            </label>
          ) : (
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Progress: {manual}%</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={manual}
                onChange={(e) => setManual(Number(e.target.value))}
                className="h-9 w-full accent-blue-600"
              />
            </label>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-500">When</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['today', 'Today'],
                ['this_week', 'This week'],
                ['next_90_days', 'Next 90 days'],
              ] as const
            ).map(([preset, label]) => (
              <button key={preset} type="button" onClick={() => applyPreset(preset)} className="rounded-md border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50">
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" aria-label="Start date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            <Input type="date" aria-label="End date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-500">Department (optional)</span>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPT}>Whole company</SelectItem>
                {HQ_DEPARTMENTS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          {goal && (
            <label className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Status</span>
              <Select value={status} onValueChange={(v) => setStatus(v as HqGoalStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="achieved">Achieved</SelectItem>
                  <SelectItem value="dropped">Dropped</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {goal ? (
          <Button
            variant="ghost"
            className="text-red-600 hover:text-red-700"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(`Delete the goal “${goal.title}”?`)) return;
              remove.mutate(goal.id, {
                onSuccess: () => {
                  toast.success('Goal deleted');
                  onDone();
                },
                onError: (e) => toast.error(errorMessage(e, 'Could not delete')),
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {goal ? 'Save' : 'Set goal'}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
