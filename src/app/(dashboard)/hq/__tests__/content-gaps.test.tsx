import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Invented footballers only: the repository is public.
const h = vi.hoisted(() => ({ gaps: [] as unknown[], fixes: [] as unknown[], summary: [] as unknown[], loading: false, calls: [] as Array<{ status?: string; game?: string }>, mutate: vi.fn(), gapMutate: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/content-gaps', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks', () => ({
  // One state at a time, like the real endpoint.
  useContentGaps: (p?: { status?: string; game?: string }) => {
    h.calls.push(p ?? {});
    const rows = (h.gaps as Array<{ status: string; game: string }>).filter((g) => (!p?.status || g.status === p.status) && (!p?.game || g.game === p.game));
    return { data: h.loading ? undefined : rows, isLoading: h.loading, error: null, refetch: vi.fn() };
  },
  useContentGapsSummary: () => ({ data: h.summary }),
  useContentFixes: () => ({ data: h.fixes, isLoading: false, error: null, refetch: vi.fn() }),
  useUpdateContentFix: () => ({ mutate: h.mutate, isPending: false, error: null }),
  useUpdateContentGap: () => ({ mutate: h.gapMutate, isPending: false, error: null }),
}));

const { default: ContentGapsPage } = await import('../content-gaps/page');

beforeEach(() => {
  h.mutate.mockReset();
  h.gapMutate.mockReset();
  h.loading = false;
  h.calls = [];
  h.summary = [{ game: 'darts501', verdict: 'uncovered', status: 'open', gaps: 3, typed: 9, lastSeen: '2026-11-10T08:00:00Z' }];
  h.gaps = [{
    id: 1, game: 'darts501', mode: 'daily', boardKey: 'cat-x', context: 'c', verdict: 'uncovered', norm: 'wim xell', resolvedId: 'p2', candidateIds: null,
    count: 9, firstSeen: '2026-11-09T08:00:00Z', lastSeen: '2026-11-10T08:00:00Z', status: 'open', revision: 0, fixId: null,
    samples: [{ locale: 'ka', typed: 'ვიმ ქსელი' }, { locale: 'en', typed: 'Wim Xell' }],
  }];
  h.fixes = [{
    id: 11, kind: 'stats', game: 'darts501', boardKey: 'cat-x', gapIds: [1], status: 'held', proposer: 'answer-gap-monitor:run-1', verifier: 'content-verifier:run-2',
    payload: { pid: 'p2', asOf: '2026-11-09', leagues: [{ league: 'Premier League', club: 'Club X', apps: 40, goals: 3 }] },
    evidence: [{ url: 'https://en.wikipedia.org/wiki/Invented', quote: 'Club X 40 (3)' }],
    context: { title: 'Invented League apps for Club X', asOf: '2026-11-09' },
    verification: { verdict: 'agree', extracted: { pid: 'p2', leagues: [] }, sources: [{ url: 'https://www.espn.com/x', quote: '40 apps', publisher: 'espn.com' }], checks: { publishers: 1, matches: true }, at: '2026-11-10T09:00:00Z' },
    revision: 3, audit: [], createdAt: '2026-11-10T08:30:00Z', verifiedAt: null,
    gaps: [{ id: 1, verdict: 'uncovered', norm: 'wim xell', count: 9, status: 'held' }],
  }];
});
afterEach(cleanup);

it('shows what players typed, in their languages, with the summary per game', () => {
  render(<ContentGapsPage />);
  expect(screen.getByText('ვიმ ქსელი')).toBeTruthy();
  expect(screen.getByText('Wim Xell')).toBeTruthy();
  // The verdict says what the matcher did, and a tooltip explains it in a sentence.
  expect(screen.getByText('Player has no data here').getAttribute('title')).toMatch(/our source has no numbers for him/);
  expect(screen.getByText(/typed 9×/)).toBeTruthy();
});

it('shows both sides of a fix and why it is held, and needs a reason to reject it', () => {
  render(<ContentGapsPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Fixes' }));
  expect(screen.getByText(/Invented League apps for Club X/)).toBeTruthy();
  expect(screen.getByText(/1 publisher$/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
  const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wrong player' } });
  fireEvent.click(confirm);
  expect(h.mutate).toHaveBeenCalledWith({ id: 11, status: 'rejected', expectedRevision: 3, reason: 'Wrong player' }, expect.anything());
});

it('a gap decision carries its revision and reason; a change while deciding blocks it', () => {
  const { rerender } = render(<ContentGapsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Not an answer' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Just a club name' } });
  // Polling brings a newer revision while the form is open.
  h.gaps = [{ ...(h.gaps[0] as object), revision: 1 }];
  rerender(<ContentGapsPage />);
  expect((screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/changed while you were deciding/)).toBeTruthy();
  expect(h.gapMutate).not.toHaveBeenCalled();
});

it('submits a gap decision with the revision it was opened on', () => {
  render(<ContentGapsPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Ask the owner' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(h.gapMutate).toHaveBeenCalledWith({ id: 1, status: 'held', expectedRevision: 0, reason: 'Ask the owner' }, expect.anything());
});

// Radix Select needs a few browser APIs jsdom lacks.
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const stateOptions = () => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter by state' }), { key: 'ArrowDown' });
  return screen.getAllByRole('option').map((o) => o.textContent);
};

it('three views hold the nine states; each state stays reachable through the State filter so a person can reopen it', () => {
  render(<ContentGapsPage />);
  for (const name of ['Needs review', 'In progress', 'Resolved']) expect(screen.getByRole('tab', { name })).toBeTruthy();
  expect(stateOptions()).toEqual(['All', 'Needs you', 'Open']);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('tab', { name: 'In progress' }));
  expect(stateOptions()).toEqual(['All', 'Being checked', 'Fix proposed', 'Verified']);
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }));
  expect(stateOptions()).toEqual(['All', 'Fixed', 'Not an answer', 'Our verdict was right', "Won't fix"]);
});

