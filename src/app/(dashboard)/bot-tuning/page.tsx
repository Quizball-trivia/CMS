'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useBotTuning } from '@/hooks';
import { botTuningErrorMessage } from '@/lib/bot-tuning-errors';
import { TuningParamsForm } from '@/components/bot-tuning/tuning-params-form';
import { RosterTable } from '@/components/bot-tuning/roster-table';
import { DangerZone } from '@/components/bot-tuning/danger-zone';
import { StatusStrip } from '@/components/bot-tuning/status-strip';

export default function BotTuningPage() {
  const { data, isLoading, error } = useBotTuning();

  return (
    <div className="text-foreground">
      <div className="space-y-8">
        <header className="space-y-1">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-8 w-8 text-gray-800" />
            <h1 className="text-4xl font-black tracking-tight text-gray-900">Bot Tuning</h1>
          </div>
          <p className="text-base font-medium text-gray-500">
            Controls how hard the bots are to beat and how much they play. Changes take effect on
            live matches within a minute.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-semibold text-red-800">Could not load bot tuning</p>
            <p className="mt-1 text-sm text-red-700">
              {botTuningErrorMessage(error, 'Unknown error')}
            </p>
          </div>
        )}

        {isLoading && (
          <p className="text-sm font-medium text-gray-500">Loading current tuning…</p>
        )}

        {data && (
          <>
            <StatusStrip data={data} />

            <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-gray-900">Settings</h2>
                <p className="text-sm text-gray-500">
                  These apply to all 1,000 bots at once. What you see is what is running right now.
                </p>
              </div>
              <TuningParamsForm data={data} />
            </section>
          </>
        )}

        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900">Individual bots</h2>
            <p className="text-sm text-gray-500">
              Edit one bot&rsquo;s name, rank, difficulty or daily limit. Freezing takes a bot out
              of matchmaking without deleting it.
            </p>
          </div>
          <RosterTable rails={data?.rails} />
        </section>

        <DangerZone />
      </div>
    </div>
  );
}
