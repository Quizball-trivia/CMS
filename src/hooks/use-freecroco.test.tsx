import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ApiClientError, freecrocoService } from '@/services';
import { freecrocoKeys, useFreecrocoCalendar, useFreecrocoGames, useReloadFreecrocoCalendar, useSaveFreecrocoCalendar, useSaveFreecrocoGames } from './use-freecroco';

vi.mock('@/services', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return {
    ApiClientError: actual.ApiClientError,
    freecrocoService: { getGames: vi.fn(), putGames: vi.fn(), getCalendar: vi.fn(), putCalendar: vi.fn() },
  };
});
afterEach(cleanup);

const stale = () => new ApiClientError({ code: 'stale_version', message: 'stale', details: null, request_id: null }, 409);
const config = (version: number) => ({ version, games: [] });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

it('reloads the games after a 409 so the screen shows what the other editor saved', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getGames).mockResolvedValueOnce(config(1)).mockResolvedValue(config(2));
  vi.mocked(freecrocoService.putGames).mockRejectedValue(stale());

  const { result } = renderHook(() => ({ games: useFreecrocoGames(), save: useSaveFreecrocoGames() }), { wrapper });
  await waitFor(() => expect(result.current.games.data?.version).toBe(1));

  let caught: unknown;
  await act(async () => {
    await result.current.save.mutateAsync(config(1)).catch((e) => (caught = e));
  });

  expect(caught).toBeInstanceOf(ApiClientError);
  expect((caught as ApiClientError).status).toBe(409);
  await waitFor(() => expect(result.current.games.data?.version).toBe(2));
  client.clear();
});

it('reloads the calendar after a 409', async () => {
  const { client, wrapper } = setup();
  const key = freecrocoKeys.calendar('2026-10-01', '2026-10-31');
  vi.mocked(freecrocoService.getCalendar).mockResolvedValueOnce({ version: 1, overrides: [] }).mockResolvedValue({ version: 2, overrides: [] });
  vi.mocked(freecrocoService.putCalendar).mockRejectedValue(stale());
  const { result } = renderHook(() => ({ calendar: useFreecrocoCalendar('2026-10-01', '2026-10-31'), save: useSaveFreecrocoCalendar() }), { wrapper });
  await waitFor(() => expect(result.current.calendar.data?.version).toBe(1));

  await act(async () => {
    await result.current.save.mutateAsync({ version: 1, changes: [] }).catch(() => undefined);
  });

  expect(client.getQueryData(key)).toEqual({ version: 2, overrides: [] });
  client.clear();
});

it('refetches the games after a successful save', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getGames).mockResolvedValueOnce(config(1)).mockResolvedValue(config(2));
  vi.mocked(freecrocoService.putGames).mockResolvedValue(config(2));
  const { result } = renderHook(() => ({ games: useFreecrocoGames(), save: useSaveFreecrocoGames() }), { wrapper });
  await waitFor(() => expect(result.current.games.data?.version).toBe(1));

  await act(async () => {
    await result.current.save.mutateAsync(config(1));
  });

  // mutateAsync resolves only after the reload, so the screen never flashes the old copy.
  expect(client.getQueryData(freecrocoKeys.games())).toEqual(config(2));
  client.clear();
});

const oct = { from: '2026-09-28', to: '2026-11-01' };
const nov = { from: '2026-10-26', to: '2026-12-06' };

it('reloads ranges and returns their version only when they all agree', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getCalendar).mockResolvedValue({ version: 3, overrides: [] });
  const { result } = renderHook(() => useReloadFreecrocoCalendar(), { wrapper });
  await expect(result.current([oct, nov])).resolves.toBe(3);
  client.clear();
});

it('fetches the ranges again when a save landed between them, instead of taking the highest version', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getCalendar).mockReset();
  // October read at v3, November at v4 (someone saved between the two reads); the retry agrees on v4.
  vi.mocked(freecrocoService.getCalendar)
    .mockResolvedValueOnce({ version: 3, overrides: [] })
    .mockResolvedValueOnce({ version: 4, overrides: [] })
    .mockResolvedValue({ version: 4, overrides: [] });
  const { result } = renderHook(() => useReloadFreecrocoCalendar(), { wrapper });
  await expect(result.current([oct, nov])).resolves.toBe(4);
  expect(freecrocoService.getCalendar).toHaveBeenCalledTimes(4);
  client.clear();
});

it('gives up with null when the ranges never agree', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getCalendar).mockReset();
  let calls = 0;
  vi.mocked(freecrocoService.getCalendar).mockImplementation(async () => ({ version: ++calls, overrides: [] }));
  const { result } = renderHook(() => useReloadFreecrocoCalendar(), { wrapper });
  await expect(result.current([oct, nov])).resolves.toBeNull();
  client.clear();
});

it('puts the saved games in the cache before the save resolves, even when the confirming reload fails', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getGames).mockReset();
  const saved = { version: 2, games: [{ gameId: 'ranked' as const, enabled: true, order: 1, defaultLimit: 12, ready: true }] };
  vi.mocked(freecrocoService.getGames).mockResolvedValueOnce(config(1)).mockRejectedValue(new Error('offline'));
  vi.mocked(freecrocoService.putGames).mockResolvedValue(saved);
  const { result } = renderHook(() => ({ games: useFreecrocoGames(), save: useSaveFreecrocoGames() }), { wrapper });
  await waitFor(() => expect(result.current.games.data?.version).toBe(1));

  await act(async () => {
    await result.current.save.mutateAsync(config(1));
  });

  expect(client.getQueryData(freecrocoKeys.games())).toEqual(saved);
  // The failed confirmation leaves the saved copy in place, flagged as a failed refresh.
  await waitFor(() => expect(result.current.games.isError).toBe(true));
  expect(result.current.games.data).toEqual(saved);
  client.clear();
});

it('writes the saved calendar into every range loaded at the version the save was based on', async () => {
  const { client, wrapper } = setup();
  vi.mocked(freecrocoService.getCalendar).mockReset().mockRejectedValue(new Error('offline'));
  const oct = freecrocoKeys.calendar('2026-09-28', '2026-11-01');
  const nov = freecrocoKeys.calendar('2026-10-26', '2026-12-06');
  const old = freecrocoKeys.calendar('2026-08-31', '2026-10-04');
  client.setQueryData(oct, { version: 1, overrides: [] });
  client.setQueryData(nov, { version: 1, overrides: [] });
  client.setQueryData(old, { version: 0, overrides: [] }); // loaded at some other version: not ours to rewrite
  vi.mocked(freecrocoService.putCalendar).mockResolvedValue({ version: 2, overrides: [] });
  const { result } = renderHook(() => useSaveFreecrocoCalendar(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync({
      version: 1,
      changes: [
        { date: '2026-10-06', gameId: 'ranked', limit: 20 },
        { date: '2026-11-03', gameId: 'countdown', limit: 0 },
      ],
    });
  });

  expect(client.getQueryData(oct)).toEqual({ version: 2, overrides: [{ date: '2026-10-06', gameId: 'ranked', limit: 20 }] });
  expect(client.getQueryData(nov)).toEqual({
    version: 2,
    overrides: [
      { date: '2026-11-03', gameId: 'countdown', limit: 0 },
    ],
  });
  expect(client.getQueryData(old)).toEqual({ version: 0, overrides: [] });
  client.clear();
});
