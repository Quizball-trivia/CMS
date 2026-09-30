import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
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
const { forgetLinkTokens, TdSetPasswordForm } = await import('../td-set-password-form');
const { deferred } = await import('@/lib/td/__tests__/helpers');
const { TdLoginForm } = await import('../td-login-form');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let calls: string[];

/** A client of the mock; `tokens` keeps an existing session store (the same browser, another way to reach the API). */
function client(fetchImpl: typeof fetch, tokens: TdTokenStore = createOrigin().store()) {
  const origin = createOrigin();
  const transport = createTransport(BASE, fetchImpl);
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

/** Under StrictMode, as `next dev` runs pages: effects run twice. */
function renderPage(ui: ReactNode) {
  return render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <TdAuthProvider>
          {ui}
          <Who />
        </TdAuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

/** Signs a seeded member in on this page's token store, as an earlier sign-in would have. */
async function signedInAs(role: 'ops' | 'betsson_admin') {
  const member = MOCK_STAFF.find((s) => s.role === role)!;
  const session = await h.api.login(member.email, MOCK_PASSWORD);
  await h.tokens.transact((tx) => tx.replace({ ...session, generation: `before-${role}`, staffId: member.id, refreshPendingSince: null }));
  return member;
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
  forgetLinkTokens();
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

  it('clears the fragment with a history state Next’s router takes up (no internal marker kept)', async () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: {} }, '', '/td/accept-invite#token=tdi_abcdefghijklmnopqrstuvwxyz');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderPage(<TdSetPasswordForm kind="invite" />);
    await screen.findByRole('heading', { name: 'Join the team' });
    const clearing = replaceState.mock.calls.find(([, , url]) => url === '/td/accept-invite');
    expect(clearing?.[0]).toBeNull();
    // Still the captured token after StrictMode's second effect run: the form is there, not the damaged-link note.
    expect(screen.getByLabelText('New password')).toBeTruthy();
  });

  it('a redemption answered after another sign-in leaves that sign-in alone', async () => {
    const token = await managerLink('invite');
    const answer = deferred<void>();
    const inner = server;
    Object.assign(h, client(((input: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(input)).pathname === '/admin/auth/accept-invite' ? answer.promise.then(() => inner(input, init)) : inner(input, init)) as typeof fetch));
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Late Joiner');
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase');
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    // Meanwhile Ops signs in in this browser.
    const ops = await signedInAs('ops');
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe(ops.name));
    await act(async () => answer.resolve());
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/td/login?done=joined'));
    expect(screen.getByTestId('who').textContent).toBe(ops.name);
    expect(h.tokens.read()?.generation).toBe('before-ops');
  });

  it('while a signed-in member’s session hands over to the invited one, no identity is shown', async () => {
    const admin = await signedInAs('betsson_admin');
    const token = await managerLink('invite', 'handover@example.test');
    const me = deferred<void>();
    const inner = server;
    let held = false;
    Object.assign(h, client(((input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      // Only the new session's first /admin/me waits.
      if (path === '/admin/me' && held) return me.promise.then(() => inner(input, init));
      if (path === '/admin/auth/accept-invite') held = true;
      return inner(input, init);
    }) as typeof fetch, h.tokens));
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe(admin.name));
    expect(screen.getByText(/You are signed in as Demo Betsson Admin/)).toBeTruthy();
    fill('Your name', 'Handed Over');
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase');
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('loading'));
    await act(async () => me.resolve());
    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('Handed Over'));
  });

  it('a link taken without a usable session in the answer still ends at sign in with a note', async () => {
    const token = await managerLink('invite');
    const inner = server;
    Object.assign(h, client((async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      return new URL(String(input)).pathname === '/admin/auth/accept-invite' ? new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }) : response;
    }) as typeof fetch));
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Luka');
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase');
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Join' })));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/td/login?done=joined'));
  });

  it('after a try with no answer, a spent link points to signing in, not to a new invitation', async () => {
    const token = await managerLink('invite');
    const inner = server;
    let lose = true;
    Object.assign(h, client((async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (lose && new URL(String(input)).pathname === '/admin/auth/accept-invite') {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return response;
    }) as typeof fetch));
    window.history.replaceState(null, '', `/td/accept-invite#token=${token}`);
    renderPage(<TdSetPasswordForm kind="invite" />);
    fill('Your name', 'Luka');
    fill('New password', 'a long enough passphrase');
    fill('Repeat the password', 'a long enough passphrase');
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Join' })));
    expect(await screen.findByText(/No answer from the Table Derby API\. It may have gone through/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Join' })));
    expect(await screen.findByText(/most likely by your try that got no answer: sign in/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/td/login');
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
