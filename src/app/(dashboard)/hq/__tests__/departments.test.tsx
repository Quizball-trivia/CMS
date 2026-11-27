import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HarnessOverview } from '@/types';

const h = vi.hoisted(() => ({ pathname: '/hq/marketing', overview: undefined as unknown, error: null as unknown, notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, notFound: h.notFound }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: 'admin', email: 'a@quizball.io' } }) }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.overview, error: h.error, isLoading: !h.overview && !h.error, refetch: vi.fn() }),
  useHqClock: () => new Date('2026-11-27T10:00:00Z'),
}));

const { default: DepartmentPage } = await import('../[department]/page');
const { default: AgentsPage } = await import('../agents/page');
const { modelName } = await import('../agents-ui');

const agent = (slug: string, name: string, over: Partial<HarnessOverview['agents'][number]> = {}): HarnessOverview['agents'][number] => ({
  slug, name, team: 't', description: `${name} does its job.`, provider: 'claude', model: 'claude-opus-5-5', effort: null, primaryAccount: 'a', fallbackAccounts: [], status: 'active', runsToday: 12, costCentsToday: 0, lastRunAt: '2026-11-27T09:00:00Z', ...over,
});
const overview = (agents: HarnessOverview['agents']): HarnessOverview =>
  ({
    settings: { paused: false, pausedReason: null, maxConcurrentRuns: 5, dailyRunLimit: 100000, updatedAt: null },
    today: { runs: 221, costCents: 0, failed: 4, live: 25 },
    accounts: [{ id: 's1', provider: 'claude', label: 'Claude Ultra', secretRef: 'X', status: 'active', reservedForPeople: false, softPct: 90, state: 'ok', blockedUntil: null, windows: {}, lastError: null, maxParallel: 3, running: 1, runsToday: 40 }],
    queue: { running: 1, ready: 0, waiting: 0, nextAt: null, dailyLimitReached: false },
    classic: { viewCap: 100, shortCategories: 0, totalShortage: 0, categories: [] },
    agents,
  }) as unknown as HarnessOverview;

afterEach(() => {
  cleanup();
  h.error = null;
  h.notFound.mockClear();
});

