import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HarnessIdea, HarnessOverview } from '@/types';

// The Content page narrowed to one market, and the Ideas tab.

const h = vi.hoisted(() => ({
  data: undefined as unknown,
  query: '',
  replace: vi.fn(),
  steeringMutate: vi.fn(),
  eventMutate: vi.fn(),
  proposalMutate: vi.fn(),
  ideaMutate: vi.fn(),
  scoutMutate: vi.fn(),
  acceptMutate: vi.fn(),
  refuseMutate: vi.fn(),
}));
const idle = (mutate: unknown = vi.fn()) => ({ mutate, isPending: false });
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/content', useRouter: () => ({ replace: h.replace }), useSearchParams: () => new URLSearchParams(h.query) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.data, error: null, isLoading: false, refetch: vi.fn() }),
  useUpdateHarnessSettings: () => idle(),
  useSetHarnessPolicy: () => idle(),
  useSetHarnessSteering: () => idle(h.steeringMutate),
  useSetHarnessDirection: () => idle(),
  useCreateHarnessRequest: () => idle(),
  useCancelHarnessRequest: () => idle(),
  useHarnessItemAction: () => idle(),
  useCreateHarnessEvent: () => idle(h.eventMutate),
  useCancelHarnessEvent: () => idle(),
  useCreateHarnessProposal: () => idle(h.proposalMutate),
  useHarnessProposalGoLive: () => idle(),
  useCancelHarnessProposal: () => idle(),
  useCreateHarnessAsk: () => idle(),
  useApplyHarnessAsk: () => idle(),
  useDismissHarnessAsk: () => idle(),
  useSwapShowQuestion: () => idle(),
  useNewShowPack: () => idle(),
  useApproveShowPack: () => idle(),
  useShowPackChanging: () => false,
  useCreateHarnessIdea: () => idle(h.ideaMutate),
  useScoutHarnessIdeas: () => idle(h.scoutMutate),
  useAcceptHarnessIdea: () => idle(h.acceptMutate),
  useRefuseHarnessIdea: () => idle(h.refuseMutate),
  useHqClock: () => new Date('2026-11-27T10:00:00Z'),
}));

const { default: HqContentPage } = await import('../content/page');
const { inScope, isMarket } = await import('../content/markets');
const { waitingByMarket, waitingIdeas } = await import('../content/ideas');

const cat = (id: string, name: string, market: string | undefined, shortage: number) =>
  ({ categoryId: id, slug: id, name, views30d: 1000, pool: 20, inPipeline: 0, needed: 20 + shortage, shortage, priority: 'normal', direction: '', liveLast7d: 0, market }) as HarnessOverview['classic']['categories'][number];

const idea = (over: Partial<HarnessIdea> = {}): HarnessIdea => ({
  id: 'i1', number: 1, source: 'agent', agent: 'market-scout', agentName: 'Market Scout', createdBy: null, market: 'ge', kind: 'category',
  title: 'Give Georgia its first category: Dinamo Tbilisi', detail: 'Georgia has no category of its own.', sourceUrl: null, status: 'open', plan: null,
  actions: [{ valid: true, summary: 'Start a new category: Dinamo Tbilisi (30 questions first, hidden from players until you put it live)', action: {} }],
  applied: [], decidedBy: null, refuseReason: null, error: null, createdAt: '2026-11-27T08:00:00Z', updatedAt: '2026-11-27T08:00:00Z', ...over,
});

function overview(over: Partial<HarnessOverview> = {}): HarnessOverview {
  return {
    settings: { paused: false, pausedReason: null, maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null },
    today: { runs: 12, costCents: 0, failed: 0, live: 7 },
    direction: '',
    show: null,
    runway: [],
    allCategories: [{ id: 'c1', name: 'Real Madrid', market: 'es' }],
    markets: [{ key: 'ge', name: 'Georgia' }, { key: 'tr', name: 'Turkey' }, { key: 'ar', name: 'Argentina' }, { key: 'uk', name: 'the UK' }, { key: 'es', name: 'Spain' }],
    ideas: [
      idea(),
      idea({ id: 'i2', number: 2, market: 'es', kind: 'questions', title: 'Fill Real Madrid before the Clasico', sourceUrl: 'https://example.com/fixtures', actions: [{ valid: true, summary: 'Boost: Real Madrid', action: {} }] }),
      idea({ id: 'i3', number: 3, source: 'person', agent: null, agentName: null, createdBy: 'Tato', market: 'es', kind: 'event', title: 'A Copa del Rey week', detail: 'A Copa del Rey week before the quarter-finals', status: 'planning', actions: [] }),
      idea({ id: 'i4', number: 4, market: 'all', kind: 'other', title: 'A store bundle for the final', actions: [] }),
      idea({ id: 'i5', number: 5, market: 'es', status: 'refused', title: 'An old idea', decidedBy: 'Tato', refuseReason: 'Done in October' }),
    ],
    scouting: null,
    contentEvents: [
      { id: 'e1', title: 'El Clásico', happensOn: '2026-12-14', notes: '', categories: ['Real Madrid'], perCategory: 10, difficulty: 'mixed', status: 'open', market: 'es', createdBy: 'Tato', live: 0, working: 3, dropped: 0 },
      { id: 'e2', title: 'Champions League night', happensOn: '2026-12-09', notes: '', categories: ['World Cup'], perCategory: 5, difficulty: 'mixed', status: 'open', market: 'all', createdBy: 'Tato', live: 0, working: 0, dropped: 0 },
    ],
    proposals: [],
    asks: [],
    classic: { viewCap: 100, shortCategories: 2, totalShortage: 50, categories: [cat('c1', 'Real Madrid', 'es', 40), cat('c2', 'World Cup', 'all', 0), cat('c3', 'Liverpool', 'uk', 10), cat('c4', 'Old backend row', undefined, 0)] },
    stages: [], jobs: [], accounts: [], agents: [], runs: [], events: [], policies: [], needsYou: [], recentLive: [],
    requests: [{ id: 'b1', category: 'Real Madrid', difficulty: 'hard', count: 20, topic: 'European Cup finals', deadline: null, requestedBy: 'Tato', status: 'open', market: 'es', live: 0, working: 0, dropped: 0, createdAt: null }],
    ...over,
  } as HarnessOverview;
}

