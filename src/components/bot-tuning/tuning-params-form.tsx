'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { botTuningErrorMessage } from '@/lib/bot-tuning-errors';
import { useUpdateBotTuning } from '@/hooks';
import type {
  BotTuningField,
  BotTuningResponse,
  UpdateBotTuningRequest,
} from '@/types';

/**
 * One editable knob. `effective` is what is in force; `override` is null when
 * the value comes from the code constant rather than an operator override.
 *
 * COPY CONTRACT (the operator is not the person who wrote the governor):
 *  - `label`  : a short human name, no jargon.
 *  - `effect` : what HAPPENS when you move it ("Bigger → bots get dumber"),
 *               never a definition of the parameter. This is the primary line.
 *  - `rails`  : the precise numbers, rendered small and muted underneath.
 */
interface FieldSpec {
  field: BotTuningField;
  label: string;
  step: string;
  group: GroupKey;
  /** Everyday knobs, flagged so the rest read as fine-tuning. */
  mostUsed?: boolean;
  effect: string;
  effectiveOf: (data: BotTuningResponse) => number;
  overrideOf: (data: BotTuningResponse) => number | null;
  rails: (data: BotTuningResponse) => string;
}

type GroupKey = 'strength' | 'autoTuner' | 'activity';

const GROUPS: { key: GroupKey; title: string; caption: string }[] = [
  {
    key: 'strength',
    title: 'Bot strength',
    caption: 'How well bots answer, and how often they are meant to win.',
  },
  {
    key: 'autoTuner',
    title: 'Auto-tuner',
    caption: 'How the system corrects itself as results come in.',
  },
  {
    key: 'activity',
    title: 'Activity',
    caption: 'How much the bots play.',
  },
];

const FIELDS: FieldSpec[] = [
  {
    field: 'ceilingMargin',
    label: 'Bot IQ ceiling',
    step: '0.0001',
    group: 'strength',
    effect: 'Bigger → ALL bots get dumber. Cannot go below the safety floor.',
    effectiveOf: (d) => d.effective.ceilingMargin,
    overrideOf: (d) => d.overrides.ceilingMargin,
    rails: (d) =>
      `Min ${d.rails.ceilingMargin.min}, max ${d.rails.ceilingMargin.max} · answer accuracy ceiling ${d.effective.ceilingAccuracy.toFixed(4)}`,
  },
  {
    field: 'topBandTargetWinrate',
    label: 'Strongest bots — target win rate',
    step: '0.001',
    group: 'strength',
    mostUsed: true,
    effect: 'Lower → your strongest bots lose more often to humans. 42.5% = slightly losing.',
    effectiveOf: (d) => d.effective.governor.topBandTargetWinrate,
    overrideOf: (d) => d.overrides.topBandTargetWinrate,
    rails: (d) => `Max ${d.rails.targetWinrate.max} · can only be lowered`,
  },
  {
    field: 'midLadderTargetWinrate',
    label: 'Average bots — target win rate',
    step: '0.001',
    group: 'strength',
    mostUsed: true,
    effect: 'Lower → average bots lose more often. 50% = an even match.',
    effectiveOf: (d) => d.effective.governor.midLadderTargetWinrate,
    overrideOf: (d) => d.overrides.midLadderTargetWinrate,
    rails: (d) => `Max ${d.rails.targetWinrate.max} · can only be lowered`,
  },
  {
    field: 'governorStep',
    label: 'Adjustment size',
    step: '0.001',
    group: 'autoTuner',
    effect: 'Smaller → the system corrects bots more gently and slowly.',
    effectiveOf: (d) => d.effective.governor.governorStep,
    overrideOf: (d) => d.overrides.governorStep,
    rails: (d) => `Max ${d.rails.governorStep.max} · can only be reduced`,
  },
  {
    field: 'topProtectionStep',
    label: 'Push-down strength near the top',
    step: '0.001',
    group: 'autoTuner',
    effect: 'Bigger → a bot nearing the top-10 is pushed back down harder and faster.',
    effectiveOf: (d) => d.effective.governor.topProtectionStep,
    overrideOf: (d) => d.overrides.topProtectionStep,
    rails: (d) =>
      `Min ${d.rails.topProtectionStep.min}, max ${d.rails.topProtectionStep.max} · can only be increased`,
  },
  {
    field: 'topProtectionMarginRp',
    label: 'Push-down starts at',
    step: '1',
    group: 'autoTuner',
    effect: 'Bigger → bots start getting pushed down while still further from the #10 human.',
    effectiveOf: (d) => d.effective.governor.topProtectionMarginRp,
    overrideOf: (d) => d.overrides.topProtectionMarginRp,
    rails: (d) => `RP below the #10 human · min ${d.rails.topProtectionRings.minMarginRp}`,
  },
  {
    field: 'topProtectionCriticalRp',
    label: 'Hard stop at',
    step: '1',
    group: 'autoTuner',
    effect: 'Bigger → bots are pinned and stop climbing while still further from the #10 human.',
    effectiveOf: (d) => d.effective.governor.topProtectionCriticalRp,
    overrideOf: (d) => d.overrides.topProtectionCriticalRp,
    rails: (d) =>
      `RP below the #10 human · min ${d.rails.topProtectionRings.minCriticalRp} · must stay inside "push-down starts at"`,
  },
  {
    field: 'activityScale',
    label: 'How much bots play',
    step: '0.01',
    group: 'activity',
    mostUsed: true,
    effect: 'Lower → fewer bot games overall. 1× = normal, 0 = bots paused entirely.',
    effectiveOf: (d) => d.effective.activityScale,
    overrideOf: (d) => d.overrides.activityScale,
    rails: () => 'Multiplier on every bot’s daily limit · 0–2',
  },
  {
    field: 'maxDailyCap',
    label: 'Daily limit per bot',
    step: '1',
    group: 'activity',
    effect: 'Lower → no bot can play more than this many games in a day.',
    effectiveOf: (d) => d.effective.maxDailyCap,
    overrideOf: (d) => d.overrides.maxDailyCap,
    rails: (d) => `Max ${d.rails.dailyCap.max} · applies roster-wide`,
  },
];

