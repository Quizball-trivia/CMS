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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useAdjustWallet, useBanUser, useResetTicketWindow, useSetProgression, useUnbanUser } from '@/hooks';
import { ApiClientError } from '@/services';
import type { AdminUserListItem } from '@/types/admin-users';

interface UserEditDialogProps {
  user: AdminUserListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Parse a value into an integer, or null if blank. Returns NaN on invalid input. */
function parseValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
}

/**
 * Set-only field row. The admin types the exact new value; the current value is
 * shown for reference. (Grant/delta was removed — when you can see the current
 * value, "set 200" and "grant -100" are equivalent, so absolute-only is simpler.)
 */
function EditRow({
  label,
  current,
  value,
  onValue,
  disabled,
  note,
}: {
  label: string;
  current: number | null;
  value: string;
  onValue: (next: string) => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        <span className="ml-2 text-xs text-gray-400">current: {current ?? '—'}</span>
      </Label>
      <Input
        type="number"
        inputMode="numeric"
        placeholder="new value"
        value={value}
        disabled={disabled || current === null}
        onChange={(e) => onValue(e.target.value)}
      />
      {current === null && note && <p className="text-xs text-amber-600">{note}</p>}
    </div>
  );
}

export function UserEditDialog({ user, open, onOpenChange }: UserEditDialogProps) {
  const [xp, setXp] = useState('');
  const [rp, setRp] = useState('');
  const [coins, setCoins] = useState('');
  const [tickets, setTickets] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);

  const setProgression = useSetProgression();
  const adjustWallet = useAdjustWallet();
  const resetTicketWindow = useResetTicketWindow();
  const banUser = useBanUser();
  const unbanUser = useUnbanUser();
  const saving = setProgression.isPending || adjustWallet.isPending;
  const banPending = banUser.isPending || unbanUser.isPending;

  const validation = useMemo(() => {
    const fields = [
      { v: xp, name: 'XP' },
      { v: rp, name: 'RP' },
      { v: coins, name: 'Coins' },
      { v: tickets, name: 'Tickets' },
    ];
    const touched = fields.filter(({ v }) => v.trim() !== '');
    const invalid = touched.find(({ v }) => !Number.isInteger(parseValue(v) ?? NaN));
    return { hasChange: touched.length > 0, invalidField: invalid?.name ?? null };
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
    const idempotencyKey = `cms-${user.id}-${Date.now()}`;

    // XP/RP → absolute "set" mode.
    const xpValue = parseValue(xp);
    const rpValue = parseValue(rp);
    const progressionBody: {
      xp?: { mode: 'set'; value: number };
      rp?: { mode: 'set'; value: number };
      reason: string;
      notify: boolean;
    } = { reason: reasonText, notify };
    if (xpValue !== null) progressionBody.xp = { mode: 'set', value: xpValue };
    if (rpValue !== null && user.rp !== null) progressionBody.rp = { mode: 'set', value: rpValue };

    // Coins/tickets → the store endpoint is delta-based, so compute delta = target − current.
    const coinsValue = parseValue(coins);
    const ticketsValue = parseValue(tickets);
    const coinsDelta = coinsValue === null ? 0 : coinsValue - user.coins;
    const ticketsDelta = ticketsValue === null ? 0 : ticketsValue - user.tickets;
    const hasWalletChange = coinsDelta !== 0 || ticketsDelta !== 0;

    try {
      if (progressionBody.xp || progressionBody.rp) {
        await setProgression.mutateAsync({ userId: user.id, body: progressionBody });
      }
      if (hasWalletChange) {
        await adjustWallet.mutateAsync({
          userId: user.id,
          coinsDelta: coinsDelta || undefined,
          ticketsDelta: ticketsDelta || undefined,
          reason: reasonText,
          idempotencyKey,
          notify,
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

  const handleResetTicketWindow = async () => {
    try {
      const result = await resetTicketWindow.mutateAsync({
        userId: user.id,
        reason: reason.trim().length >= 3 ? reason.trim() : 'Admin reset of daily ticket-buy window',
      });
      toast.success(
        result.voided > 0
          ? `Ticket window cleared (${result.voided} purchase${result.voided === 1 ? '' : 's'} voided)`
          : 'Ticket window already clear'
      );
    } catch (error) {
      const message =
        error instanceof ApiClientError ? error.message : 'Failed to reset ticket window';
      toast.error(message);
    }
  };

  const handleBan = async () => {
    const name = user.nickname ?? user.email ?? 'this user';
    if (reason.trim().length < 3) {
      toast.error('A reason (min 3 characters) is required to ban');
      return;
    }
    if (!window.confirm(`Ban ${name}? This blocks login and zeroes their RP (restored on unban).`)) {
      return;
    }
    try {
      await banUser.mutateAsync({ userId: user.id, reason: reason.trim(), zeroRp: true });
      toast.success(`Banned ${name}`);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Failed to ban user';
      toast.error(message);
    }
  };

  const handleUnban = async () => {
    const name = user.nickname ?? user.email ?? 'this user';
    if (!window.confirm(`Unban ${name}? Login is restored and their pre-ban RP is reinstated.`)) {
      return;
    }
    try {
      await unbanUser.mutateAsync({ userId: user.id });
      toast.success(`Unbanned ${name}`);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Failed to unban user';
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit {user.nickname ?? user.email ?? 'user'}</DialogTitle>
          <DialogDescription>
            Enter the exact new value for any field. Changes are logged with your admin identity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <EditRow label="XP" current={user.total_xp} value={xp} onValue={setXp} disabled={saving} />
            <EditRow
              label="Rank Points"
              current={user.rp}
              value={rp}
              onValue={setRp}
              disabled={saving}
              note="No ranked profile yet — RP can't be edited until they play a ranked match."
            />
            <EditRow label="Coins" current={user.coins} value={coins} onValue={setCoins} disabled={saving} />
            <EditRow label="Tickets" current={user.tickets} value={tickets} onValue={setTickets} disabled={saving} />
          </div>

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

          {/* Ticket-purchase window control */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-gray-900">Daily ticket-buy limit</p>
              <p className="text-xs text-gray-400">
                Clear the last 24h of ticket purchases so they can buy again.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetTicketWindow}
              disabled={resetTicketWindow.isPending}
            >
              {resetTicketWindow.isPending ? 'Resetting…' : 'Reset window'}
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
            <Checkbox
              checked={notify}
              disabled={saving}
              onCheckedChange={(checked) => setNotify(checked === true)}
            />
            Notify user (sends an in-app notification about the change)
          </label>

          {/* Danger zone: ban / unban */}
          <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-red-700">
                {user.is_banned ? 'Account banned' : 'Ban account'}
              </p>
              <p className="text-xs text-gray-500">
                {user.is_banned
                  ? 'Login is blocked. Unban to restore access and pre-ban RP.'
                  : 'Blocks login, zeroes RP (restored on unban). A reason is required.'}
              </p>
            </div>
            {user.is_banned ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnban}
                disabled={banPending}
              >
                {unbanUser.isPending ? 'Unbanning…' : 'Unban'}
              </Button>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBan}
                disabled={banPending || saving}
              >
                {banUser.isPending ? 'Banning…' : 'Ban'}
              </Button>
            )}
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
