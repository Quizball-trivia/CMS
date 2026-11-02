import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({
  role: undefined as string | undefined,
  email: undefined as string | undefined,
  pathname: '/freecroco',
  overview: undefined as unknown,
  overviewEnabled: [] as boolean[],
}));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role, email: h.email } }) }));
vi.mock('@/hooks', () => ({
  useHqOverview: (opts: { enabled?: boolean } = {}) => {
    h.overviewEnabled.push(opts.enabled ?? true);
    return { data: opts.enabled === false ? undefined : h.overview };
  },
}));

beforeEach(() => {
  h.email = undefined;
  h.overview = undefined;
  h.overviewEnabled = [];
});
afterEach(cleanup);

const nav = () => screen.getByRole('navigation', { name: 'CMS navigation' });
const links = () => within(nav()).getAllByRole('link').map((a) => a.getAttribute('href'));

it('shows partner staff the Partners department with Freecroco only — no HQ, no Staff page', () => {
  h.role = 'partner_staff';
  h.pathname = '/freecroco';
  render(<Sidebar />);
  const hrefs = new Set(links());
  expect([...hrefs].every((href) => href === '/freecroco' || href?.startsWith('/freecroco/'))).toBe(true);
  for (const href of ['/freecroco', '/freecroco/games', '/freecroco/calendar', '/freecroco/ranked-points', '/freecroco/deliveries', '/freecroco/players']) {
    expect(hrefs.has(href)).toBe(true);
  }
  expect(hrefs.has('/freecroco/staff')).toBe(false);
  expect(hrefs.has('/hq/departments/partners')).toBe(false);
  expect(within(nav()).queryByText('Company')).toBeNull();
  expect(within(nav()).queryByText('Content')).toBeNull();
  // Partner staff can't read HQ, so its live signals are never requested.
  expect(h.overviewEnabled.every((enabled) => enabled === false)).toBe(true);
});

it('shows admins the Company section and every department', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  render(<Sidebar />);
  const hrefs = links();
  expect(hrefs[0]).toBe('/hq');
  for (const href of ['/hq/goals', '/hq/analytics', '/hq/team', '/hq/board', '/hq/inbox', '/hq/schedules', '/hq/activity']) expect(hrefs).toContain(href);
  // v3 order: Standup, Goals, Analytics, Team, Work up top; Inbox/Automations/Activity under "More".
  expect(hrefs.slice(0, 5)).toEqual(['/hq', '/hq/goals', '/hq/analytics', '/hq/team', '/hq/board']);
  expect(within(nav()).getByText('Standup')).toBeTruthy();
  expect(within(nav()).getByText('More')).toBeTruthy();
  expect(hrefs.indexOf('/hq/inbox')).toBeGreaterThan(hrefs.indexOf('/hq/departments/partners'));
  for (const key of ['leadership', 'growth', 'content', 'competitions', 'engineering', 'partners']) {
    expect(hrefs).toContain(`/hq/departments/${key}`);
  }
  expect(within(nav()).getByText('Work')).toBeTruthy();
  expect(within(nav()).getByText('Automations')).toBeTruthy();
  expect(within(nav()).queryByText('Board')).toBeNull();
});

it("expands the department that owns the current tool page and lists its tools", () => {
  h.role = 'admin';
  h.pathname = '/questions/123';
  render(<Sidebar />);
  const hrefs = new Set(links());
  for (const href of ['/questions', '/categories', '/quiz-pages', '/agents']) expect(hrefs.has(href)).toBe(true);
  expect(hrefs.has('/weekend-league')).toBe(false); // Competitions stays collapsed
  fireEvent.click(screen.getByRole('button', { name: 'Expand Competitions' }));
  expect(new Set(links()).has('/weekend-league')).toBe(true);
});

it('keeps the Freecroco Staff page for admins', () => {
  h.role = 'admin';
  h.pathname = '/freecroco/staff';
  render(<Sidebar />);
  expect(new Set(links()).has('/freecroco/staff')).toBe(true);
});

it('badges the Inbox with approvals + unread messages, and flags busy departments', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  h.overview = {
    countsByStatus: { needs_approval: 2 },
    needsApproval: [],
    inboxUnread: 3,
    departments: [
      { key: 'growth', counts: { needsApproval: 1 }, working: [{ member: { id: 'a' }, task: { id: 't' } }] },
    ],
  };
  render(<Sidebar />);
  expect(within(nav()).getByRole('link', { name: 'Inbox (5)' })).toBeTruthy();
  expect(within(nav()).getByTitle('1 waiting for approval')).toBeTruthy();
  expect(within(nav()).getAllByLabelText('working').length).toBeGreaterThan(0);
});

it('shows Player activity under Growth only for the allowed account', () => {
  h.role = 'admin';
  h.pathname = '/stats';
  render(<Sidebar />);
  expect(links()).not.toContain('/activity');
  cleanup();
  h.email = 'bighead@quizball.com';
  render(<Sidebar />);
  expect(links()).toContain('/activity');
});
