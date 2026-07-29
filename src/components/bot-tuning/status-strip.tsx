'use client';

import type { BotTuningResponse } from '@/types';

/**
 * Read-only summary of the live config.
 *
 * NOTE: PERSISTENT_BOTS_ENABLED / BOT_GOVERNOR_ENABLED are backend env flags
 * that the tuning API does not expose, so they are deliberately not shown here
 * rather than guessed at. If a later PR adds them to the GET payload, they
 * belong in this strip.
 */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function StatusStrip({ data }: { data: BotTuningResponse }) {
  const { effective, overrides } = data;

  const overriddenCount = (
    [
      'ceilingMargin',
      'topBandTargetWinrate',
      'midLadderTargetWinrate',
      'governorStep',
      'topProtectionStep',
      'topProtectionMarginRp',
      'topProtectionCriticalRp',
      'activityScale',
      'maxDailyCap',
    ] as const
  ).filter((key) => overrides[key] !== null).length;

  const updatedAt = overrides.updatedAt
    ? new Date(overrides.updatedAt).toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi' })
    : 'never';

  return (
    <div className="grid grid-cols-2 gap-6 rounded-lg border border-gray-200 bg-white p-6 md:grid-cols-4 xl:grid-cols-5">
      <Stat label="Settings version" value={`v${effective.version}`} hint="audit counter" />
      <Stat
        label="Bot IQ ceiling"
        value={effective.ceilingAccuracy.toFixed(4)}
        hint={`best answer rate any bot can reach · margin ${effective.ceilingMargin}`}
      />
      <Stat
        label="Custom settings"
        value={`${overriddenCount} of 9`}
        hint={overriddenCount === 0 ? 'all defaults' : 'the rest are defaults'}
      />
      <Stat
        label="How much bots play"
        value={`${effective.activityScale}×`}
        hint={effective.activityScale === 0 ? 'bots paused' : '1× = normal'}
      />
      <Stat label="Last change" value={updatedAt} hint={overrides.updatedBy ?? 'Georgia time'} />
    </div>
  );
}