it('shows a department with no agents yet: its mission, the agents it could have, and its tools', () => {
  h.pathname = '/hq/marketing';
  h.overview = overview([agent('question-maker', 'Question Maker')]);
  render(<DepartmentPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Marketing');
  expect(screen.getByText('No agent works for this department yet. The ones below are where it could start.')).toBeTruthy();
  const suggested = screen.getByRole('heading', { name: /Suggested agents/ }).closest('section')!;
  expect(within(suggested).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Growth Analyst', 'Social Writer', 'Search Page Writer', 'Win-back Writer', 'Ad Tester', 'Community Listener']);
  const growth = within(suggested).getByRole('article', { name: 'Growth Analyst' });
  expect(within(growth).getByText('Can start now')).toBeTruthy();
  expect(within(growth).queryByText('Needs first')).toBeNull();
  const ads = within(suggested).getByRole('article', { name: 'Ad Tester' });
  expect(within(ads).getByText('Needs one thing')).toBeTruthy();
  expect(within(ads).getByText('Ad accounts (Meta, Google, TikTok) and a monthly budget.')).toBeTruthy();
  const tools = screen.getByRole('heading', { name: 'Tools' }).closest('section')!;
  expect(within(tools).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/retention', '/announcements', '/users', '/stats']);
});

it('moves an agent from suggested to at work once the harness runs it', () => {
  h.pathname = '/hq/investors';
  h.overview = overview([agent('investor-scout', 'Investor Scout', { altModel: 'gpt-6.1-sol' })]);
  render(<DepartmentPage />);
  const atWork = screen.getByRole('heading', { name: /Agents at work/ }).closest('section')!;
  const card = within(atWork).getByRole('article', { name: 'Investor Scout' });
  expect(card.textContent).toMatch(/Claude Opus, then GPT/);
  expect(card.textContent).toMatch(/12 runs today · last 1h ago/);
  const suggested = screen.getByRole('heading', { name: /Suggested agents/ }).closest('section')!;
  expect(within(suggested).queryByRole('article', { name: 'Investor Scout' })).toBeNull();
  // Investors has no CMS tools yet, so no Tools section.
  expect(screen.queryByRole('heading', { name: 'Tools' })).toBeNull();
});

it('is not a page for a department with its own page, or for an unknown one', () => {
  for (const path of ['/hq/content', '/hq/games', '/hq/nonsense']) {
    h.pathname = path;
    expect(() => render(<DepartmentPage />)).toThrow('NOT_FOUND');
    cleanup();
  }
});

it('lists every agent in the company by department, with the subscriptions they run on', () => {
  h.overview = overview([agent('question-maker', 'Question Maker'), agent('game-planner', 'Game Planner', { status: 'paused' })]);
  render(<AgentsPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Agents');
  expect(screen.getByText('Claude Ultra')).toBeTruthy();
  const games = screen.getByRole('region', { name: 'Games agents' });
  expect(within(games).getByText('1 at work · 4 suggested')).toBeTruthy();
  expect(within(within(games).getByRole('article', { name: 'Game Planner' })).getByText('Paused')).toBeTruthy();
  expect(within(games).getByRole('link', { name: 'Open Games' }).getAttribute('href')).toBe('/hq/games');
  for (const name of ['Content', 'Competitions', 'Marketing', 'Partners', 'Investors']) expect(screen.getByRole('region', { name: `${name} agents` })).toBeTruthy();
});

it('says so when the agents cannot be loaded, instead of calling running agents suggestions', () => {
  h.overview = undefined;
  h.error = new Error('down');
  render(<AgentsPage />);
  expect(screen.getByRole('alert').textContent).toMatch(/down/);
  expect(screen.queryByRole('article', { name: 'Growth Analyst' })).toBeNull();
  cleanup();
  h.pathname = '/hq/marketing';
  render(<DepartmentPage />);
  expect(screen.getByRole('alert').textContent).toMatch(/down/);
  expect(screen.queryByText('No agent works for this department yet. The ones below are where it could start.')).toBeNull();
  expect(screen.queryByRole('article', { name: 'Growth Analyst' })).toBeNull();
});

it('shows every agent as paused while the pause switch is on', () => {
  h.pathname = '/hq/investors';
  h.overview = { ...overview([agent('investor-scout', 'Investor Scout')]), settings: { paused: true, pausedReason: 'x', maxConcurrentRuns: 5, dailyRunLimit: 100000, updatedAt: null } };
  render(<DepartmentPage />);
  const card = screen.getByRole('article', { name: 'Investor Scout' });
  expect(within(card).getByText('Paused')).toBeTruthy();
  expect(within(card).queryByText('Running')).toBeNull();
  cleanup();
  render(<AgentsPage />);
  expect(within(screen.getByRole('region', { name: 'Investors agents' })).getByText('1 paused · 4 suggested')).toBeTruthy();
});

it('puts a running agent in the department it was suggested for', async () => {
  const { departmentOfAgent, agentsOf } = await import('@/lib/hq-agents');
  expect(departmentOfAgent('game-scout')).toBe('games');
  expect(departmentOfAgent('partner-reporter')).toBe('partners');
  expect(departmentOfAgent('pitch-coach')).toBe('investors');
  expect(departmentOfAgent('game-planner')).toBe('games');
  expect(departmentOfAgent('question-maker')).toBe('content');
  expect(agentsOf('partners', [{ slug: 'partner-reporter' } as never]).running).toHaveLength(1);
  expect(agentsOf('content', [{ slug: 'partner-reporter' } as never]).running).toHaveLength(0);
});

it('names the AI an agent runs on without the version', () => {
  expect(modelName('claude-opus-5-5')).toBe('Claude Opus');
  expect(modelName('claude-sonnet-5-5')).toBe('Claude Sonnet');
  expect(modelName('gpt-6.1-sol')).toBe('GPT');
  expect(modelName('other')).toBe('other');
});
