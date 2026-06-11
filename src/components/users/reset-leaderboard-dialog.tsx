'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { useResetLeaderboard } from '@/hooks';
import { ApiClientError } from '@/services';

const CONFIRM_WORD = 'RESET';

interface ResetLeaderboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetLeaderboardDialog({ open, onOpenChange }: ResetLeaderboardDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [notes, setNotes] = useState('');
  const reset = useResetLeaderboard();

  const canReset = confirmText.trim().toUpperCase() === CONFIRM_WORD && !reset.isPending;

  const handleReset = async () => {
    if (!canReset) return;
    try {
      const result = await reset.mutateAsync({
        confirm: true,
        notes: notes.trim() || undefined,
      });
      toast.success(`Leaderboard reset — ${result.profilesReset} players set to 0 RP`);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Failed to reset leaderboard';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Reset ranks &amp; placement
          </DialogTitle>
          <DialogDescription>
            This sets <strong>every real player&apos;s rank points to 0</strong> (tier Academy)
            and clears placement, so <strong>everyone re-does their placement matches</strong> and
            climbs back from scratch. Current standings are archived first, so it&apos;s reversible
            from the database. AI and seed accounts are not affected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="reset-notes" className="text-sm">
              Notes (optional)
            </Label>
            <Textarea
              id="reset-notes"
              placeholder="e.g. Summer event season start"
              value={notes}
              disabled={reset.isPending}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm" className="text-sm">
              Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={confirmText}
              disabled={reset.isPending}
              autoComplete="off"
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reset.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleReset} disabled={!canReset}>
            {reset.isPending ? 'Resetting…' : 'Reset leaderboard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
