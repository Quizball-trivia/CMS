'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  useApproveDayBatch,
  useDayBatch,
  useRejectDayBatch,
  useRunScheduleNow,
  useSetDayBatchHold,
  useSpawnDayBatch,
  useUpdateSchedule,
} from '@/hooks';
import { formatRelativeTime } from './agent-ui';
import type { AgentSchedule, BuscaminasBatchDay, DailyGame, DailyGameBuffer, DayBatchSummary } from '@/types';

// Daily games (Buscaminas, Pistas, Último, Minuto) in the same Agents flow as the question schedules: each game is a
// schedule card on Schedules, its builds are rows on Jobs, and a batch that needs a person is on Review.

export const GAME_LABELS: Record<DailyGame, string> = {
  buscaminas: 'Buscaminas futbolero',
  pistas: 'Pistas futboleras',
  ultimo: 'Último en pie',
  minuto: '¿En qué minuto?',
};

// Games whose next days the pipeline can build today. The others still get their days from the seed scripts.
export const HAS_BUILDER = new Set<DailyGame>(['buscaminas']);

const STATUS_STYLES: Record<DayBatchSummary['status'], string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  seeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-slate-200 bg-slate-100 text-slate-600',
  failed: 'border-red-200 bg-red-50 text-red-700',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function DaysLeft({ days, lastDay }: { days: number; lastDay: string | null }) {
  // no stored days at all is not "running out": this database simply has none for the game
  if (lastDay === null) return <span className="text-sm font-medium text-slate-400">No days stored</span>;
  const tone = days < 14 ? 'text-red-600' : days < 30 ? 'text-amber-600' : 'text-emerald-600';
  return (
    <span className={cn('text-2xl font-bold tabular-nums', tone)}>
      {days}
      <span className="ml-1 text-sm font-medium text-slate-500">day{days === 1 ? '' : 's'} left</span>
    </span>
  );
}

const LOCALES = ['es', 'en', 'ka', 'tr'] as const;
type Locale = (typeof LOCALES)[number];

