import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/lib/td/client', () => ({
  tdAdmin: { media: { file: vi.fn(async () => new Blob(['png'], { type: 'image/png' })) } },
  tdTokens: { read: () => null },
}));

const { useTdUploadUrl } = await import('./use-td-content');

let made: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  made = [];
  revoked = [];
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:td-${made.length + 1}`;
    made.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => void revoked.push(url));
});

afterEach(() => cleanup());

const wrapper = ({ children }: { children: ReactNode }) => (
  <StrictMode>
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  </StrictMode>
);

it('hands out a live object URL under StrictMode, revokes every other one it made, and all of them on unmount', async () => {
  const { result, unmount } = renderHook(() => useTdUploadUrl('upload-1'), { wrapper });
  await waitFor(() => expect(result.current.url).not.toBeNull());
  const shown = result.current.url!;
  expect(revoked).not.toContain(shown);
  expect(made.filter((url) => url !== shown).every((url) => revoked.includes(url))).toBe(true);
  unmount();
  expect(made.every((url) => revoked.includes(url))).toBe(true);
});

it('has no URL without an upload', () => {
  const { result } = renderHook(() => useTdUploadUrl(null), { wrapper });
  expect(result.current.url).toBeNull();
  expect(made).toEqual([]);
});
