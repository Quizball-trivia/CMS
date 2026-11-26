import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({
  role: undefined as string | undefined,
  email: undefined as string | undefined,
  pathname: '/freecroco',
  logout: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role, email: h.email }, logout: h.logout }) }));

beforeEach(() => {
  h.email = undefined;
  h.logout.mockClear();
});
afterEach(cleanup);

const nav = () => screen.getByRole('navigation', { name: 'CMS navigation' });
const links = () => within(nav()).getAllByRole('link').map((a) => a.getAttribute('href'));

it('shows partner staff the Partners department with Freecroco only — no HQ, Staff, Calendar, Deliveries or Ranked points', () => {
  h.role = 'partner_staff';
  h.pathname = '/freecroco';
  render(<Sidebar />);
  const hrefs = new Set(links());
  expect([...hrefs].every((href) => href === '/freecroco' || href?.startsWith('/freecroco/'))).toBe(true);
  for (const href of ['/freecroco', '/freecroco/games', '/freecroco/players']) {
    expect(hrefs.has(href)).toBe(true);
  }
  for (const href of ['/freecroco/staff', '/freecroco/calendar', '/freecroco/ranked-points', '/freecroco/deliveries']) {
    expect(hrefs.has(href)).toBe(false);
  }
  expect(within(nav()).queryByText('Home')).toBeNull();
  expect(within(nav()).queryByText('Content')).toBeNull();
});

it('shows admins Home, Analytics and Agents, then one group per department, and nothing of the old HQ', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  render(<Sidebar />);
  const hrefs = links();
  expect(hrefs.slice(0, 3)).toEqual(['/hq', '/hq/analytics', '/hq/agents']);
  expect(within(nav()).getByText('Departments')).toBeTruthy();
  // Every department opens on its own HQ page.
  for (const [name, href] of [['Content', '/hq/content'], ['Games', '/hq/games'], ['Competitions', '/hq/competitions'], ['Marketing', '/hq/marketing'], ['Partners', '/hq/partners'], ['Investors', '/hq/investors']]) {
    expect(within(nav()).getByRole('link', { name }).getAttribute('href')).toBe(href);
  }
  for (const gone of ['Work', 'Builds', 'Team', 'Romero', 'Goals', 'Messages', 'Schedules', 'Activity', 'More', 'Leadership', 'Engineering', 'Growth', 'Preferences']) expect(within(nav()).queryByText(gone)).toBeNull();
  expect(hrefs.some((href) => /^\/hq\/(board|builds|team|director|goals|inbox|schedules|activity|departments)/.test(href ?? ''))).toBe(false);
  expect(hrefs).not.toContain('/settings');
  expect(hrefs).not.toContain('/analytics');
});

it('signs out from the foot of the sidebar', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  render(<Sidebar />);
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(h.logout).toHaveBeenCalledTimes(1);
});

it('lists a department\'s own HQ page first, then its tools', () => {
  h.role = 'admin';
  h.pathname = '/hq/games';
  render(<Sidebar />);
  const hrefs = links();
  const at = (href: string) => hrefs.indexOf(href);
  expect(at('/bot-tuning')).toBeGreaterThan(-1);
  expect(hrefs.filter((x) => x === '/hq/games').length).toBeGreaterThan(0);
  expect(new Set(hrefs).has('/daily-challenges')).toBe(true);
  cleanup();
  h.pathname = '/hq/content-gaps';
  render(<Sidebar />);
  expect(new Set(links()).has('/questions')).toBe(true);
});

it("expands the department that owns the current tool page and lists its tools", () => {
  h.role = 'admin';
  h.pathname = '/questions/123';
  render(<Sidebar />);
  const hrefs = new Set(links());
  for (const href of ['/questions', '/categories', '/quiz-pages', '/agents']) expect(hrefs.has(href)).toBe(true);
  // Competitions stays collapsed: only its header shows (which opens its first tool).
  expect(hrefs.has('/weekend-league/content')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Expand Competitions' }));
  expect(new Set(links()).has('/weekend-league/content')).toBe(true);
});

it('keeps the Freecroco Staff page for admins', () => {
  h.role = 'admin';
  h.pathname = '/freecroco/staff';
  render(<Sidebar />);
  expect(new Set(links()).has('/freecroco/staff')).toBe(true);
});

it('opens the pages about players under Analytics, Player activity only for the allowed account', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  render(<Sidebar />);
  expect(links()).not.toContain('/audience');
  cleanup();
  h.pathname = '/hq/analytics';
  render(<Sidebar />);
  expect(links()).toEqual(expect.arrayContaining(['/audience', '/persons']));
  expect(links()).not.toContain('/activity');
  cleanup();
  h.pathname = '/persons/registered/1';
  h.email = 'bighead@quizball.com';
  render(<Sidebar />);
  expect(links()).toEqual(expect.arrayContaining(['/audience', '/persons', '/activity']));
});
