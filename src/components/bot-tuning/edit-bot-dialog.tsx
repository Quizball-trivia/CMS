'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditBot } from '@/hooks';
import { botTuningErrorMessage } from '@/lib/bot-tuning-errors';
import { cn } from '@/lib/utils';
import type { BotRosterRow, BotTuningRails, PatchBotRequest } from '@/types';

type RpMode = 'set' | 'adjust';

interface EditBotDialogProps {
  bot: BotRosterRow | null;
  rails?: BotTuningRails;
  onClose: () => void;
}

const DEFAULT_SKILL_MIN = 0.05;
const DEFAULT_SKILL_MAX = 0.9;
const DEFAULT_CAP_MAX = 12;

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * The fields, split out so the parent can mount it with `key={bot.botUserId}`.
 *
 * That key is what re-primes the inputs when a different row is opened: state
 * initialises from the bot's committed values on mount, instead of being synced
 * back in an effect (which would cascade renders).
 */
function EditBotForm({
  bot,
  rails,
  onClose,
}: {
  bot: BotRosterRow;
  rails?: BotTuningRails;
  onClose: () => void;
}) {
  const editMutation = useEditBot();

  const [nickname, setNickname] = useState(bot.nickname ?? '');
  const [rpMode, setRpMode] = useState<RpMode>('set');
  const [rpSet, setRpSet] = useState(bot.rp === null ? '' : String(bot.rp));
  const [rpAdjust, setRpAdjust] = useState('');
  const [baseSkill, setBaseSkill] = useState(String(bot.baseSkill));
  const [dailyCap, setDailyCap] = useState(String(bot.dailyCap));
  const [note, setNote] = useState('');

  const skillMin = rails?.perBotEdit?.baseSkill.min ?? DEFAULT_SKILL_MIN;
  const skillMax = rails?.perBotEdit?.baseSkill.max ?? DEFAULT_SKILL_MAX;
  const capMin = rails?.perBotEdit?.dailyCap.min ?? 0;
  const capMax = rails?.perBotEdit?.dailyCap.max ?? DEFAULT_CAP_MAX;
  const rpMargin = rails?.perBotEdit?.rp.marginBelowHumanTop10;

  /**
   * Build the payload from what actually differs. Sending an unchanged field is
   * not merely wasteful: a nickname echoed back would still be written to the
   * bot's PUBLIC rename history, so "no change" must mean "no key".
   */
  const payload = useMemo<Omit<PatchBotRequest, 'note'>>(() => {
    const next: Omit<PatchBotRequest, 'note'> = {};

    const trimmedNickname = nickname.trim();
    if (trimmedNickname && trimmedNickname !== (bot.nickname ?? '')) {
      next.nickname = trimmedNickname;
    }

    if (rpMode === 'set') {
      const raw = rpSet.trim();
      if (raw !== '' && Number(raw) !== (bot.rp ?? 0)) next.rpSet = Number(raw);
    } else {
      const raw = rpAdjust.trim();
      if (raw !== '' && Number(raw) !== 0) next.rpAdjust = Number(raw);
    }

    const rawSkill = baseSkill.trim();
    if (rawSkill !== '' && Number(rawSkill) !== bot.baseSkill) next.baseSkill = Number(rawSkill);

    const rawCap = dailyCap.trim();
    if (rawCap !== '' && Number(rawCap) !== bot.dailyCap) next.dailyCap = Number(rawCap);

    return next;
  }, [bot, nickname, rpMode, rpSet, rpAdjust, baseSkill, dailyCap]);

  const changedCount = Object.keys(payload).length;
  const saving = editMutation.isPending;
  const canSave = changedCount > 0 && note.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;

    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        toast.error(`${key} is not a valid number`);
        return;
      }
    }

    try {
      const result = await editMutation.mutateAsync({
        botUserId: bot.botUserId,
        data: { ...payload, note: note.trim() },
      });

      if (!result.changed) {
        toast.info('Nothing changed — the submitted values already match this bot.');
      } else {
        const fields = Object.keys(result.applied).join(', ');
        toast.success(`Updated ${result.applied.nickname ?? bot.nickname ?? 'bot'} — ${fields}`);
        // Server-side consequences the operator should see (e.g. that an RP edit
        // also moved how strongly the bot plays).
        for (const warning of result.warnings) {
          toast.warning(warning, { duration: 10000 });
        }
      }
      onClose();
    } catch (error) {
      // Rail violations arrive in details.fieldErrors and are the useful part.
      toast.error(botTuningErrorMessage(error, 'Failed to save bot edit'), { duration: 10000 });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {bot.nickname ?? 'bot'}</DialogTitle>
        <DialogDescription>
          Change one bot&rsquo;s name, rank points, difficulty or daily limit. Only the fields you
          actually change are sent, and every change is saved to the audit log.
        </DialogDescription>
      </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="edit-nickname" className="text-sm font-semibold text-gray-800">
              Nickname
            </Label>
            <Input
              id="edit-nickname"
              value={nickname}
              disabled={saving}
              onChange={(event) => setNickname(event.target.value)}
            />
            <Warning>Shows in the bot&rsquo;s public rename history, like a real rename.</Warning>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold text-gray-800">Rank points (RP)</Label>
            <div className="flex items-center gap-4">
              {(
                [
                  { mode: 'set' as const, label: 'Set exact value' },
                  { mode: 'adjust' as const, label: 'Adjust by ±' },
                ]
              ).map(({ mode, label }) => (
                <label
                  key={mode}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 text-sm',
                    rpMode === mode ? 'font-semibold text-gray-900' : 'text-gray-600'
                  )}
                >
                  <input
                    type="radio"
                    name="rp-mode"
                    value={mode}
                    checked={rpMode === mode}
                    disabled={saving}
                    onChange={() => setRpMode(mode)}
                    className="h-3.5 w-3.5 accent-gray-900"
                  />
                  {label}
                </label>
              ))}
            </div>
            {rpMode === 'set' ? (
              <Input
                id="edit-rp-set"
                type="number"
                step="1"
                min={0}
                value={rpSet}
                placeholder="Exact RP"
                disabled={saving}
                onChange={(event) => setRpSet(event.target.value)}
              />
            ) : (
              <Input
                id="edit-rp-adjust"
                type="number"
                step="1"
                value={rpAdjust}
                placeholder="e.g. -150 or 75"
                disabled={saving}
                onChange={(event) => setRpAdjust(event.target.value)}
              />
            )}
            <Warning>Rank points — also affects how strong this bot plays.</Warning>
            <p className="text-xs text-gray-500">
              Currently {bot.rp ?? '—'} RP.
              {rpMargin !== undefined
                ? ` Must stay at least ${rpMargin} RP below the live human #10.`
                : ''}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-base-skill" className="text-sm font-semibold text-gray-800">
              Hidden skill
            </Label>
            <p className="text-xs text-gray-600">
              How good this one bot is at answering, on top of its rank.
            </p>
            <Input
              id="edit-base-skill"
              type="number"
              step="0.001"
              min={skillMin}
              max={skillMax}
              value={baseSkill}
              disabled={saving}
              onChange={(event) => setBaseSkill(event.target.value)}
            />
            <p className="text-xs text-gray-500">
              {skillMin}–{skillMax}. The global safety caps still apply on top of this.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-daily-cap" className="text-sm font-semibold text-gray-800">
              Daily limit
            </Label>
            <p className="text-xs text-gray-600">Max games this bot can play per day.</p>
            <Input
              id="edit-daily-cap"
              type="number"
              step="1"
              min={capMin}
              max={capMax}
              value={dailyCap}
              disabled={saving}
              onChange={(event) => setDailyCap(event.target.value)}
            />
            <p className="text-xs text-gray-500">
              {capMin}–{capMax}. 0 pauses this bot.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-note" className="text-sm font-semibold text-gray-800">
              Reason <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="edit-note"
              value={note}
              rows={2}
              maxLength={200}
              placeholder="e.g. renamed on player report; RP reduced after win streak"
              disabled={saving}
              onChange={(event) => setNote(event.target.value)}
            />
            <p className="text-xs text-gray-500">
              Required — saved with the change so it can be traced later.
            </p>
          </div>
        </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave}>
          {saving ? 'Saving…' : `Save${changedCount ? ` (${changedCount})` : ''}`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditBotDialog({ bot, rails, onClose }: EditBotDialogProps) {
  return (
    <Dialog open={bot !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {bot && (
          <EditBotForm key={bot.botUserId} bot={bot} rails={rails} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
