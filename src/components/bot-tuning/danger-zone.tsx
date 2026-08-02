'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useZeroGovernorOffsets } from '@/hooks';
import { botTuningErrorMessage } from '@/lib/bot-tuning-errors';

export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const zeroMutation = useZeroGovernorOffsets();

  const handleConfirm = async () => {
    try {
      const result = await zeroMutation.mutateAsync(reason.trim() || undefined);
      toast.success(`Reset the automatic handicap on ${result.cleared} bot(s)`);
      setOpen(false);
      setReason('');
    } catch (error) {
      toast.error(botTuningErrorMessage(error, 'Failed to reset the automatic handicaps'));
    }
  };

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-red-800">
            <AlertTriangle className="h-4 w-4" />
            Danger zone
          </h3>
          <p className="max-w-2xl text-xs leading-relaxed text-red-700/80">
            Reset all automatic handicaps — every bot goes back to its natural difficulty. The
            system re-learns from recent results. Use only if bots got mistuned.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Reset all automatic handicaps
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset all automatic handicaps?</DialogTitle>
            <DialogDescription>
              Every bot goes back to its natural difficulty right away. This cannot be undone — the
              system has to re-learn each handicap from new match results.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="zero-reason">Reason (optional, saved to the logs)</Label>
            <Input
              id="zero-reason"
              value={reason}
              placeholder="e.g. bots got far too weak after the weekend"
              disabled={zeroMutation.isPending}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={zeroMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={zeroMutation.isPending}
            >
              {zeroMutation.isPending ? 'Resetting…' : 'Yes, reset every handicap'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
