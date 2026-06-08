'use client';

import { useMemo, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { useAdjustWallet, useSetProgression } from '@/hooks';
import { ApiClientError } from '@/services';
import type { AdminEditMode, AdminUserListItem } from '@/types/admin-users';

interface UserEditDialogProps {
  user: AdminUserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldState {
  mode: AdminEditMode;
  value: string;
}

const EMPTY_FIELD: FieldState = { mode: 'set', value: '' };

/** Parse a field into an integer, or null if blank. Returns NaN on invalid input. */
function parseFieldValue(field: FieldState): number | null {
  const trimmed = field.value.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
}

/** Resolve the delta to send for a wallet field given current value + edit state. */
function resolveWalletDelta(field: FieldState, current: number): number | null {
  const parsed = parseFieldValue(field);
  if (parsed === null) return null;
  return field.mode === 'set' ? parsed - current : parsed;
}

function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: AdminEditMode;
  onChange: (mode: AdminEditMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-200 p-0.5">
      {(['set', 'delta'] as const).map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => onChange(m)}
          className={cn(
            'px-2.5 py-1 text-xs font-medium rounded transition-colors',
            mode === m
              ? 'bg-foreground text-background'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          {m === 'set' ? 'Set' : 'Grant'}
        </button>
      ))}
    </div>
  );
}

function EditRow({
  label,
  current,
  field,
  onField,
  disabled,
}: {
  label: string;
  current: number | null;
  field: FieldState;
  onField: (next: FieldState) => void;
  disabled?: boolean;
}) {
  const preview =
    parseFieldValue(field) === null || current === null
      ? null
      : field.mode === 'set'
        ? parseFieldValue(field)
        : current + (parseFieldValue(field) as number);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">
          {label}
          <span className="ml-2 text-xs text-gray-400">
            current: {current ?? '—'}
          </span>
        </Label>
        <ModeToggle
          mode={field.mode}
          onChange={(mode) => onField({ ...field, mode })}
          disabled={disabled}
        />
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          placeholder={field.mode === 'set' ? 'new value' : 'e.g. +500'}
          value={field.value}
          disabled={disabled || current === null}
          onChange={(e) => onField({ ...field, value: e.target.value })}
        />
        {preview !== null && Number.isFinite(preview) && (
          <span className="text-xs text-gray-400 whitespace-nowrap">→ {preview}</span>
        )}
      </div>
      {current === null && (
        <p className="text-xs text-amber-600">
          No ranked profile yet — RP can&apos;t be edited until they play a ranked match.
        </p>
      )}
    </div>
  );
}

export function UserEditDialog({ user, open, onOpenChange }: UserEditDialogProps) {
  const [xp, setXp] = useState<FieldState>(EMPTY_FIELD);
  const [rp, setRp] = useState<FieldState>(EMPTY_FIELD);
  const [coins, setCoins] = useState<FieldState>(EMPTY_FIELD);
  const [tickets, setTickets] = useState<FieldState>(EMPTY_FIELD);
  const [reason, setReason] = useState('');

  const setProgression = useSetProgression();
  const adjustWallet = useAdjustWallet();
  const saving = setProgression.isPending || adjustWallet.isPending;

  const validation = useMemo(() => {
    const fields = [
      { f: xp, name: 'XP' },
      { f: rp, name: 'RP' },
      { f: coins, name: 'Coins' },
      { f: tickets, name: 'Tickets' },
    ];
    const touched = fields.filter(({ f }) => f.value.trim() !== '');
    const invalid = touched.find(({ f }) => !Number.isInteger(parseFieldValue(f) ?? NaN));
    return {
      hasChange: touched.length > 0,
      invalidField: invalid?.name ?? null,
    };
  }, [xp, rp, coins, tickets]);

  if (!user) return null;

  const handleSave = async () => {
    if (!validation.hasChange) {
      toast.error('Nothing to change — enter at least one value');
      return;
    }
    if (validation.invalidField) {
      toast.error(`${validation.invalidField} must be a whole number`);
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('A reason (min 3 characters) is required');
      return;
    }

    const reasonText = reason.trim();
    // One idempotency key per save so the wallet adjustment can't double-apply on retry.
    const idempotencyKey = `cms-${user.id}-${Date.now()}`;

    // Build progression payload (XP/RP).
    const xpValue = parseFieldValue(xp);
    const rpValue = parseFieldValue(rp);
    const progressionBody: {
      xp?: { mode: AdminEditMode; value: number };
      rp?: { mode: AdminEditMode; value: number };
      reason: string;
    } = { reason: reasonText };
    if (xpValue !== null) progressionBody.xp = { mode: xp.mode, value: xpValue };
    if (rpValue !== null && user.rp !== null) {
      progressionBody.rp = { mode: rp.mode, value: rpValue };
    }

    // Build wallet payload (coins/tickets) as deltas computed from current row.
    const coinsDelta = resolveWalletDelta(coins, user.coins);
    const ticketsDelta = resolveWalletDelta(tickets, user.tickets);
    const hasWalletChange =
      (coinsDelta !== null && coinsDelta !== 0) ||
      (ticketsDelta !== null && ticketsDelta !== 0);

    try {
      if (progressionBody.xp || progressionBody.rp) {
        await setProgression.mutateAsync({ userId: user.id, body: progressionBody });
      }
      if (hasWalletChange) {
        await adjustWallet.mutateAsync({
          userId: user.id,
          coinsDelta: coinsDelta ?? undefined,
          ticketsDelta: ticketsDelta ?? undefined,
          reason: reasonText,
          idempotencyKey,
        });
      }
      toast.success(`Updated ${user.nickname ?? user.email ?? 'user'}`);
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Failed to apply changes';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit {user.nickname ?? user.email ?? 'user'}</DialogTitle>
          <DialogDescription>
            Set an absolute value or grant a delta. Changes are logged with your admin
            identity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <EditRow label="XP" current={user.total_xp} field={xp} onField={setXp} disabled={saving} />
          <EditRow label="Rank Points" current={user.rp} field={rp} onField={setRp} disabled={saving} />
          <EditRow label="Coins" current={user.coins} field={coins} onField={setCoins} disabled={saving} />
          <EditRow label="Tickets" current={user.tickets} field={tickets} onField={setTickets} disabled={saving} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-reason" className="text-sm">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="edit-reason"
              placeholder="e.g. event correction, support grant"
              value={reason}
              disabled={saving}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