const open = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }));

beforeEach(() => {
  h.data = overview();
  h.query = '';
  for (const f of Object.values(h)) if (typeof f === 'function') (f as ReturnType<typeof vi.fn>).mockReset();
});
afterEach(cleanup);

it('decides what shows under a market', () => {
  expect(inScope({ market: 'all', withEveryone: false }, 'ge')).toBe(true);
  expect(inScope({ market: 'ge', withEveryone: false }, 'ge')).toBe(true);
  expect(inScope({ market: 'ge', withEveryone: false }, 'all')).toBe(false);
  expect(inScope({ market: 'ge', withEveryone: true }, 'all')).toBe(true);
  expect(inScope({ market: 'ge', withEveryone: true }, 'es')).toBe(false);
  // An older backend sends no market: that is "for everyone".
  expect(inScope({ market: 'ge', withEveryone: true }, undefined)).toBe(true);
  expect(isMarket('ar')).toBe(true);
  expect(isMarket('fr')).toBe(false);
});

it('counts the ideas that wait for an answer, per market', () => {
  const all = overview().ideas;
  expect(waitingByMarket(all)).toEqual({ ge: 1, es: 1, all: 1 });
  expect(waitingIdeas(all, { market: 'es', withEveryone: false }).map((i) => i.id)).toEqual(['i2']);
  expect(waitingIdeas(all, { market: 'es', withEveryone: true }).map((i) => i.id)).toEqual(['i2', 'i4']);
  expect(waitingIdeas(undefined, { market: 'all', withEveryone: false })).toEqual([]);
});

it('offers every market, and picking one goes into the address', () => {
  render(<HqContentPage />);
  const group = screen.getByRole('group', { name: 'Market' });
  expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['All markets3', 'Georgia1', 'Turkey', 'Argentina', 'UK', 'Spain1']);
  fireEvent.click(within(group).getByRole('button', { name: /^Spain/ }));
  expect(h.replace).toHaveBeenCalledWith('/hq/content?market=es');
  // With no market picked, everything shows and nothing claims to be local.
  expect(screen.queryByText(/Players everywhere still see it/)).toBeNull();
});

it('keeps the market when the tab changes', () => {
  h.query = 'market=es';
  render(<HqContentPage />);
  open('Library');
  expect(h.replace).toHaveBeenCalledWith('/hq/content?tab=library&market=es');
});

