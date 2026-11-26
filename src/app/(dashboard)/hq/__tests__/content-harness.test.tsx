import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HarnessOverview } from '@/types';

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  error: null as unknown,
  settingsMutate: vi.fn(),
  policyMutate: vi.fn(),
  steeringMutate: vi.fn(),
  directionMutate: vi.fn(),
  requestMutate: vi.fn(),
  cancelMutate: vi.fn(),
  itemMutate: vi.fn(),
  eventMutate: vi.fn(),
  cancelEventMutate: vi.fn(),
  proposalMutate: vi.fn(),
  goLiveMutate: vi.fn(),
  cancelProposalMutate: vi.fn(),
  askMutate: vi.fn(),
  applyAskMutate: vi.fn(),
  dismissAskMutate: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/content', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.data, error: h.error, isLoading: false, refetch: vi.fn() }),
  useUpdateHarnessSettings: () => ({ mutate: h.settingsMutate, isPending: false }),
  useSetHarnessPolicy: () => ({ mutate: h.policyMutate, isPending: false }),
  useSetHarnessSteering: () => ({ mutate: h.steeringMutate, isPending: false }),
  useSetHarnessDirection: () => ({ mutate: h.directionMutate, isPending: false }),
  useCreateHarnessRequest: () => ({ mutate: h.requestMutate, isPending: false }),
  useCancelHarnessRequest: () => ({ mutate: h.cancelMutate, isPending: false }),
  useHarnessItemAction: () => ({ mutate: h.itemMutate, isPending: false }),
  useCreateHarnessEvent: () => ({ mutate: h.eventMutate, isPending: false }),
  useCancelHarnessEvent: () => ({ mutate: h.cancelEventMutate, isPending: false }),
  useCreateHarnessProposal: () => ({ mutate: h.proposalMutate, isPending: false }),
  useHarnessProposalGoLive: () => ({ mutate: h.goLiveMutate, isPending: false }),
  useCancelHarnessProposal: () => ({ mutate: h.cancelProposalMutate, isPending: false }),
  useCreateHarnessAsk: () => ({ mutate: h.askMutate, isPending: false }),
  useApplyHarnessAsk: () => ({ mutate: h.applyAskMutate, isPending: false }),
  useDismissHarnessAsk: () => ({ mutate: h.dismissAskMutate, isPending: false }),
}));

const { default: HqContentPage } = await import('../content/page');

const q = (en: string) => ({
  prompt: { en, ka: `${en} (ka)` },
  options: [
    { text: { en: 'Leeds United' }, correct: true },
    { text: { en: 'Arsenal' }, correct: false },
  ],
  explanation: {},
});

