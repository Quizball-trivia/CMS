import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoRankedPointsPage from '../(dashboard)/freecroco/ranked-points/page';

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
      <FreecrocoRankedPointsPage />
    </QueryClientProvider>,
  );
  return client;
}

const save = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

it('shows the contract table and the note that values are agreed with Freecroco', async () => {
  renderPage();
  await screen.findByText('Win by 6 or more goals');
  expect(field('Win by 1 goal winner').value).toBe('100');
  expect(field('Win by 1 goal loser').value).toBe('50');
  expect(field('Win by 6 or more goals winner').value).toBe('500');
  expect(field('Draw, won on penalties loser').value).toBe('50');
  expect(field('Draw after penalties').value).toBe('60');
  expect(field('Opponent left, stayer not ahead').value).toBe('100');
  expect(screen.getByText(/agreed with Freecroco/)).toBeTruthy();
  expect(save().disabled).toBe(true);
});

it('saves an edit, follows the new maximum, then reports a save that lost to another editor', async () => {
  renderPage();
  await screen.findByText('Win by 6 or more goals');
  fireEvent.change(field('Win by 6 or more goals winner'), { target: { value: '800' } });
  expect(screen.getByText('800')).toBeTruthy();
  fireEvent.click(save());
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ranked points saved'));
  expect(field('Win by 6 or more goals winner').value).toBe('800');
  expect((await getFreecrocoMock().getRankedPoints()).maxScore).toBe(800);

  getFreecrocoMock().simulateOtherEditor();
  fireEvent.change(field('Win by 2 goals winner'), { target: { value: '175' } });
  fireEvent.click(save());
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Someone else saved/)));
  // The draft is dropped for the latest saved copy.
  expect(field('Win by 2 goals winner').value).toBe('150');
});

it('blocks Save on a loser above the winner, a fraction, an empty box or a value over 5000', async () => {
  renderPage();
  await screen.findByText('Win by 6 or more goals');
  fireEvent.change(field('Win by 3 goals loser'), { target: { value: '250' } });
  expect(save().disabled).toBe(true);
  expect(screen.getByText('Winner points must be at least the loser points')).toBeTruthy();
  fireEvent.change(field('Win by 3 goals loser'), { target: { value: '200' } });
  expect(screen.queryByText('Winner points must be at least the loser points')).toBeNull();
  expect(save().disabled).toBe(false);

  for (const value of ['5001', '1.5', '', '-1']) {
    fireEvent.change(field('Draw after penalties'), { target: { value } });
    expect(save().disabled).toBe(true);
    expect(screen.getByText(/Whole number from 0 to 5000/)).toBeTruthy();
  }
});

it('saves the version the draft was based on, not whatever a later refetch brought in', async () => {
  const client = renderPage();
  await screen.findByText('Win by 6 or more goals');
  const putSpy = vi.spyOn(getFreecrocoMock(), 'putRankedPoints');
  fireEvent.change(field('Opponent left, stayer not ahead'), { target: { value: '120' } });
  getFreecrocoMock().simulateOtherEditor();
  await client.invalidateQueries();

  await screen.findByText(/can no longer be saved/);
  expect(save().disabled).toBe(true);
  fireEvent.click(save());
  expect(putSpy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Discard my changes/ }));
  expect(screen.queryByText(/can no longer be saved/)).toBeNull();
});

it('keeps the draft when a refused save is followed by a failed reload, and recovers on refresh', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await screen.findByText('Win by 6 or more goals');
  fireEvent.change(field('Win by 4 goals winner'), { target: { value: '260' } });
  mock.simulateOtherEditor();
  const original = mock.getRankedPoints.bind(mock);
  const getSpy = vi.spyOn(mock, 'getRankedPoints').mockRejectedValue(new Error('offline'));

  fireEvent.click(save());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/)));
  expect(field('Win by 4 goals winner').value).toBe('260');
  expect(save().disabled).toBe(true);

  getSpy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh again' }));
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Someone else saved/)));
  await waitFor(() => expect(screen.queryByText(/Could not refresh the ranked points/)).toBeNull());
});

it('is read-only for partner staff', async () => {
  h.role = 'partner_staff';
  renderPage();
  await screen.findByText('Win by 6 or more goals');
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(field('Win by 1 goal winner').disabled).toBe(true);
  expect(field('Draw after penalties').disabled).toBe(true);
  expect(screen.getByText(/Only Quizball admins can change them/)).toBeTruthy();
});