function BuscaminasDayPreview({ day, locale }: { day: BuscaminasBatchDay; locale: Locale }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        #{day.number} · {day.day}
        <span className="text-xs font-normal text-slate-400">{day.rounds.length} rounds</span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-200 p-3">
          {day.rounds.map((round, i) => (
            <div key={round.id} className="space-y-1.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs tabular-nums text-slate-400">{i + 1}</span>
                <span className="text-sm font-medium text-slate-900">{round.prompt[locale] || <em className="text-red-600">missing {locale}</em>}</span>
                {locale !== 'es' ? <span className="text-xs text-slate-400">{round.prompt.es}</span> : null}
                <Badge variant="outline" className="text-[10px] capitalize">{round.difficulty}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {round.cards.map((card) => (
                  <span
                    key={card.id}
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-xs',
                      card.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'
                    )}
                  >
                    {card.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A batch of days waiting for a person: held for review, or failed validation. Same actions as a draft question. */
export function DayBatchReviewCard({ summary }: { summary: DayBatchSummary }) {
  const { data: batch, isLoading } = useDayBatch(summary.id);
  const approve = useApproveDayBatch();
  const reject = useRejectDayBatch();
  const [reason, setReason] = useState('');
  const [locale, setLocale] = useState<Locale>('es');
  const valid = summary.validation?.ok === true;
  const dryRun = batch?.dryRun ?? null;
  const dryRunError = dryRun && 'error' in dryRun ? dryRun.error : null;
  const canApprove = valid && !!dryRun && !dryRunError;

  const onApprove = () => {
    approve.mutate(summary.id, {
      onSuccess: () => toast.success(`${summary.dayCount} days added to ${GAME_LABELS[summary.game]}`),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };
  const onReject = () => {
    reject.mutate(
      { batchId: summary.id, reason: reason.trim() },
      {
        onSuccess: () => toast.success('Batch rejected'),
        onError: (error) => toast.error(errorMessage(error)),
      }
    );
  };

  return (
    <Card className="border-amber-200 shadow-sm">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Daily game</Badge>
          <span className="text-base font-semibold text-slate-900">{GAME_LABELS[summary.game]}</span>
          <span className="text-sm text-slate-500">
            {summary.firstDay} → {summary.lastDay} · {summary.dayCount} days
          </span>
          <span className="text-xs text-slate-400">built {formatRelativeTime(summary.createdAt)}</span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Validation</div>
            <div className={cn('text-sm font-medium', valid ? 'text-emerald-700' : 'text-red-700')}>
              {valid ? 'Passed on the whole calendar' : 'Failed — this batch can only be rejected'}
            </div>
            {summary.validation?.output ? (
              <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">{summary.validation.output}</pre>
            ) : null}
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">If approved now</div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking…</div>
            ) : dryRunError ? (
              <div className="text-sm text-red-700">Refused: {dryRunError}</div>
            ) : dryRun && 'plan' in dryRun ? (
              <div className="text-sm text-slate-700">
                Adds {dryRun.plan.entries.filter((e) => e.status === 'new').length} new days (#{dryRun.plan.entries[0]?.number}–#
                {dryRun.plan.entries[dryRun.plan.entries.length - 1]?.number}); {dryRun.plan.keptDays} stored days stay as they are.
              </div>
            ) : null}
          </div>
        </div>

        {summary.game === 'buscaminas' && batch ? (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Days (green = fits the prompt, red = mine)
              </span>
              <span className="ml-auto flex gap-1" role="group" aria-label="Prompt language">
                {LOCALES.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLocale(l)}
                    aria-pressed={locale === l}
                    className={cn(
                      'rounded px-2 py-0.5 text-xs font-medium uppercase',
                      locale === l ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    {l}
                  </button>
                ))}
              </span>
            </div>
            {(batch.days as BuscaminasBatchDay[]).map((day) => (
              <BuscaminasDayPreview key={day.day} day={day} locale={locale} />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          <Button onClick={onApprove} disabled={!canApprove || approve.isPending}>
            {approve.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}
            Approve and add days
          </Button>
          <div className="flex min-w-0 flex-1 items-end gap-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why reject? (required)"
              className="min-h-9 min-w-0 flex-1"
              rows={1}
            />
            <Button variant="outline" onClick={onReject} disabled={reason.trim().length < 3 || reject.isPending}>
              {reject.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <X className="mr-1 h-4 w-4" />}
              Reject
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


/**
 * One daily game on the Schedules tab: the days it has left, the automatic build (when under N days, build M at an
 * hour), whether new batches wait for review, a manual build, and its latest batches.
 */
export function DailyGameScheduleCard({ buffer, schedule, batches }: { buffer: DailyGameBuffer; schedule?: AgentSchedule; batches: DayBatchSummary[] }) {
  const update = useUpdateSchedule();
  const runNow = useRunScheduleNow();
  const spawn = useSpawnDayBatch();
  const setHold = useSetDayBatchHold();
  const p = schedule?.params ?? {};
  const [hour, setHour] = useState(schedule?.hourTbilisi ?? 10);
  const [days, setDays] = useState(Number(p.days ?? 14));
  const [target, setTarget] = useState(Number(p.targetDays ?? 60));
  const dirty = !!schedule && (hour !== schedule.hourTbilisi || days !== Number(p.days ?? 14) || target !== Number(p.targetDays ?? 60));
  const busy = buffer.activeJobId !== null || buffer.pendingBatchId !== null;
  const recent = batches.filter((b) => b.game === buffer.game && b.status !== 'pending').slice(0, 3);

  const save = (patch: { enabled?: boolean }) => {
    if (!schedule) return;
    update.mutate(
      { id: schedule.id, data: { ...patch, hourTbilisi: hour, params: { ...p, game: buffer.game, days, targetDays: target } } },
      { onSuccess: () => toast.success('Schedule saved'), onError: (error) => toast.error(errorMessage(error)) }
    );
  };
  const buildNow = () => {
    const done = { onSuccess: () => toast.success(`Building the next ${days} ${GAME_LABELS[buffer.game]} days`), onError: (error: unknown) => toast.error(errorMessage(error)) };
    if (schedule) runNow.mutate(schedule.id, done);
    else spawn.mutate({ game: buffer.game, days }, done);
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-slate-900">{GAME_LABELS[buffer.game]}</span>
          <Badge variant="outline" className="border-violet-200 bg-violet-50 text-violet-700">Daily game</Badge>
          {schedule ? (
            <Badge variant="outline" className={schedule.enabled ? STATUS_STYLES.seeded : STATUS_STYLES.rejected}>{schedule.enabled ? 'On' : 'Off'}</Badge>
          ) : null}
          <span className="ml-auto"><DaysLeft days={buffer.daysLeft} lastDay={buffer.lastDay} /></span>
        </div>
        {buffer.lastDay ? <div className="-mt-2 text-right text-xs text-slate-500">Last day: {buffer.lastDay}</div> : null}

        {HAS_BUILDER.has(buffer.game) ? (
          <>
            {schedule ? (
              <label className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
                When under
                <Input type="number" min={1} max={365} value={target} onChange={(e) => setTarget(Number(e.target.value) || 1)} className="h-8 w-16" aria-label="Days left that start a build" />
                days left, build the next
                <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} className="h-8 w-16" aria-label="Days to build" />
                days, checked daily at
                <Input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Math.min(23, Math.max(0, Number(e.target.value) || 0)))} className="h-8 w-14" aria-label="Hour" />
                :00 Tbilisi
              </label>
            ) : (
              <label className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
                No automatic schedule for this game yet; build the next
                <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} className="h-8 w-16" aria-label="Days to build" />
                days by hand.
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={buffer.holdForReview}
                disabled={setHold.isPending}
                onChange={(e) => setHold.mutate({ game: buffer.game, hold: e.target.checked }, { onError: (error) => toast.error(errorMessage(error)) })}
              />
              Hold new batches for my review (otherwise a batch that passes validation is added automatically)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {schedule && dirty ? <Button size="sm" variant="outline" onClick={() => save({})} disabled={update.isPending}>Save</Button> : null}
              {schedule ? (
                <Button size="sm" variant={schedule.enabled ? 'outline' : 'default'} onClick={() => save({ enabled: !schedule.enabled })} disabled={update.isPending}>
                  {schedule.enabled ? 'Turn off' : 'Turn on'}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={buildNow} disabled={busy || runNow.isPending || spawn.isPending}>
                {runNow.isPending || spawn.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Build next {days} days now
              </Button>
              {busy ? (
                <span className="text-xs text-slate-500">
                  {buffer.pendingBatchId ? (buffer.holdForReview ? 'A batch is waiting on Review.' : 'A batch is being added…') : 'Building…'}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">No builder in the pipeline yet; days come from the seed scripts.</p>
        )}

        {recent.length > 0 ? (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {recent.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="tabular-nums text-slate-600">{b.firstDay} → {b.lastDay}</span>
                <Badge variant="outline" className={STATUS_STYLES[b.status]}>
                  {b.status === 'seeded' ? (b.decidedBy ? 'Added' : 'Added automatically') : b.status === 'failed' ? 'Not added' : 'Rejected'}
                </Badge>
                {b.rejectReason || b.error ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500" title={b.rejectReason ?? b.error ?? ''}>{b.rejectReason ?? b.error}</span>
                ) : null}
                <span className="ml-auto text-xs text-slate-400">{formatRelativeTime(b.decidedAt ?? b.createdAt)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
