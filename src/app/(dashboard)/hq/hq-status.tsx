'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useUpdateHqSettings } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatUsd } from '@/lib/hq-board';
import type { HqOverview, HqSettings } from '@/types';
import { errorMessage } from './hq-ui';

/** Agents running/paused, today's usage, and the pause switch. */
export function HqStatus({ settings, today }: { settings: HqSettings; today: HqOverview['today'] }) {
  const update = useUpdateHqSettings();
  const [pauseOpen, setPauseOpen] = useState(false);
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
      <MiniMeter label="Est. cost" value={today.costCents} max={settings.dailyLimitCents} format={formatUsd} />
      {settings.paused ? (
        <Button size="sm" onClick={resume} disabled={update.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <Play className="h-4 w-4" /> Resume
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPauseOpen(true)} className="border-red-200 text-red-700 hover:bg-red-50">
          <Pause className="h-4 w-4" /> Pause all
        </Button>
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
