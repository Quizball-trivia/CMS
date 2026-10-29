import { describe, expect, it } from 'vitest';
import { safeNextPath, tabForSegment, tabsForRole, TD_TABS } from '../navigation';

const CONTENT = ['dashboard', 'categories', 'questions'];
const keys = (role: Parameters<typeof tabsForRole>[0]) => tabsForRole(role).map((tab) => tab.key);

describe('Table Derby navigation', () => {
  it('has the Quizball CMS’s pages, adapted: the rounds are game modes of the one Questions page', () => {
    expect(TD_TABS).toHaveLength(8);
  });

  it('shows Betsson’s team the content, players, leaderboard, team and integration tabs', () => {
    expect(keys('betsson_admin')).toEqual([...CONTENT, 'players', 'leaderboard', 'team', 'integration']);
  });

  it('gives settings to ops only', () => {
    expect(keys('ops')).toEqual([...CONTENT, 'players', 'leaderboard', 'team', 'integration', 'settings']);
  });

  it.each([
    [null, 'dashboard'],
    ['team', 'team'],
    ['questions', 'questions'],
    // The dailies ship with the game's code since contract 12: no Daily page.
    ['dailies', null],
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
