import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HarnessOverview } from '@/types';

const h = vi.hoisted(() => ({ pathname: '/hq/marketing', overview: undefined as unknown, error: null as unknown, reports: undefined as unknown, reportsError: null as unknown, create: vi.fn(), archive: vi.fn(), setPolicy: vi.fn(), notFound: vi.fn(() => { throw new Error('NOT_FOUND'); }) }));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname, notFound: h.notFound }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: 'admin', email: 'a@quizball.io' } }) }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.overview, error: h.error, isLoading: !h.overview && !h.error, refetch: vi.fn() }),
  useHqClock: () => new Date('2026-11-27T10:00:00Z'),
  useHarnessReports: () => ({ data: h.reports, error: h.reportsError, isLoading: !h.reports && !h.reportsError, refetch: vi.fn() }),
  useCreateReport: () => ({ mutate: h.create, isPending: false }),
  useArchiveReport: () => ({ mutate: h.archive, isPending: false }),
  useSetHarnessPolicy: () => ({ mutate: h.setPolicy, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
  h.reports = undefined;
  h.reportsError = null;
  h.create.mockClear();
  h.archive.mockClear();
  h.setPolicy.mockClear();
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
  // Its own switch is off: listed, but not counted as working.
  expect(within(games).getByText('1 paused · 4 suggested')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Content agents' })).getByText('1 at work · 3 suggested')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Investors agents' })).getByText('0 at work · 5 suggested')).toBeTruthy();
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

it('does not call any agent a suggestion before the running ones are known', () => {
  h.pathname = '/hq/marketing';
  h.overview = undefined;
  render(<DepartmentPage />);
  expect(screen.getByText('Checking which agents are running…')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: /Suggested agents/ })).toBeNull();
});

it('names the AI an agent runs on without the version', () => {
  expect(modelName('claude-opus-5-5')).toBe('Claude Opus');
  expect(modelName('claude-sonnet-5-5')).toBe('Claude Sonnet');
  expect(modelName('gpt-6.1-sol')).toBe('GPT');
  expect(modelName('other')).toBe('other');
});

// ── Reports ──

const WRITERS = [
  { slug: 'growth-analyst', department: 'marketing', every: 'week' },
  { slug: 'investor-update-writer', department: 'investors', every: 'month' },
  { slug: 'investor-scout', department: 'investors', every: 'month' },
];
const report = (n: number, over: Record<string, unknown> = {}) => ({
  id: `r${n}`, number: n, agent: 'investor-scout', agentName: 'Investor Scout', department: 'investors', title: `Report ${n}`, status: 'ready',
  body: { summary: `Summary ${n}.`, sections: [{ heading: 'How I searched', points: ['Portfolio pages of funds that backed quiz apps.'] }], leads: [], questions: [] },
  requestedBy: 'schedule', error: null, createdAt: '2026-11-27T08:00:00Z', updatedAt: '2026-11-27T08:05:00Z', ...over,
});

