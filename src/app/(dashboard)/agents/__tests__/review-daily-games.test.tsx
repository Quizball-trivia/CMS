import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const batch = {
  id: 'b1', jobId: 'j1', game: 'buscaminas', firstDay: '2026-12-25', lastDay: '2026-12-31', dayCount: 7, status: 'pending',
  validation: { ok: true }, plan: null, error: null, rejectReason: null, decidedBy: null, decidedAt: null, createdAt: new Date().toISOString(),
};
const mutation = { mutate: vi.fn(), isPending: false };

vi.mock('next/navigation', () => ({ usePathname: () => '/agents/review' }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/questions/translate-backfill-dialog', () => ({ TranslateBackfillDialog: () => null }));
vi.mock('../translation-progress', () => ({ TranslationProgressStrip: () => null }));
vi.mock('@/hooks', () => ({
  useReviewCount: () => ({ data: { count: 1 } }),
  useReviewQueue: () => ({ data: { count: 0, groups: [] }, isLoading: false }),
  useDayBatches: () => ({ data: [batch] }),
  useDayBatch: () => ({ data: { ...batch, days: [], dryRun: { plan: { entries: [], keptDays: 90 } } }, isLoading: false }),
  useApproveQuestion: () => mutation,
  useRejectQuestion: () => mutation,
  useRegenerateQuestion: () => mutation,
  useUpdateReviewQuestion: () => mutation,
  useApproveDayBatch: () => mutation,
  useRejectDayBatch: () => mutation,
}));

import ReviewPage from '../review/page';

afterEach(cleanup);

describe('Review queue with daily games', () => {
  it('lists a daily-game batch that needs a person beside the questions, with its own source filter', () => {
    render(<ReviewPage />);
    expect(screen.getByText('Buscaminas futbolero')).toBeTruthy();
    expect(screen.getByText(/1 agent-generated item waiting for review/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^All/ })[0].textContent).toContain('1');
    fireEvent.click(screen.getByRole('button', { name: /Ranked/ }));
    expect(screen.queryByText('Buscaminas futbolero')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Daily games/ }));
    expect(screen.getByText('Buscaminas futbolero')).toBeTruthy();
    // there is no separate Daily games tab any more
    expect(screen.queryByRole('link', { name: /Daily games/ })).toBeNull();
  });
});