function overview(over: Partial<HarnessOverview> = {}): HarnessOverview {
  return {
    settings: { paused: false, pausedReason: null, maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null },
    today: { runs: 12, costCents: 340, failed: 1, live: 7 },
    direction: '',
    allCategories: [{ id: 'c1', name: 'Manchester United' }, { id: 'c9', name: 'Real Madrid' }],
    contentEvents: [{ id: 'e1', title: 'El Clásico', happensOn: '2026-12-14', notes: '', categories: ['Real Madrid', 'Barcelona'], perCategory: 10, difficulty: 'mixed', status: 'open', createdBy: 'Tato', live: 5, working: 7, dropped: 0 }],
    proposals: [{ id: 'p1', name: 'Inter Miami', why: 'the Messi era', target: 30, status: 'filling', proposedBy: 'Tato', inGame: false, live: 31, working: 0, putInOrder: 1, clueChain: 1, specialsRequired: true, createdAt: null }],
    asks: [
      {
        id: 'a1', message: 'focus on Spanish clubs', askedBy: 'Tato', status: 'answered', reply: 'Boosting Real Madrid and ordering El Clásico questions.',
        actions: [
          { valid: true, summary: 'Boost: Real Madrid', action: {} },
          { valid: true, summary: 'Order 10 medium questions for Real Madrid: El Clásico history', action: {} },
          { valid: false, summary: 'An action that could not be read', action: {} },
        ],
        applied: [], error: null, appliedBy: null, createdAt: new Date().toISOString(),
      },
    ],
    classic: {
      viewCap: 100,
      shortCategories: 2,
      totalShortage: 113,
      categories: [
        { categoryId: 'c2', slug: 'world-cup', name: 'World Cup', views30d: 10046, pool: 921, inPipeline: 0, needed: 101, shortage: 0, priority: 'normal', direction: '', liveLast7d: 0 },
        { categoryId: 'c1', slug: 'manchester-united', name: 'Manchester United', views30d: 12129, pool: 19, inPipeline: 8, needed: 122, shortage: 103, priority: 'normal', direction: '', liveLast7d: 14 },
        { categoryId: 'c3', slug: 'milan', name: 'AC Milan', views30d: 3000, pool: 20, inPipeline: 0, needed: 30, shortage: 10, priority: 'boost', direction: 'more 90s', liveLast7d: 0 },
      ],
    },
    stages: [
      { mode: 'classic', stage: 'draft', count: 3 },
      { mode: 'classic', stage: 'validated', count: 56 },
      { mode: 'classic', stage: 'verified', count: 2 },
      { mode: 'classic', stage: 'localized', count: 1 },
      { mode: 'classic', stage: 'escalated', count: 41 },
    ],
    jobs: [{ kind: 'make', status: 'running', count: 2 }],
    accounts: [
      { id: 'claude-premium-1', provider: 'claude', label: 'Claude premium seat 1', secretRef: 'HARNESS_CLAUDE_PREMIUM_1_TOKEN', status: 'active', reservedForPeople: false, softPct: 90, state: 'ok', blockedUntil: null, windows: { five_hour: { status: 'allowed', utilization: 0.42, resets_at: null } }, lastError: null },
    ],
    agents: [
      { slug: 'fact-checker', name: 'Fact Checker', team: 'checking', description: 'Checks every claim.', provider: 'codex', model: 'gpt-6.1-sol', effort: 'high', primaryAccount: 'codex-1', fallbackAccounts: [], status: 'active', runsToday: 5, costCentsToday: 0, lastRunAt: null },
    ],
    runs: [],
    events: [
      { id: '1', type: 'item_stage', level: 'info', message: 'approved -> live', itemId: 'i1', category: 'Manchester United', prompt: 'Who scored in 1999?', createdAt: '2026-11-25T12:00:00Z' },
      { id: '2', type: 'worker', level: 'info', message: 'worker w1 started', itemId: null, createdAt: '2026-11-25T12:00:00Z' },
    ],
    policies: [{ key: 'classic.release_status', value: 'published', note: '', editable: true, updatedAt: null }],
    needsYou: [{ id: 'i9', version: 6, category: 'Manchester United', difficulty: 'hard', question: q('From which club did Cantona join?'), issues: ['the year is wrong'], updatedAt: null }],
    recentLive: [{ id: 'i5', version: 9, category: 'Liverpool', difficulty: 'easy', question: q('Who won in Istanbul?'), questionId: 'q5', releasedAt: null }],
    requests: [{ id: 'b1', category: 'Real Madrid', difficulty: 'hard', count: 20, topic: 'Champions League finals', deadline: '2026-12-10', requestedBy: 'Tato', status: 'open', live: 4, working: 9, dropped: 1, createdAt: null }],
    ...over,
  };
}

beforeEach(() => {
  h.data = overview();
  h.error = null;
  for (const f of Object.values(h)) if (typeof f === 'function' && 'mockReset' in f) (f as ReturnType<typeof vi.fn>).mockReset();
});
afterEach(cleanup);

it('says in one line what happened today and what needs a person', () => {
  render(<HqContentPage />);
  expect(screen.getByText('Agents working')).toBeTruthy();
  expect(screen.getByText('new questions in ranked today').parentElement?.textContent).toContain('7');
  // every stuck question counts, not only the 30 listed
  expect(screen.getByText('questions need you').parentElement?.textContent).toContain('41');
});

it('shows the five steps with what is in each', () => {
  render(<HqContentPage />);
  const checking = screen.getByText('2. Checking').parentElement!;
  expect(within(checking).getByText('56', { exact: true })).toBeTruthy();
  const translating = screen.getByText('3. Translating').parentElement!;
  expect(within(translating).getByText('3', { exact: true })).toBeTruthy(); // verified + localized
});

it('lists boosted categories first, by name, with how long until full', () => {
  render(<HqContentPage />);
  const table = screen.getByText('Full in').closest('table')!;
  const names = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
  expect(names[0]).toContain('AC Milan');
  expect(names[1]).toContain('Manchester United');
  expect(screen.getByText('About 52 days')).toBeTruthy(); // 103 not yet live at 2 a day
  expect(screen.getByText('more 90s')).toBeTruthy();
});

it('holds a category from its priority switch', () => {
  render(<HqContentPage />);
  const group = screen.getByRole('group', { name: 'Priority for Manchester United' });
  fireEvent.click(within(group).getByRole('button', { name: 'Hold' }));
  expect(h.steeringMutate).toHaveBeenCalledWith({ categoryId: 'c1', priority: 'hold' }, expect.anything());
});

it('approves a stuck question at the version on screen', () => {
  render(<HqContentPage />);
  expect(screen.getByText('• the year is wrong')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /approve/i }));
  expect(h.itemMutate).toHaveBeenCalledWith({ itemId: 'i9', version: 6, action: 'approve', note: '' }, expect.anything());
});

