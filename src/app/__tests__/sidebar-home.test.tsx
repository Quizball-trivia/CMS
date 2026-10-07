import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/sidebar';

const h = vi.hoisted(() => ({ role: undefined as string | undefined }));
vi.mock('next/navigation', () => ({ usePathname: () => '/stats' }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role } }) }));

afterEach(cleanup);

const logoHref = () => screen.getByLabelText('QuizBall CMS home').getAttribute('href');

it.each([undefined, 'admin'])('keeps the logo pointing at /stats for a normal admin (%s)', (role) => {
  h.role = role;
  render(<Sidebar />);
  expect(logoHref()).toBe('/stats');
});

it('points partner staff at the Freecroco section', () => {
  h.role = 'partner_staff';
  render(<Sidebar />);
  expect(logoHref()).toBe('/freecroco');
});
