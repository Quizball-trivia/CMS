'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqGoal, useDeleteHqGoal, useUpdateHqGoal } from '@/hooks';
import { cn } from '@/lib/utils';
import { HQ_DEPARTMENTS, departmentInfo } from '@/lib/hq-departments';
import {
  GOAL_METRIC_LABELS,
  formatPeriod,
  goalProgressLabel,
  goalProgressPct,
  periodFor,
  type PeriodPreset,
} from '@/lib/hq-standup';
import type { HqDepartmentKey, HqGoal, HqGoalHorizon, HqGoalMetric, HqGoalStatus } from '@/types';
import { errorMessage } from './hq-ui';

export const HORIZON_LABELS: Record<HqGoalHorizon, string> = { north_star: 'North Star', week: 'This week', day: 'Today' };

// ── Progress ring ──

export function ProgressRing({ pct, size = 120, stroke = 12, tone = 'blue' }: { pct: number | null; size?: number; stroke?: number; tone?: 'blue' | 'emerald' | 'amber' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = pct ?? 0;
  const color = { blue: '#2563eb', emerald: '#059669', amber: '#d97706' }[value >= 100 ? 'emerald' : tone];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={pct === null ? 'No progress yet' : `${pct}% done`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value / 100)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-900 font-extrabold" style={{ fontSize: size * 0.24 }}>
        {pct === null ? '—' : `${pct}%`}
      </text>
    </svg>
  );
}

function ProgressBar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn('h-full rounded-full transition-all', (pct ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-blue-600')}
        style={{ width: `${pct ?? 0}%` }}
      />
    </div>
  );
}

// ── Cards ──

/** The company's one big goal: huge ring, huge title, the live number. */
export function NorthStarCard({ goal, onEdit, onCreate, now }: { goal: HqGoal | null; onEdit: (g: HqGoal) => void; onCreate: () => void; now: Date }) {
  if (!goal) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className="flex w-full items-center gap-6 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-8 text-left transition hover:border-slate-400 hover:bg-slate-50"
      >
        <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-slate-100 text-4xl">⭐</span>
        <span>
          <span className="block text-2xl font-bold text-slate-900">Set your North Star</span>
          <span className="mt-1 block text-base text-slate-500">The one big goal every agent works toward — e.g. “5,000 daily active players”.</span>
        </span>
      </button>
    );
  }
  const pct = goalProgressPct(goal);
  return (
    <div className="flex flex-wrap items-center gap-8 rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-8 text-white shadow-lg">
      <div className="rounded-full bg-white p-2">
        <ProgressRing pct={pct} size={140} stroke={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold uppercase tracking-widest text-amber-300">⭐ North Star</div>
        <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">{goal.title}</h2>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-2xl font-bold">{goalProgressLabel(goal)}</span>
          {goal.metric && <span className="text-base text-slate-300">{GOAL_METRIC_LABELS[goal.metric].toLowerCase()}</span>}
          <span className="text-sm text-slate-400">by {formatPeriod(goal.periodEnd, goal.periodEnd, now)}</span>
        </div>
      </div>
      <Button variant="secondary" size="icon-lg" onClick={() => onEdit(goal)} aria-label="Edit North Star" className="rounded-full">
        <Pencil className="h-5 w-5" />
      </Button>
    </div>
  );
}

export function GoalCard({ goal, onEdit, now }: { goal: HqGoal; onEdit: (g: HqGoal) => void; now: Date }) {
  const pct = goalProgressPct(goal);
  const dept = departmentInfo(goal.department);
  return (
    <div className={cn('group flex flex-col rounded-3xl border bg-white p-6 shadow-xs', goal.status === 'achieved' ? 'border-emerald-200' : 'border-slate-200')}>
      <div className="flex items-start gap-3">
        <h3 className="min-w-0 flex-1 text-xl font-bold leading-snug text-slate-900">
          {goal.status === 'achieved' && '✅ '}
          {goal.title}
        </h3>
        <button
          type="button"
          onClick={() => onEdit(goal)}
          aria-label={`Edit goal: ${goal.title}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-auto space-y-2 pt-5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-3xl font-extrabold text-slate-900">{pct === null ? '—' : `${pct}%`}</span>
          <span className="text-sm font-medium text-slate-500">{goalProgressLabel(goal)}</span>
        </div>
        <ProgressBar pct={pct} />
        <div className="flex items-center gap-2 pt-1 text-xs text-slate-400">
          <span>{formatPeriod(goal.periodStart, goal.periodEnd, now)}</span>
          {dept && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {dept.emoji} {dept.name}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AddGoalCard({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-slate-200 p-6 text-slate-400 transition hover:border-slate-300 hover:bg-white hover:text-slate-600"
    >
      <Plus className="h-7 w-7" />
      <span className="text-base font-semibold">{label}</span>
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
        <DialogTitle className="flex items-center gap-2 text-xl">
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
                'rounded-xl border px-3 py-3 text-sm font-semibold transition',
                horizon === h ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              )}
            >
              {h === 'north_star' ? '⭐ ' : h === 'week' ? '📅 ' : '☀️ '}
              {HORIZON_LABELS[h]}
            </button>
          ))}
        </div>

        <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 5,000 daily active players" maxLength={200} className="h-12 text-lg" />
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
                    📊 {GOAL_METRIC_LABELS[m]}
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
              <button key={preset} type="button" onClick={() => applyPreset(preset)} className="rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50">
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
                    {d.emoji} {d.name}
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
                  <SelectItem value="active">🎯 Active</SelectItem>
                  <SelectItem value="achieved">✅ Achieved</SelectItem>
                  <SelectItem value="dropped">✖ Dropped</SelectItem>
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
