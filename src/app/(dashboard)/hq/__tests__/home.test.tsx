import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HarnessGame, HarnessGames, HarnessOverview, HqAnalytics } from '@/types';

const h = vi.hoisted(() => ({ overview: undefined as unknown, games: undefined as unknown, analytics: undefined as unknown, overviewError: null as unknown }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: 'admin', email: 'a@quizball.io' } }) }));
vi.mock('@/hooks/use-real-analytics-visible', () => ({ useRealAnalyticsVisible: () => false }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.overview, error: h.overviewError }),
  useHarnessGames: () => ({ data: h.games, error: null }),
  useHqAnalytics: () => ({ data: h.analytics, error: null }),
  useHqClock: () => new Date('2026-11-27T10:00:00Z'),
}));

const { default: HqHomePage } = await import('../page');
const { needsYou, pulse } = await import('../home');

const seat = (id: string, over: Partial<HarnessOverview['accounts'][number]> = {}): HarnessOverview['accounts'][number] => ({
  id, provider: 'claude', label: id, secretRef: 'X', status: 'active', reservedForPeople: false, softPct: 90, state: 'ok', blockedUntil: null, windows: {}, lastError: null, maxParallel: 2, running: 0, runsToday: 0, ...over,
});
const overview = (over: Partial<HarnessOverview> = {}): HarnessOverview => ({
  settings: { paused: false, pausedReason: null, maxConcurrentRuns: 5, dailyRunLimit: 100000, updatedAt: null },
  today: { runs: 900, costCents: 0, failed: 0, live: 342 },
  direction: '',
  show: { eventDate: '2026-11-30', episode: 302, showAt: '2026-11-30T18:00:00.000Z', loaded: true, loadedIsThisPack: true, pack: null },
  runway: [{ key: 'pistas', label: 'Pistas', storedThrough: '2026-12-09', calendarEnds: null, endsOn: '2026-12-09', daysLeft: 12, limitedBy: 'content' }, { key: 'draft', label: 'Football Draft', storedThrough: '2027-12-01', calendarEnds: null, endsOn: '2027-12-01', daysLeft: 369, limitedBy: 'content' }],
  allCategories: [], contentEvents: [], proposals: [], asks: [], needsYou: [], recentLive: [], requests: [],
  classic: { viewCap: 100, shortCategories: 19, totalShortage: 640, categories: [] },
  stages: [], jobs: [],
  accounts: [seat('Ultra', { running: 2 }), seat('Premium 1', { state: 'limit', blockedUntil: '2026-11-27T20:00:00Z' }), seat('Codex', { provider: 'codex', running: 1 })],
  queue: { running: 3, ready: 40, waiting: 0, nextAt: null, dailyLimitReached: false },
  agents: [], runs: [], events: [], policies: [],
  ...over,
} as HarnessOverview);
const game = (name: string, started: [number, number], finished: [number, number]): HarnessGame => ({
  key: name, name, group: 'daily', what: '', state: 'on', route: null, preview: null,
  stats: { started: { now: started[0], before: started[1] }, finished: { now: finished[0], before: finished[1] }, played: null },
});
const games = (list: HarnessGame[]): HarnessGames => ({ generatedAt: '2026-11-27T10:00:00Z', games: list });
const series = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `d${i}`, newUsers: i < n - 8 ? 10 : 20, activePlayers: 0, matches: i < n - 8 ? 100 : 150 }));
const analytics = { series: series(30), actives: { dau: 1200, wau: 6400, mau: 21000 } } as unknown as HqAnalytics;

afterEach(() => {
  cleanup();
  h.overviewError = null;
});

