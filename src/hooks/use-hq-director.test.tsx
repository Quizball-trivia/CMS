import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqDirectorChatPage, HqMessage } from '@/types';

const api = vi.hoisted(() => ({ directorChat: vi.fn(), sendDirectorChat: vi.fn(), resolveEscalation: vi.fn() }));
vi.mock('@/lib/hq-api', () => ({ hqApi: api }));

const { hqKeys, useHqDirectorChat, useResolveEscalation, useSendDirectorChat } = await import('./use-hq');

const msg = (id: number): HqMessage => ({
  id, taskId: 'c1', author: null, recipient: null, kind: 'comment', body: `message ${id}`, readAt: null, createdAt: '2026-11-09T06:00:00Z',
});
const page = (ids: number[], chat = { queued: false, running: false }): HqDirectorChatPage => ({ items: ids.map(msg), chat });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});

it('sending a message puts the response into the chat cache and refreshes the summary', async () => {
  const fresh = page([1, 2], { queued: true, running: false });
  api.sendDirectorChat.mockResolvedValue(fresh);
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(useSendDirectorChat, { wrapper });
  await act(async () => {
    await result.current.mutateAsync('Hello');
  });
  expect(api.sendDirectorChat).toHaveBeenCalledWith('Hello');
  expect(client.getQueryData(hqKeys.directorChat())).toBe(fresh);
  expect(invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey))).toContain(JSON.stringify(hqKeys.directorSummary()));
});

it('resolving an escalation refreshes tasks and the Director summary', async () => {
  api.resolveEscalation.mockResolvedValue({ id: 't1' });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const { result } = renderHook(useResolveEscalation, { wrapper });
  await act(async () => {
    await result.current.mutateAsync('t1');
  });
  expect(api.resolveEscalation).toHaveBeenCalledWith('t1');
  const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
  for (const key of [hqKeys.tasks(), hqKeys.directorSummary()]) expect(keys).toContain(JSON.stringify(key));
});

it('"load earlier" prepends older messages before the first id, and stops after a short page', async () => {
  const latest = Array.from({ length: 50 }, (_, i) => i + 51); // 51..100: a full page, so there may be more
  api.directorChat.mockImplementation(async (params?: { before?: number }) => (params?.before ? page([48, 49, 50]) : page(latest)));
  const { result } = renderHook(useHqDirectorChat, { wrapper });
  await waitFor(() => expect(result.current.messages).toHaveLength(50));
  expect(result.current.hasEarlier).toBe(true);

  await act(async () => {
    await result.current.loadEarlier();
  });
  expect(api.directorChat).toHaveBeenLastCalledWith({ before: 51, limit: 50 });
  expect(result.current.messages.map((m) => m.id).slice(0, 4)).toEqual([48, 49, 50, 51]);
  expect(result.current.hasEarlier).toBe(false);
});

it('keeps older messages when the latest page refetches', async () => {
  const latest = Array.from({ length: 50 }, (_, i) => i + 51);
  api.directorChat.mockImplementation(async (params?: { before?: number }) => (params?.before ? page([50]) : page(latest)));
  const { result } = renderHook(useHqDirectorChat, { wrapper });
  await waitFor(() => expect(result.current.messages).toHaveLength(50));
  await act(async () => {
    await result.current.loadEarlier();
  });
  await act(async () => {
    await result.current.refetch();
  });
  expect(result.current.messages).toHaveLength(51);
});
