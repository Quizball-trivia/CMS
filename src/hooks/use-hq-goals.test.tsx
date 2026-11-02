import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ listGoals: vi.fn() }));
vi.mock('@/lib/hq-api', () => ({ hqApi: api }));
const { hqKeys, useHqGoals, useHqPastGoals } = await import('./use-hq');

const goal = (id: string) => ({ id, title: id }) as never;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

it('active goals use the default (active-only) list', async () => {
  api.listGoals.mockReset().mockResolvedValue({ items: [goal('a')], nextCursor: null });
  const { client, wrapper } = setup();
  const { result } = renderHook(() => useHqGoals(), { wrapper });
  await waitFor(() => expect(result.current.data).toEqual([goal('a')]));
  expect(api.listGoals).toHaveBeenCalledWith({ limit: 200 });
  client.clear();
});

it('past goals load page by page via nextCursor, and only when enabled', async () => {
  api.listGoals
    .mockReset()
    .mockResolvedValueOnce({ items: [goal('p3'), goal('p2')], nextCursor: 'p2' })
    .mockResolvedValueOnce({ items: [goal('p1')], nextCursor: null });
  const { client, wrapper } = setup();

  const { result, rerender } = renderHook(({ enabled }) => useHqPastGoals(enabled), { wrapper, initialProps: { enabled: false } });
  expect(api.listGoals).not.toHaveBeenCalled();

  rerender({ enabled: true });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
  expect(api.listGoals).toHaveBeenLastCalledWith({ status: ['achieved', 'dropped'], limit: 30, before: undefined });
  expect(result.current.hasNextPage).toBe(true);

  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(api.listGoals).toHaveBeenLastCalledWith({ status: ['achieved', 'dropped'], limit: 30, before: 'p2' });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  expect(result.current.data?.pages.flatMap((p) => p.items).map((g) => (g as { id: string }).id)).toEqual(['p3', 'p2', 'p1']);
  expect(result.current.hasNextPage).toBe(false);
  // Goal mutations invalidate hqKeys.goals(), which prefixes the past-goals key.
  expect(hqKeys.pastGoals().slice(0, 2)).toEqual(hqKeys.goals());
  client.clear();
});
