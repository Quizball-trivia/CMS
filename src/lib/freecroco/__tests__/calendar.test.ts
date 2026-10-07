import { describe, expect, it } from 'vitest';
import {
  buildChangeSet,
  effectiveLimit,
  isEditableDate,
  MAX_CHANGES_PER_SAVE,
  monthRange,
  monthWeeks,
  overrideMap,
  pasteWeek,
  setCellEdit,
  snapshotWeek,
  applySavedChanges,
  validateChangeSet,
  weekStart,
  type CalendarEdits,
} from '../calendar';
import { PARTNER_GAME_IDS } from '../games';
import type { PartnerGameConfig } from '@/types/freecroco';

const TODAY = '2026-10-05'; // a Monday
const NONE: CalendarEdits = new Map();
const range = { from: '2026-09-28', to: '2026-11-08' };
const games: PartnerGameConfig[] = [
  { gameId: 'ranked', enabled: true, order: 1, defaultLimit: 10, ready: true },
  { gameId: 'countdown', enabled: true, order: 2, defaultLimit: 1, ready: true },
];

describe('calendar dates', () => {
  it('allows today through +90 days only', () => {
    expect(isEditableDate('2026-10-04', TODAY)).toBe(false);
    expect(isEditableDate(TODAY, TODAY)).toBe(true);
    expect(isEditableDate('2027-01-03', TODAY)).toBe(true);
    expect(isEditableDate('2027-01-04', TODAY)).toBe(false);
  });

  it('lays out Monday-first weeks that cover the month', () => {
    expect(weekStart('2026-10-11')).toBe('2026-10-05');
    expect(monthRange('2026-10')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
    const weeks = monthWeeks('2026-10');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toBe('2026-09-28');
  });
});

describe('change-set building', () => {
  const server = overrideMap([{ date: '2026-10-07', gameId: 'countdown', limit: 3 }]);

  it('shows the default unless an override or pending edit exists', () => {
    expect(effectiveLimit(games, server, NONE, '2026-10-06', 'countdown')).toBe(1);
    expect(effectiveLimit(games, server, NONE, '2026-10-07', 'countdown')).toBe(3);
    const edits = setCellEdit(server, NONE, '2026-10-07', 'countdown', 0);
    expect(effectiveLimit(games, server, edits, '2026-10-07', 'countdown')).toBe(0);
  });

  it('sends only real differences, including removals as null', () => {
    let edits = setCellEdit(server, NONE, '2026-10-06', 'ranked', 20);
    edits = setCellEdit(server, edits, '2026-10-07', 'countdown', null);
    expect(buildChangeSet(server, edits, TODAY, range)).toEqual([
      { date: '2026-10-06', gameId: 'ranked', limit: 20 },
      { date: '2026-10-07', gameId: 'countdown', limit: null },
    ]);
  });

  it('drops an edit that puts a cell back to what the server has', () => {
    let edits = setCellEdit(server, NONE, '2026-10-07', 'countdown', 5);
    expect(edits.size).toBe(1);
    edits = setCellEdit(server, edits, '2026-10-07', 'countdown', 3);
    expect(edits.size).toBe(0);
    expect(setCellEdit(server, NONE, '2026-10-06', 'ranked', null).size).toBe(0);
  });

  it('keeps an off-day (0) as an override, not a removal', () => {
    const edits = setCellEdit(server, NONE, '2026-10-06', 'ranked', 0);
    expect(buildChangeSet(server, edits, TODAY, range)).toEqual([{ date: '2026-10-06', gameId: 'ranked', limit: 0 }]);
  });

  it('never sends past or out-of-window dates', () => {
    const edits = new Map<string, number | null>([
      ['2026-10-04|ranked', 5],
      ['2027-02-01|ranked', 5],
      ['2026-10-05|ranked', 5],
    ]);
    expect(buildChangeSet(server, edits, TODAY, range).map((c) => c.date)).toEqual(['2026-10-05']);
  });

  it('keeps edits on a month that is not loaded, where the server copy cannot judge them', () => {
    const edits = new Map<string, number | null>([['2026-12-01|ranked', null]]);
    expect(buildChangeSet(server, edits, TODAY, range)).toEqual([{ date: '2026-12-01', gameId: 'ranked', limit: null }]);
  });

  it('refuses more than 100 changes and out-of-bound limits', () => {
    const many = Array.from({ length: MAX_CHANGES_PER_SAVE + 1 }, (_, i) => ({
      date: '2026-10-06',
      gameId: 'ranked' as const,
      limit: i % 2,
    }));
    expect(validateChangeSet(many)).toMatch(/at most 100/);
    expect(validateChangeSet(many.slice(0, MAX_CHANGES_PER_SAVE))).toBeNull();
    expect(validateChangeSet([{ date: '2026-10-06', gameId: 'countdown', limit: 11 }])).toMatch(/0 to 10/);
    expect(validateChangeSet([{ date: '2026-10-06', gameId: 'ranked', limit: 30 }])).toBeNull();
  });
});

describe('copy a week', () => {
  const server = overrideMap([
    { date: '2026-10-05', gameId: 'ranked', limit: 20 },
    { date: '2026-10-07', gameId: 'countdown', limit: 0 },
    { date: '2026-10-14', gameId: 'ranked', limit: 5 },
  ]);

  it('makes the target week match the source, removing overrides the source lacks', () => {
    const snapshot = snapshotWeek(server, NONE, '2026-10-05');
    const { edits, skippedDays } = pasteWeek(server, NONE, snapshot, '2026-10-12', TODAY);
    expect(skippedDays).toBe(0);
    expect(buildChangeSet(server, edits, TODAY, range)).toEqual([
      { date: '2026-10-12', gameId: 'ranked', limit: 20 },
      { date: '2026-10-14', gameId: 'ranked', limit: null },
      { date: '2026-10-14', gameId: 'countdown', limit: 0 },
    ]);
  });

  it('copies pending edits too', () => {
    const edits = setCellEdit(server, NONE, '2026-10-06', 'ranked', 7);
    expect(snapshotWeek(server, edits, '2026-10-05')[1]).toEqual({ ranked: 7 });
  });

  it('skips read-only target days', () => {
    const snapshot = snapshotWeek(server, NONE, '2026-10-05');
    const { edits, skippedDays } = pasteWeek(server, NONE, snapshot, '2026-09-28', TODAY);
    expect(skippedDays).toBe(7);
    expect(edits.size).toBe(0);
  });

  it('can exceed 100 changes, which the save guard then blocks', () => {
    const dense = overrideMap(
      Array.from({ length: 7 }, (_, d) => PARTNER_GAME_IDS.map((gameId) => ({ date: `2026-10-${String(5 + d).padStart(2, '0')}`, gameId, limit: 2 }))).flat(),
    );
    const { edits } = pasteWeek(dense, NONE, snapshotWeek(dense, NONE, '2026-10-05'), '2026-10-12', TODAY);
    const changes = buildChangeSet(dense, edits, TODAY, range);
    expect(changes).toHaveLength(77);
    expect(validateChangeSet(changes)).toBeNull();
  });
});

describe('applying a saved change set to a cached range', () => {
  const cached = {
    version: 4,
    overrides: [
      { date: '2026-10-07', gameId: 'countdown' as const, limit: 3 },
      { date: '2026-10-20', gameId: 'ranked' as const, limit: 9 },
    ],
  };

  it('sets, removes and moves the version, touching only dates inside the range', () => {
    const next = applySavedChanges(
      cached,
      { from: '2026-09-28', to: '2026-11-01' },
      [
        { date: '2026-10-06', gameId: 'ranked', limit: 0 },
        { date: '2026-10-07', gameId: 'countdown', limit: null },
        { date: '2026-12-01', gameId: 'ranked', limit: 5 }, // another month: not this range's business
      ],
      5,
    );
    expect(next).toEqual({
      version: 5,
      overrides: [
        { date: '2026-10-06', gameId: 'ranked', limit: 0 },
        { date: '2026-10-20', gameId: 'ranked', limit: 9 },
      ],
    });
    expect(cached.version).toBe(4); // the cached copy itself is untouched
  });
});
