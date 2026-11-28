import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HarnessDayGame, HarnessDayRound } from '@/types';

const h = vi.hoisted(() => ({ days: undefined as unknown, daysError: null as unknown, roundsError: null as unknown, rounds: [] as unknown, roundsAsked: [] as Array<[string, boolean]>, build: vi.fn(), policy: vi.fn() }));
vi.mock('@/hooks', () => ({
  useHarnessDays: () => ({ data: h.days, error: h.daysError }),
  useHarnessDayRounds: (game: string, enabled: boolean) => {
    h.roundsAsked.push([game, enabled]);
    return { data: h.rounds, error: h.roundsError, isLoading: false };
  },
  useBuildDays: () => ({ mutate: h.build, isPending: false }),
  useSetHarnessPolicy: () => ({ mutate: h.policy, isPending: false }),
  useHqClock: () => new Date('2026-11-28T10:00:00Z'),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DayBuilder, daysReady } = await import('../content/day-builder');

const game = (over: Partial<HarnessDayGame> = {}): HarnessDayGame => ({
  game: 'pistas', label: 'Football Clues', ahead: 21, daysLeft: 11, storedThrough: '2026-12-09', storing: false,
  rounds: { planned: 4, written: 3, checked: 2, localized: 1, ready: 23 }, readyByDifficulty: { easy: 8, medium: 9, hard: 6 }, perDay: { easy: 3, medium: 4, hard: 3 },
  builtLately: [], droppedLately: { count: 0, examples: [] }, planning: false, agent: 'active', ...over,
});
const round = (over: Partial<HarnessDayRound> = {}): HarnessDayRound => ({
  id: 'r1', number: 12, status: 'ready', difficulty: 'hard', subject: 'Arlan Moss', note: 'the checker corrected 1 and removed 1 of 9 facts',
  profile: { confed: 'UEFA', position: 'FW', foot: 'left', born: 1976 }, facts: ['In 1994 I scored in a cup final.', 'I won the league twice.'],
  sources: ['https://en.wikipedia.org/wiki/Arlan', 'javascript:alert(1)'], names: { en: 'Arlan Moss', ka: 'არლან მოსი' }, georgian: ['1994 წელს გოლი გავიტანე.', 'ლიგა ორჯერ მოვიგე.'],
  updatedAt: '2026-11-28T09:00:00Z', ...over,
});

afterEach(() => {
  cleanup();
  h.days = undefined;
  h.daysError = null;
  h.roundsError = null;
  h.rounds = [];
  h.roundsAsked = [];
  h.build.mockClear();
  h.policy.mockClear();
});

it('counts the days the ready rounds make by the difficulty that runs out first', () => {
  expect(daysReady(game())).toBe(2); // 8/3, 9/4, 6/3
  expect(daysReady(game({ readyByDifficulty: { easy: 30, medium: 3, hard: 30 } }))).toBe(0);
  expect(daysReady(game({ readyByDifficulty: { easy: 0, medium: 0, hard: 0 } }))).toBe(0);
});

it('shows where a game stands and says plainly that nothing reaches players while storing is off', () => {
  h.days = { games: [game()] };
  render(<DayBuilder />);
  const card = screen.getByRole('article', { name: 'Football Clues days' });
  expect(within(card).getByText(/11 days stored after today; the builder keeps 21\. 10 days are missing\./)).toBeTruthy();
  expect(within(card).getByText('enough for 2 days')).toBeTruthy();
  expect(within(card).getByText('Storing days is off.')).toBeTruthy();
  expect(within(card).getByText(/Nothing reaches players/)).toBeTruthy();
  expect(within(card).getByText('Working')).toBeTruthy();
  // Five steps, each with its count.
  expect(['Named', 'Written', 'Checked', 'Translated', 'Ready'].map((label) => within(card).getByText(label).nextElementSibling?.textContent)).toEqual(['4', '3', '2', '1', '23']);
  fireEvent.click(within(card).getByRole('button', { name: 'Turn storing on' }));
  expect(h.policy).toHaveBeenCalledWith({ key: 'days.pistas.store', value: true }, expect.anything());
});

it('offers to turn storing off again, and reports what was built and dropped', () => {
  h.days = { games: [game({ storing: true, daysLeft: 21, rounds: { planned: 0, written: 0, checked: 0, localized: 0, ready: 0 }, readyByDifficulty: { easy: 0, medium: 0, hard: 0 }, builtLately: [{ day: '2026-12-10', at: '2026-11-28T09:30:00Z' }], droppedLately: { count: 2, examples: [{ number: 7, note: 'only 5 of 9 facts could be confirmed', at: '2026-11-28T09:00:00Z' }] } })] };
  render(<DayBuilder />);
  expect(screen.getByText(/Nothing is missing/)).toBeTruthy();
  expect(screen.getByText('Idle')).toBeTruthy();
  expect(screen.getByText(/Built lately: 2026-12-10 \(30m ago\)/)).toBeTruthy();
  expect(screen.getByText('2 rounds were dropped in the last 7 days')).toBeTruthy();
  expect(screen.getByText(/Round 7: only 5 of 9 facts could be confirmed/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Turn storing off' }));
  expect(h.policy).toHaveBeenCalledWith({ key: 'days.pistas.store', value: false }, expect.anything());
});

it('loads the rounds only when a person opens them, and shows the clues, the Georgian and the pages', () => {
  h.days = { games: [game()] };
  h.rounds = [round(), round({ id: 'r2', number: 9, status: 'dropped', subject: 'Teo Varga', note: 'the writer skipped it: two players', profile: null, facts: [], sources: [], names: null, georgian: [] })];
  render(<DayBuilder />);
  expect(h.roundsAsked).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: /Read the rounds/ }));
  expect(h.roundsAsked.at(-1)).toEqual(['pistas', true]);
  expect(screen.getByText(/Keep them inside the team/)).toBeTruthy();
  const ready = screen.getByRole('listitem', { name: 'Round 12' });
  expect(within(ready).getByText('Arlan Moss')).toBeTruthy();
  expect(within(ready).getByText('UEFA · FW · left-footed · born 1976')).toBeTruthy();
  expect(within(ready).getByText('In 1994 I scored in a cup final.')).toBeTruthy();
  expect(within(ready).getByText(/Note: the checker corrected 1/)).toBeTruthy();
  // Only a real https page becomes a link.
  expect(within(ready).getAllByRole('link').map((a) => (a as HTMLAnchorElement).href)).toEqual(['https://en.wikipedia.org/wiki/Arlan']);
  fireEvent.click(within(ready).getByRole('button', { name: 'Show the Georgian' }));
  expect(within(ready).getByText('1994 წელს გოლი გავიტანე.')).toBeTruthy();
  expect(within(ready).queryByText('In 1994 I scored in a cup final.')).toBeNull();
  const dropped = screen.getByRole('listitem', { name: 'Round 9' });
  expect(within(dropped).getByText('Why: the writer skipped it: two players')).toBeTruthy();
  expect(within(dropped).queryByRole('button', { name: 'Show the Georgian' })).toBeNull();
});

it('runs the builder now, unless it is paused, and shows nothing when no game is built this way', () => {
  h.days = { games: [game({ agent: 'paused' })] };
  const view = render(<DayBuilder />);
  expect(screen.getByText('Paused')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Run it now/ }) as HTMLButtonElement).disabled).toBe(true);
  h.days = { games: [game({ planning: true })] };
  view.rerender(<DayBuilder />);
  expect(screen.getByText('Choosing footballers')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Run it now/ }));
  expect(h.build).toHaveBeenCalledWith('pistas', expect.anything());
  h.days = { games: [] };
  view.rerender(<DayBuilder />);
  expect(screen.queryByRole('heading', { name: 'Day Builder' })).toBeNull();
});

it('shows the pause for all agents, whatever the builder\'s own switch says', () => {
  h.days = { games: [game({ planning: true })] };
  render(<DayBuilder allPaused />);
  expect(screen.getByText('All agents are paused')).toBeTruthy();
  expect(screen.queryByText('Choosing footballers')).toBeNull();
});

it('says when what it shows could not be refreshed', () => {
  h.days = { games: [game()] };
  h.daysError = new Error('offline');
  h.rounds = [round()];
  h.roundsError = new Error('offline');
  render(<DayBuilder />);
  expect(screen.getAllByText(/Couldn.t refresh/)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: /Read the rounds/ }));
  expect(screen.getAllByText(/Couldn.t refresh/)).toHaveLength(2);
  // Nothing loaded at all is an error, not an empty section.
  cleanup();
  h.days = undefined;
  render(<DayBuilder />);
  expect(screen.getByRole('alert').textContent).toContain('offline');
});
