'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy, RefreshCw, Play, Pause, XCircle, Bot, Zap, Plus } from 'lucide-react';
import { api } from '@/lib/api';
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
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadList = useCallback(async () => {
    const { data, error: apiError } = await api.GET('/api/v1/admin/wl/tournaments');
    if (apiError) { setError('Could not load tournaments'); return; }
    setError(null);
    setTournaments((data?.tournaments ?? []) as TournamentRow[]);
  }, []);

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

  // openapi-fetch reports HTTP failures via the returned `error`, not by
  // throwing — surface them, or a failed action looks like a success.
  const act = useCallback(async (
    label: string,
    fn: () => Promise<{ error?: unknown } | unknown>,
  ) => {
    setBusy(label);
    try {
      const result = (await fn()) as { error?: unknown } | undefined;
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setError(`${label} failed: ${JSON.stringify(result.error).slice(0, 300)}`);
      } else {
        setError(null);
      }
    } catch (e) {
      setError(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
      void loadList();
      if (selectedId) void loadDetail(selectedId);
    }
  }, [selectedId, loadList, loadDetail]);

  const createCompressedTest = useCallback(() => act('create', async () => {
    await api.POST('/api/v1/admin/wl/create-test', {
      body: {
        compressed: { entry_seconds: 120, checkin_seconds: 60, to_final_seconds: 900 },
        config: { free_entry: true, question_time_ms: 6_000, break_ms: 30_000, spectator_delay_ms: 15_000 },
      },
    });
  }), [act]);

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
              onClick={() => void createCompressedTest()}
              disabled={busy != null}
              className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-bold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Compressed test event
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-800">
            {error}
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
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Top the field up to 100 with roster bots? Bots cannot be removed once entered.')) {
                      void act('fill bots', () => api.POST('/api/v1/admin/wl/tournaments/{id}/fill-bots', {
                        params: { path: { id: String(selected['id']) } }, body: { min_field: 100 },
                      }));
                    }
                  }}
                  disabled={busy != null}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                ><Bot className="h-4 w-4" /> Fill bots →100</button>
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
              </div>
            </div>

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
      </div>
    </div>
  );
}
