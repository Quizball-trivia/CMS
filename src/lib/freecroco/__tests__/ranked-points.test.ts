import { describe, expect, it } from 'vitest';
import type { RankedPointsTable } from '@/types/freecroco';
import { isStaleVersion } from '../errors';
import { createFreecrocoMock } from '../mock';
import {
  isRankedPointsDirty,
  rankedMaxScore,
  updateMargin,
  updatePenaltyWin,
  validateRankedPoints,
} from '../ranked-points';

const contract: RankedPointsTable = {
  margins: [
    { winner: 100, loser: 50 },
    { winner: 150, loser: 40 },
    { winner: 200, loser: 30 },
    { winner: 250, loser: 20 },
    { winner: 300, loser: 10 },
    { winner: 500, loser: 0 },
  ],
  penaltyWin: { winner: 100, loser: 50 },
  drawAfterPenalties: 60,
  leftNotAhead: 100,
};

describe('ranked points table', () => {
  it('accepts the contract table; the maximum is its largest value', () => {
    expect(validateRankedPoints(contract)).toEqual({ valid: true, errors: {} });
    expect(rankedMaxScore(contract)).toBe(500);
    expect(rankedMaxScore({ ...contract, leftNotAhead: 650 })).toBe(650);
  });

  it('flags each bad value and each row where the loser beats the winner', () => {
    const bad = updatePenaltyWin(updateMargin(contract, 5, 'loser', 600), 'winner', 5001);
    expect(validateRankedPoints({ ...bad, drawAfterPenalties: 2.5, leftNotAhead: Number.NaN }).errors).toEqual({
      'margins.5.row': 'Winner points must be at least the loser points',
      'penaltyWin.winner': 'Whole number from 0 to 5000',
      drawAfterPenalties: 'Whole number from 0 to 5000',
      leftNotAhead: 'Whole number from 0 to 5000',
    });
    expect(validateRankedPoints(updateMargin(contract, 0, 'loser', 100)).valid).toBe(true);
  });

  it('edits never mutate the table they start from; dirty compares every value', () => {
    const edited = updateMargin(contract, 2, 'winner', 210);
    expect(contract.margins[2].winner).toBe(200);
    expect(isRankedPointsDirty(contract, edited)).toBe(true);
    expect(isRankedPointsDirty(contract, updateMargin(edited, 2, 'winner', 200))).toBe(false);
    expect(isRankedPointsDirty(contract, { ...contract, leftNotAhead: 101 })).toBe(true);
  });
});

describe('ranked points in the mock backend', () => {
  it('serves version 1, saves with compare-and-set and rejects invalid tables', async () => {
    const mock = createFreecrocoMock({ today: '2026-10-05', delayMs: 0 });
    const loaded = await mock.getRankedPoints();
    expect(loaded).toEqual({ version: 1, points: contract, maxScore: 500 });
    const saved = await mock.putRankedPoints({ version: 1, points: { ...contract, drawAfterPenalties: 900 } });
    expect(saved).toMatchObject({ version: 2, maxScore: 900 });
    expect(isStaleVersion(await mock.putRankedPoints({ version: 1, points: contract }).catch((e: unknown) => e))).toBe(true);
    await expect(mock.putRankedPoints({ version: 2, points: updateMargin(contract, 1, 'loser', 400) }))
      .rejects.toMatchObject({ status: 400 });
    mock.simulateOtherEditor();
    expect(isStaleVersion(await mock.putRankedPoints({ version: 2, points: contract }).catch((e: unknown) => e))).toBe(true);
  });
});
