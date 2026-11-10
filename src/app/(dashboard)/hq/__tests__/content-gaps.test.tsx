import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Invented footballers only: the repository is public.
const h = vi.hoisted(() => ({ gaps: [] as unknown[], fixes: [] as unknown[], mutate: vi.fn(), gapMutate: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/content-gaps', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/hooks', () => ({
  useContentGaps: () => ({ data: h.gaps, isLoading: false, error: null, refetch: vi.fn() }),
  useContentGapsSummary: () => ({ data: [{ game: 'darts501', verdict: 'uncovered', status: 'open', gaps: 3, typed: 9, lastSeen: '2026-11-10T08:00:00Z' }] }),
  useContentFixes: () => ({ data: h.fixes, isLoading: false, error: null, refetch: vi.fn() }),
  useUpdateContentFix: () => ({ mutate: h.mutate, isPending: false, error: null }),
  useUpdateContentGap: () => ({ mutate: h.gapMutate, isPending: false, error: null }),
}));

const { default: ContentGapsPage } = await import('../content-gaps/page');

beforeEach(() => {
  h.mutate.mockReset();
  h.gapMutate.mockReset();
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
  expect(screen.getByText('No data for him')).toBeTruthy();
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
  fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Ask the owner' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(h.gapMutate).toHaveBeenCalledWith({ id: 1, status: 'held', expectedRevision: 0, reason: 'Ask the owner' }, expect.anything());
});

it('closed gaps stay reachable (their own tabs) so a person can reopen them', () => {
  render(<ContentGapsPage />);
  for (const name of ['Fixed', 'Not an answer', 'Our verdict was right', "Won't fix"]) expect(screen.getByRole('tab', { name })).toBeTruthy();
});
