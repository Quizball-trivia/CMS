import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdStaff } from '@/types/td';

const h = vi.hoisted(() => ({
  storage: null as Storage | null,
  me: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
}));

vi.mock('@/lib/td/client', async () => {
  const { createTokenStore } = await import('@/lib/td/token-store');
  const { MemoryStorage } = await import('@/lib/td/__tests__/helpers');
  h.storage = new MemoryStorage();
  return {
    tdTokens: createTokenStore(() => h.storage),
    tdRefresh: { refresh: vi.fn(async () => 'ok') },
    tdApi: { me: h.me, logout: h.logout, login: h.login },
    TD_CONFIG: { deployEnv: 'local', apiUrl: '', mock: false },
  };
});

const { TdAuthProvider, useTdAuth } = await import('../td-auth-provider');
const { tdTokens } = await import('@/lib/td/client');
const { session } = await import('@/lib/td/__tests__/helpers');

const EDITOR: TdStaff = { id: 'staff-editor', email: 'editor@example.test', name: 'Editor', role: 'editor' };
const ADMIN: TdStaff = { id: 'staff-admin', email: 'admin@example.test', name: 'Admin', role: 'betsson_admin' };
const PRIVATE = ['td', 'players'];

function renderSignedIn(client: QueryClient) {
  tdTokens.write(session('access-1', 'refresh-1'));
  tdTokens.writeStaffId(EDITOR.id);
  h.me.mockResolvedValue(EDITOR);
  return renderHook(useTdAuth, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <TdAuthProvider>{children}</TdAuthProvider>
      </QueryClientProvider>
    ),
  });
}

function otherTab(write: (storage: Storage) => void, key: string) {
  act(() => {
    write(h.storage!);
    window.dispatchEvent(new StorageEvent('storage', { key }));
  });
}

beforeEach(() => {
  h.storage!.clear();
  h.me.mockReset();
  h.logout.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

it('clears cached data and the session on logout', async () => {
  const client = new QueryClient();
  const { result } = renderSignedIn(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['a player']);

  await act(() => result.current.logout());

  expect(h.logout).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('anonymous');
  expect(tdTokens.read()).toBeNull();
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
});

it('drops cached data when another tab signs in as someone else', async () => {
  const client = new QueryClient();
  const { result } = renderSignedIn(client);
  await waitFor(() => expect(result.current.user?.id).toBe(EDITOR.id));
  client.setQueryData(PRIVATE, ['visible to the editor']);

  h.me.mockResolvedValue(ADMIN);
  otherTab((storage) => {
    storage.setItem('td_session', JSON.stringify(session('access-9', 'refresh-9')));
    storage.setItem('td_staff_id', ADMIN.id);
  }, 'td_staff_id');

  await waitFor(() => expect(result.current.user?.id).toBe(ADMIN.id));
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
});

it('ignores token rotation by another tab', async () => {
  const client = new QueryClient();
  const { result } = renderSignedIn(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['still mine']);

  otherTab((storage) => storage.setItem('td_session', JSON.stringify(session('access-2', 'refresh-2'))), 'td_session');

  expect(result.current.user?.id).toBe(EDITOR.id);
  expect(h.me).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(PRIVATE)).toEqual(['still mine']);
});

it('signs out when another tab signs out', async () => {
  const client = new QueryClient();
  const { result } = renderSignedIn(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['a player']);

  otherTab((storage) => storage.removeItem('td_session'), 'td_session');

  expect(result.current.status).toBe('anonymous');
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
});
