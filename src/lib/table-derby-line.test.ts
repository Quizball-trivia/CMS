import { describe, expect, it } from 'vitest';
import { tableDerbyLine } from './table-derby-line';

const td = {
  day: '2026-11-27', updatedAt: '2026-11-27T08:30:00.000Z', totalUsers: 1500, newUsers: 4, dau: 30, wau: 120,
  mau: 300, matches: 55, dauSeries: [], signupsPerDay: [],
};
const fmt = (n: number) => n.toLocaleString('en-US');

describe('tableDerbyLine', () => {
  it('shows the Table Derby part of a figure synced today', () => {
    expect(tableDerbyLine(td, (t) => t.totalUsers, '2026-11-27T09:00:00.000Z', fmt)).toBe(' · of which Table Derby 1,500');
  });

  it('says which day and sync time an older count is from', () => {
    // 2026-11-27 21:00 UTC is already the 28th in Tbilisi.
    expect(tableDerbyLine(td, (t) => t.dau, '2026-11-27T21:00:00.000Z', fmt)).toBe(
      ' · of which Table Derby 30 (as of 11/27, synced 11/27 12:30)',
    );
  });

  it('is empty without Table Derby numbers', () => {
    expect(tableDerbyLine(null, (t) => t.dau, '2026-11-27T09:00:00.000Z', fmt)).toBe('');
    expect(tableDerbyLine(undefined, (t) => t.dau, '2026-11-27T09:00:00.000Z', fmt)).toBe('');
  });
});
