import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HarnessOverview, HarnessShowPack, HarnessShowQuestion } from '@/types';

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
  swapShowMutate: vi.fn(),
  newShowMutate: vi.fn(),
  approveShowMutate: vi.fn(),
  showChanging: false,
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
  useSwapShowQuestion: () => ({ mutate: h.swapShowMutate, isPending: false }),
  useNewShowPack: () => ({ mutate: h.newShowMutate, isPending: false }),
  useApproveShowPack: () => ({ mutate: h.approveShowMutate, isPending: false }),
  useShowPackChanging: () => h.showChanging,
  useCreateHarnessIdea: () => ({ mutate: vi.fn(), isPending: false }),
  useScoutHarnessIdeas: () => ({ mutate: vi.fn(), isPending: false }),
  useAcceptHarnessIdea: () => ({ mutate: vi.fn(), isPending: false }),
  useRefuseHarnessIdea: () => ({ mutate: vi.fn(), isPending: false }),
  useHqClock: () => new Date('2026-11-26T18:00:00Z'),
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
    show: { eventDate: '2027-01-04', episode: 307, showAt: '2027-01-04T18:00:00.000Z', loaded: false, loadedIsThisPack: false, pack: null },
    runway: [
      { key: 'dato-falso', label: 'Dato Falso', storedThrough: '2026-12-05', calendarEnds: '2026-12-05', endsOn: '2026-12-05', daysLeft: 9, limitedBy: 'both' },
      { key: 'buscaminas', label: 'Minesweeper', storedThrough: '2027-02-22', calendarEnds: null, endsOn: '2027-02-22', daysLeft: 88, limitedBy: 'content' },
    ],
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

/** Opens one of the Content tab's sections. */
const open = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));

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
  open('Library');
  const table = screen.getByText('Full in').closest('table')!;
  const names = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
  expect(names[0]).toContain('AC Milan');
  expect(names[1]).toContain('Manchester United');
  expect(screen.getByText('About 52 days')).toBeTruthy(); // 103 not yet live at 2 a day
  expect(screen.getByText('more 90s')).toBeTruthy();
});

it('holds a category from its priority switch', () => {
  render(<HqContentPage />);
  open('Library');
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
  open('In progress');
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

it('keeps the technical view in its own tab, and shows the agents as a team', () => {
  render(<HqContentPage />);
  expect(screen.queryByText('Fact Checker')).toBeNull();
  open('Agents');
  expect(screen.getByText('Fact Checker')).toBeTruthy();
  expect(screen.getByText('Checking')).toBeTruthy();
  expect(screen.getByText('Working')).toBeTruthy();
  open('Engine room');
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
  expect(screen.getByText(/couldn.t refresh/i)).toBeTruthy();
  open('Library');
  expect(screen.getByText('Manchester United', { selector: 'div' })).toBeTruthy();
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
  open('In progress');
  expect(screen.getByText('El Clásico')).toBeTruthy();
  expect(screen.getByText('Real Madrid, Barcelona · 10 each · by Tato')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /go live/i }));
  expect(h.goLiveMutate).toHaveBeenCalledWith('p1', expect.anything());
});

