import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const file = vi.fn(async () => new Blob(['img'], { type: 'image/webp' }));
const cardsOf = (category: string) =>
  Array.from({ length: 30 }, (_, i) => ({ id: `${category}-${i}`, data: { categoryKey: category, imageKey: `${category}-img-${i}`, photo: null } }));
const media = ['a', 'b', 'c', 'd'].flatMap((category) =>
  Array.from({ length: 30 }, (_, i) => ({ status: 'approved', approved: null, data: { key: `${category}-img-${i}`, uploadId: `up-${category}-${i}`, url: null } })),
);
vi.mock('@/lib/td/client', () => ({
  tdAdmin: {
    content: (type: string) => ({
      list: async (query: { category?: string }) => ({ items: type === 'media' ? media : cardsOf(query.category!), nextCursor: null }),
    }),
    media: { file },
  },
  tdTokens: { read: () => null },
}));

const { useTdCategoryImagePrefetch, resetTdPrefetchBudget, PREFETCH_MAX_PICTURES, PREFETCH_PER_MINUTE } = await import('./use-td-image-prefetch');

beforeEach(() => {
  file.mockClear();
  resetTdPrefetchBudget();
});

const wrapperWith = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

it('reads a category\'s first pictures ahead once, in small copies, and all categories together stay within the allowance', async () => {
  const client = new QueryClient();
  const wrapper = wrapperWith(client);
  const a = renderHook(() => useTdCategoryImagePrefetch('a'), { wrapper });
  a.result.current.now();
  await waitFor(() => expect(file).toHaveBeenCalledTimes(PREFETCH_MAX_PICTURES));
  expect(file.mock.calls.every((call) => (call as unknown[])[2] !== undefined)).toBe(true);
  a.result.current.now();
  for (const key of ['b', 'c', 'd']) renderHook(() => useTdCategoryImagePrefetch(key), { wrapper }).result.current.now();
  await waitFor(() => expect(file).toHaveBeenCalledTimes(PREFETCH_PER_MINUTE));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(file).toHaveBeenCalledTimes(PREFETCH_PER_MINUTE);
});

it('reads nothing for a pointer that only passes over', async () => {
  vi.useFakeTimers();
  try {
    const { result } = renderHook(() => useTdCategoryImagePrefetch('a'), { wrapper: wrapperWith(new QueryClient()) });
    result.current.soon();
    vi.advanceTimersByTime(100);
    result.current.cancel();
    vi.advanceTimersByTime(500);
  } finally {
    vi.useRealTimers();
  }
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(file).not.toHaveBeenCalled();
});