type FormState = Record<BotTuningField, string>;

function buildForm(data: BotTuningResponse): FormState {
  return FIELDS.reduce((acc, spec) => {
    acc[spec.field] = String(spec.effectiveOf(data));
    return acc;
  }, {} as FormState);
}

export function TuningParamsForm({ data }: { data: BotTuningResponse }) {
  const updateMutation = useUpdateBotTuning();
  const [form, setForm] = useState<FormState>(() => buildForm(data));
  const [updatedBy, setUpdatedBy] = useState('');

  // Re-sync when the server sends new committed values (initial load, or after
  // a save returns the merged row).
  useEffect(() => {
    setForm(buildForm(data));
  }, [data]);

  /**
   * Only send what actually changed. An unchanged field must be OMITTED, not
   * echoed back: sending every field would write overrides for values the
   * operator never touched, pinning them against future code-constant changes.
   */
  const changed = useMemo(
    () =>
      FIELDS.filter((spec) => {
        const current = form[spec.field].trim();
        if (current === '') return spec.overrideOf(data) !== null;
        return Number(current) !== spec.effectiveOf(data);
      }),
    [form, data]
  );

  const handleSave = async () => {
    if (changed.length === 0) {
      toast.info('No changes to save');
      return;
    }

    const payload: UpdateBotTuningRequest = {};
    for (const spec of changed) {
      const raw = form[spec.field].trim();
      // Empty input = clear the override back to the code constant.
      if (raw === '') {
        payload[spec.field] = null;
        continue;
      }
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        toast.error(`${spec.label} is not a valid number`);
        return;
      }
      payload[spec.field] = parsed;
    }
    if (updatedBy.trim()) payload.updatedBy = updatedBy.trim();

    try {
      await updateMutation.mutateAsync(payload);
      toast.success('Bot tuning saved');
    } catch (error) {
      // The server's rail messages are the useful part - surface them verbatim.
      toast.error(botTuningErrorMessage(error, 'Failed to save bot tuning'), {
        duration: 10000,
      });
    }
  };

  const handleReset = () => {
    setForm(buildForm(data));
  };

  const saving = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">
        Every setting here can only make bots <strong>weaker, lazier, or fewer</strong> — never
        stronger. The hard limits below apply no matter what.
      </p>

      {GROUPS.map((group) => {
        const groupFields = FIELDS.filter((spec) => spec.group === group.key);
        return (
          <section key={group.key} className="space-y-3">
            <div className="space-y-0.5 border-b border-gray-100 pb-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-700">
                {group.title}
              </h3>
              <p className="text-xs text-gray-500">{group.caption}</p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {groupFields.map((spec) => {
                const isOverridden = spec.overrideOf(data) !== null;
                const isDirty = changed.some((c) => c.field === spec.field);
                return (
                  <div key={spec.field} className="flex flex-col space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Label htmlFor={spec.field} className="text-sm font-semibold text-gray-800">
                        {spec.label}
                      </Label>
                      {spec.mostUsed && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          Most used
                        </span>
                      )}
                      {isOverridden && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          Custom
                        </span>
                      )}
                      {isDirty && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                          Unsaved
                        </span>
                      )}
                    </div>
                    <p className="grow text-xs leading-relaxed text-gray-700">{spec.effect}</p>
                    <Input
                      id={spec.field}
                      type="number"
                      step={spec.step}
                      value={form[spec.field]}
                      disabled={saving}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, [spec.field]: event.target.value }))
                      }
                    />
                    <p className="text-[11px] leading-relaxed text-gray-400">{spec.rails(data)}</p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <Alert>
        <AlertTitle className="text-sm font-semibold">Hard limits that always apply</AlertTitle>
        <AlertDescription className="text-xs text-gray-600">
          No setting on this page can push a bot past these. Answer accuracy cap{' '}
          {data.rails.immutable.hardProbCap} · skill cap {data.rails.immutable.hardSkillCap} ·
          fastest possible answer {data.rails.immutable.hardMinAnswerTimeMs}ms.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-gray-200 pt-5">
        <div className="w-full max-w-xs space-y-1.5">
          <Label htmlFor="updatedBy" className="text-sm font-semibold text-gray-800">
            Who is making this change, and why
          </Label>
          <Input
            id="updatedBy"
            value={updatedBy}
            placeholder="e.g. tazi — lowering mid-ladder target"
            disabled={saving}
            onChange={(event) => setUpdatedBy(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={saving || changed.length === 0}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Revert
          </Button>
          <Button onClick={handleSave} disabled={saving || changed.length === 0}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
          </Button>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Clear a box and save to put that setting back to its default. Anything you do not touch
        stays as it is.
      </p>
    </div>
  );
}
