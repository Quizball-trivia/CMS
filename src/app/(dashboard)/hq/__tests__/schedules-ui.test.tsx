import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqMember, HqSchedule } from '@/types';

// Invented-universe fixtures only (this repo is public).

const h = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/team/a1', useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/hooks', () => ({
  useCreateHqSchedule: mutation,
  useDeleteHqSchedule: mutation,
  useRunHqScheduleNow: mutation,
  useUpdateHqSchedule: () => ({ mutate: h.update, isPending: false }),
}));
vi.mock('../hq-ui', async (orig) => ({ ...(await orig<object>()), useTaskSheet: () => ({ openTask: vi.fn() }) }));

const { SchedulesTable } = await import('../schedules-ui');

const owner = { id: 'a1', slug: 'harbor-scout', name: 'Harbor Scout', avatar: '🔭', color: 'blue', kind: 'agent' as const };
const old = '2026-11-01T06:00:00Z';
const schedule = (extra: Partial<HqSchedule> = {}): HqSchedule => ({
  id: 's1', member: owner, name: 'Moonball morning check', cron: '0 8 * * *', timezone: 'Asia/Tbilisi', taskTitle: 'Check the Moonball table',
  taskBody: '', taskKind: 'task', enabled: true, nextRunAt: '2099-01-01T08:00:00Z', lastRunAt: null, lastTaskId: null, createdAt: old, updatedAt: old, ...extra,
});

beforeEach(() => h.update.mockReset());
afterEach(cleanup);

it('on an agent profile, uses the profile’s own status even when the member list has not loaded', () => {
  render(<SchedulesTable schedules={[schedule()]} members={[]} showMember={false} fixedMemberId="a1" fixedMemberStatus={'active' as HqMember['status']} />);
  // An active owner: the schedule is in the normal list, not folded away as blocked.
  expect(screen.getByText('Moonball morning check')).toBeTruthy();
  expect(screen.queryByText(/archived/i)).toBeNull();
});

it('reschedules an enabled schedule that has no next run, without asking for a changed field', () => {
  render(<SchedulesTable schedules={[schedule({ nextRunAt: null })]} members={[{ ...owner, status: 'active' } as unknown as HqMember]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }));
  expect(h.update).toHaveBeenCalledWith({ id: 's1', data: { cron: '0 8 * * *', timezone: 'Asia/Tbilisi' } }, expect.anything());
  expect(screen.queryByRole('button', { name: 'Set schedule' })).toBeNull();
});
