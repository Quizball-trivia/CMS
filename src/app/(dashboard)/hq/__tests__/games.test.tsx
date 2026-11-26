import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { HarnessGame, HarnessGameChange, HarnessGames } from '@/types';

const h = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, changes: [] as unknown, createMutate: vi.fn(), replanMutate: vi.fn(), cancelMutate: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useHarnessGames: () => ({ data: h.data, error: h.error, isLoading: false, refetch: vi.fn() }),
  useHarnessGameChanges: () => ({ data: h.changes, error: null }),
  useCreateGameChange: () => ({ mutate: h.createMutate, isPending: false }),
  useReplanGameChange: () => ({ mutate: h.replanMutate, isPending: false }),
  useCancelGameChange: () => ({ mutate: h.cancelMutate, isPending: false }),
}));

// The preview site is read when games.ts loads: pin it, whatever the shell that runs the tests has set.
vi.stubEnv('NEXT_PUBLIC_GAME_PREVIEW_URL', '');
const { default: HqGamesPage } = await import('../games/page');
const { change, finishRate, previewUrl, worthALook } = await import('../games/games');
const { Delta } = await import('../hq-ui');

const game = (key: string, over: Partial<HarnessGame> = {}): HarnessGame => ({
  key, name: key, group: 'daily', what: `What ${key} is.`, state: 'on', route: `/${key}`, preview: { kind: 'playground', game: key },
  stats: { started: { now: 1000, before: 1000 }, finished: { now: 700, before: 700 }, played: null }, ...over,
});
const hub = (games: HarnessGame[]): HarnessGames => ({ generatedAt: '2026-11-27T10:00:00Z', weeks: { before: ['2026-11-13', '2026-11-19'], now: ['2026-11-20', '2026-11-26'] }, games });

afterEach(() => {
  cleanup();
  h.error = null;
  h.changes = [];
  vi.clearAllMocks();
});
afterAll(() => vi.unstubAllEnvs());

it('puts every game in its group with its state, its numbers and how to play it', () => {
  h.data = hub([
    game('Minesweeper', { stats: { started: { now: 3101, before: 3580 }, finished: { now: 2477, before: 2769 }, played: null } }),
    game('Tenable', { stats: { started: { now: 2379, before: 3738 }, finished: { now: 1630, before: 2915 }, played: { now: 787, before: 641 } } }),
    game('Ranked', { group: 'match', preview: { kind: 'demo', slug: 'match' }, stats: { started: null, finished: null, played: { now: 8007, before: 10544 } } }),
    game('Zone', { group: 'match', state: 'beta', preview: null, stats: { started: null, finished: null, played: { now: 0, before: 0 } } }),
    game('Partner', { group: 'partner', route: null, preview: null, stats: { started: null, finished: null, played: null } }),
  ]);
  render(<HqGamesPage />);
  const daily = screen.getByRole('heading', { name: /^Daily games/ }).closest('section')!;
  const cards = within(daily).getAllByRole('article');
  // Biggest first, counting daily starts and games with friends together.
  expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Tenable', 'Minesweeper']);
  expect(cards[1].textContent).toMatch(/3,101\s*started a day\s*▼ 13%/);
  expect(cards[1].textContent).toMatch(/Finished the day\s*80%/);
  expect(cards[0].textContent).toMatch(/With friends\s*787\s*▲ 23%/);
  const match = screen.getByRole('heading', { name: /^The match/ }).closest('section')!;
  expect(within(match).getByText(/8,007/).closest('p')!.textContent).toMatch(/8,007\s*played\s*▼ 24%/);
  expect(within(match).getByText('Beta')).toBeTruthy();
  expect(within(match).getByText('No preview yet')).toBeTruthy();
  expect(screen.getByText('Plays are not counted for this game yet.')).toBeTruthy();
  expect(screen.getByText(/Numbers are for 20 Nov to 26 Nov, compared with 13 Nov to 19 Nov\./)).toBeTruthy();
  expect((within(cards[1]).getByRole('link', { name: /Open the real game/ }) as HTMLAnchorElement).href).toBe('https://staging.quizball.io/Minesweeper');
});

