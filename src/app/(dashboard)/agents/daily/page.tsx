'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Loader2, Play, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useSchedules, useScheduleRuns, useUpdateSchedule, useRunScheduleNow } from '@/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobStatusBadge, formatCents, formatRelativeTime, AgentNav } from '../agent-ui';
import type { AgentSchedule } from '@/types';

// Next fire time for a daily Tbilisi-hour schedule, shown in the admin's locale.
function nextFire(hourTbilisi: number): string {
  const now = new Date();
  // Tbilisi is UTC+4; compute the next UTC instant whose Tbilisi hour == target.
  const targetUtcHour = (hourTbilisi - 4 + 24) % 24;
  const next = new Date(now);
  next.setUTCHours(targetUtcHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

function ScheduleCard({ schedule }: { schedule: AgentSchedule }) {
  const update = useUpdateSchedule();
  const runNow = useRunScheduleNow();
  const { data: runs, isLoading: runsLoading } = useScheduleRuns(schedule.id);
  const [hour, setHour] = useState(schedule.hourTbilisi);

  const p = schedule.params ?? {};
  const isRanked = schedule.jobType !== 'daily_challenge';
  const savedTypes = (Array.isArray(p.questionTypes) ? p.questionTypes : []) as string[];
  const savedMix = (p.difficultyMix ?? null) as { easy: number; medium: number; hard: number } | null;

  // editable config (count / difficulty / types / categories-per-day)
  const [count, setCount] = useState<number>(Number(p.count ?? 25));
  const [difficulty, setDifficulty] = useState<string>(savedMix ? 'mixed' : String(p.difficulty ?? 'medium'));
  const [mix, setMix] = useState<{ easy: number; medium: number; hard: number }>(savedMix ?? { easy: 8, medium: 9, hard: 8 });
  const [selTypes, setSelTypes] = useState<string[]>(savedTypes.length ? savedTypes : ['mcq_single']);
  const [perDay, setPerDay] = useState<number>(Number(p.categoriesPerDay ?? 40));

  const dirty =
    count !== Number(p.count ?? 25) ||
    difficulty !== (savedMix ? 'mixed' : String(p.difficulty ?? 'medium')) ||
    (difficulty === 'mixed' && JSON.stringify(mix) !== JSON.stringify(savedMix ?? {})) ||
    (isRanked && (JSON.stringify(selTypes) !== JSON.stringify(savedTypes.length ? savedTypes : ['mcq_single']) || perDay !== Number(p.categoriesPerDay ?? 40)));

  const handleConfigSave = () => {
    const next: Record<string, unknown> = { ...p, count };
    if (difficulty === 'mixed') {
      next.difficultyMix = mix;
    } else {
      next.difficulty = difficulty;
      delete next.difficultyMix;
    }
    if (isRanked) {
      next.questionTypes = selTypes;
      next.categoriesPerDay = perDay;
    }
    update.mutate(
      { id: schedule.id, data: { params: next } },
      { onSuccess: () => toast.success('Schedule config saved'), onError: () => toast.error('Failed to save config') }
    );
  };

  const perRunTotal = difficulty === 'mixed' ? mix.easy + mix.medium + mix.hard : count;

  const handleToggle = (enabled: boolean) => {
    update.mutate(
      { id: schedule.id, data: { enabled } },
      { onSuccess: () => toast.success(enabled ? 'Schedule enabled' : 'Schedule paused') }
    );
  };

  const handleHourSave = () => {
    if (hour === schedule.hourTbilisi) return;
    update.mutate(
      { id: schedule.id, data: { hourTbilisi: hour } },
      { onSuccess: () => toast.success(`Fire time set to ${String(hour).padStart(2, '0')}:00 Tbilisi`) }
    );
  };

  const handleRunNow = () => {
    runNow.mutate(schedule.id, {
      onSuccess: (job) => toast.success(`Daily set queued (job ${job.id.slice(0, 8)})`),
      onError: () => toast.error('Failed to run now'),
    });
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">{schedule.label}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  schedule.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {schedule.enabled ? 'Active' : 'Paused'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Fires daily at{' '}
              <span className="font-medium text-slate-700">{String(schedule.hourTbilisi).padStart(2, '0')}:00 Tbilisi</span>
              {schedule.enabled ? <> · next ~{nextFire(schedule.hourTbilisi)}</> : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleToggle(!schedule.enabled)}
              disabled={update.isPending}
            >
              {schedule.enabled ? 'Pause' : 'Enable'}
            </Button>
            <Button size="sm" onClick={handleRunNow} disabled={runNow.isPending}>
              {runNow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run now
            </Button>
          </div>
        </div>

        {/* editable config */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {difficulty === 'mixed' ? 'Easy / Med / Hard' : isRanked ? 'Qs / type / category' : 'Qs / challenge'}
            </div>
            {difficulty === 'mixed' ? (
              <div className="mt-1 flex gap-1">
                {(['easy', 'medium', 'hard'] as const).map((d) => (
                  <input
                    key={d}
                    type="number"
                    min={0}
                    title={d}
                    value={mix[d]}
                    onChange={(e) => setMix((m) => ({ ...m, [d]: Math.max(0, Number(e.target.value) || 0) }))}
                    className="w-full rounded-md border border-slate-200 px-1 py-1 text-center text-sm"
                  />
                ))}
              </div>
            ) : (
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Difficulty</div>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-sm capitalize"
            >
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
              <option value="mixed">mixed…</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {isRanked ? 'Types (tap to toggle)' : 'Type'}
            </div>
            {isRanked ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {['mcq_single', 'true_false', 'clue_chain', 'put_in_order', 'countdown_list', 'career_path', 'imposter_multi_select', 'high_low', 'image_mcq'].map((t) => {
                  const on = selTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setSelTypes((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
                      className={
                        on
                          ? 'rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white'
                          : 'rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50'
                      }
                    >
                      {t.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-1 text-sm font-medium text-slate-800">per active challenge</div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {isRanked ? 'Categories / day (LRU)' : 'Fire hour (Tbilisi)'}
            </div>
            {isRanked ? (
              <input
                type="number"
                min={1}
                value={perDay}
                onChange={(e) => setPerDay(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-20 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                  className="w-14 rounded-md border border-slate-200 px-2 py-1 text-sm"
                />
                {hour !== schedule.hourTbilisi ? (
                  <Button size="sm" variant="outline" onClick={handleHourSave} disabled={update.isPending}>
                    Save
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {isRanked ? (
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fire hour (Tbilisi) </span>
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                className="ml-2 w-14 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
              {hour !== schedule.hourTbilisi ? (
                <Button size="sm" variant="outline" className="ml-2" onClick={handleHourSave} disabled={update.isPending}>
                  Save
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {dirty ? (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <span className="text-xs text-blue-700">Unsaved config changes</span>
            <Button size="sm" onClick={handleConfigSave} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save config
            </Button>
          </div>
        ) : null}

        {/* what this schedule generates each run */}
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Each run:</span>{' '}
          {isRanked ? (
            <>
              {perRunTotal} questions per type ({selTypes.map((t) => t.replace(/_/g, ' ')).join(', ') || '—'}) ×{' '}
              {perDay} categories = <b>{perRunTotal * selTypes.length * perDay} questions</b>. Categories are picked
              least-recently-generated first (LRU), so the whole bank cycles automatically — no fixed category needed.
              {difficulty === 'mixed' ? <> Difficulty split {mix.easy}/{mix.medium}/{mix.hard} (E/M/H).</> : null}
            </>
          ) : (
            <>
              one job per ACTIVE daily challenge (Money Drop, True/False, …), {perRunTotal} questions each
              {difficulty === 'mixed' ? <> — split {mix.easy} easy / {mix.medium} medium / {mix.hard} hard</> : null}. Each
              challenge uses its own category (or an LRU pick when set to all categories).
            </>
          )}
        </p>

        {/* run history */}
        <div>
          <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Recent runs</h3>
          {runsLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : !runs || runs.length === 0 ? (
            <p className="text-sm text-slate-400">No runs yet. Use “Run now” to generate a set immediately.</p>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
              {runs.slice(0, 12).map((job) => {
                const counts = (job.counts ?? {}) as Record<string, number>;
                return (
                  <Link
                    key={job.id}
                    href={`/agents/${job.id}`}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50"
                  >
                    <JobStatusBadge status={job.status} />
                    <span className="text-slate-500">{formatRelativeTime(job.createdAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      {typeof job.params?.topic === 'string' ? job.params.topic : 'daily set'}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {counts.published ?? counts.approved ?? 0}/{counts.target ?? counts.generated ?? '?'} Qs
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{formatCents(job.spentCents)}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold capitalize text-slate-900">{value}</div>
    </div>
  );
}

export default function DailyChallengesPage() {
  const { data: schedules, isLoading } = useSchedules();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <CalendarClock className="h-6 w-6 text-slate-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Schedules</h1>
          <p className="text-sm text-slate-500">Recurring cron jobs that auto-generate questions — config, what they do, history, and manual run.</p>
        </div>
      </div>

      <AgentNav />

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading schedules…
        </div>
      ) : !schedules || schedules.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="py-10 text-center text-sm text-slate-500">No schedules configured.</CardContent>
        </Card>
      ) : (
        schedules.map((s) => <ScheduleCard key={s.id} schedule={s} />)
      )}
    </div>
  );
}