it('shows a department the reports its agents wrote, and opens one to read', () => {
  h.pathname = '/hq/investors';
  h.overview = overview([]);
  h.reports = {
    agents: WRITERS, profile: 'QuizBall is a football trivia game.',
    items: [
      report(7, {
        title: 'Investors worth approaching',
        body: {
          summary: 'Twelve investors who backed games like ours.',
          sections: [{ heading: 'How I searched', points: ['Portfolio pages.'] }],
          leads: [
            { name: 'Real Fund', kind: 'fund', where: 'London', why: 'Backed a quiz app at seed.', source: 'https://www.realfund.example/portfolio', reach: 'Apply on their site.' },
            { name: 'Sneaky', kind: 'angel', where: '', why: 'x', source: 'javascript:alert(1)', reach: '' },
          ],
          questions: ['What stage is the company at?'],
        },
      }),
      report(6, { agent: 'growth-analyst', agentName: 'Growth Analyst', department: 'marketing', title: 'Growth read' }),
    ],
  };
  render(<DepartmentPage />);
  const section = screen.getByRole('heading', { name: /From the agents/ }).closest('section')!;
  // Only this department's reports, and a button for each of its writers.
  expect(within(section).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Investors worth approaching']);
  expect(within(section).getByRole('button', { name: 'New investor update draft' })).toBeTruthy();
  expect(within(section).getByRole('button', { name: 'New investor list' })).toBeTruthy();
  expect(within(section).queryByRole('button', { name: 'New growth read' })).toBeNull();
  const card = within(section).getByRole('article', { name: 'Investors worth approaching' });
  expect(card.textContent).toMatch(/Report 7 · Investor Scout · 2h ago/);
  expect(within(card).getByText('Twelve investors who backed games like ours.')).toBeTruthy();
  expect(within(card).queryByText('Real Fund')).toBeNull();
  fireEvent.click(within(card).getByRole('button', { name: /Read it/ }));
  expect(within(card).getByText('Real Fund')).toBeTruthy();
  const link = within(card).getByRole('link', { name: /realfund\.example/ });
  expect(link.getAttribute('href')).toBe('https://www.realfund.example/portfolio');
  expect(link.getAttribute('rel')).toContain('noopener');
  // A source that is not a web page is never made a link.
  expect(within(card).getAllByRole('link')).toHaveLength(1);
  expect(within(card).getByText('What stage is the company at?')).toBeTruthy();
  expect(within(card).getByText(/check each one before you write to them/)).toBeTruthy();
});

it('asks an agent for a new report, not twice while it is writing, and puts a report away', () => {
  h.pathname = '/hq/investors';
  h.overview = overview([]);
  h.reports = { agents: WRITERS, profile: '', items: [report(9, { status: 'writing', body: null }), report(8, { agent: 'investor-update-writer', agentName: 'Investor Update Writer', status: 'failed', body: null, error: 'no subscription was free' })] };
  render(<DepartmentPage />);
  expect((screen.getByRole('button', { name: 'New investor list' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/Investor Scout is working on it/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New investor update draft' }));
  expect(h.create.mock.calls[0][0]).toBe('investor-update-writer');
  const failed = screen.getByRole('article', { name: 'Report 8' });
  expect(failed.textContent).toMatch(/It could not be finished: no subscription was free/);
  fireEvent.click(within(failed).getByRole('button', { name: /Put away/ }));
  expect(h.archive.mock.calls[0][0]).toBe('r8');
  // A report still being written cannot be put away.
  expect(within(screen.getByRole('article', { name: 'Report 9' })).queryByRole('button', { name: /Put away/ })).toBeNull();
});

it('shows no reports block for a department whose agents write none, and says when reports cannot be loaded', () => {
  h.pathname = '/hq/competitions';
  h.overview = overview([]);
  h.reports = { agents: WRITERS, profile: '', items: [] };
  render(<DepartmentPage />);
  expect(screen.queryByRole('heading', { name: /From the agents/ })).toBeNull();
  cleanup();
  h.pathname = '/hq/marketing';
  render(<DepartmentPage />);
  expect(screen.getByText('Nothing written yet. The first reports arrive by themselves, or ask for one above.')).toBeTruthy();
  cleanup();
  h.reports = undefined;
  h.reportsError = new Error('reports down');
  render(<DepartmentPage />);
  expect(screen.getByText('reports down')).toBeTruthy();
});

it('lets an owner correct what the agents are told about the company', () => {
  h.overview = overview([]);
  h.reports = { agents: WRITERS, profile: 'QuizBall is a football trivia game on the web.', items: [] };
  render(<AgentsPage />);
  const box = screen.getByLabelText('About the company') as HTMLTextAreaElement;
  expect(box.value).toBe('QuizBall is a football trivia game on the web.');
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.change(box, { target: { value: 'short' } });
  expect(save.disabled).toBe(true);
  expect(screen.getByText('Too short to save')).toBeTruthy();
  fireEvent.change(box, { target: { value: '  QuizBall is a football trivia game. We are at pre-seed.  ' } });
  expect(save.disabled).toBe(false);
  fireEvent.click(save);
  expect(h.setPolicy.mock.calls[0][0]).toEqual({ key: 'company.profile', value: 'QuizBall is a football trivia game. We are at pre-seed.' });
  fireEvent.click(screen.getByRole('button', { name: 'Undo changes' }));
  expect(box.value).toBe('QuizBall is a football trivia game on the web.');
});

it('only ever links to a real web page', async () => {
  const { safeLink } = await import('../reports');
  expect(safeLink('https://fund.example/portfolio')).toBe('https://fund.example/portfolio');
  expect(safeLink('http://fund.example')).toBe('http://fund.example/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'their website', '', 'ftp://x.example']) expect(safeLink(bad)).toBeNull();
});