it('needs a reason before a live question can be flagged', () => {
  render(<HqContentPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Flag this question' }));
  const take = screen.getByRole('button', { name: 'Take it out' }) as HTMLButtonElement;
  expect(take.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('What is wrong'), { target: { value: 'two answers are right' } });
  fireEvent.click(take);
  expect(h.itemMutate).toHaveBeenCalledWith({ itemId: 'i5', version: 9, action: 'flag', note: 'two answers are right' }, expect.anything());
});

it('shows questions in another language', () => {
  render(<HqContentPage />);
  const live = screen.getByText('Just went live').closest('section')!;
  fireEvent.click(within(live).getByRole('button', { name: 'ka' }));
  expect(within(live).getByText('Who won in Istanbul? (ka)')).toBeTruthy();
});

it('shows orders with their progress and can cancel an open one', () => {
  render(<HqContentPage />);
  expect(screen.getByText('Champions League finals')).toBeTruthy();
  expect(screen.getByText(/needed by 2026-12-10/)).toBeTruthy();
  const orders = screen.getByText('Champions League finals').closest('section')!;
  fireEvent.click(within(orders).getByRole('button', { name: 'Cancel' }));
  expect(h.cancelMutate).toHaveBeenCalledWith('b1', expect.anything());
});

it('puts activity in plain words and hides engine noise', () => {
  render(<HqContentPage />);
  expect(screen.getByText('Manchester United: “Who scored in 1999?” — went live in ranked')).toBeTruthy();
  expect(screen.queryByText(/worker w1 started/)).toBeNull();
});

it('keeps the engine room closed until asked', () => {
  render(<HqContentPage />);
  expect(screen.queryByText('Fact Checker')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /engine room/i }));
  expect(screen.getByText('Fact Checker')).toBeTruthy();
  expect(screen.getByText('(waits, no fallback)')).toBeTruthy();
  expect(screen.getByText('five-hour 42%')).toBeTruthy();
});

it('pauses running agents with a reason', () => {
  render(<HqContentPage />);
  fireEvent.click(screen.getByRole('button', { name: /pause agents/i }));
  expect(h.settingsMutate).toHaveBeenCalledWith({ paused: true, pausedReason: 'Paused from the CMS' }, expect.anything());
});

it('shows a load error with a retry', () => {
  h.data = undefined;
  h.error = new Error('down');
  render(<HqContentPage />);
  expect(screen.getByRole('button', { name: /retry|try again/i })).toBeTruthy();
});

it('keeps the data but warns when a refresh fails', () => {
  h.error = new Error('down');
  render(<HqContentPage />);
  expect(screen.getByText('Manchester United', { selector: 'div' })).toBeTruthy();
  expect(screen.getByText(/couldn.t refresh/i)).toBeTruthy();
});

it('lets the team apply only the Assistant proposals they tick', () => {
  render(<HqContentPage />);
  expect(screen.getByText('Boosting Real Madrid and ordering El Clásico questions.')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Order 10 medium questions for Real Madrid: El Clásico history'));
  fireEvent.click(screen.getByRole('button', { name: /apply 1 selected/i }));
  expect(h.applyAskMutate).toHaveBeenCalledWith({ id: 'a1', indexes: [0] }, expect.anything());
});

it('sends a message to the Assistant', () => {
  render(<HqContentPage />);
  fireEvent.change(screen.getByLabelText('Ask HQ'), { target: { value: 'more Georgian league questions' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(h.askMutate).toHaveBeenCalledWith('more Georgian league questions', expect.anything());
});

it('shows events with their progress and new categories ready to go live', () => {
  render(<HqContentPage />);
  expect(screen.getByText('El Clásico')).toBeTruthy();
  expect(screen.getByText('Real Madrid, Barcelona · 10 each · by Tato')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /go live/i }));
  expect(h.goLiveMutate).toHaveBeenCalledWith('p1', expect.anything());
});

it('adds an event for the categories picked', () => {
  render(<HqContentPage />);
  fireEvent.click(screen.getByRole('button', { name: /add event/i }));
  fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'El Clásico' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-14' } });
  fireEvent.change(screen.getByLabelText(/^Categories/), { target: { value: 'real' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Real Madrid' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add event' }).at(-1)!);
  expect(h.eventMutate).toHaveBeenCalledWith(
    { title: 'El Clásico', happensOn: '2026-12-14', notes: '', categoryIds: ['c9'], perCategory: 10, difficulty: 'mixed' },
    expect.anything()
  );
});

it('keeps a new category from going live until ranked can use it', () => {
  const base = overview();
  h.data = overview({ proposals: [{ ...base.proposals[0], clueChain: 0 }] });
  render(<HqContentPage />);
  expect(screen.getByText('Before it can go live, add a clue-chain question under Questions.')).toBeTruthy();
  expect((screen.getByRole('button', { name: /go live/i }) as HTMLButtonElement).disabled).toBe(true);
});
