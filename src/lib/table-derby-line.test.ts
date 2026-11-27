import { describe, expect, it } from 'vitest';
import { tableDerbyAsOf, tableDerbyLine } from './table-derby-line';

const td = { day: '2026-11-27', updatedAt: '2026-11-27T08:30:00.000Z', totalUsers: 1500, dau: 30 };
const fmt = (n: number) => n.toLocaleString('en-US');

describe('tableDerbyLine', () => {
  it('shows the Table Derby part of a figure synced today, recently', () => {
    expect(tableDerbyLine(td, (t) => t.totalUsers, new Date('2026-11-27T09:00:00.000Z'), fmt)).toBe(
      ' · of which Table Derby 1,500',
    );
  });

  it('says which day and sync time an older count is from, judged by the clock at render time', () => {
    // 2026-11-27 21:00 UTC is already the 28th in Tbilisi.
    expect(tableDerbyLine(td, (t) => t.dau, new Date('2026-11-27T21:00:00.000Z'), fmt)).toBe(
      ' · of which Table Derby 30 (as of 11/27, synced 11/27 12:30)',
    );
  });

  it('shows the sync time when today’s sync is more than two hours old', () => {
    expect(tableDerbyAsOf(td, new Date('2026-11-27T10:29:00.000Z'))).toBe('');
    expect(tableDerbyAsOf(td, new Date('2026-11-27T10:31:00.000Z'))).toBe(' (synced 11/27 12:30)');
  });

  it('is empty without Table Derby numbers', () => {
    expect(tableDerbyLine(null, (t: typeof td) => t.dau, new Date(), fmt)).toBe('');
    expect(tableDerbyLine(undefined, (t: typeof td) => t.dau, new Date(), fmt)).toBe('');
  });
});
