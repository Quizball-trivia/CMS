import { describe, expect, it } from 'vitest';
import { safeNextPath, tabForPath, tabsForRole, TD_TABS } from '../navigation';

const CONTENT = ['dashboard', 'round-1', 'round-2', 'round-3', 'penalties', 'dailies', 'practice', 'clubs', 'media', 'import', 'releases'];
const keys = (role: Parameters<typeof tabsForRole>[0]) => tabsForRole(role).map((tab) => tab.key);

describe('Table Derby navigation', () => {
  it('has every tab from plan §13.1', () => {
    expect(TD_TABS).toHaveLength(16);
  });

  it('shows editors and publishers only the content tabs', () => {
    expect(keys('editor')).toEqual(CONTENT);
    expect(keys('publisher')).toEqual(CONTENT);
  });

  it('adds players, leaderboard, integration and team for Betsson admins', () => {
    expect(keys('betsson_admin')).toEqual([...CONTENT, 'players', 'leaderboard', 'integration', 'team']);
  });

  it('gives settings to ops only', () => {
    expect(keys('ops')).toEqual([...CONTENT, 'players', 'leaderboard', 'integration', 'team', 'settings']);
  });

  it.each([
    ['/td', 'dashboard'],
    ['/td/', 'dashboard'],
    ['/td/team', 'team'],
    ['/td/round-1/category-7', 'round-1'],
    ['/td/round-10', null],
    ['/td/login', null],
  ])('maps %s to %s', (path, key) => {
    expect(tabForPath(path)?.key ?? null).toBe(key);
  });

  it.each([
    [null, '/td'],
    ['/td/team?tab=invites', '/td/team?tab=invites'],
    ['/td/login', '/td'],
    ['/questions', '/td'],
    ['//evil.example', '/td'],
    ['/\\evil.example', '/td'],
    ['https://evil.example/td', '/td'],
    ['javascript:alert(1)', '/td'],
  ])('accepts %s as a post-login destination only if it is a Table Derby page', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});
