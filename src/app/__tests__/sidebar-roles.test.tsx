import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({ role: undefined as string | undefined, pathname: '/freecroco' }));
vi.mock('next/navigation', () => ({ usePathname: () => h.pathname }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role } }) }));

afterEach(cleanup);

const links = () =>
  within(screen.getByRole('navigation', { name: 'CMS navigation' }))
    .getAllByRole('link')
    .map((a) => a.getAttribute('href'));

it('shows partner staff the Freecroco section only, without the Staff page', () => {
  h.role = 'partner_staff';
  h.pathname = '/freecroco';
  render(<Sidebar />);
  const hrefs = new Set(links());
  expect([...hrefs].every((href) => href === '/freecroco' || href?.startsWith('/freecroco/'))).toBe(true);
  for (const href of ['/freecroco', '/freecroco/games', '/freecroco/calendar', '/freecroco/ranked-points', '/freecroco/deliveries', '/freecroco/players']) {
    expect(hrefs.has(href)).toBe(true);
  }
  expect(hrefs.has('/freecroco/staff')).toBe(false);
  expect(screen.queryByText('Content')).toBeNull();
  expect(screen.queryByText('Users')).toBeNull();
});

it('shows admins every group and the Freecroco Staff page', () => {
  h.role = 'admin';
  h.pathname = '/freecroco/staff';
  render(<Sidebar />);
  const hrefs = new Set(links());
  expect(hrefs.has('/freecroco/staff')).toBe(true);
  expect(hrefs.has('/categories') || hrefs.has('/quiz-pages')).toBe(true);
  expect(hrefs.has('/users')).toBe(true);
});
