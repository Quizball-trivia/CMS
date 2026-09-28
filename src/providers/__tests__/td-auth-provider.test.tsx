import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { CrossTabLock } from '@/lib/td/cross-tab-lock';
import type { TdStaff } from '@/types/td';

const h = vi.hoisted(() => ({
  storage: null as Storage | null,
  lock: null as CrossTabLock | null,
  me: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/td/client', async () => {
  const { createTokenStore } = await import('@/lib/td/token-store');
  const { createWebLocksLock } = await import('@/lib/td/cross-tab-lock');
  const { MemoryStorage, createFakeLockManager } = await import('@/lib/td/__tests__/helpers');
  h.storage = new MemoryStorage();
  h.lock = createWebLocksLock('td-session', createFakeLockManager(), 2_000);
  return {
    tdTokens: createTokenStore(() => h.storage),
    tdLock: () => h.lock,
    tdRefresh: { refresh: h.refresh },
    tdApi: { me: h.me, logout: h.logout, login: h.login },
    TD_CONFIG: { deployEnv: 'local', apiUrl: '', apiOrigin: null, mock: false },
  };
});

const { TdAuthProvider, useTdAuth } = await import('../td-auth-provider');
const { tdTokens } = await import('@/lib/td/client');
const { TdApiError } = await import('@/lib/td/api-client');
const { deferred, session, tokenSet } = await import('@/lib/td/__tests__/helpers');

const EDITOR: TdStaff = { id: 'staff-editor', email: 'editor@example.test', name: 'Editor', role: 'editor' };
const OPS: TdStaff = { id: 'staff-ops', email: 'ops@example.test', name: 'Ops', role: 'ops' };
const PRIVATE = ['td', 'players'];

/** Renders with the editor's session (generation gen-a) stored; `/admin/me` answers per generation. */
function renderWithSession(client: QueryClient, meForA: () => Promise<TdStaff> = () => Promise.resolve(EDITOR)) {
  tdTokens.replace(session('gen-a', 'access-a', 'refresh-a', { staffId: EDITOR.id }));
  h.me.mockImplementation((options?: { generation?: string | null }) => (options?.generation === 'gen-a' ? meForA() : Promise.resolve(OPS)));
  return renderHook(useTdAuth, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <TdAuthProvider>{children}</TdAuthProvider>
      </QueryClientProvider>
    ),
  });
}

function otherTab(write: (storage: Storage) => void) {
  act(() => {
    write(h.storage!);
    window.dispatchEvent(new StorageEvent('storage', { key: 'td_session' }));
  });
}

beforeEach(() => {
  h.storage!.clear();
  h.me.mockReset();
  h.refresh.mockReset().mockResolvedValue('ok');
  h.logout.mockReset().mockResolvedValue(true);
  h.login.mockReset().mockResolvedValue(tokenSet('access-b', 'refresh-b'));
});

afterEach(() => {
  cleanup();
});

it('clears cached data and the session on logout, revoking with the refresh token', async () => {
  const client = new QueryClient();
  const { result } = renderWithSession(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['a player']);

  await act(() => result.current.logout());

  expect(h.logout).toHaveBeenCalledWith('refresh-a');
  expect(result.current.status).toBe('anonymous');
  expect(tdTokens.read()).toBeNull();
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
});

it('ignores an /admin/me answer that arrives after logout', async () => {
  const meA = deferred<TdStaff>();
  const { result } = renderWithSession(new QueryClient(), () => meA.promise);
  await waitFor(() => expect(h.me).toHaveBeenCalled());

  await act(() => result.current.logout());
  await act(async () => meA.resolve(EDITOR));

  expect(result.current).toMatchObject({ status: 'anonymous', user: null });
  expect(tdTokens.read()).toBeNull();
});

it("ignores A's /admin/me answer once B has signed in", async () => {
  const meA = deferred<TdStaff>();
  const { result } = renderWithSession(new QueryClient(), () => meA.promise);
  await waitFor(() => expect(h.me).toHaveBeenCalled());

  await act(() => result.current.login('ops@example.test', 'pw'));
  await act(async () => meA.resolve(EDITOR));

  expect(result.current).toMatchObject({ status: 'authenticated', user: OPS });
  expect(tdTokens.read()).toMatchObject({ accessToken: 'access-b', staffId: OPS.id });
});

