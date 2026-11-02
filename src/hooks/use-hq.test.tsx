import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { hqApi } from '@/lib/hq-api';
import { hqKeys, useApproveHqTask } from './use-hq';

vi.mock('@/lib/hq-api', () => ({ hqApi: { approveTask: vi.fn() } }));
afterEach(cleanup);

it('approving a task refreshes the board, overview, team and activity feed', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(hqApi.approveTask).mockResolvedValue({ id: 't1' } as never);
  const invalidate = vi.spyOn(client, 'invalidateQueries');

  const { result, unmount } = renderHook(useApproveHqTask, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await act(async () => {
    await result.current.mutateAsync({ id: 't1', note: 'great' });
  });

  expect(hqApi.approveTask).toHaveBeenCalledWith('t1', 'great');
  const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  for (const key of [hqKeys.tasks(), hqKeys.overview(), hqKeys.members(), hqKeys.events()]) {
    expect(keys).toContain(JSON.stringify(key));
  }
  unmount();
  client.clear();
});
