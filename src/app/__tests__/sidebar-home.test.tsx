import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({ role: undefined as string | undefined }));
vi.mock('next/navigation', () => ({ usePathname: () => '/stats' }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role } }) }));
vi.mock('@/hooks', () => ({ useHqOverview: () => ({ data: undefined }) }));

afterEach(cleanup);

const logoHref = () => screen.getByLabelText('QuizBall HQ home').getAttribute('href');

it.each([undefined, 'admin'])('points the logo at the HQ Command Center for an admin (%s)', (role) => {
  h.role = role;
  render(<Sidebar />);
  expect(logoHref()).toBe('/hq');
});

it('points partner staff at the Freecroco section', () => {
  h.role = 'partner_staff';
  render(<Sidebar />);
  expect(logoHref()).toBe('/freecroco');
});