it('shows the whole company on one page: agents, what needs a person, the product, and every department', () => {
  h.overview = overview();
  h.games = games([game('Football Clues', [956, 1103], [278, 295]), game('Minesweeper', [3100, 3578], [2478, 2762])]);
  h.analytics = analytics;
  render(<HqHomePage />);
  expect(screen.getByText('Agents working')).toBeTruthy();
  expect(screen.getByText('3 running now on 2 subscriptions, 40 jobs next in line.')).toBeTruthy();
  expect(screen.getByRole('link', { name: '2 of 3 subscriptions available' }).getAttribute('href')).toBe('/hq/content?tab=agents');

  const needs = screen.getByRole('heading', { name: /^Needs you/ }).closest('section')!;
  expect(within(needs).getByText(/1 daily game runs out of content within two weeks: Pistas \(12 days\)\./)).toBeTruthy();
  expect(within(needs).getByText(/1 game is worth a look: Football Clues\./)).toBeTruthy();
  expect(within(needs).getByRole('link', { name: /Open Games/ }).getAttribute('href')).toBe('/hq/games');

  const product = screen.getByRole('heading', { name: /^The product/ }).closest('section')!;
  expect(product.textContent).toMatch(/Active today1,200/);
  expect(product.textContent).toMatch(/New players140\+100% on the week before/);
  expect(product.textContent).toMatch(/Games played1,050\+50% on the week before/);

  const departments = screen.getByRole('heading', { name: /^Departments/ }).closest('section')!;
  const cards = within(departments).getAllByRole('article');
  expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Content', 'Games', 'Competitions', 'Growth', 'Partners']);
  expect(cards[0].textContent).toMatch(/342 new questions went live today\./);
  expect(cards[0].textContent).toMatch(/640 still missing across 19 categories\./);
  expect(cards[0].textContent).toMatch(/Shortest daily game: Pistas, 12 days of content left\./);
  expect(within(cards[0]).getByRole('link', { name: 'Open Content' }).getAttribute('href')).toBe('/hq/content');
  expect(cards[1].textContent).toMatch(/2 games are on\.1 worth a look this week\./);
  expect(within(cards[2]).getByText('Agents not set up yet')).toBeTruthy();
  expect(within(cards[3]).getByRole('link', { name: 'Users' }).getAttribute('href')).toBe('/users');
  expect(within(cards[3]).queryByRole('link', { name: 'Analytics (live)' })).toBeNull();
});

it('lists what needs a person in order of urgency, and says so when nothing does', () => {
  const o = overview({
    accounts: [seat('Codex', { provider: 'codex', state: 'auth' })],
    show: { eventDate: '2026-11-30', episode: 302, showAt: '', loaded: false, loadedIsThisPack: false, pack: { id: 'p', status: 'ready', approvedBy: null, updatedAt: '', counts: { total: 21, ok: 21, flagged: 0, notChecked: 0, checking: 0 }, rounds: [] } },
    stages: [{ mode: 'classic', stage: 'escalated', count: 2 }],
  });
  expect(needsYou(o, undefined, Date.parse('2026-11-27T10:00:00Z')).map((i) => i.key)).toEqual(['logins', 'show', 'stuck', 'runway']);
  expect(needsYou(overview({ runway: [] }), games([game('Fine', [1000, 1000], [800, 800])]))).toEqual([]);
  h.overview = overview({ runway: [] });
  h.games = games([game('Fine', [1000, 1000], [800, 800])]);
  h.analytics = undefined;
  render(<HqHomePage />);
  expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
  expect(screen.getByText('Loading the product numbers…')).toBeTruthy();
});

it('keeps the page up while parts are still loading or one of them failed', () => {
  h.overview = undefined;
  h.overviewError = new Error('down');
  h.games = undefined;
  h.analytics = analytics;
  render(<HqHomePage />);
  expect(screen.getByText('Could not load what the agents are doing.')).toBeTruthy();
  expect(screen.getAllByText('Loading its numbers…')).toHaveLength(2);
  expect(screen.getByText(/1,200/)).toBeTruthy();
});

it('compares two whole weeks for the pulse and gives nothing when there are too few days', () => {
  expect(pulse({ series: series(30) })).toMatchObject({ newPlayers: { now: 140, before: 70 }, games: { now: 1050, before: 700 }, from: 'd22', to: 'd28' });
  expect(pulse({ series: series(10) })).toBeNull();
  expect(pulse(undefined)).toBeNull();
});
