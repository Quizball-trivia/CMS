import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

let failCards = false;
let photoCards = false;
const file = vi.fn(async () => new Blob(['img'], { type: 'image/webp' }));
const cardsOf = (category: string) =>
  Array.from({ length: 30 }, (_, i) =>
    photoCards
      ? { id: `${category}-${i}`, data: { categoryKey: category, imageKey: null, photo: { id: category.charCodeAt(0) * 100 + i, ver: '1' } } }
      : { id: `${category}-${i}`, data: { categoryKey: category, imageKey: `${category}-img-${i}`, photo: null } },
  );
const media = ['a', 'b', 'c', 'd'].flatMap((category) =>
  Array.from({ length: 30 }, (_, i) => ({ status: 'approved', approved: null, data: { key: `${category}-img-${i}`, uploadId: `up-${category}-${i}`, url: null } })),
);
vi.mock('@/lib/td/client', () => ({
  tdAdmin: {
    content: (type: string) => ({
      list: async (query: { category?: string }) => {
        if (type === 'cards' && failCards) throw new Error('down');
        return { items: type === 'media' ? media : cardsOf(query.category!), nextCursor: null };
      },
    }),
    media: { file },
  },
  tdTokens: { read: () => null },
}));

const { useTdCategoryImagePrefetch, resetTdPrefetchBudget, PREFETCH_MAX_PICTURES, PREFETCH_PER_MINUTE } = await import('./use-td-image-prefetch');

beforeEach(() => {
  failCards = false;
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

it('tries a category again after its rows failed to load or the allowance ran out, without asking twice for a picture it has', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrapperWith(client);
    failCards = true;
    const d = renderHook(() => useTdCategoryImagePrefetch('d'), { wrapper });
    d.result.current.now();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(file).not.toHaveBeenCalled();
    failCards = false;
    client.clear();
    for (const key of ['a', 'b', 'c']) renderHook(() => useTdCategoryImagePrefetch(key), { wrapper }).result.current.now();
    await waitFor(() => expect(file).toHaveBeenCalledTimes(PREFETCH_PER_MINUTE));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // c got 12 of its 24; a minute later the next hover reads the other 12, and d (whose rows failed) its 24.
    vi.setSystemTime(Date.now() + 61_000);
    renderHook(() => useTdCategoryImagePrefetch('c'), { wrapper }).result.current.now();
    await waitFor(() => expect(file).toHaveBeenCalledTimes(PREFETCH_PER_MINUTE + 12));
    d.result.current.now();
    await waitFor(() => expect(file).toHaveBeenCalledTimes(PREFETCH_PER_MINUTE + 12 + PREFETCH_MAX_PICTURES));
  } finally {
    vi.useRealTimers();
  }
});

it('counts SoFIFA faces against the same allowance and loads each once', async () => {
  const images: string[] = [];
  vi.stubGlobal('Image', class { set src(value: string) { images.push(value); } });
  try {
    const wrapper = wrapperWith(new QueryClient());
    photoCards = true;
    for (const key of ['a', 'b', 'c']) renderHook(() => useTdCategoryImagePrefetch(key), { wrapper }).result.current.now();
    await waitFor(() => expect(images).toHaveLength(PREFETCH_PER_MINUTE));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(images).toHaveLength(PREFETCH_PER_MINUTE);
    expect(new Set(images).size).toBe(PREFETCH_PER_MINUTE);
  } finally {
    photoCards = false;
    vi.unstubAllGlobals();
  }
});
