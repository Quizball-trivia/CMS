import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdAdminApi } from '@/lib/td/admin-api';
import type { TdApiClient } from '@/lib/td/api-client';
import type { TdTokenStore } from '@/lib/td/token-store';

/** The redemption pages with the real auth provider and client, against the mock API. */
const h = vi.hoisted(() => ({
  api: null as unknown as TdApiClient,
  admin: null as unknown as TdAdminApi,
  tokens: null as unknown as TdTokenStore,
  replace: vi.fn(),
  search: '',
}));

vi.mock('@/lib/td/client', () => ({
  get tdApi() {
    return h.api;
  },
  get tdAdmin() {
    return h.admin;
  },
  get tdTokens() {
    return h.tokens;
  },
  tdRefresh: { refresh: async () => 'ok' },
  TD_CONFIG: { deployEnv: 'local', apiUrl: 'https://td-api.mock', apiOrigin: null, mock: true },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: h.replace, push: h.replace }),
  useSearchParams: () => new URLSearchParams(h.search),
}));

const { createTdAdminApi } = await import('@/lib/td/admin-api');
const { createTdApiClient, createTransport, requestTokenRefresh } = await import('@/lib/td/api-client');
const { createRefreshCoordinator } = await import('@/lib/td/refresh-coordinator');
const { memoryBlobStore } = await import('@/lib/td/mock/blob-store');
const { createMockTdApi, MOCK_PASSWORD, MOCK_STAFF } = await import('@/lib/td/mock-api');
const { createOrigin, MemoryStorage } = await import('@/lib/td/__tests__/helpers');
const { TdAuthProvider, useTdAuth } = await import('@/providers/td-auth-provider');
const { TdSetPasswordForm } = await import('../td-set-password-form');
const { TdLoginForm } = await import('../td-login-form');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let calls: string[];

function client(fetchImpl: typeof fetch) {
  const origin = createOrigin();
  const transport = createTransport(BASE, fetchImpl);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: (token, id) => requestTokenRefresh(transport, token, id) });
  const api = createTdApiClient({ transport, tokens, coordinator });
  return { api, tokens, admin: createTdAdminApi(api) };
}

/** A team manager's invitation (or reset) link token, made over the mock like the Team tab does. */
async function managerLink(kind: 'invite' | 'reset', email = 'new.member@example.test') {
  const manager = client(server);
  const admin = MOCK_STAFF.find((s) => s.role === 'betsson_admin')!;
  const session = await manager.api.login(admin.email, MOCK_PASSWORD);
  await manager.tokens.transact((tx) => tx.replace({ ...session, generation: 'manager', staffId: admin.id, refreshPendingSince: null }));
  if (kind === 'invite') return (await manager.admin.staff.invite({ email, role: 'editor' })).token;
  const editor = MOCK_STAFF.find((s) => s.role === 'editor' && s.status === 'active')!;
  const response = await manager.api.post<{ token: string }>(`/admin/staff/${editor.id}/reset-link`);
  return response.token;
}

function Who() {
  const { status, user } = useTdAuth();
  return <p data-testid="who">{status === 'authenticated' ? user?.name : status}</p>;
}

function renderPage(ui: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TdAuthProvider>
        {ui}
        <Who />
      </TdAuthProvider>
    </QueryClientProvider>,
  );
}

const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  const storage = new MemoryStorage();
  const mock = createMockTdApi({ storage: () => storage, latencyMs: 0, blobs: memoryBlobStore(), lock: undefined });
  calls = [];
  server = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`);
    return mock(input, init);
  }) as typeof fetch;
  Object.assign(h, client(server));
  h.replace.mockReset();
  h.search = '';
  window.history.replaceState(null, '', '/td/accept-invite');
});

afterEach(() => cleanup());

describe('invitation and reset links', () => {
  it('takes the token from the fragment, then clears it from the address bar; a damaged link shows no form', async () => {
    window.history.replaceState(null, '', '/td/accept-invite?utm=x#token=tdi_abcdefghijklmnopqrstuvwxyz');
    renderPage(<TdSetPasswordForm kind="invite" />);
    expect(await screen.findByRole('heading', { name: 'Join the team' })).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.pathname + window.location.search).toBe('/td/accept-invite?utm=x');
    cleanup();

    window.history.replaceState(null, '', '/td/reset#token=short');
    renderPage(<TdSetPasswordForm kind="reset" />);
    expect(await screen.findByText(/This link is incomplete or damaged/)).toBeTruthy();
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('an invitation: checks the password before sending, then joins and signs in; the link works once', async () => {
    const token = await managerLink('invite');
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Nino Beridze');
    fill('New password', 'short');
    fill('Repeat the password', 'short');
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(screen.getByRole('alert').textContent).toMatch(/at least 12 characters/);
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase!');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByRole('alert').textContent).toMatch(/not the same/);
    expect(calls.filter((c) => c === 'POST /admin/auth/accept-invite')).toHaveLength(0);

    fill('Repeat the password', 'a long enough passphrase');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Join' })));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/td'));
    expect(screen.getByTestId('who').textContent).toBe('Nino Beridze');
    cleanup();

    // The same link again: spent.
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Nino Beridze');
    fill('New password', 'another long passphrase');
    fill('Repeat the password', 'another long passphrase');
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Join' })));
    expect(await screen.findByText(/expired or was already used/)).toBeTruthy();
  });

  it('a reset: sets the new password and signs in; the old one no longer works', async () => {
    const token = await managerLink('reset');
    window.history.replaceState(null, '', `/td/reset#token=${token}`);
    renderPage(<TdSetPasswordForm kind="reset" />);
    fill('New password', 'a brand new passphrase');
    fill('Repeat the password', 'a brand new passphrase');
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Set password' })));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/td'));
    const editor = MOCK_STAFF.find((s) => s.role === 'editor' && s.status === 'active')!;
    expect(screen.getByTestId('who').textContent).toBe(editor.name);
    await expect(h.api.login(editor.email, MOCK_PASSWORD)).rejects.toMatchObject({ status: 401 });
    await expect(h.api.login(editor.email, 'a brand new passphrase')).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('once the link is spent but the session cannot be taken up, goes to sign in with a note', async () => {
    const token = await managerLink('invite');
    const inner = server;
    // The answer to /admin/me is lost: the password is set all the same.
    Object.assign(h, client(((input: RequestInfo | URL, init?: RequestInit) => (new URL(String(input)).pathname === '/admin/me' ? Promise.reject(new TypeError('Failed to fetch')) : inner(input, init))) as typeof fetch));
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Luka');
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase');
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Join' })));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/td/login?done=joined'));
  });

  it('the login page shows a finished link’s note, only for the notes it knows', async () => {
    h.search = 'done=joined';
    renderPage(<TdLoginForm />);
    expect(await screen.findByText('You have joined the team. Sign in with your new password.')).toBeTruthy();
    cleanup();
    h.search = 'done=constructor';
    renderPage(<TdLoginForm />);
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByText(/joined the team|password is set/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/function|native code/);
  });
});
