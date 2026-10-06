import { describe, expect, it } from 'vitest';
import {
  deliveryHealth,
  formatAge,
  lastDays,
  rangeLength,
  rangeProblem,
  shortDay,
  sortGamesByPlays,
} from '../stats';
import type { PartnerGameStats } from '@/types/freecroco';

const TODAY = '2026-10-06';

describe('ranges', () => {
  it('counts the last n days with today included', () => {
    expect(lastDays(TODAY, 14)).toEqual({ from: '2026-09-23', to: TODAY });
    expect(rangeLength(lastDays(TODAY, 92))).toBe(92);
  });

  it('refuses what the backend refuses', () => {
    expect(rangeProblem(lastDays(TODAY, 92), TODAY)).toBeNull();
    expect(rangeProblem(lastDays(TODAY, 93), TODAY)).toBe('At most 92 days at a time');
    expect(rangeProblem({ from: TODAY, to: '2026-10-05' }, TODAY)).toBe('From must be on or before To');
    expect(rangeProblem({ from: TODAY, to: '2026-10-07' }, TODAY)).toBe('To cannot be after today');
    expect(rangeProblem({ from: '', to: TODAY }, TODAY)).toBe('Pick both dates');
  });
});

describe('formatting', () => {
  it('shows a Georgian day without shifting it', () => {
    expect(shortDay('2026-10-06')).toBe('6 Oct');
  });

  it('ages the delivery backlog', () => {
    expect(formatAge(null)).toBe('—');
    expect(formatAge(42)).toBe('42 s');
    expect(formatAge(600)).toBe('10 min');
    expect(formatAge(7200)).toBe('2 h');
    expect(formatAge(7380)).toBe('2 h 3 min');
  });

  it('uses the status endpoint thresholds', () => {
    expect(deliveryHealth(null)).toBe('ok');
    expect(deliveryHealth(300)).toBe('ok');
    expect(deliveryHealth(301)).toBe('degraded');
    expect(deliveryHealth(3601)).toBe('down');
  });
});

it('sorts games by plays, keeping the partner order among ties', () => {
  const game = (gameId: PartnerGameStats['gameId'], plays: number): PartnerGameStats => ({
    gameId, plays, finished: 0, averageScore: null, maxScore: null, uniquePlayers: 0,
  });
  const sorted = sortGamesByPlays([game('ranked', 3), game('countdown', 0), game('true-false', 9), game('pick-em', 0)]);
  expect(sorted.map((g) => g.gameId)).toEqual(['true-false', 'ranked', 'countdown', 'pick-em']);
});
