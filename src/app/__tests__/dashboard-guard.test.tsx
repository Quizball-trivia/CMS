import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from '../(dashboard)/layout';

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/categories',
  auth: { user: { role: 'admin' } as { role?: string } | null, isAuthenticated: true, isLoading: false },
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: h.replace }),
}));
vi.mock('@/providers', () => ({ useAuth: () => h.auth }));
vi.mock('@/components/layout', () => ({
  Sidebar: () => <nav>sidebar</nav>,
  Header: () => <header>header</header>,
  EnvironmentBanner: () => null,
}));

beforeEach(() => {
  h.auth = { user: { role: 'admin' }, isAuthenticated: true, isLoading: false };
  h.pathname = '/categories';
});
afterEach(() => {
  cleanup();
  h.replace.mockClear();
  h.push.mockClear();
});

const renderPage = () => render(<DashboardLayout><p>page content</p></DashboardLayout>);

describe('dashboard layout guard', () => {
  it('redirects partner staff from any other dashboard route without mounting it', () => {
    h.auth.user = { role: 'partner_staff' };
    renderPage();
    expect(h.replace).toHaveBeenCalledWith('/freecroco');
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('shows partner staff the Freecroco section', () => {
    h.auth.user = { role: 'partner_staff' };
    h.pathname = '/freecroco/calendar';
    renderPage();
    expect(h.replace).not.toHaveBeenCalled();
    expect(screen.getByText('page content')).toBeTruthy();
  });

  it('sends partner staff from the admin-only Staff page back to the section', () => {
    h.auth.user = { role: 'partner_staff' };
    h.pathname = '/freecroco/staff';
    renderPage();
    expect(h.replace).toHaveBeenCalledWith('/freecroco');
    expect(screen.queryByText('page content')).toBeNull();
  });

  it('leaves admins on every route, Freecroco included', () => {
    for (const path of ['/categories', '/freecroco', '/freecroco/staff']) {
      h.pathname = path;
      renderPage();
      expect(screen.getByText('page content')).toBeTruthy();
      cleanup();
    }
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('still sends signed-out visitors to login', () => {
    h.auth = { user: null, isAuthenticated: false, isLoading: false };
    renderPage();
    expect(h.push).toHaveBeenCalledWith('/login');
    expect(h.replace).not.toHaveBeenCalled();
  });
});
