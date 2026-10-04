import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TdAdminApi } from '@/lib/td/admin-api';
import type { TdApiClient } from '@/lib/td/api-client';
import type { Dashboard } from '@/lib/td/contract';
import type { TdTokenStore } from '@/lib/td/token-store';
import type { TdRole, TdStaff } from '@/types/td';

const h = vi.hoisted(() => ({
  admin: null as unknown as TdAdminApi,
  api: null as unknown as TdApiClient,
  tokens: null as unknown as TdTokenStore,
  user: null as TdStaff | null,
}));

vi.mock('@/lib/td/client', () => ({
  get tdAdmin() {
    return h.admin;
  },
  get tdApi() {
    return h.api;
  },
  get tdTokens() {
    return h.tokens;
  },
  TD_CONFIG: { deployEnv: 'local', apiUrl: 'https://td-api.mock', apiOrigin: null, mock: true },
}));
vi.mock('@/providers/td-auth-provider', () => ({ useTdAuth: () => ({ user: h.user, status: 'authenticated' }) }));
// jsdom has no layout, so recharts' ResponsiveContainer measures 0 and draws nothing: give the chart a size.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 288 }) };
});

const { createTdAdminApi } = await import('@/lib/td/admin-api');
const { createTdApiClient, createTransport, requestTokenRefresh } = await import('@/lib/td/api-client');
const { createRefreshCoordinator } = await import('@/lib/td/refresh-coordinator');
const { memoryBlobStore } = await import('@/lib/td/mock/blob-store');
const { createMockTdApi, MOCK_PASSWORD, MOCK_STAFF } = await import('@/lib/td/mock-api');
const { createOrigin, MemoryStorage, put } = await import('@/lib/td/__tests__/helpers');
const { addDays } = await import('@/lib/td/georgia');
const { TdDashboard } = await import('../td-dashboard');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let generation = 0;

async function signIn(role: TdRole) {
  const origin = createOrigin();
  const transport = createTransport(BASE, server);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: (token, id) => requestTokenRefresh(transport, token, id) });
  const api = createTdApiClient({ transport, tokens, coordinator });
  const staff = MOCK_STAFF.find((s) => s.role === role && s.status === 'active')!;
  const session = await api.login(staff.email, MOCK_PASSWORD);
  await put(tokens, { ...session, generation: `gen-${++generation}`, staffId: staff.id, refreshPendingSince: null });
  const admin = createTdAdminApi(api);
  Object.assign(h, { admin, api, tokens, user: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } });
  return admin;
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TdDashboard />
    </QueryClientProvider>,
  );
}

/** What the API would say, for the cases the mock does not produce. */
const serving = (admin: TdAdminApi, change: (data: Dashboard) => Dashboard) => {
  h.admin = { ...admin, dashboard: async () => change(await admin.dashboard()) };
};

/** The 30 days ending today, every figure positive so that a bar is drawn for each; `missing` are left out as the API may. */
const thirtyDays = (today: string, missing: number[] = []): Dashboard['days'] =>
  Array.from({ length: 30 }, (_, i) => ({ date: addDays(today, i - 29), activePlayers: i + 1, newPlayers: 1, matchesSettled: i + 2, dailiesCompleted: 1, practiceRuns: 1 })).filter((_, i) => !missing.includes(i));

const figure = (n: number) => n.toLocaleString('en-GB');
const card = (label: string) => screen.getByText(label).closest<HTMLElement>('[data-slot="card"]')!;

