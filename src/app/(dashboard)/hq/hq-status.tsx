'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Gauge, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUpdateHqSettings } from '@/hooks';
import { cn } from '@/lib/utils';
import type { HqOverview, HqPlanStatus, HqSettings } from '@/types';
import { errorMessage } from './hq-ui';

/** Agents running/paused, today's usage, and the pause switch. */
export function HqStatus({ settings, today }: { settings: HqSettings; today: HqOverview['today'] }) {
  const update = useUpdateHqSettings();
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
        'flex flex-wrap items-center gap-4 rounded-2xl border bg-white px-4 py-3 shadow-xs',
        settings.paused ? 'border-red-200 bg-red-50/60' : 'border-slate-200'
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', settings.paused ? 'bg-red-500' : 'animate-pulse bg-emerald-500')} />
        <div className="leading-tight">
          <div className="text-sm font-bold text-slate-900">{settings.paused ? 'Agents paused' : 'Agents running'}</div>
          <div className="max-w-56 truncate text-[11px] text-slate-500">
            {settings.paused ? settings.pausedReason || 'Nothing new starts until you resume' : `Up to ${settings.maxConcurrentRuns} at a time`}
          </div>
        </div>
      </div>
      <div className="h-8 w-px bg-slate-200" />
      <MiniMeter label="Runs today" value={today.runs} max={settings.dailyRunLimit} format={String} />
      {settings.planSoftPct !== undefined && settings.planHardPct !== undefined && (
        <>
          <PlanMeters plan={settings.plan} soft={settings.planSoftPct} hard={settings.planHardPct} />
          <Button size="sm" variant="ghost" onClick={() => setShareOpen(true)} className="text-slate-600" title="How much of the Claude plan HQ may use">
            <Gauge className="h-4 w-4" /> Plan share
          </Button>
        </>
      )}
      {settings.paused ? (
        <Button size="sm" onClick={resume} disabled={update.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Play className="h-4 w-4" /> Resume
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)} className="border-red-200 text-red-700 hover:bg-red-50">
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