it('adds an event for the categories picked', () => {
  render(<HqContentPage />);
  open('In progress');
  fireEvent.click(screen.getByRole('button', { name: /add event/i }));
  fireEvent.change(screen.getByLabelText('Event'), { target: { value: 'El Clásico' } });
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-12-14' } });
  fireEvent.change(screen.getByLabelText(/^Categories/), { target: { value: 'real' } });
  fireEvent.click(screen.getByRole('button', { name: '+ Real Madrid' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Add event' }).at(-1)!);
  expect(h.eventMutate).toHaveBeenCalledWith(
    { title: 'El Clásico', happensOn: '2026-12-14', notes: '', categoryIds: ['c9'], perCategory: 10, difficulty: 'mixed', market: 'all' },
    expect.anything()
  );
});

it('keeps a new category from going live until ranked can use it', () => {
  const base = overview();
  h.data = overview({ proposals: [{ ...base.proposals[0], clueChain: 0 }] });
  render(<HqContentPage />);
  open('In progress');
  expect(screen.getByText('Before it can go live, add a clue-chain question under Questions.')).toBeTruthy();
  expect((screen.getByRole('button', { name: /go live/i }) as HTMLButtonElement).disabled).toBe(true);
});

it('shows the games running out of content first, and the rest on request', () => {
  render(<HqContentPage />);
  const runway = screen.getByRole('heading', { name: /^Runway/ }).closest('section')!;
  expect(within(runway).getByText('Dato Falso')).toBeTruthy();
  expect(within(runway).getByText('Running out')).toBeTruthy();
  expect(within(runway).getByText(/Needs more days and its fixed end date lifted/)).toBeTruthy();
  expect(within(runway).queryByText('Minesweeper')).toBeNull();
  fireEvent.click(within(runway).getByRole('button', { name: 'Show all 2' }));
  expect(within(runway).getByText('Minesweeper')).toBeTruthy();
});

it('counts what is urgent on the tabs and opens the full runway', () => {
  render(<HqContentPage />);
  expect(screen.getByRole('tab', { name: /^Runway/ }).textContent).toContain('1'); // one game under 14 days
  expect(screen.getByRole('tab', { name: /^In progress/ }).textContent).toContain('1'); // one open order
  open('Runway');
  expect(screen.getByText('Minesweeper')).toBeTruthy(); // every game, not only the short ones
  expect(screen.queryByText('Just went live')).toBeNull();
});

it('shows every agent as paused while the pause switch is on', () => {
  h.data = overview({ settings: { paused: true, pausedReason: 'maintenance', maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null } });
  render(<HqContentPage />);
  open('Agents');
  expect(screen.queryByText('Working')).toBeNull();
  expect(screen.getByText('Paused')).toBeTruthy();
});

const showQ = (index: number, over: Partial<HarnessShowQuestion> = {}): HarnessShowQuestion => ({
  index, kind: 'true_false', check: 'ok', note: '', prompt: { ka: `კითხვა ${index}`, en: `Statement ${index}` }, image: null, options: [], answer: { ka: 'მცდარია', en: 'False' }, lines: [], ...over,
});
const showPack = (status: HarnessShowPack['status'], questions: HarnessShowQuestion[]): HarnessShowPack => ({
  id: 'sp1', status, approvedBy: status === 'approved' ? 'Tato' : null, updatedAt: '2026-11-26T10:00:00Z',
  counts: { total: questions.length, ok: questions.filter((x) => x.check === 'ok').length, flagged: questions.filter((x) => x.check === 'flagged').length, notChecked: questions.filter((x) => x.check === 'skipped').length, checking: questions.filter((x) => x.check === 'unchecked').length },
  rounds: [{ kind: 'true_false', title: 'თამაში 1 · მართალია თუ მცდარი', cut: { keep_percent: 50 }, questions }],
});
const withShow = (pack: HarnessShowPack | null, over: Partial<HarnessOverview['show']> = {}) =>
  overview({ show: { eventDate: '2027-01-04', episode: 307, showAt: '2027-01-04T18:00:00.000Z', loaded: false, loadedIsThisPack: false, pack, ...over } });

it('says on Today that the show pack is being prepared, and that paused agents prepare none', () => {
  h.data = withShow(null);
  render(<HqContentPage />);
  const card = screen.getByRole('heading', { name: /^Monday show/ }).closest('section')!;
  expect(within(card).getByText(/episode 307 · Monday, 4 January 2027/)).toBeTruthy();
  expect(within(card).getByText(/The agents are preparing one/)).toBeTruthy();
  cleanup();
  h.data = { ...withShow(null), settings: { paused: true, pausedReason: null, maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null } };
  render(<HqContentPage />);
  expect(screen.getByText(/The agents are paused, so none is being prepared/)).toBeTruthy();
});

it('shows a ready pack question by question and lets a person swap one and approve', () => {
  h.data = withShow(showPack('ready', [showQ(0), showQ(1, { check: 'flagged', note: 'The record was broken in 2025.' }), showQ(2, { check: 'skipped', note: 'The checker could not run.' })]));
  render(<HqContentPage />);
  expect(screen.getByRole('tab', { name: /Monday show\s*1/ })).toBeTruthy();
  open('Monday show');
  expect(screen.getByRole('status').textContent).toMatch(/Ready for you: 3 questions, 1 checked, 1 flagged, 1 not checked/);
  expect(screen.getByText(/After this round the top 50% go through/)).toBeTruthy();
  const second = screen.getByRole('article', { name: 'Question 2' });
  expect(within(second).getByText('Flagged')).toBeTruthy();
  expect(within(second).getByText('The record was broken in 2025.')).toBeTruthy();
  expect(within(second).getByText('მცდარია')).toBeTruthy();
  fireEvent.click(within(second).getByRole('button', { name: 'Swap question 2' }));
  expect(h.swapShowMutate).toHaveBeenCalledWith({ id: 'sp1', index: 1, seen: '2026-11-26T10:00:00Z' }, expect.anything());

  fireEvent.click(screen.getByRole('button', { name: 'Approve and load for the show' }));
  expect(screen.getByText(/2 questions are flagged or not checked: read them first/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Approve and load' }));
  expect(h.approveShowMutate).toHaveBeenCalledWith({ id: 'sp1', seen: '2026-11-26T10:00:00Z' }, expect.anything());
});

it('closes the approval question when the pack changes underneath it', () => {
  h.data = withShow(showPack('ready', [showQ(0)]));
  const view = render(<HqContentPage />);
  open('Monday show');
  fireEvent.click(screen.getByRole('button', { name: 'Approve and load for the show' }));
  expect(screen.getByRole('button', { name: 'Approve and load' })).toBeTruthy();
  h.data = withShow({ ...showPack('ready', [showQ(0, { prompt: { ka: 'სხვა კითხვა' } })]), updatedAt: '2026-11-26T10:05:00Z' });
  view.rerender(<HqContentPage />);
  expect(screen.queryByRole('button', { name: 'Approve and load' })).toBeNull();
});

it('does not let anyone approve or swap while the checker is still working', () => {
  h.data = withShow(showPack('checking', [showQ(0), showQ(1, { check: 'unchecked' })]));
  render(<HqContentPage />);
  open('Monday show');
  expect(screen.getByRole('status').textContent).toMatch(/The checker is verifying 1 of 2 questions/);
  expect((screen.getByRole('button', { name: 'Approve and load for the show' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /Swap question/ })).toBeNull();
  expect(within(screen.getByRole('article', { name: 'Question 2' })).getByText('Being checked')).toBeTruthy();
});

it('shows an approved pack as loaded, warns when another pack was loaded by hand, and can ask for a new pack before approval', () => {
  h.data = withShow(showPack('approved', [showQ(0)]), { loaded: true, loadedIsThisPack: true });
  render(<HqContentPage />);
  open('Monday show');
  expect(screen.getByRole('status').textContent).toMatch(/Approved by Tato and loaded for the show/);
  expect(screen.queryByRole('button', { name: 'Approve and load for the show' })).toBeNull();
  expect(screen.queryByRole('button', { name: /New pack/ })).toBeNull();
  cleanup();
  h.data = withShow(showPack('approved', [showQ(0)]), { loaded: true, loadedIsThisPack: false });
  render(<HqContentPage />);
  open('Monday show');
  expect(screen.getByRole('status').textContent).toMatch(/a different one/);
  cleanup();
  h.data = withShow(showPack('ready', [showQ(0)]));
  render(<HqContentPage />);
  open('Monday show');
  fireEvent.click(screen.getByRole('button', { name: /New pack/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Build a new pack' }));
  expect(h.newShowMutate).toHaveBeenCalledWith('sp1', expect.anything());
});

it('locks every show pack button while a change is on its way, and still opens when the backend has no show yet', () => {
  h.showChanging = true;
  h.data = withShow(showPack('ready', [showQ(0)]));
  render(<HqContentPage />);
  open('Monday show');
  expect((screen.getByRole('button', { name: 'Approve and load for the show' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /New pack/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /Swap question/ })).toBeNull();
  h.showChanging = false;
  cleanup();
  h.data = { ...overview(), show: undefined };
  render(<HqContentPage />);
  expect(screen.getByRole('heading', { name: /^Runway/ })).toBeTruthy();
  open('Monday show');
  expect(screen.getByText('The Monday show is not available yet.')).toBeTruthy();
});

const seat = (id: string, over: Partial<HarnessOverview['accounts'][number]> = {}): HarnessOverview['accounts'][number] => ({
  id, provider: 'claude', label: id, secretRef: 'X', status: 'active', reservedForPeople: false, softPct: 90, state: 'ok', blockedUntil: null, windows: {}, lastError: null, maxParallel: 2, running: 0, runsToday: 0, ...over,
});

it('shows each subscription: working, free, or used up and until when', () => {
  h.data = {
    ...overview(),
    queue: { running: 2, ready: 5, waiting: 0, nextAt: null, dailyLimitReached: false },
    accounts: [
      seat('Ultra', { running: 2, maxParallel: 3, runsToday: 40, windows: { five_hour: { status: 'allowed', utilization: 0.42, resets_at: '2026-11-26T20:00:00Z' } } }),
      seat('Premium 1', { state: 'limit', blockedUntil: '2026-11-26T20:00:00Z' }),
      seat('Premium 2'),
      seat('Codex', { provider: 'codex', state: 'auth', blockedUntil: '2026-11-26T18:20:00Z' }),
    ],
  };
  render(<HqContentPage />);
  expect(screen.getByText('Agents working')).toBeTruthy();
  expect(screen.getByText('2 running now on 1 subscription, 5 jobs next in line.')).toBeTruthy();
  open('Agents');
  const subs = screen.getByRole('heading', { name: /^Subscriptions/ }).closest('section')!;
  expect(within(subs).getByText('Working: 2 of 3 at once')).toBeTruthy();
  expect(within(subs).getByText('Used up until Fri 00:00')).toBeTruthy();
  expect(within(subs).getByText('Free')).toBeTruthy();
  expect(within(subs).getByText('Needs a new login')).toBeTruthy();
  expect(within(subs).getByText(/42% used · resets Fri 00:00/)).toBeTruthy();
});

it('says why the agents are quiet: every subscription used up, the daily limit, or nothing to do', () => {
  const used = [seat('Ultra', { state: 'limit', blockedUntil: '2026-11-27T02:00:00Z' }), seat('Premium 1', { state: 'limit', blockedUntil: '2026-11-26T20:00:00Z' })];
  h.data = { ...overview(), accounts: used, queue: { running: 0, ready: 12, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('Agents waiting')).toBeTruthy();
  expect(screen.getByText('Every subscription is used up. The first one is back Fri 00:00. 12 jobs waiting.')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Ultra')], queue: { running: 0, ready: 12, waiting: 0, nextAt: null, dailyLimitReached: true } };
  render(<HqContentPage />);
  expect(screen.getByText('Agents stopped for today')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Ultra')], queue: { running: 0, ready: 0, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  // Questions are still missing: the queue is only empty between two planning rounds.
  expect(screen.getByText('Between rounds')).toBeTruthy();
  cleanup();
  const full = overview();
  h.data = { ...full, classic: { ...full.classic, totalShortage: 0, shortCategories: 0 }, accounts: [seat('Ultra')], queue: { running: 0, ready: 0, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('Nothing to do right now')).toBeTruthy();
});

it('lists what was taken out of the show pack and why', () => {
  h.data = withShow({ ...showPack('ready', [showQ(0)]), removed: [{ kind: 'true_false', by: 'checker', note: 'The record was broken in 2026.', text: { ka: 'ძველი კითხვა', en: 'Old statement' }, at: null }] });
  render(<HqContentPage />);
  open('Monday show');
  expect(screen.getByText('Taken out of this pack (1)')).toBeTruthy();
  expect(screen.getByText('ძველი კითხვა')).toBeTruthy();
  expect(screen.getByText('The record was broken in 2026.')).toBeTruthy();
});

it('keeps the status honest in the awkward cases: put-off jobs, logins, a limit reached mid-run, a seat that ran out while running', () => {
  const used = [seat('Ultra', { state: 'limit', blockedUntil: '2026-11-27T02:00:00Z' })];
  h.data = { ...overview(), accounts: used, queue: { running: 0, ready: 0, waiting: 9, nextAt: '2026-11-27T02:00:00Z', dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('Every subscription is used up. The first one is back Fri 06:00. 9 jobs waiting.')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Codex', { state: 'auth', blockedUntil: '2026-11-26T18:20:00Z' })], queue: { running: 0, ready: 4, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('Agents cannot work')).toBeTruthy();
  expect(screen.getByText('Every subscription needs a new login on the worker. 4 jobs waiting.')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Ultra', { running: 2 })], queue: { running: 2, ready: 3, waiting: 0, nextAt: null, dailyLimitReached: true } };
  render(<HqContentPage />);
  expect(screen.getByText('Agents finishing for today')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Ultra', { running: 1, state: 'limit', blockedUntil: '2026-11-27T02:00:00Z' }), seat('Premium 1')], queue: { running: 1, ready: 0, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('1 running now on 1 subscription.')).toBeTruthy();
  open('Agents');
  expect(screen.getByText(/1 still finishing/)).toBeTruthy();
});

it('never calls a seat with a rejected login free, and says so when no subscription is switched on', () => {
  h.data = { ...overview(), accounts: [seat('Codex', { provider: 'codex', state: 'auth', blockedUntil: null })], queue: { running: 0, ready: 4, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('Agents cannot work')).toBeTruthy();
  open('Agents');
  expect(screen.getByText('Needs a new login')).toBeTruthy();
  cleanup();
  h.data = { ...overview(), accounts: [seat('Old', { status: 'disabled' })], queue: { running: 0, ready: 4, waiting: 0, nextAt: null, dailyLimitReached: false } };
  render(<HqContentPage />);
  expect(screen.getByText('No subscription is switched on for the agents. 4 jobs waiting.')).toBeTruthy();
});
