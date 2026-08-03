'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, RefreshCw, Play, Pause, XCircle, Bot, Zap, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { agentsApi } from '@/lib/agents-api';
import type { AgentJob } from '@/types/agents';
import type { components } from '@/types/api.generated';

type TournamentRow = Record<string, unknown>;
type Detail = components['schemas']['WlAdminTournamentDetailResponse'];

const STATUS_TONE: Record<string, string> = {
  entry_open: 'bg-emerald-100 text-emerald-800',
  checkin: 'bg-amber-100 text-amber-800',
  game_live: 'bg-red-100 text-red-800',
  break: 'bg-orange-100 text-orange-800',
  final_checkin: 'bg-amber-100 text-amber-800',
  final_live: 'bg-red-100 text-red-800',
  completed: 'bg-gray-200 text-gray-700',
  cancelled: 'bg-gray-100 text-gray-500',
  paused: 'bg-purple-100 text-purple-800',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_TONE[status] ?? 'bg-blue-100 text-blue-800'}`}>
      {status}
    </span>
  );
}

const WL_KINDS = ['true_false', 'high_low', 'mcq_single', 'career_path', 'clue_chain'] as const;

const AGENT_STATUS_TONE: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
};

function fmt(ts: unknown): string {
  if (typeof ts !== 'string') return '—';
  return new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Tbilisi', dateStyle: 'short', timeStyle: 'short' });
}

export default function WeekendLeaguePage() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadList = useCallback(async () => {
    const { data, error: apiError } = await api.GET('/api/v1/admin/wl/tournaments');
    if (apiError) { setError('Could not load tournaments'); return; }
    setError(null);
    setTournaments((data?.tournaments ?? []) as TournamentRow[]);
  }, []);

  // WL question-agent visibility: recent weekend_league jobs from the same
  // agents surface the Agents tab uses, plus the protected-stock fuel gauge.
  const [agentJobs, setAgentJobs] = useState<AgentJob[]>([]);
  const [stock, setStock] = useState<Array<{ type: string; visibility: string; n: number }>>([]);
  const loadAgentPanel = useCallback(async () => {
    try {
      const jobs = await agentsApi.listJobs({ limit: 100 });
      setAgentJobs((jobs.items ?? []).filter((j) => j.type === 'weekend_league').slice(0, 12));
    } catch { /* agents surface may be unavailable — panel just stays empty */ }
    try {
      const { data } = await api.GET('/api/v1/admin/wl/stock');
      if (data) setStock(data.stock);
    } catch { /* older backend without the endpoint */ }
  }, []);
  useEffect(() => { void loadAgentPanel(); }, [loadAgentPanel]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { void loadAgentPanel(); }, 15_000);
    return () => clearInterval(id);
  }, [autoRefresh, loadAgentPanel]);

  const loadDetail = useCallback(async (id: string) => {
    const { data, error: apiError } = await api.GET('/api/v1/admin/wl/tournaments/{id}', {
      params: { path: { id } },
    });
    if (apiError) { setError('Could not load tournament detail'); return; }
    setDetail(data ?? null);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    }, 5_000);
    return () => clearInterval(id);
  }, [autoRefresh, selectedId, loadList, loadDetail]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);

  // Bot fill: arbitrary target, optionally reached gradually so the joined
  // counter climbs like real sign-ups instead of jumping in one tick. The
  // ramp runs client-side (this page must stay open) by stepping the
  // idempotent fill-bots target upward on an interval.
  const [botTarget, setBotTarget] = useState(100);
  const [botRampMin, setBotRampMin] = useState(0);
  const [ramp, setRamp] = useState<{ from: number; target: number; startedAt: number; endsAt: number } | null>(null);
  // Generation token: bumping it invalidates any in-flight step and its
  // self-scheduled successor — the definitive double-start/stale-loop guard.
  const rampGen = useRef(0);
  const rampNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRamp = useCallback(() => {
    rampGen.current += 1;
    if (rampNext.current) clearTimeout(rampNext.current);
    rampNext.current = null;
    setRamp(null);
  }, []);
  useEffect(() => () => stopRamp(), [stopRamp]);
  useEffect(() => { stopRamp(); }, [selectedId, stopRamp]);

  // openapi-fetch reports HTTP failures via the returned `error`, not by
  // throwing — surface them, or a failed action looks like a success.
  const act = useCallback(async (
    label: string,
    fn: () => Promise<{ error?: unknown } | unknown>,
  ) => {
    // Any explicit action supersedes a running bot ramp — a cancel must
    // never be followed by a scheduled fill.
    stopRamp();
    setBusy(label);
    try {
      const result = (await fn()) as { error?: unknown } | undefined;
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setActionError(`${label} failed: ${JSON.stringify(result.error).slice(0, 300)}`);
      } else {
        setActionError(null);
      }
    } catch (e) {
      setActionError(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    }
  }, [selectedId, loadList, loadDetail, stopRamp]);

  const [showCreate, setShowCreate] = useState(false);

  const clampInt = (v: number, lo: number, hi: number, fallback: number) =>
    Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback;
  const startBotFill = useCallback((id: string, currentField: number, target: number, rampMin: number) => {
    if (rampMin <= 0) {
      void act('fill bots', () => api.POST('/api/v1/admin/wl/tournaments/{id}/fill-bots', {
        params: { path: { id } }, body: { min_field: target },
      }));
      return;
    }
    stopRamp();
    const gen = rampGen.current;
    const startedAt = Date.now();
    const endsAt = startedAt + rampMin * 60_000;
    const from = Math.min(Number.isFinite(currentField) ? currentField : 0, target);
    setRamp({ from, target, startedAt, endsAt });
    // Self-scheduling: the next step only arms after this one finishes, so
    // slow requests can never overlap, and failures never orphan a loop.
    const step = async () => {
      if (gen !== rampGen.current) return;
      const progress = Math.min(1, (Date.now() - startedAt) / (endsAt - startedAt));
      try {
        const next = Math.round(from + (target - from) * progress);
        const result = await api.POST('/api/v1/admin/wl/tournaments/{id}/fill-bots', {
          params: { path: { id } }, body: { min_field: Math.max(1, next) },
        });
        if (gen !== rampGen.current) return;
        if (result.error) {
          setActionError(`bot ramp failed: ${JSON.stringify(result.error).slice(0, 200)}`);
          stopRamp();
          return;
        }
        await loadList().catch(() => {});
      } catch (e) {
        if (gen !== rampGen.current) return;
        setActionError(`bot ramp failed: ${e instanceof Error ? e.message : String(e)}`);
        stopRamp();
        return;
      }
      if (progress >= 1) { stopRamp(); return; }
      rampNext.current = setTimeout(() => { void step(); }, 15_000);
    };
    void step();
  }, [act, loadList, stopRamp]);
  const [mode, setMode] = useState<'compressed' | 'scheduled'>('compressed');
  const [entrySec, setEntrySec] = useState(120);
  const [checkinSec, setCheckinSec] = useState(60);
  const [toFinalSec, setToFinalSec] = useState(900);
  const [entryOpensAt, setEntryOpensAt] = useState('');
  const [entryClosesAt, setEntryClosesAt] = useState('');
  const [qualifierStartsAt, setQualifierStartsAt] = useState('');
  const [finalStartsAt, setFinalStartsAt] = useState('');
  const [questionMs, setQuestionMs] = useState(6_000);
  const [breakMs, setBreakMs] = useState(30_000);
  const [specDelayMs, setSpecDelayMs] = useState(15_000);
  const [freeEntry, setFreeEntry] = useState(true);

  const createTest = useCallback(() => {
    // Mirror the backend's zod ranges so a cleared field ("" → 0) or an
    // out-of-range value fails HERE with a readable message instead of a
    // raw server validation error.
    const intIn = (label: string, v: number, min: number, max: number): string | null =>
      Number.isInteger(v) && v >= min && v <= max
        ? null
        : `${label} must be a whole number between ${min} and ${max}.`;
    const problems = [
      ...(mode === 'compressed'
        ? [
            intIn('Entry window', entrySec, 10, 3600),
            intIn('Check-in window', checkinSec, 10, 3600),
            intIn('Qualifier → final', toFinalSec, 10, 7200),
          ]
        : []),
      intIn('Question time', questionMs, 1000, 120_000),
      intIn('Break', breakMs, 0, 30 * 60_000),
      intIn('Spectator delay', specDelayMs, 1000, 120_000),
    ].filter((p): p is string => p != null);
    if (problems.length > 0) {
      setActionError(problems.join(' '));
      return;
    }
    const config = {
      free_entry: freeEntry,
      question_time_ms: questionMs,
      break_ms: breakMs,
      spectator_delay_ms: specDelayMs,
    };
    if (mode === 'scheduled') {
      if (!entryOpensAt || !entryClosesAt || !qualifierStartsAt || !finalStartsAt) {
        setActionError('Scheduled mode needs all four times (entry opens/closes, qualifier, final).');
        return;
      }
      void act('create', () =>
        api.POST('/api/v1/admin/wl/create-test', {
          body: {
            entry_opens_at: new Date(entryOpensAt).toISOString(),
            entry_closes_at: new Date(entryClosesAt).toISOString(),
            qualifier_starts_at: new Date(qualifierStartsAt).toISOString(),
            final_starts_at: new Date(finalStartsAt).toISOString(),
            config,
          },
        })
      );
      return;
    }
    void act('create', () =>
      api.POST('/api/v1/admin/wl/create-test', {
        body: {
          compressed: { entry_seconds: entrySec, checkin_seconds: checkinSec, to_final_seconds: toFinalSec },
          config,
        },
      })
    );
  }, [act, mode, entrySec, checkinSec, toFinalSec, entryOpensAt, entryClosesAt,
    qualifierStartsAt, finalStartsAt, questionMs, breakMs, specDelayMs, freeEntry]);

  const selected = useMemo(
    () => tournaments.find((t) => t['id'] === selectedId) ?? null,
    [tournaments, selectedId],
  );

  return (
    <div className="min-h-screen bg-[#f8f9fb] py-10 text-foreground">
      <div className="mx-auto max-w-[1500px] space-y-8 px-8">
        <header className="flex items-end justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Trophy className="h-8 w-8 text-gray-800" />
              <h1 className="text-4xl font-black tracking-tight text-gray-900">Weekend League</h1>
            </div>
            <p className="text-base font-medium text-gray-500">
              Live events, registrations, standings and awards. Test events run compressed on any date;
              times shown in Georgia time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              auto-refresh
            </label>
            <button
              type="button"
              onClick={() => void act('tick', () => api.POST('/api/v1/admin/wl/force-tick'))}
              disabled={busy != null}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Zap className="h-4 w-4" /> Force tick
            </button>
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              disabled={busy != null}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Test event…
            </button>
          </div>
        </header>

        {showCreate && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-6">
              <span className="text-lg font-black text-gray-900">New test event</span>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="radio" checked={mode === 'compressed'} onChange={() => setMode('compressed')} />
                Compressed (starts now)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input type="radio" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} />
                Scheduled (pick times)
              </label>
            </div>
            {mode === 'compressed' ? (
              <div className="grid grid-cols-3 gap-4">
                <label className="text-sm font-semibold text-gray-600">
                  Entry window (sec)
                  <input type="number" min={10} max={3600} value={entrySec} onChange={(e) => setEntrySec(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
                </label>
                <label className="text-sm font-semibold text-gray-600">
                  Check-in window (sec)
                  <input type="number" min={10} max={3600} value={checkinSec} onChange={(e) => setCheckinSec(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
                </label>
                <label className="text-sm font-semibold text-gray-600">
                  Qualifier → final (sec)
                  <input type="number" min={10} max={7200} value={toFinalSec} onChange={(e) => setToFinalSec(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                <label className="text-sm font-semibold text-gray-600">
                  Entry opens
                  <input type="datetime-local" value={entryOpensAt} onChange={(e) => setEntryOpensAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm font-semibold text-gray-600">
                  Entry closes
                  <input type="datetime-local" value={entryClosesAt} onChange={(e) => setEntryClosesAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm font-semibold text-gray-600">
                  Qualifiers start
                  <input type="datetime-local" value={qualifierStartsAt} onChange={(e) => setQualifierStartsAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <label className="text-sm font-semibold text-gray-600">
                  Final starts
                  <input type="datetime-local" value={finalStartsAt} onChange={(e) => setFinalStartsAt(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" />
                </label>
                <p className="col-span-4 text-xs font-medium text-gray-400">
                  Times are entered in this browser&apos;s timezone and stored as UTC.
                </p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-4 items-end gap-4">
              <label className="text-sm font-semibold text-gray-600">
                Question time (ms)
                <input type="number" min={1000} max={120000} step={500} value={questionMs} onChange={(e) => setQuestionMs(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
              </label>
              <label className="text-sm font-semibold text-gray-600">
                Break between games (ms)
                <input type="number" min={0} max={1800000} step={1000} value={breakMs} onChange={(e) => setBreakMs(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
              </label>
              <label className="text-sm font-semibold text-gray-600">
                Spectator delay (ms)
                <input type="number" min={1000} max={120000} step={1000} value={specDelayMs} onChange={(e) => setSpecDelayMs(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono" />
              </label>
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input type="checkbox" checked={freeEntry} onChange={(e) => setFreeEntry(e.target.checked)} />
                  Free entry (no QP)
                </label>
                <button
                  type="button"
                  onClick={() => createTest()}
                  disabled={busy != null}
                  className="flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Create
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}
        {actionError && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-900">
            {actionError}
            <button type="button" className="ml-3 underline" onClick={() => setActionError(null)}>dismiss</button>
          </div>
        )}

        <section className="rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Week</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Entries</th>
                <th className="px-4 py-3">Checked in</th>
                <th className="px-4 py-3">Bots</th>
                <th className="px-4 py-3">Qualifier</th>
                <th className="px-4 py-3">Final</th>
                <th className="px-4 py-3">Test</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr
                  key={String(t['id'])}
                  onClick={() => setSelectedId(String(t['id']))}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${t['id'] === selectedId ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{String(t['week_key'] ?? '—')}</td>
                  <td className="px-4 py-2.5"><StatusPill status={String(t['status'])} /></td>
                  <td className="px-4 py-2.5 tabular-nums">{Number(t['registered'] ?? 0)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{Number(t['checked_in'] ?? 0)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{Number(t['bots'] ?? 0)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{fmt(t['qualifier_starts_at'])}</td>
                  <td className="px-4 py-2.5 text-gray-600">{fmt(t['final_starts_at'])}</td>
                  <td className="px-4 py-2.5">{t['is_test'] ? '🧪' : ''}</td>
                </tr>
              ))}
              {tournaments.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No tournaments yet</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {selected && detail && (
          <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-gray-900">
                  {String(selected['week_key'] ?? 'Test event')}
                </h2>
                <StatusPill status={String(selected['status'])} />
                <span className="text-xs font-mono text-gray-400">{String(selected['id'])}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Pause this tournament? Players will be stuck until resume.')) {
                      void act('pause', () => api.POST('/api/v1/admin/wl/tournaments/{id}/pause', { params: { path: { id: String(selected['id']) } } }));
                    }
                  }}
                  disabled={busy != null}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                ><Pause className="h-4 w-4" /> Pause</button>
                <button
                  type="button"
                  onClick={() => void act('resume', () => api.POST('/api/v1/admin/wl/tournaments/{id}/resume', { params: { path: { id: String(selected['id']) } } }))}
                  disabled={busy != null}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                ><Play className="h-4 w-4" /> Resume</button>
                <span className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1">
                  <Bot className="h-4 w-4 text-gray-500" />
                  <input
                    type="number" min={1} max={2000} value={botTarget}
                    onChange={(e) => setBotTarget(Number(e.target.value))}
                    title="Fill the field up to this many entrants"
                    className="w-16 rounded border border-gray-200 px-1.5 py-0.5 text-sm font-bold text-gray-800"
                  />
                  <span className="text-xs font-semibold text-gray-400">over</span>
                  <input
                    type="number" min={0} max={240} value={botRampMin}
                    onChange={(e) => setBotRampMin(Number(e.target.value))}
                    title="Minutes to spread the fill over (0 = instant)"
                    className="w-12 rounded border border-gray-200 px-1.5 py-0.5 text-sm font-bold text-gray-800"
                  />
                  <span className="text-xs font-semibold text-gray-400">min</span>
                  {ramp == null ? (
                    <button
                      type="button"
                      onClick={() => {
                        const target = clampInt(botTarget, 1, 2000, 100);
                        const rampMin = clampInt(botRampMin, 0, 240, 0);
                        setBotTarget(target);
                        setBotRampMin(rampMin);
                        if (window.confirm(`Fill the field to ${target} with roster bots${rampMin > 0 ? ` over ${rampMin} min` : ''}? Bots cannot be removed once entered.`)) {
                          startBotFill(String(selected['id']), Number(selected['registered'] ?? 0), target, rampMin);
                        }
                      }}
                      disabled={busy != null}
                      className="rounded-lg bg-gray-900 px-3 py-1 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
                    >Fill bots</button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopRamp}
                      className="rounded-lg bg-amber-600 px-3 py-1 text-sm font-bold text-white hover:bg-amber-700"
                    >Ramping → {ramp.target} (stop)</button>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Cancel this tournament?')) {
                      void act('cancel', () => api.POST('/api/v1/admin/wl/tournaments/{id}/cancel', { params: { path: { id: String(selected['id']) } } }));
                    }
                  }}
                  disabled={busy != null}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                ><XCircle className="h-4 w-4" /> Cancel</button>
                {Boolean(selected['is_test']) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('Delete this TEST event permanently? Its entries, results and questions rows go with it.')) return;
                      // Not act(): the selection must clear only AFTER a
                      // successful delete, and the post-action detail reload
                      // would 404 against the removed id.
                      void (async () => {
                        setBusy('delete');
                        try {
                          const result = await api.DELETE('/api/v1/admin/wl/tournaments/{id}', { params: { path: { id: String(selected['id']) } } });
                          if (result.error) {
                            setActionError(`delete failed: ${JSON.stringify(result.error).slice(0, 300)}`);
                          } else {
                            setActionError(null);
                            setSelectedId(null);
                            setDetail(null);
                          }
                        } catch (e) {
                          setActionError(`delete failed: ${e instanceof Error ? e.message : String(e)}`);
                        } finally {
                          setBusy(null);
                          void loadList();
                        }
                      })();
                    }}
                    disabled={busy != null}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  ><XCircle className="h-4 w-4" /> Delete</button>
                )}
              </div>
            </div>

            {Array.isArray(detail['registrants']) && (detail['registrants'] as Array<Record<string, unknown>>).length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Registered players ({(detail['registrants'] as Array<Record<string, unknown>>).length})
                </h3>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-3 py-2">Player</th>
                        <th className="px-3 py-2">QP at entry</th>
                        <th className="px-3 py-2">Entered</th>
                        <th className="px-3 py-2">Checked in</th>
                        <th className="px-3 py-2">State</th>
                        <th className="px-3 py-2 text-right">Final rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail['registrants'] as Array<Record<string, unknown>>).map((r, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-1.5 font-semibold text-gray-800">
                            {String(r['nickname'] ?? '—')}
                            {r['is_ai'] ? <span className="ml-1.5 text-xs text-purple-500">bot</span> : null}
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">{Number(r['qp_at_entry'] ?? 0)}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500">{fmt(r['entered_at'])}</td>
                          <td className="px-3 py-1.5 text-xs text-gray-500">{r['checked_in_at'] ? fmt(r['checked_in_at']) : '—'}</td>
                          <td className="px-3 py-1.5 text-xs font-semibold text-gray-600">{String(r['state'] ?? '')}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r['final_rank'] != null ? `#${r['final_rank']}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Entry states</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {detail.entry_states.map((row) => (
                      <tr key={row.state} className="border-b border-gray-100">
                        <td className="py-1.5 font-semibold text-gray-700">{row.state}</td>
                        <td className="py-1.5 text-right tabular-nums">{row.n}</td>
                        <td className="py-1.5 text-right text-xs text-gray-400 tabular-nums">{row.bots} bots</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3 className="mb-2 mt-6 text-sm font-bold uppercase tracking-wide text-gray-500">Stream</h3>
                <p className="text-sm text-gray-600">
                  head <span className="font-mono">{detail.stream?.head ?? '—'}</span> ·
                  pending <span className="font-mono">{detail.stream?.pending ?? 0}</span> ·
                  {' '}poison-ish <span className={`font-mono ${(detail.stream?.poisonish ?? 0) > 0 ? 'text-red-600 font-bold' : ''}`}>{detail.stream?.poisonish ?? 0}</span>
                </p>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
                  Board — game {detail.current_game_index}
                </h3>
                <table className="w-full text-sm">
                  <tbody>
                    {detail.board.slice(0, 15).map((row) => (
                      <tr key={row.user_id} className="border-b border-gray-100">
                        <td className="py-1 pr-2 tabular-nums text-gray-400">#{row.rank}</td>
                        <td className="py-1 font-semibold text-gray-800">
                          {row.nickname ?? row.user_id.slice(0, 8)}
                          {row.is_ai ? <span className="ml-1.5 text-xs text-purple-500">bot</span> : null}
                        </td>
                        <td className="py-1 text-right tabular-nums">{row.points}</td>
                      </tr>
                    ))}
                    {detail.board.length === 0 && (
                      <tr><td className="py-3 text-gray-400">No standings yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Awards</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {(detail.awards as Array<Record<string, unknown>>).map((a) => (
                      <tr key={String(a['user_id'])} className="border-b border-gray-100">
                        <td className="py-1.5 font-bold uppercase text-xs text-amber-700">{String(a['band'])}</td>
                        <td className="py-1.5 font-semibold text-gray-800">{String(a['nickname'] ?? '')}</td>
                        <td className="py-1.5 text-right text-xs text-gray-500">{String(a['status'])}</td>
                      </tr>
                    ))}
                    {detail.awards.length === 0 && (
                      <tr><td className="py-3 text-gray-400">No awards yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {!selected && tournaments.length > 0 && (
          <p className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw className="h-4 w-4" /> Select a tournament to see its field, standings and awards.
          </p>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Bot className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-black text-gray-900">Question agent</h2>
            <span className="text-sm font-medium text-gray-400">
              daily WL stock generation on the VPS — jobs land as <code className="font-mono text-xs">wl_private</code>
            </span>
          </div>

          <div className="mb-6 grid grid-cols-5 gap-3">
            {WL_KINDS.map((kind) => {
              const priv = stock.find((s) => s.type === kind && s.visibility === 'wl_private')?.n ?? 0;
              const pub = stock.find((s) => s.type === kind && s.visibility === 'public')?.n ?? 0;
              return (
                <div key={kind} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{kind.replace('_', ' ')}</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-2xl font-black tabular-nums ${priv > 0 ? 'text-gray-900' : 'text-red-500'}`}>{priv}</span>
                    <span className="text-xs font-semibold text-gray-400">WL</span>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-gray-400">{pub} public</span>
                  </div>
                </div>
              );
            })}
          </div>

          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Recent WL generation jobs</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-bold uppercase tracking-wide text-gray-400">
                <th className="py-2">Created</th>
                <th className="py-2">Kind</th>
                <th className="py-2">Topic</th>
                <th className="py-2 text-right">Target</th>
                <th className="py-2 text-right">Generated</th>
                <th className="py-2 text-right">Published</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {agentJobs.map((j) => (
                <tr key={j.id} className="border-b border-gray-100">
                  <td className="py-2 text-gray-500">{fmt(j.createdAt)}</td>
                  <td className="py-2 font-semibold text-gray-800">{String(j.params['questionType'] ?? '—')}</td>
                  <td className="py-2 text-gray-600">{String(j.params['topic'] ?? '—')}</td>
                  <td className="py-2 text-right tabular-nums">{j.counts.target ?? (Number(j.params['count'] ?? 0) || '—')}</td>
                  <td className="py-2 text-right tabular-nums">{j.counts.generated ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums font-bold">{j.counts.published ?? '—'}</td>
                  <td className="py-2">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${AGENT_STATUS_TONE[j.status] ?? 'bg-blue-100 text-blue-800'}`}>
                      {j.status}
                    </span>
                    {j.error ? <span className="ml-2 text-xs text-red-500" title={j.error}>{j.error.slice(0, 60)}</span> : null}
                  </td>
                </tr>
              ))}
              {agentJobs.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-gray-400">No WL generation jobs yet — the schedule fires daily at 05:00 Tbilisi.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