it('opens a game in the frame: the playground for the newer games, a demo run for the others', () => {
  h.data = hub([game('tenable'), game('ranked', { group: 'match', preview: { kind: 'demo', slug: 'match' }, stats: { started: null, finished: null, played: { now: 5, before: 5 } } })]);
  render(<HqGamesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Play tenable' }));
  expect((screen.getByTitle('tenable preview') as HTMLIFrameElement).src).toBe('https://staging.quizball.io/dev/games?game=tenable&locale=en');
  expect(screen.getByText(/pick any screen of the game/)).toBeTruthy();
  cleanup();
  render(<HqGamesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Play ranked' }));
  expect((screen.getByTitle('ranked preview') as HTMLIFrameElement).src).toBe('https://staging.quizball.io/demos/match');
});

it('lists the games worth a look, worst first, and only when the numbers mean something', () => {
  const clues = game('Clues', { stats: { started: { now: 955, before: 1105 }, finished: { now: 277, before: 296 }, played: null } });
  const darts = game('Darts', { stats: { started: { now: 1654, before: 3755 }, finished: { now: 985, before: 2790 }, played: null } });
  const tiny = game('Tiny', { stats: { started: { now: 20, before: 60 }, finished: { now: 2, before: 30 }, played: null } });
  const retired = game('Old', { state: 'retired', stats: { started: { now: 246, before: 399 }, finished: { now: 20, before: 314 }, played: null } });
  const fine = game('Fine');
  expect(worthALook([fine, darts, tiny, retired, clues]).map((f) => [f.game.key, f.reason])).toEqual([
    ['Clues', 'Only 29% of the players who start a day finish it.'],
    ['Darts', 'Plays fell 56% in a week (3,755 to 1,654).'],
  ]);
  h.data = hub([fine, darts, clues]);
  render(<HqGamesPage />);
  const list = screen.getByRole('heading', { name: /^Worth a look/ }).closest('section')!;
  expect(within(list).getByText('Only 29% of the players who start a day finish it.')).toBeTruthy();
  cleanup();
  h.data = hub([fine]);
  render(<HqGamesPage />);
  expect(screen.getByText('Nothing stands out this week.')).toBeTruthy();
});

it('reads the numbers honestly at the edges', () => {
  expect(change({ now: 0, before: 0 })).toBeNull();
  expect(change({ now: 12, before: 0 })).toEqual({ text: 'new', tone: 'up' });
  expect(change({ now: 100, before: 100 })).toEqual({ text: 'no change', tone: 'flat' });
  expect(change(null)).toBeNull();
  expect(finishRate(game('x', { stats: { started: { now: 0, before: 5 }, finished: { now: 0, before: 1 }, played: null } }))).toBeNull();
  expect(previewUrl({ preview: null })).toBeNull();
  expect(previewUrl({ preview: { kind: 'demo', slug: '' } })).toBe('https://staging.quizball.io/demos');
});

it('finds a game by name or by kind', () => {
  h.data = hub([game('Minesweeper'), game('Tenable'), game('Ranked', { group: 'match', stats: { started: null, finished: null, played: { now: 5, before: 5 } } })]);
  render(<HqGamesPage />);
  const names = () => screen.getAllByRole('article').map((c) => within(c).getByRole('heading').textContent);
  expect(names()).toHaveLength(3);
  fireEvent.change(screen.getByPlaceholderText('Find a game'), { target: { value: 'mine' } });
  expect(names()).toEqual(['Minesweeper']);
  fireEvent.change(screen.getByPlaceholderText('Find a game'), { target: { value: 'zzz' } });
  expect(screen.getByText('No game matches “zzz”.')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('Find a game'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /^The match/ }));
  expect(names()).toEqual(['Ranked']);
});

it('shows a change as a small up or down mark, and nothing when there is nothing to compare', () => {
  const text = (now: number, before: number) => render(<Delta now={now} before={before} />).container.textContent;
  expect(text(110, 100)).toBe('▲ 10%');
  expect(text(87, 100)).toBe('▼ 13%');
  expect(text(5, 0)).toBe('new');
  expect(text(100, 100)).toBe('no change');
  expect(text(0, 0)).toBe('');
});

const aChange = (number: number, over: Partial<HarnessGameChange> = {}): HarnessGameChange => ({
  id: `c${number}`, number, gameKey: 'tenable', gameName: 'Football Tenable', title: 'Four lives', request: 'Give four lives instead of three in the daily game.', source: 'person', requestedBy: 'Nika',
  status: 'planning', plan: null, error: null, decidedBy: null, createdAt: '2026-11-27T08:00:00Z', updatedAt: '2026-11-27T08:00:00Z', ...over,
});

it('sends a request for a change from a game card', () => {
  h.data = hub([game('tenable')]);
  render(<HqGamesPage />);
  expect(screen.getByText(/No changes in progress/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Ask for a change to tenable' }));
  const send = screen.getByRole('button', { name: /Send to the planner/ }) as HTMLButtonElement;
  expect(send.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('In a few words'), { target: { value: 'Four lives' } });
  fireEvent.change(screen.getByLabelText('What should change, and why'), { target: { value: '  Give four lives instead of three.  ' } });
  fireEvent.click(send);
  expect(h.createMutate).toHaveBeenCalledWith({ gameKey: 'tenable', title: 'Four lives', request: 'Give four lives instead of three.' }, expect.anything());
});

it('shows each change with how far along it is, its plan in plain words, and what the planner needs to know', () => {
  h.data = hub([game('tenable')]);
  h.changes = [
    aChange(2),
    aChange(1, {
      status: 'planned',
      plan: { summary: 'Daily players get four wrong guesses.', size: 'small', changes: [{ area: 'server', what: 'Lives go from 3 to 4.' }], risks: ['Scores get higher.'], test: ['Give three wrong answers: still in.'], questions: ['Practice lists too?'] },
    }),
    aChange(3, { status: 'cancelled' }),
  ];
  render(<HqGamesPage />);
  const list = screen.getByRole('heading', { name: /^Changes/ }).closest('section')!;
  // Open ones only, until asked; the count is what waits for a person.
  expect(within(list).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Change 2', 'Change 1']);
  expect(within(list).getByRole('heading', { name: /^Changes\s*1/ })).toBeTruthy();
  const planning = within(list).getByRole('article', { name: 'Change 2' });
  expect(within(planning).getByText('Being planned')).toBeTruthy();
  expect(within(planning).getByText(/The planner is reading the game/)).toBeTruthy();
  const planned = within(list).getByRole('article', { name: 'Change 1' });
  expect(within(planned).getByText('Plan ready')).toBeTruthy();
  expect(within(planned).getByText('Planned').getAttribute('aria-current')).toBe('step');
  expect(within(planned).getByText('Small change')).toBeTruthy();
  expect(within(planned).getByText('Lives go from 3 to 4.')).toBeTruthy();
  expect(within(planned).getByText('Practice lists too?')).toBeTruthy();
  expect(within(planned).getByText(/not connected yet/)).toBeTruthy();
  // The game's card says work is in progress on it.
  expect(screen.getByText('2 changes in progress')).toBeTruthy();
  fireEvent.click(within(list).getByRole('button', { name: 'Show 1 finished' }));
  expect(within(list).getByRole('article', { name: 'Change 3' })).toBeTruthy();
});

it('lets a person rewrite a request to answer the planner, or cancel it', () => {
  h.data = hub([game('tenable')]);
  h.changes = [aChange(1, { status: 'planned' })];
  render(<HqGamesPage />);
  const card = screen.getByRole('article', { name: 'Change 1' });
  fireEvent.click(within(card).getByRole('button', { name: /Rewrite the request/ }));
  const again = within(card).getByRole('button', { name: /Plan it again/ }) as HTMLButtonElement;
  expect(again.disabled).toBe(true); // nothing changed yet
  fireEvent.change(within(card).getByLabelText('Rewrite the request for change 1'), { target: { value: 'Four lives in the daily and in practice lists.' } });
  fireEvent.click(again);
  expect(h.replanMutate).toHaveBeenCalledWith({ id: 'c1', request: 'Four lives in the daily and in practice lists.' }, expect.anything());
  cleanup();
  render(<HqGamesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel change 1' }));
  expect(h.cancelMutate).toHaveBeenCalledWith('c1', expect.anything());
});
