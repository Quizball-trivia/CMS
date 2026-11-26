import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import type { HarnessGame, HarnessGames } from '@/types';

const h = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown }));
vi.mock('@/hooks', () => ({ useHarnessGames: () => ({ data: h.data, error: h.error, isLoading: false, refetch: vi.fn() }) }));

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
