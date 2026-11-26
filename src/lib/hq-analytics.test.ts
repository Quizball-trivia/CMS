import { describe, expect, it } from 'vitest';
import { countryFlag, countryName, countryShares, latestD7, modeLabel, retentionPct, topModesWithOther } from './hq-analytics';

describe('countries', () => {
  it('turns ISO-2 codes into flags and names', () => {
    expect(countryFlag('ge')).toBe('🇬🇪');
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(countryFlag('Georgia')).toBe('🌐');
    expect(countryFlag(null)).toBe('🌐');
    expect(countryName('GE')).toBe('Georgia');
    expect(countryName('')).toBe('Unknown');
    expect(countryName('Sakartvelo')).toBe('Sakartvelo');
  });
  it('uses the all-countries total for shares when the backend sends it', () => {
    const rows = countryShares([{ country: 'GE', players: 40, registered: 50 }], 15, 200);
    expect(rows[0].share).toBe(0.2);
    expect(rows[0].basis).toBe('all');
  });

  it('falls back to the visible sum (basis "top") when the total is missing or inconsistent', () => {
    const list = [{ country: 'GE', players: 40, registered: 50 }, { country: 'TR', players: 10, registered: 20 }];
    expect(countryShares(list, 15).map((r) => [r.share, r.basis])).toEqual([[0.8, 'top'], [0.2, 'top']]);
    // A total smaller than what's listed can't be right — ignore it.
    expect(countryShares(list, 15, 30)[0].basis).toBe('top');
    expect(countryShares(list, 15, 0)[0].basis).toBe('top');
  });

  it('ranks countries with their share of players', () => {
    const rows = countryShares(
      [
        { country: 'TR', players: 25, registered: 40 },
        { country: 'GE', players: 75, registered: 90 },
      ],
      15
    );
    expect(rows.map((r) => [r.country, r.share])).toEqual([
      ['GE', 0.75],
      ['TR', 0.25],
    ]);
  });
});

describe('game modes', () => {
  it('merges a real "other" mode from the API into the single Other row', () => {
    const rows = topModesWithOther(
      [
        { mode: 'ranked', matches: 50, share: 0.5 },
        { mode: 'other', matches: 40, share: 0.4 },
        { mode: 'friendly', matches: 10, share: 0.1 },
        { mode: 'auction', matches: 5, share: 0.05 },
      ],
      undefined,
      2
    );
    expect(rows.map((r) => [r.mode, r.matches])).toEqual([
      ['ranked', 50],
      ['friendly', 10],
      ['other', 45],
    ]);
    expect(rows.filter((r) => r.mode === 'other')).toHaveLength(1);
  });

  it('keeps the top N modes and folds the rest into Other', () => {
    const rows = topModesWithOther(
      [
        { mode: 'ranked', matches: 50, share: 0.5 },
        { mode: 'friendly', matches: 30, share: 0.3 },
        { mode: 'football_grid', matches: 15, share: 0.15 },
        { mode: 'auction', matches: 5, share: 0.05 },
      ],
      { ranked: 'Ranked 1v1' },
      2
    );
    expect(rows.map((r) => [r.label, r.matches])).toEqual([
      ['Ranked 1v1', 50],
      ['Friendly', 30],
      ['Other', 20],
    ]);
  });
  it('humanises unknown mode keys', () => {
    expect(modeLabel('football_grid')).toBe('Football Grid');
  });
});

describe('retention', () => {
  it('turns 0–1 cohort shares into percentages', () => {
    expect(retentionPct(0.25)).toBe(25);
    expect(retentionPct(1)).toBe(100);
    expect(retentionPct(0)).toBe(0);
    expect(retentionPct(null)).toBeNull();
  });
  it('picks the newest cohort with a finished day-7 window', () => {
    expect(
      latestD7([
        { cohortStart: '2026-10-26', size: 10, d1: 0.5, d7: null, d30: null },
        { cohortStart: '2026-10-19', size: 12, d1: 0.4, d7: 0.2, d30: null },
        { cohortStart: '2026-10-12', size: 9, d1: 0.3, d7: 0.1, d30: null },
      ])
    ).toEqual({ pct: 20, cohortStart: '2026-10-19' });
    expect(latestD7([])).toBeNull();
  });
});