it("does not let A's late 401 clear B's session", async () => {
  const meA = deferred<TdStaff>();
  const { result } = renderWithSession(new QueryClient(), () => meA.promise);
  await waitFor(() => expect(h.me).toHaveBeenCalled());

  await act(() => result.current.login('ops@example.test', 'pw'));
  await act(async () => meA.reject(new TdApiError(401, 'unauthorized', 'expired')));

  expect(result.current).toMatchObject({ status: 'authenticated', user: OPS });
  expect(tdTokens.read()).toMatchObject({ accessToken: 'access-b' });
});

it('drops identity and cached data as soon as another tab signs in, then revalidates', async () => {
  const client = new QueryClient();
  const { result } = renderWithSession(client);
  await waitFor(() => expect(result.current.user?.id).toBe(EDITOR.id));
  client.setQueryData(PRIVATE, ['visible to the editor']);
  const meB = deferred<TdStaff>();
  h.me.mockImplementation(() => meB.promise);

  // B's sign-in is still validating in the other tab: no staff id yet.
  otherTab((storage) => storage.setItem('td_session', JSON.stringify(session('gen-b', 'access-b', 'refresh-b'))));

  expect(result.current).toMatchObject({ status: 'loading', user: null });
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
  await act(async () => meB.resolve(OPS));
  expect(result.current).toMatchObject({ status: 'authenticated', user: OPS });
});

it('ignores token rotation by another tab', async () => {
  const client = new QueryClient();
  const { result } = renderWithSession(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['still mine']);

  otherTab((storage) => storage.setItem('td_session', JSON.stringify(session('gen-a', 'access-a2', 'refresh-a2', { staffId: EDITOR.id }))));

  expect(result.current.user?.id).toBe(EDITOR.id);
  expect(h.me).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(PRIVATE)).toEqual(['still mine']);
});

it('signs out when another tab signs out', async () => {
  const client = new QueryClient();
  const { result } = renderWithSession(client);
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  client.setQueryData(PRIVATE, ['a player']);

  otherTab((storage) => storage.removeItem('td_session'));

  expect(result.current.status).toBe('anonymous');
  expect(client.getQueryData(PRIVATE)).toBeUndefined();
});

it('stays signed out when a refresh commits while the sign-out waits for the lock', async () => {
  const { result } = renderWithSession(new QueryClient());
  await waitFor(() => expect(result.current.status).toBe('authenticated'));
  const refreshHoldsLock = deferred<void>();
  const held = h.lock!.run(() => refreshHoldsLock.promise);

  let signedOut!: Promise<void>;
  act(() => {
    signedOut = result.current.logout();
  });
  expect(result.current.status).toBe('anonymous');

  // The in-flight refresh commits its rotation for gen-a before releasing the lock.
  act(() => {
    tdTokens.update('gen-a', { accessToken: 'access-a2', refreshToken: 'refresh-a2' });
  });
  expect(result.current.status).toBe('anonymous');
  expect(h.me).toHaveBeenCalledTimes(1);

  refreshHoldsLock.resolve();
  await act(async () => {
    await held;
    await signedOut;
  });
  expect(tdTokens.read()).toBeNull();
  expect(result.current.status).toBe('anonymous');
});

it('clears a sign-in whose /admin/me is refused', async () => {
  tdTokens.replace(session('gen-a', 'access-a', 'refresh-a'));
  h.me.mockImplementation((options?: { generation?: string | null }) =>
    options?.generation === 'gen-a' ? Promise.resolve(EDITOR) : Promise.reject(new TdApiError(403, 'forbidden', 'not staff')),
  );
  const { result } = renderHook(useTdAuth, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        <TdAuthProvider>{children}</TdAuthProvider>
      </QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.status).toBe('authenticated'));

  await act(() => expect(result.current.login('x@example.test', 'pw')).rejects.toMatchObject({ status: 403 }));

  expect(result.current.status).toBe('anonymous');
  expect(tdTokens.read()).toBeNull();
});
