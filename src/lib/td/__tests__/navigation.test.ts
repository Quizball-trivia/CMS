import { describe, expect, it } from 'vitest';
import { safeNextPath, tabForSegment, tabsForRole, TD_TABS } from '../navigation';

const CONTENT = ['dashboard', 'questions', 'categories', 'dailies', 'clubs', 'media', 'import', 'releases'];
const keys = (role: Parameters<typeof tabsForRole>[0]) => tabsForRole(role).map((tab) => tab.key);

describe('Table Derby navigation', () => {
  it('has every page: the rounds are game modes of the one Questions page', () => {
    expect(TD_TABS).toHaveLength(13);
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
    [null, 'dashboard'],
    ['team', 'team'],
    ['questions', 'questions'],
    ['round-1', null],
    ['settings', 'settings'],
    ['round-10', null],
    ['login', null],
    ['_next', null],
    ['', null],
  ])('maps the console segment %j to %j and fails closed on anything unknown', (segment, key) => {
    expect(tabForSegment(segment)?.key ?? null).toBe(key);
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
