import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { msToNextGeorgiaDay } from '@/lib/td/georgia';
import { useGeorgiaToday } from './use-georgia-today';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useGeorgiaToday', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }));
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('moves on at Georgian midnight (20:00 UTC), not at UTC midnight', () => {
    vi.setSystemTime(new Date('2026-09-30T19:59:58Z'));
    const { result } = renderHook(() => useGeorgiaToday());
    expect(result.current).toBe('2026-09-30');
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current).toBe('2026-10-01');
    // And again a day later, with no reload.
    act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1000));
    expect(result.current).toBe('2026-10-02');
  });

  it('catches up when the page is shown again after the machine slept past midnight', () => {
    vi.setSystemTime(new Date('2026-09-30T10:00:00Z'));
    const { result } = renderHook(() => useGeorgiaToday());
    expect(result.current).toBe('2026-09-30');
    // Asleep: the clock moved, no timer ran.
    vi.setSystemTime(new Date('2026-09-30T21:00:00Z'));
    act(() => setVisibility('visible'));
    expect(result.current).toBe('2026-10-01');
  });

  it('counts to the next Georgian midnight', () => {
    expect(msToNextGeorgiaDay(Date.parse('2026-09-30T19:59:59Z'))).toBe(1_000);
    expect(msToNextGeorgiaDay(Date.parse('2026-09-30T20:00:00Z'))).toBe(24 * 60 * 60 * 1000);
    expect(msToNextGeorgiaDay(Date.parse('2026-09-30T23:30:00Z'))).toBe(20.5 * 60 * 60 * 1000);
  });
});
