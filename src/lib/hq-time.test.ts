import { describe, expect, it } from 'vitest';
import { formatRelative, formatTbilisi } from './hq-time';

describe('time formatting', () => {
  const now = Date.parse('2026-11-02T08:00:00Z');
  it('formats past and future relative times', () => {
    expect(formatRelative('2026-11-02T07:55:00Z', now)).toBe('5m ago');
    expect(formatRelative('2026-11-02T10:00:00Z', now)).toBe('in 2h');
    expect(formatRelative(null, now)).toBe('—');
  });
  it('formats in Tbilisi time, or the given zone, and falls back on an unknown one', () => {
    const iso = '2026-11-02T06:00:00Z';
    expect(formatTbilisi(iso)).toContain('10:00');
    expect(formatTbilisi(iso, 'Europe/London')).toContain('06:00');
    expect(formatTbilisi(iso, 'Not/AZone')).toContain('10:00');
  });
});
