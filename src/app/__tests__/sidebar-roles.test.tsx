import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({
  role: undefined as string | undefined,
  realData: false,
  email: undefined as string | undefined,
  pathname: '/freecroco',
}));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));
vi.mock('@/hooks/use-real-analytics-visible', () => ({ useRealAnalyticsVisible: () => h.realData }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role, email: h.email } }) }));

beforeEach(() => {
  h.realData = false;
  h.email = undefined;
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

it('shows admins Home and Analytics, then one group per department, and nothing of the old HQ', () => {
  h.role = 'admin';
  h.pathname = '/hq';
  render(<Sidebar />);
  const hrefs = links();
  expect(hrefs.slice(0, 2)).toEqual(['/hq', '/hq/analytics']);
  expect(within(nav()).getByText('Departments')).toBeTruthy();
  for (const name of ['Content', 'Games', 'Competitions', 'Growth', 'Partners']) expect(within(nav()).getByText(name)).toBeTruthy();
  // A department with its own HQ page opens on it; one without opens on its first tool.
  expect(within(nav()).getByRole('link', { name: 'Content' }).getAttribute('href')).toBe('/hq/content');
  expect(within(nav()).getByRole('link', { name: 'Games' }).getAttribute('href')).toBe('/hq/games');
  expect(within(nav()).getByRole('link', { name: 'Competitions' }).getAttribute('href')).toBe('/weekend-league');
  for (const gone of ['Work', 'Builds', 'Team', 'Romero', 'Goals', 'Messages', 'Schedules', 'Activity', 'More', 'Leadership', 'Engineering']) expect(within(nav()).queryByText(gone)).toBeNull();
  expect(hrefs.some((href) => /^\/hq\/(board|builds|team|director|goals|inbox|schedules|activity|departments)/.test(href ?? ''))).toBe(false);
  expect(hrefs).toContain('/settings');
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

it('keeps the real-data pages under Growth behind the Preferences toggle, and Preferences reachable', () => {
  h.role = 'admin';
  h.pathname = '/stats';
  render(<Sidebar />);
  expect(links()).toContain('/settings');
  expect(links()).not.toContain('/analytics');
  expect(links()).not.toContain('/persons');
  cleanup();
  h.realData = true;
  render(<Sidebar />);
  expect(links()).toEqual(expect.arrayContaining(['/stats', '/analytics', '/persons']));
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
