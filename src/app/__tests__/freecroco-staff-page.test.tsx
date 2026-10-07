import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoStaffPage from '../(dashboard)/freecroco/staff/page';

const h = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role } }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1');
  h.role = 'admin';
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Object.values(toast).forEach((fn) => fn.mockClear());
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FreecrocoStaffPage />
    </QueryClientProvider>,
  );
}

const rowOf = (email: string) => screen.getByText(email).closest('tr') as HTMLTableRowElement;

it('lists staff with role, who added them and the last sign-in', async () => {
  renderPage();
  await screen.findByText('ops@freecroco.example');
  const row = rowOf('ops@freecroco.example');
  expect((within(row).getByLabelText('Role of ops@freecroco.example') as HTMLSelectElement).value).toBe('editor');
  expect(within(row).getByText('by admin@quizball.io')).toBeTruthy();
  expect(within(rowOf('analyst@freecroco.example')).getByText('Never')).toBeTruthy();
});

it('adds a member by email and role', async () => {
  const spy = vi.spyOn(getFreecrocoMock(), 'addStaff');
  renderPage();
  await screen.findByText('ops@freecroco.example');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: '  New.Person@Freecroco.example ' } });
  fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'editor' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add staff member' }));
  await screen.findByText('new.person@freecroco.example');
  expect(spy).toHaveBeenCalledWith({ email: 'New.Person@Freecroco.example', role: 'editor' });
  expect(toast.success).toHaveBeenCalledWith('Invite sent to new.person@freecroco.example.');
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('');
});

it('shows why an email was refused', async () => {
  renderPage();
  await screen.findByText('ops@freecroco.example');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'someone@quizball.io' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add staff member' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalled());
  expect(JSON.stringify(toast.error.mock.calls[0])).toContain('Quizball admin');
  expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('someone@quizball.io');
});

it('changes a role', async () => {
  const spy = vi.spyOn(getFreecrocoMock(), 'updateStaffRole');
  renderPage();
  await screen.findByText('analyst@freecroco.example');
  fireEvent.change(screen.getByLabelText('Role of analyst@freecroco.example'), { target: { value: 'editor' } });
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('analyst@freecroco.example is now an editor'));
  expect(spy).toHaveBeenCalledWith('7c0f6b2e-1d4a-4c55-9a51-0f1f6f3b2a02', 'editor');
});

it('removes a member only after confirmation', async () => {
  const spy = vi.spyOn(getFreecrocoMock(), 'removeStaff');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderPage();
  await screen.findByText('analyst@freecroco.example');
  fireEvent.click(screen.getByRole('button', { name: 'Remove analyst@freecroco.example' }));
  expect(confirm).toHaveBeenCalled();
  expect(spy).not.toHaveBeenCalled();

  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove analyst@freecroco.example' }));
  await waitFor(() => expect(screen.queryByText('analyst@freecroco.example')).toBeNull());
  expect(spy).toHaveBeenCalledWith('7c0f6b2e-1d4a-4c55-9a51-0f1f6f3b2a02');
});

it('never loads the list for partner staff', async () => {
  h.role = 'partner_staff';
  const spy = vi.spyOn(getFreecrocoMock(), 'listStaff');
  renderPage();
  expect(screen.getByText('Only Quizball admins can manage Freecroco staff.')).toBeTruthy();
  expect(screen.queryByLabelText('Email')).toBeNull();
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(spy).not.toHaveBeenCalled();
});
