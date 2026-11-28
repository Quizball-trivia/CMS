import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HarnessGame, HarnessGames, HarnessOverview, HqAnalytics } from '@/types';

const h = vi.hoisted(() => ({ days: undefined as unknown, feedback: undefined as unknown, overview: undefined as unknown, games: undefined as unknown, analytics: undefined as unknown, overviewError: null as unknown, gamesError: null as unknown, fixes: [] as unknown, fixesError: null as unknown, reports: undefined as unknown }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: 'admin', email: 'a@quizball.io' } }) }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.overview, error: h.overviewError }),
  useHarnessGames: () => ({ data: h.games, error: h.gamesError }),
  useHqAnalytics: () => ({ data: h.analytics, error: null }),
  useHqClock: () => new Date('2026-11-27T10:00:00Z'),
  useContentFixes: () => ({ data: h.fixes, error: h.fixesError }),
  useHarnessReports: () => ({ data: h.reports, error: null }),
  useHarnessDays: () => ({ data: h.days, error: null }),
  useHarnessFeedback: () => ({ data: h.feedback, error: null }),
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
// Real calendar days, oldest first, ending 27 Nov (today in the tests).
const series = (n: number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 27 - (n - 1 - i))).toISOString().slice(0, 10), newUsers: i < n - 8 ? 10 : 20, activePlayers: 0, matches: i < n - 8 ? 100 : 150 }));
const analytics = { series: series(30), actives: { dau: 1200, wau: 6400, mau: 21000 } } as unknown as HqAnalytics;

afterEach(() => {
  cleanup();
  h.overviewError = null;
  h.gamesError = null;
  h.fixes = [];
  h.fixesError = null;
  h.reports = undefined;
});

it('shows the whole company on one page: agents, what needs a person, the product, and every department', () => {
  h.overview = overview();
  h.games = games([game('Football Clues', [956, 1103], [278, 295]), game('Minesweeper', [3100, 3578], [2478, 2762])]);
  h.analytics = analytics;
  render(<HqHomePage />);
  expect(screen.getByText('Agents working')).toBeTruthy();
  expect(screen.getByText('3 running now on 2 subscriptions, 40 jobs next in line.')).toBeTruthy();
  expect(screen.getByRole('link', { name: '2 of 3 subscriptions available' }).getAttribute('href')).toBe('/hq/agents');

  const needs = screen.getByRole('heading', { name: /^Needs you/ }).closest('section')!;
  expect(within(needs).getByText(/1 daily game runs out of content within two weeks: Pistas \(12 days\)\./)).toBeTruthy();
  expect(within(needs).getByText(/1 game is worth a look: Football Clues\./)).toBeTruthy();
  expect(within(needs).getByRole('link', { name: /Open Games/ }).getAttribute('href')).toBe('/hq/games');

  const product = screen.getByRole('heading', { name: /^The product/ }).closest('section')!;
  expect(product.textContent).toMatch(/last 7 whole days \(20 Nov to 26 Nov\)/);
  expect(product.textContent).toMatch(/Active today1,200/);
  expect(product.textContent).toMatch(/New players140▲ 100%/);
  expect(product.textContent).toMatch(/Games played1,050▲ 50%/);

  const departments = screen.getByRole('heading', { name: /^Departments/ }).closest('section')!;
  const cards = within(departments).getAllByRole('link');
  expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Content', 'Games', 'Competitions', 'Marketing', 'Partners', 'Investors']);
  expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/hq/content', '/hq/games', '/hq/competitions', '/hq/marketing', '/hq/partners', '/hq/investors']);
  expect(cards[0].textContent).toMatch(/Live today342new questions/);
  expect(cards[0].textContent).toMatch(/Still missing640in 19 categories/);
  expect(cards[0].textContent).toMatch(/Runway12 daysshortest: Pistas/);
  expect(cards[0].getAttribute('aria-label')).toBe('Open Content');
  expect(cards[1].textContent).toMatch(/Games on2of 2Worth a look1this week/);
  // A department with no agents yet says so, and how many of its suggested ones could start today.
  expect(cards[3].textContent).toMatch(/No agents yet · 6 suggested/);
  expect(cards[3].textContent).toMatch(/1 of its suggested agents can start with what HQ already has\./);
});

it('counts a department\'s running agents from the harness, and stops suggesting an agent once it runs', () => {
  const agent = (slug: string, name: string) => ({ slug, name, team: 't', description: '', provider: 'claude', model: 'claude-opus-5-5', effort: null, primaryAccount: 'a', fallbackAccounts: [], status: 'active', runsToday: 0, costCentsToday: 0, lastRunAt: null }) as HarnessOverview['agents'][number];
  h.overview = overview({ agents: [agent('question-maker', 'Question Maker'), { ...agent('fact-checker', 'Fact Checker'), status: 'paused' }, agent('game-planner', 'Game Planner'), { ...agent('growth-analyst', 'Growth Analyst'), status: 'paused' }] });
  h.games = games([]);
  h.analytics = analytics;
  render(<HqHomePage />);
  const cards = within(screen.getByRole('heading', { name: /^Departments/ }).closest('section')!).getAllByRole('link');
  // An agent whose own switch is off is listed but not counted as running.
  expect(cards[0].textContent).toMatch(/1 agent running, 1 paused · 3 suggested/);
  expect(cards[1].textContent).toMatch(/1 agent running · 4 suggested/);
  expect(cards[3].textContent).toMatch(/1 agent paused · 5 suggested/);
  expect(cards[5].textContent).toMatch(/No agents yet · 5 suggested/);
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
  // No all-clear while a source is missing.
  expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Could not check the agents and content and the games, so this list may be missing something.');
  // Content failed, Games is still loading: each card says which.
  expect(screen.getByText('Could not load its numbers. Trying again.')).toBeTruthy();
  expect(screen.getAllByText('Loading its numbers…')).toHaveLength(1);
  // Nothing is called a suggestion while the list of running agents is unknown.
  expect(screen.queryByText(/suggested/)).toBeNull();
  expect(screen.getByText(/1,200/)).toBeTruthy();
});