it('a view with nothing in it says so, and the State filter narrows the list', () => {
  h.gaps = [{ ...(h.gaps[0] as object), status: 'fixed' }];
  h.summary = [{ game: 'darts501', verdict: 'uncovered', status: 'fixed', gaps: 1, typed: 9, lastSeen: '2026-11-10T08:00:00Z' }];
  render(<ContentGapsPage />);
  expect(screen.getByText('Nothing needs review.')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Resolved' }));
  expect(screen.getByText('Wim Xell')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter by state' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('option', { name: 'Not an answer' }));
  expect(screen.getByText('No gaps in this state.')).toBeTruthy();
});

it('stacked states get a light divider label only when more than one has gaps', () => {
  h.gaps = [{ ...(h.gaps[0] as object), status: 'open' }, { ...(h.gaps[0] as object), id: 2, status: 'held', samples: [{ locale: 'en', typed: 'Other Name' }] }];
  h.summary = [
    { game: 'darts501', verdict: 'uncovered', status: 'open', gaps: 1, typed: 9, lastSeen: '2026-11-10T08:00:00Z' },
    { game: 'darts501', verdict: 'uncovered', status: 'held', gaps: 1, typed: 2, lastSeen: '2026-11-10T08:00:00Z' },
  ];
  const { unmount } = render(<ContentGapsPage />);
  expect(screen.getByRole('heading', { level: 3, name: 'Needs you' })).toBeTruthy();
  expect(screen.getByRole('heading', { level: 3, name: 'Open' })).toBeTruthy();
  unmount();
  h.gaps = [h.gaps[0]];
  render(<ContentGapsPage />);
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
});

it('an empty state in the stacked "All" shows nothing: no empty message beside the rows of another state', () => {
  // Needs review = Needs you + Open; only Open has gaps. The summary also says so, which must not matter.
  render(<ContentGapsPage />);
  expect(screen.getByText('Wim Xell')).toBeTruthy();
  expect(screen.queryByText('No gaps in this state.')).toBeNull();
  expect(screen.queryByText('Nothing needs review.')).toBeNull();
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
});

it('one empty message when the whole view has no rows, a skeleton while the states load', () => {
  h.gaps = [];
  const { unmount } = render(<ContentGapsPage />);
  expect(screen.getAllByText(/Nothing needs review/)).toHaveLength(1);
  unmount();
  h.loading = true;
  render(<ContentGapsPage />);
  expect(screen.getByRole('status', { name: 'Loading gaps' })).toBeTruthy();
  expect(screen.queryByText(/Nothing needs review/)).toBeNull();
  expect(screen.queryByText('No gaps in this state.')).toBeNull();
});

it('the game filter is a named Select built from the summary, and narrows the list', () => {
  h.summary = [
    { game: 'darts501', verdict: 'uncovered', status: 'open', gaps: 1, typed: 9, lastSeen: '2026-11-10T08:00:00Z' },
    { game: 'tenable', verdict: 'unknown', status: 'open', gaps: 1, typed: 2, lastSeen: '2026-11-10T08:00:00Z' },
  ];
  render(<ContentGapsPage />);
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter by game' }), { key: 'ArrowDown' });
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All games', 'Football Darts 501', 'Football Tenable']);
  fireEvent.click(screen.getByRole('option', { name: 'Football Tenable' }));
  expect(h.calls.some((c) => c.game === 'tenable')).toBe(true);
  // Nothing in the list is a tenable gap, so the one empty message names the game.
  expect(screen.getByText('Nothing needs review for Football Tenable.')).toBeTruthy();
});

it('every verdict has a precise label and an explanation, repeated under Review for touch screens', () => {
  const verdicts: Array<[string, string]> = [
    ['unknown', 'Name not recognised'], ['uncovered', 'Player has no data here'], ['ambiguous', 'Matches several people'],
    ['miss', 'Recognised, not on the list'], ['reported', 'Player says it was right'],
  ];
  for (const [verdict, label] of verdicts) {
    h.gaps = [{ ...(h.gaps[0] as object), verdict }];
    const { unmount } = render(<ContentGapsPage />);
    expect(screen.getByText(label).getAttribute('title')?.length).toBeGreaterThan(30);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByText(screen.getByText(label).getAttribute('title') as string)).toBeTruthy();
    unmount();
  }
});

it('groups the answers by board: the game and the board key once in a header, not on every row', () => {
  const base = h.gaps[0] as object;
  h.gaps = [
    base,
    { ...base, id: 2, samples: [{ locale: 'en', typed: 'Second Answer' }] },
    { ...base, id: 3, game: 'tenable', boardKey: 'list-y', samples: [{ locale: 'es', typed: 'Third Answer' }] },
  ];
  render(<ContentGapsPage />);
  const darts = screen.getByRole('list', { name: /Football Darts 501\s*cat-x/ });
  expect(within(darts).getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByRole('list', { name: /Football Tenable\s*list-y/ })).getAllByRole('listitem')).toHaveLength(1);
  // The board key is written once per board, not once per answer.
  expect(screen.getAllByText('cat-x')).toHaveLength(1);
  expect(screen.getAllByText('list-y')).toHaveLength(1);
  // Each answer keeps its own Review control.
  expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(3);
});

it('a malformed or non-web source stays plain text and the fix stays actionable', () => {
  h.fixes = [{ ...(h.fixes[0] as object), evidence: [{ url: 'not a url', quote: 'q1' }, { url: 'javascript:alert(1)', quote: 'q2' }], gaps: undefined, audit: undefined }];
  render(<ContentGapsPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Fixes' }));
  expect(screen.getByText('not a url')).toBeTruthy();
  expect(screen.getByText('javascript:alert(1)').closest('a')).toBeNull();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
});
