import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HarnessOverview } from '@/types';

const h = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, settingsMutate: vi.fn(), policyMutate: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/content', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useHarnessOverview: () => ({ data: h.data, error: h.error, isLoading: false, refetch: vi.fn() }),
  useUpdateHarnessSettings: () => ({ mutate: h.settingsMutate, isPending: false }),
  useSetHarnessPolicy: () => ({ mutate: h.policyMutate, isPending: false }),
}));

const { default: HqContentPage } = await import('../content/page');

function overview(over: Partial<HarnessOverview> = {}): HarnessOverview {
  return {
    settings: { paused: true, pausedReason: 'Switch on once accounts are configured.', maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null },
    today: { runs: 12, costCents: 340, failed: 1 },
    classic: {
      viewCap: 100,
      shortCategories: 1,
      totalShortage: 103,
      categories: [
        { categoryId: 'c2', slug: 'world-cup', views30d: 10046, pool: 921, inPipeline: 0, needed: 101, shortage: 0 },
        { categoryId: 'c1', slug: 'manchester-united', views30d: 12129, pool: 19, inPipeline: 0, needed: 122, shortage: 103 },
      ],
    },
    stages: [
      { mode: 'classic', stage: 'approved', count: 8 },
      { mode: 'classic', stage: 'escalated', count: 2 },
    ],
    jobs: [{ kind: 'fact_check', status: 'queued', count: 4 }],
    accounts: [
      { id: 'claude-premium-1', provider: 'claude', label: 'Claude premium seat 1 (Making)', secretRef: 'HARNESS_CLAUDE_PREMIUM_1_TOKEN', status: 'active', reservedForPeople: false, softPct: 90, state: 'ok', blockedUntil: null, windows: { five_hour: { status: 'allowed', utilization: 0.42, resets_at: null } }, lastError: null },
      { id: 'claude-people', provider: 'claude', label: 'nika@quizball.io seat: people only', secretRef: 'HARNESS_NEVER_USED', status: 'disabled', reservedForPeople: true, softPct: 90, state: 'ok', blockedUntil: null, windows: {}, lastError: null },
    ],
    agents: [
      { slug: 'fact-checker', name: 'Fact Checker', team: 'checking', description: 'Checks every claim.', provider: 'codex', model: 'gpt-6.1-sol', effort: 'high', primaryAccount: 'codex-1', fallbackAccounts: [], status: 'active', runsToday: 5, costCentsToday: 0, lastRunAt: null },
    ],
    runs: [],
    events: [{ id: '1', type: 'item_stage', level: 'info', message: 'draft -> validated', itemId: 'i1', createdAt: '2026-11-25T12:00:00Z' }],
    policies: [{ key: 'classic.release_status', value: 'draft', note: '', editable: true, updatedAt: null }],
    ...over,
  };
}

beforeEach(() => {
  h.data = overview();
  h.error = null;
  h.settingsMutate.mockReset();
  h.policyMutate.mockReset();
});
afterEach(cleanup);

it('shows the Classic gap with the biggest shortage first', () => {
  render(<HqContentPage />);
  expect(screen.getByText('Agents are paused.')).toBeTruthy();
  const rows = screen.getAllByRole('row').slice(1, 3).map((r) => within(r).getAllByRole('cell')[0].textContent);
  expect(rows).toEqual(['manchester-united', 'world-cup']);
  expect(screen.getByText('103', { selector: 'td' })).toBeTruthy();
  expect(screen.getByText('Stuck (needs the Arbiter)')).toBeTruthy();
});

it('shows the people seat as never used and checkers without a fallback', () => {
  render(<HqContentPage />);
  expect(screen.getByText('never used by agents')).toBeTruthy();
  expect(screen.getByText('People only')).toBeTruthy();
  expect(screen.getByText('(waits, no fallback)')).toBeTruthy();
  expect(screen.getByText('five-hour 42%')).toBeTruthy();
});

it('switches the agents on from the pause state', () => {
  render(<HqContentPage />);
  fireEvent.click(screen.getByRole('button', { name: /switch agents on/i }));
  expect(h.settingsMutate).toHaveBeenCalledWith({ paused: false, pausedReason: null }, expect.anything());
});

it('pauses running agents with a reason', () => {
  h.data = overview({ settings: { paused: false, pausedReason: null, maxConcurrentRuns: 3, dailyRunLimit: 1500, updatedAt: null } });
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

it('marks an account at its usage share as not ready, like the router', () => {
  const base = overview();
  h.data = overview({
    accounts: [{ ...base.accounts[0], windows: { five_hour: { status: 'allowed', utilization: 0.95, resets_at: '2999-01-01T00:00:00Z' } } }],
  });
  render(<HqContentPage />);
  expect(screen.getByText('At its limit')).toBeTruthy();
  expect(screen.queryByText('Ready')).toBeNull();
});

it('keeps the data but warns when a refresh fails', () => {
  h.error = new Error('down');
  render(<HqContentPage />);
  expect(screen.getByText('manchester-united')).toBeTruthy();
  expect(screen.getByText(/couldn.t refresh/i)).toBeTruthy();
});