it('shows only what is made for the market, says the truth about it, and can add what is for everyone', () => {
  h.query = 'tab=library&market=es';
  render(<HqContentPage />);
  expect(screen.getByText('Categories made for Spain')).toBeTruthy();
  expect(screen.getByText('Real Madrid')).toBeTruthy();
  expect(screen.queryByText('Liverpool')).toBeNull();
  expect(screen.queryByText('World Cup')).toBeNull();
  expect(screen.getByText(/Players everywhere still see it/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Also show what is for everyone'));
  expect(screen.getByText('World Cup')).toBeTruthy();
  expect(screen.getByText('Old backend row')).toBeTruthy();
  expect(screen.queryByText('Liverpool')).toBeNull();
});

it('says so when a market has nothing of its own, and points to Ideas', () => {
  h.query = 'tab=library&market=tr';
  render(<HqContentPage />);
  expect(screen.getByText(/Nothing is made for Turkey yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Suggest its first category' }));
  expect(h.replace).toHaveBeenCalledWith('/hq/content?tab=ideas&market=tr');
});

it('sums up a market on Today', () => {
  h.query = 'market=es';
  render(<HqContentPage />);
  const card = screen.getByRole('heading', { name: 'Spain' }).closest('div')!.parentElement!;
  expect(card.textContent).toContain('1 category of its own');
  expect(card.textContent).toContain('40 questions short in them');
  expect(card.textContent).toContain('1 event coming');
  expect(card.textContent).toContain('1 idea waiting');
  expect(card.textContent).toContain('Emptiest: Real Madrid (20 of 60)');
  fireEvent.click(screen.getByRole('button', { name: 'Launch something for Spain' }));
  expect(h.replace).toHaveBeenCalledWith('/hq/content?tab=ideas&market=es');
});

it('narrows orders and events too, and a new event is marked for the market', () => {
  h.query = 'tab=plans&market=es';
  render(<HqContentPage />);
  expect(screen.getByText('European Cup finals')).toBeTruthy();
  expect(screen.getByText('El Clásico')).toBeTruthy();
  expect(screen.queryByText('Champions League night')).toBeNull();
  cleanup();
  h.query = 'tab=plans&market=ge';
  render(<HqContentPage />);
  expect(screen.getByText(/No events for Georgia yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Suggest a category/ }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dinamo Tbilisi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create and fill' }));
  expect(h.proposalMutate.mock.calls[0]![0]).toEqual({ name: 'Dinamo Tbilisi', why: '', target: 30, market: 'ge' });
});

it('moves a category to another market from the Library', () => {
  h.query = 'tab=library';
  render(<HqContentPage />);
  expect(screen.getByLabelText('Market for Real Madrid').textContent).toContain('Spain');
  expect(screen.getByLabelText('Market for World Cup').textContent).toContain('Everyone');
});

it('lists the ideas that wait, with what accepting does, and accepts one', () => {
  h.query = 'tab=ideas';
  render(<HqContentPage />);
  expect(screen.getByRole('tab', { name: /^Ideas/ }).textContent).toBe('Ideas3');
  const card = screen.getByText('Give Georgia its first category: Dinamo Tbilisi').closest('.hq-card') as HTMLElement;
  expect(within(card).getByText('For Georgia')).toBeTruthy();
  expect(within(card).getByText(/Start a new category: Dinamo Tbilisi/)).toBeTruthy();
  fireEvent.click(within(card).getByRole('button', { name: 'Accept' }));
  expect(h.acceptMutate.mock.calls[0]![0]).toBe('i1');
  // An idea HQ cannot do by itself is kept, not "accepted".
  const other = screen.getByText('A store bundle for the final').closest('.hq-card') as HTMLElement;
  expect(within(other).getByText(/HQ cannot do this one by itself/)).toBeTruthy();
  expect(within(other).getByRole('button', { name: 'Keep on the list' })).toBeTruthy();
  // Only a real address becomes a link.
  expect(screen.getByRole('link', { name: /The page behind it/ }).getAttribute('href')).toBe('https://example.com/fixtures');
});

it('refuses with a reason the scout will read', () => {
  h.query = 'tab=ideas&market=es';
  render(<HqContentPage />);
  const card = screen.getByText('Fill Real Madrid before the Clasico').closest('.hq-card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Refuse' }));
  fireEvent.change(within(card).getByLabelText(/Why not/), { target: { value: ' We did this in October ' } });
  fireEvent.click(within(card).getByRole('button', { name: 'Refuse it' }));
  expect(h.refuseMutate.mock.calls[0]![0]).toEqual({ id: 'i2', reason: 'We did this in October' });
  // Georgia's idea is not shown under Spain; the refused one is, under "Decided lately".
  expect(screen.queryByText('Give Georgia its first category: Dinamo Tbilisi')).toBeNull();
  expect(screen.getByText(/Done in October/)).toBeTruthy();
});

it('sends a person\'s own idea for the market being worked on, and shows it while the plan is made', () => {
  h.query = 'tab=ideas&market=es';
  render(<HqContentPage />);
  const send = screen.getByRole('button', { name: 'Send to the agents' }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('What do you want to launch?'), { target: { value: 'A week of Copa del Rey classics' } });
  expect(send.disabled).toBe(false);
  fireEvent.click(send);
  expect(h.ideaMutate.mock.calls[0]![0]).toEqual({ text: 'A week of Copa del Rey classics', market: 'es', kind: 'category' });
  expect(screen.getByText("Tato's idea")).toBeTruthy();
  expect(screen.getByText('The HQ Assistant is preparing a plan…')).toBeTruthy();
});

it('asks the scout for the market being worked on, once at a time', () => {
  h.query = 'tab=ideas&market=ge';
  render(<HqContentPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask for ideas for Georgia' }));
  expect(h.scoutMutate.mock.calls[0]![0]).toBe('ge');
  cleanup();
  h.data = overview({ scouting: { market: 'ge' } });
  render(<HqContentPage />);
  expect((screen.getByRole('button', { name: /The scout is looking/ }) as HTMLButtonElement).disabled).toBe(true);
});

it('still renders against a backend that knows nothing about markets or ideas', () => {
  const old: Partial<HarnessOverview> = overview();
  delete old.markets;
  delete old.ideas;
  delete old.scouting;
  h.data = old;
  h.query = 'tab=ideas';
  render(<HqContentPage />);
  expect(screen.getByText(/No ideas waiting for every market/)).toBeTruthy();
});
