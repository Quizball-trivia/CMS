import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const hooks = vi.hoisted(() => ({
  detail: null as unknown,
  approve: vi.fn(),
  reject: vi.fn(),
  spawn: vi.fn(),
  runNow: vi.fn(),
  updateSchedule: vi.fn(),
  setHold: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useDayBatch: () => ({ data: hooks.detail, isLoading: false }),
  useApproveDayBatch: () => ({ mutate: hooks.approve, isPending: false }),
  useRejectDayBatch: () => ({ mutate: hooks.reject, isPending: false }),
  useSpawnDayBatch: () => ({ mutate: hooks.spawn, isPending: false }),
  useRunScheduleNow: () => ({ mutate: hooks.runNow, isPending: false }),
  useUpdateSchedule: () => ({ mutate: hooks.updateSchedule, isPending: false }),
  useSetDayBatchHold: () => ({ mutate: hooks.setHold, isPending: false }),
  useReviewCount: () => ({ data: { count: 1 } }),
}));

import { DailyGameScheduleCard, DayBatchReviewCard } from '../day-batches-ui';

const day = (date: string, number: number) => ({
  day: date,
  number,
  contentVersion: 1,
  rounds: [{ id: `${date}-01`, difficulty: 'easy', prompt: { es: 'Jugaron en Boca', en: 'Played for Boca', ka: 'ითამაშეს ბოკაში', tr: '' }, cards: [
    { id: '1', name: 'Riquelme', img: '/x', ok: true },
    { id: '2', name: 'Haaland', img: '/x', ok: false },
  ] }],
});
const pending = {
  id: 'b1', jobId: 'j1', game: 'buscaminas', firstDay: '2026-12-25', lastDay: '2026-12-26', dayCount: 2, status: 'pending',
  validation: { ok: true, output: 'OK: 92 days' }, plan: null, error: null, rejectReason: null, decidedBy: null, decidedAt: null,
  createdAt: new Date().toISOString(),
} as const;
const buffer = (over: Record<string, unknown> = {}) =>
  ({ game: 'buscaminas', lastDay: '2026-12-24', daysLeft: 9, pendingBatchId: null, activeJobId: null, holdForReview: false, ...over }) as never;
const schedule = (over: Record<string, unknown> = {}) =>
  ({ id: 'buscaminas-days', label: 'Buscaminas', jobType: 'daily_days', enabled: false, hourTbilisi: 10, params: { game: 'buscaminas', days: 14, targetDays: 60 }, lastRunAt: null, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  hooks.detail = { ...pending, days: [day('2026-12-25', 91), day('2026-12-26', 92)],
    dryRun: { plan: { entries: [{ day: '2026-12-25', number: 91, status: 'new' }, { day: '2026-12-26', number: 92, status: 'new' }], keptDays: 90 } } };
});
afterEach(cleanup);

describe('DayBatchReviewCard (on Review)', () => {
  it('shows what approval would do, previews a day in every language, and approves', () => {
    render(<DayBatchReviewCard summary={pending as never} />);
    expect(screen.getByText('Daily game')).toBeTruthy();
    expect(screen.getByText(/Adds 2 new days \(#91–#\s*92\); 90 stored days stay/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /#91 · 2026-12-25/ }));
    expect(screen.getByText('Riquelme').className).toContain('emerald');
    expect(screen.getByText('Haaland').className).toContain('red');
    fireEvent.click(screen.getByRole('button', { name: 'ka' }));
    expect(screen.getByText('ითამაშეს ბოკაში')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'tr' }));
    expect(screen.getByText('missing tr')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Approve and add days/ }));
    expect(hooks.approve).toHaveBeenCalledWith('b1', expect.any(Object));
  });

  it('cannot approve a batch that failed validation or that the dry run refuses; reject needs a reason', () => {
    render(<DayBatchReviewCard summary={{ ...pending, validation: { ok: false, output: 'FAILED' } } as never} />);
    expect((screen.getByRole('button', { name: /Approve and add days/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    hooks.detail = { ...(hooks.detail as object), dryRun: { error: 'append only: already stored: 2026-12-25' } };
    render(<DayBatchReviewCard summary={pending as never} />);
    expect(screen.getByText(/Refused: append only/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Approve and add days/ }) as HTMLButtonElement).disabled).toBe(true);
    const reject = screen.getByRole('button', { name: /Reject/ }) as HTMLButtonElement;
    expect(reject.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Why reject/), { target: { value: 'dates taken' } });
    fireEvent.click(reject);
    expect(hooks.reject).toHaveBeenCalledWith({ batchId: 'b1', reason: 'dates taken' }, expect.any(Object));
  });
});

describe('DailyGameScheduleCard (on Schedules)', () => {
  it('shows the days left and turns the schedule on with its full params', () => {
    render(<DailyGameScheduleCard buffer={buffer()} schedule={schedule()} batches={[]} />);
    expect(screen.getByText('9').className).toContain('text-red-600');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(hooks.updateSchedule).toHaveBeenCalledWith(
      { id: 'buscaminas-days', data: { enabled: true, hourTbilisi: 10, params: { game: 'buscaminas', days: 14, targetDays: 60 } } },
      expect.any(Object)
    );
  });

  it('builds now through the schedule (or directly without one), and holds batches for review', () => {
    render(<DailyGameScheduleCard buffer={buffer()} schedule={schedule()} batches={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Build next 14 days now/ }));
    expect(hooks.runNow).toHaveBeenCalledWith('buscaminas-days', expect.any(Object));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(hooks.setHold).toHaveBeenCalledWith({ game: 'buscaminas', hold: true }, expect.any(Object));
    cleanup();
    render(<DailyGameScheduleCard buffer={buffer()} batches={[]} />);
    fireEvent.change(screen.getByLabelText('Days to build'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Build next 7 days now/ }));
    expect(hooks.spawn).toHaveBeenCalledWith({ game: 'buscaminas', days: 7 }, expect.any(Object));
  });

  it('lists the latest batches (automatic additions labelled) and says when a game has no days or no builder', () => {
    render(<DailyGameScheduleCard buffer={buffer()} schedule={schedule()} batches={[{ ...pending, status: 'seeded', decidedAt: new Date().toISOString() }] as never} />);
    expect(screen.getByText('Added automatically')).toBeTruthy();
    cleanup();
    render(<DailyGameScheduleCard buffer={buffer({ game: 'minuto', lastDay: null, daysLeft: 0 })} batches={[]} />);
    expect(screen.getByText('No days stored')).toBeTruthy();
    expect(screen.getByText(/No builder in the pipeline yet/)).toBeTruthy();
  });
});
