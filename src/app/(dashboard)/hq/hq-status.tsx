'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Gauge, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUpdateHqSettings } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HqOverview, HqPlanStatus, HqSettings } from '@/types';
import { errorMessage } from './hq-ui';

/**
 * Agents running/paused, today's usage, and the pause switch. With `summary` (HQ's one-line agent counts) it replaces
 * the label, and the usage meters and plan share sit behind a "Usage" toggle: the line stays calm, the switch stays.
 */
export function HqStatus({ settings, today, summary, compact = false, trailing, hideSummary = false }: {
  settings: HqSettings; today: HqOverview['today']; summary?: ReactNode; compact?: boolean;
  /** HQ shows the counts as tiles: the calm line then carries only what is wrong (paused, plan limits). */
  hideSummary?: boolean;
  /** Shown after the automation control on the same row (HQ puts its phone actions here). */
  trailing?: ReactNode;
}) {
  // HQ's calm one-line layout; it stays the same while the agent counts are still loading.
  const calm = compact || !!summary;
  const update = useUpdateHqSettings();
  const [usageOpen, setUsageOpen] = useState(false);
  const plan = settings.plan;
  const blocked =
    plan && plan.state !== 'ok'
      ? `${plan.state === 'auth' ? 'Claude login rejected, agents can’t start' : 'Claude plan limit reached, agents wait'}${plan.until ? ` until ${timeLabel(plan.until)} (Tbilisi)` : ''}`
      : plan?.mode === 'blocked'
        ? 'Plan share used up, agents wait'
        : plan?.mode === 'urgent_only'
          ? 'Plan share nearly used: urgent work only'
          : null;
  const [pauseOpen, setPauseOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reason, setReason] = useState('');

  const resume = () =>
    update.mutate(
      { paused: false, pausedReason: null },
      { onSuccess: () => toast.success('Agents are back to work'), onError: (e) => toast.error(errorMessage(e, 'Could not resume')) }
    );
  const pause = () =>
    update.mutate(
      { paused: true, pausedReason: reason.trim() || null },
      {
        onSuccess: () => {
          toast.success('All agents paused');
          setPauseOpen(false);
          setReason('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not pause')),
      }
    );

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 rounded-lg sm:justify-start',
        // Quiet while running; boxed in red when paused, because then it needs attention.
        settings.paused ? 'border border-red-200 bg-red-50/60 px-4 py-2.5' : ''
      )}
    >
      {/* sr-only, not hidden: the live regions inside must stay in the accessibility tree to announce when a notice appears. */}
      <div className={cn('flex items-center gap-2', hideSummary && !settings.paused && !blocked && 'sr-only')}>
        {/* In the calm line the dot belongs to "Automation on" (beside Usage and Pause), not to the agent counts. */}
        {!calm && <span className={cn('h-2 w-2 shrink-0 rounded-full', settings.paused ? 'bg-red-500' : 'bg-emerald-500')} />}
        {calm ? (
          <div className="text-[13px] tabular-nums text-slate-700">
            {/* The agents lead; automation being on is a setting (beside Usage and Pause), unless it is paused. */}
            {/* The notices are persistent polite live regions, so a change from refreshed settings is announced; the summary (a link) stays outside. */}
            <span role="status" aria-live="polite">
              {settings.paused && (
                <span className="font-semibold text-red-700">
                  Automation paused{settings.pausedReason ? ` (${settings.pausedReason})` : ''} ·{' '}
                </span>
              )}
            </span>
            {!hideSummary && <span className="text-slate-800">{summary ?? 'Agents'}</span>}
            {/* What stops work starting is never hidden behind the Usage toggle. */}
            <span role="status" aria-live="polite">
              {!settings.paused && blocked && (
                <span className="ml-1 font-medium text-red-700">
                  · {blocked}
                </span>
              )}
            </span>
          </div>
        ) : (
          <div className="leading-tight" role="status" aria-live="polite">
            <div className="text-sm font-semibold text-slate-950">{settings.paused ? 'Agents paused' : 'Agents on'}</div>
            <div className="max-w-56 truncate text-[11px] text-slate-500">
              {settings.paused ? settings.pausedReason || 'Nothing new starts until you resume' : `May start work · up to ${settings.maxConcurrentRuns} at a time`}
            </div>
          </div>
        )}
      </div>
      {calm && (
        // One automation control: running → a quiet toggle that opens usage and Pause; paused → Resume, in sight.
        <div className="flex min-w-0 flex-wrap items-center">
          {/* The same control in both states, so usage and the plan share can be checked before resuming. */}
          <span className="flex items-center">
          <Button size="sm" variant="ghost" className="h-11 gap-1.5 px-2 text-[13px] font-normal text-slate-600 sm:h-7" aria-expanded={usageOpen} onClick={() => setUsageOpen((v) => !v)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', settings.paused ? 'bg-red-500' : 'bg-emerald-500')} aria-hidden />
            {settings.paused ? 'Automation paused' : 'Automation on'}
            <ChevronDown className={cn('h-3.5 w-3.5 transition', usageOpen && 'rotate-180')} aria-hidden />
          </Button>
          {settings.paused && (
            <Button size="sm" onClick={resume} disabled={update.isPending} className="h-11 bg-emerald-600 text-white hover:bg-emerald-700 sm:h-7">
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          </span>
          {trailing}
        </div>
      )}
      {/* Usage meters are for the desk; on a phone the state and the pause switch are what matter. */}
      <div className={cn('flex-wrap items-center gap-4', calm ? (usageOpen ? 'flex basis-full sm:basis-auto' : 'hidden') : 'hidden sm:flex')}>
        {calm && !settings.paused && (blocked ? <span className="text-[13px] font-medium text-red-700">{blocked}</span> : <span className="text-[13px] text-slate-600">New runs can start, up to {settings.maxConcurrentRuns} at a time</span>)}
        <div className="h-8 w-px bg-slate-200" />
        <MiniMeter label="Runs today" value={today.runs} max={settings.dailyRunLimit} format={String} />
        {settings.planSoftPct !== undefined && settings.planHardPct !== undefined && (
          <PlanMeters plan={settings.plan} soft={settings.planSoftPct} hard={settings.planHardPct} />
        )}
      </div>
      {settings.planSoftPct !== undefined && settings.planHardPct !== undefined && (!calm || usageOpen) && (
        <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} className="text-slate-600" title="How much of the Claude plan HQ may use">
          <Gauge className="h-4 w-4" /> Plan share
        </Button>
      )}
      {calm && usageOpen && !settings.paused && (
        <Button size="sm" variant="ghost" onClick={() => setPauseOpen(true)} className="h-11 text-slate-600 hover:bg-red-50 hover:text-red-700 sm:h-7">
          <Pause className="h-4 w-4" /> Pause all
        </Button>
      )}
      {calm ? null : settings.paused ? (
        <Button size="sm" onClick={resume} disabled={update.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Play className="h-4 w-4" /> Resume
        </Button>
      ) : (
        <Button
          size="sm"
          variant={calm ? 'ghost' : 'outline'}
          onClick={() => setPauseOpen(true)}
          // On HQ's calm status line it is a quiet control that turns red on hover; elsewhere the outlined red button.
          className={calm ? 'h-7 text-slate-600 hover:bg-red-50 hover:text-red-700' : 'border-red-200 text-red-700 hover:bg-red-50'}
        >
          <Pause className="h-4 w-4" /> Pause all
        </Button>
      )}

      {shareOpen && settings.planSoftPct !== undefined && settings.planHardPct !== undefined && (
        <PlanShareDialog soft={settings.planSoftPct} hard={settings.planHardPct} onClose={() => setShareOpen(false)} />
      )}

      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause all agents?</DialogTitle>
            <DialogDescription>Runs in progress finish. No new runs start, and automations wait until you resume.</DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPauseOpen(false)}>
              Cancel
            </Button>
            <Button onClick={pause} disabled={update.isPending} className="bg-red-600 text-white hover:bg-red-700">
              Pause
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniMeter({ label, value, max, format }: { label: string; value: number; max: number; format: (v: number) => string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-28">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-800">{format(value)}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-slate-400">{max > 0 ? `of ${format(max)}` : 'no limit'}</div>
    </div>
  );
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi', weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Claude subscription usage per window, against HQ's share of it. */
function PlanMeters({ plan, soft, hard }: { plan: HqPlanStatus | undefined; soft: number; hard: number }) {
  if (plan && plan.state !== 'ok' && plan.until) {
    return (
      <div className="max-w-64 text-[11px] leading-tight">
        <div className="font-semibold text-red-700">{plan.state === 'auth' ? 'Claude login rejected' : 'Waiting for the Claude plan to reset'}</div>
        <div className="text-slate-500">Agents resume after {timeLabel(plan.until)} (Tbilisi)</div>
      </div>
    );
  }
  const windows = (plan?.windows ?? []).filter((w) => w.usedPct !== null || w.status !== 'allowed').slice(0, 3);
  if (!windows.length) return <div className="w-36 text-[11px] leading-tight text-slate-400">Claude plan usage shows after the next agent run</div>;
  return (
    <>
      {windows.map((w) => {
        const used = w.usedPct ?? (w.status === 'rejected' ? 100 : null);
        const tone = used === null ? 'bg-amber-500' : used >= hard ? 'bg-red-500' : used >= soft ? 'bg-amber-500' : 'bg-emerald-500';
        return (
          <div key={w.key} className="w-28" title={w.resetsAt ? `Resets ${timeLabel(w.resetsAt)} (Tbilisi)` : undefined}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="text-slate-500">{w.label}</span>
              <span className="font-semibold text-slate-800">{used === null ? 'near limit' : `${used}%`}</span>
            </div>
            <div className="relative mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, used ?? soft)}%` }} />
              <div className="absolute top-0 h-full w-px bg-slate-400" style={{ left: `${hard}%` }} />
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">HQ stops at {hard}%</div>
          </div>
        );
      })}
    </>
  );
}

function PlanShareDialog({ soft: initialSoft, hard: initialHard, onClose }: { soft: number; hard: number; onClose: () => void }) {
  const update = useUpdateHqSettings();
  const [soft, setSoft] = useState(String(initialSoft));
  const [hard, setHard] = useState(String(initialHard));
  const s = Number(soft);
  const h = Number(hard);
  const valid = Number.isInteger(s) && Number.isInteger(h) && s >= 1 && h <= 100 && s <= h;
  const save = () =>
    update.mutate(
      { planSoftPct: s, planHardPct: h },
      { onSuccess: () => { toast.success('Plan share saved'); onClose(); }, onError: (e) => toast.error(errorMessage(e, 'Could not save')) }
    );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How much of the Claude plan may HQ use?</DialogTitle>
          <DialogDescription>
            Agents share your Claude subscription with you. Past the first number only urgent work (and the director&apos;s chat) runs;
            at the second, every agent waits until that usage window resets.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-slate-600">Urgent work only from</span>
            <div className="mt-1 flex items-center gap-1">
              <Input type="number" min={1} max={100} value={soft} onChange={(e) => setSoft(e.target.value)} /> %
            </div>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Stop all agents at</span>
            <div className="mt-1 flex items-center gap-1">
              <Input type="number" min={1} max={100} value={hard} onChange={(e) => setHard(e.target.value)} /> %
            </div>
          </label>
        </div>
        {!valid && <p className="text-xs text-red-600">Use whole numbers 1–100, the first not above the second.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!valid || update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