beforeEach(() => {
  const storage = new MemoryStorage();
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => Date.now(), blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('the dashboard', () => {
  it('shows today’s figure on each card, with the last 7 and 30 days under it', async () => {
    const admin = await signIn('ops');
    const data = await admin.dashboard();
    serving(admin, (d) => ({ ...d, last7Days: { ...d.last7Days!, players: { new: 1, active: 1234 } }, last30Days: { ...d.last30Days!, players: { new: 1, active: 5678 } } }));
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Stats' })).toBeTruthy();

    const [today, week, month] = [data.today, data.last7Days!, data.last30Days!];
    const dailies = (of: { dailies: Dashboard['today']['dailies'] }) => of.dailies.footballLogic.attempts + of.dailies.putInOrder.attempts + of.dailies.careerPath.attempts;
    const expected: Array<[string, number, string, string]> = [
      ['Players', today.players.active, '1,234', '5,678'],
      ['Matches played', today.matches.settled, figure(week.matches.settled), figure(month.matches.settled)],
      ['Dailies played', dailies(today), figure(week.dailies.attempts), figure(month.dailies.attempts)],
      ['Practice runs', today.practice.runs, figure(week.practice.runs), figure(month.practice.runs)],
    ];
    await waitFor(() => expect(card('Players').textContent).toContain(figure(today.players.active)));
    for (const [label, value, last7, last30] of expected) {
      const element = card(label);
      expect(within(element).getByText(figure(value), { selector: 'div' })).toBeTruthy();
      expect(within(element).getByText(`7 days: ${last7} · 30 days: ${last30}`)).toBeTruthy();
    }
  });

  it('shows “—” for a period the API has not counted yet', async () => {
    const admin = await signIn('ops');
    serving(admin, (d) => ({ ...d, last7Days: null, last30Days: { ...d.last30Days!, practice: { runs: 4321 } } }));
    renderDashboard();
    expect(await screen.findByText('7 days: — · 30 days: 4,321')).toBeTruthy();
    expect(within(card('Players')).getByText('7 days: — · 30 days: ' + figure((await h.admin.dashboard()).last30Days!.players.active))).toBeTruthy();

    serving(admin, (d) => ({ ...d, last7Days: null, last30Days: null }));
    cleanup();
    renderDashboard();
    await waitFor(() => expect(screen.getAllByText('7 days: — · 30 days: —')).toHaveLength(4));
  });

  it('draws the 30 days in both charts, with a gap for a day the API has no figure for', async () => {
    const admin = await signIn('ops');
    serving(admin, (d) => ({ ...d, days: thirtyDays(d.today.date, [12]) }));
    const { container } = renderDashboard();
    await waitFor(() => expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(29));
    // The line breaks at the missing day: two stretches, not one that falls to zero.
    const stretches = (path: string) => path.match(/M/g)?.length;
    expect(stretches(container.querySelector('.recharts-area-curve')!.getAttribute('d')!)).toBe(2);
    expect(screen.getByText('Players per day · last 30 days')).toBeTruthy();
    expect(screen.getByText('Matches played per day · last 30 days')).toBeTruthy();
  });

  it('breaks nothing when every day has its figure', async () => {
    const admin = await signIn('ops');
    serving(admin, (d) => ({ ...d, days: thirtyDays(d.today.date) }));
    const { container } = renderDashboard();
    await waitFor(() => expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(30));
    expect(container.querySelector('.recharts-area-curve')!.getAttribute('d')!.match(/M/g)).toHaveLength(1);
  });

  it('gives a day with no neighbours a dot, since a line cannot reach it', async () => {
    const admin = await signIn('ops');
    serving(admin, (d) => ({ ...d, days: thirtyDays(d.today.date, [4, 6]) }));
    const { container } = renderDashboard();
    await waitFor(() => expect(container.querySelectorAll('.recharts-bar-rectangle')).toHaveLength(28));
    expect(container.querySelectorAll('.recharts-area-dots circle')).toHaveLength(1);
  });

  it.each([
    ['ops', true],
    ['betsson_admin', true],
    ['publisher', false],
    ['editor', false],
  ] as const)('shows the leaderboard’s top ten to %s: %s', async (role, shown) => {
    const admin = await signIn(role);
    const standings = vi.fn(admin.leaderboard.standings);
    h.admin = { ...admin, leaderboard: { ...admin.leaderboard, standings } };
    renderDashboard();
    // The cards fill in once the figures have come.
    await waitFor(() => expect(card('Players').textContent).not.toContain('—'));
    if (shown) {
      expect(await screen.findByText('Leaderboard · top 10')).toBeTruthy();
      await waitFor(() => expect(within(card('Leaderboard · top 10')).getAllByRole('row')).toHaveLength(11));
      expect(standings).toHaveBeenCalledWith({ limit: 10 }, expect.anything());
    } else {
      expect(screen.queryByText('Leaderboard · top 10')).toBeNull();
      expect(standings).not.toHaveBeenCalled();
    }
  });

  it('says how many early-quit penalties need a look, and offers the review to ops only', async () => {
    const admin = await signIn('ops');
    serving(admin, (d) => ({ ...d, penaltiesToReview: 2 }));
    renderDashboard();
    expect(await screen.findByText(/^2 early-quit penalties need a second look/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review' }).getAttribute('href')).toBe('/td/players');
    cleanup();

    const publisher = await signIn('publisher');
    serving(publisher, (d) => ({ ...d, penaltiesToReview: 1 }));
    renderDashboard();
    expect(await screen.findByText(/^1 early-quit penalty needs a second look/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Review' })).toBeNull();
    cleanup();

    serving(publisher, (d) => ({ ...d, penaltiesToReview: 0 }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/^Georgian time/)).toBeTruthy());
    expect(screen.queryByText(/early-quit/)).toBeNull();
  });
});
