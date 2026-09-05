import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Category } from '@/types';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { categoriesService } from '@/services';
import { categoryKeys, useCategories, useUpdateCategory } from './use-categories';
import { featuredKeys } from './use-featured';

vi.mock('@/services', () => ({ categoriesService: { update: vi.fn(), listAll: vi.fn() } }));
afterEach(cleanup);

const original: Category = { id: 'category-1', slug: 'category-1', parent_id: null, name: { en: 'Before' }, description: {}, icon: null, image_url: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

it('updates category list, detail, and featured caches after an edit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  const updated = { ...original, name: { en: 'After' } };
  const other = { id: 'category-2', name: { en: 'Other' } };
  const listKey = categoryKeys.list();
  client.setQueryData(listKey, [original, other]);
  client.setQueryData(featuredKeys.list(), [{ id: 'featured-1', category: original }]);
  vi.mocked(categoriesService.update).mockResolvedValue(updated);
  const { result, unmount } = renderHook(useUpdateCategory, {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await act(async () => { await result.current.mutateAsync({ id: original.id, data: { name: updated.name } }); });
  expect(client.getQueryData(listKey)).toEqual([updated, other]);
  expect(client.getQueryData(categoryKeys.detail(original.id))).toEqual(updated);
  expect(client.getQueryData(featuredKeys.list())).toEqual([{ id: 'featured-1', category: updated }]);
  unmount();
  client.clear();
});

it('refreshes filtered category lists when an edited category no longer matches', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.mocked(categoriesService.listAll).mockResolvedValueOnce([original]).mockResolvedValue([]);
  vi.mocked(categoriesService.update).mockResolvedValue({ ...original, is_active: false });
  const { result, unmount } = renderHook(() => ({ list: useCategories({ is_active: 'true' }), update: useUpdateCategory() }), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  await waitFor(() => expect(result.current.list.data).toEqual([original]));
  await act(async () => { await result.current.update.mutateAsync({ id: original.id, data: { is_active: false } }); });
  await waitFor(() => expect(result.current.list.data).toEqual([]));
  unmount();
  client.clear();
});