it('compares two whole weeks for the pulse and gives nothing when there are too few days', () => {
  expect(pulse({ series: series(30) })).toMatchObject({ newPlayers: { now: 140, before: 70 }, games: { now: 1050, before: 700 }, from: '2026-11-20', to: '2026-11-26' });
  expect(pulse({ series: series(10) })).toBeNull();
  expect(pulse(undefined)).toBeNull();
});

it('does not call it all clear while the games are still being counted, and keeps what it already found', () => {
  h.overview = overview();
  h.games = undefined;
  h.analytics = analytics;
  render(<HqHomePage />);
  expect(screen.getByRole('status').textContent).toBe('Still checking the games…');
  expect(screen.getByText(/1 daily game runs out of content/)).toBeTruthy();
  cleanup();
  h.overview = overview({ runway: [] });
  render(<HqHomePage />);
  expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
});

it('counts Ask HQ answers and held content fixes as things that need a person, and never gives the all-clear on stale data', () => {
  const o = overview({ runway: [], asks: [{ id: 'a', message: 'm', askedBy: null, status: 'answered', reply: '', actions: [], createdAt: '' }] as never });
  expect(needsYou(o, undefined, Date.parse('2026-11-27T10:00:00Z'), 3).map((i) => [i.key, i.text])).toEqual([
    ['asks', '1 answer from Ask HQ is waiting for you to apply or dismiss.'],
    ['fixes', '3 content fixes are held for a decision.'],
  ]);
  // Everything loaded and empty, but the last refresh of one source failed: no all-clear.
  h.overview = overview({ runway: [] });
  h.games = games([game('Fine', [1000, 1000], [800, 800])]);
  h.analytics = analytics;
  h.fixesError = new Error('refresh failed');
  render(<HqHomePage />);
  expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Could not check the held content fixes, so this list may be missing something.');
});

it('shows the newest finished reports from the agents, each opening in its department', () => {
  const report = (n: number, over: Record<string, unknown> = {}) => ({ id: `r${n}`, number: n, agent: 'growth-analyst', agentName: 'Growth Analyst', department: 'marketing', title: `Growth read ${n}`, status: 'ready', body: { summary: `Summary ${n}.`, sections: [], leads: [], questions: [] }, requestedBy: 'schedule', error: null, createdAt: '2026-11-27T08:00:00Z', updatedAt: '2026-11-27T08:05:00Z', ...over });
  h.overview = overview();
  h.games = games([]);
  h.analytics = analytics;
  h.reports = { items: [report(5, { status: 'writing', body: null }), report(4, { department: 'investors', agentName: 'Investor Scout', title: 'Investors worth approaching' }), report(3), report(2, { status: 'failed', body: null })], agents: [], profile: '' };
  render(<HqHomePage />);
  const fresh = screen.getByRole('heading', { name: 'Fresh from the agents' }).closest('section')!;
  const links = within(fresh).getAllByRole('link');
  // Only finished ones: not the one being written, not the failed one.
  expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Read: Investors worth approaching', 'Read: Growth read 3']);
  expect(links.map((a) => a.getAttribute('href'))).toEqual(['/hq/investors', '/hq/marketing']);
  expect(links[0].textContent).toMatch(/Investors.*Investor Scout · 2h ago/);
  cleanup();
  h.reports = { items: [], agents: [], profile: '' };
  render(<HqHomePage />);
  expect(screen.queryByRole('heading', { name: 'Fresh from the agents' })).toBeNull();
});

it('tells a person when built days wait for them, and what players report as broken', () => {
  const dayGame = (over: Record<string, unknown> = {}) => ({ game: 'pistas', label: 'Football Clues', unit: 'footballer', ahead: 21, daysLeft: 11, storedThrough: '2026-12-09', storing: false, rounds: { planned: 0, written: 0, checked: 0, localized: 0, ready: 60 }, readyByDifficulty: { easy: 17, medium: 25, hard: 18 }, perDay: { easy: 3, medium: 4, hard: 3 }, builtLately: [], droppedLately: { count: 0, examples: [] }, planning: false, agent: 'active', ...over });
  const recap = (urgent: string[]) => ({ recap: { recap: { summary: 's', themes: [], praise: [], urgent } } });
  const items = needsYou(undefined, undefined, 0, undefined, { days: { games: [dayGame(), dayGame({ game: 'ultimo', label: 'Último', storing: true }), dayGame({ game: 'x', label: 'Empty', readyByDifficulty: { easy: 2, medium: 9, hard: 9 } })] } as never, feedback: recap(['Tenable does not accept Georgian typing (77).', 'Lag in penalties (21).']) as never });
  expect(items.map((i) => [i.key, i.area, i.href])).toEqual([['days-pistas', 'Content', '/hq/content?tab=runway'], ['feedback', 'Feedback', '/hq/feedback']]);
  // 17 easy at 3 a day is 5 days, whatever the other difficulties could make.
  expect(items[0]!.text).toBe('Football Clues: the Day Builder has rounds ready for 5 new days, and 11 days are left in the game. Nothing is stored until you have read some of them and turned storing on.');
  expect(items[1]!.text).toBe('Players report 2 things that may be broken: Tenable does not accept Georgian typing (77). (and 1 more)');
  expect(needsYou(undefined, undefined, 0, undefined, { feedback: recap([]) as never })).toEqual([]);
  expect(needsYou(undefined, undefined, 0)).toEqual([]);
});
