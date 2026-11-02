import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  messages: [] as unknown[],
  membersError: null as unknown,
  refetchMembers: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/hq/inbox',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/hooks', () => ({
  useHqTasks: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useHqInbox: () => ({ data: h.messages, isLoading: false, error: null, refetch: vi.fn() }),
  useHqMembers: () => ({ data: h.membersError ? undefined : [], error: h.membersError, refetch: h.refetchMembers }),
  useMarkHqInboxRead: mutation,
  useApproveHqTask: mutation,
  useRejectHqTask: mutation,
  useRunHqTask: mutation,
}));

const { default: InboxPage } = await import('../inbox/page');

const author = { id: 'a1', slug: 'ops', name: 'Ops Reporter', avatar: '📊', color: 'blue', kind: 'agent' as const };
const longBody = 'A long direct message.\nLine two.\nLine three.\nLine four.\nLine five — still readable.';

beforeEach(() => {
  h.membersError = null;
  h.refetchMembers.mockReset();
  h.messages = [
    { id: 1, taskId: null, author, recipient: null, kind: 'comment', body: longBody, readAt: null, createdAt: '2026-11-03T06:00:00Z' },
    { id: 2, taskId: 't9', author, recipient: null, kind: 'comment', body: 'About task 9', readAt: null, createdAt: '2026-11-03T05:00:00Z' },
  ];
});
afterEach(cleanup);

it('shows task-less messages in full, and keeps task messages clamped', () => {
  render(<InboxPage />);
  fireEvent.click(screen.getByRole('tab', { name: /messages/i }));
  const taskless = screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === longBody);
  expect(taskless.className).not.toContain('line-clamp');
  expect(screen.getByText('About task 9').className).toContain('line-clamp-3');
});

it('explains why "Try again" is hidden when the team failed to load, with a retry', () => {
  h.membersError = new Error('boom');
  render(<InboxPage />);
  fireEvent.click(screen.getByRole('tab', { name: /blocked/i }));
  expect(screen.getByRole('alert').textContent).toMatch(/Try again.*hidden/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(h.refetchMembers).toHaveBeenCalledTimes(1);
});
