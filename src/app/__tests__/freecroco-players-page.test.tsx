import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoPlayersPage from '../(dashboard)/freecroco/players/page';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.mocked(toast.error).mockClear();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FreecrocoPlayersPage />
    </QueryClientProvider>,
  );
}

const row = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

it('lists every player, filters by status and searches', async () => {
  renderPage();
  await screen.findByText('Player 2000');
  expect(screen.getByText('Player 2008')).toBeTruthy();
  expect(screen.getByText(/of 9/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Banned' }));
  await waitFor(() => expect(screen.queryByText('Player 2000')).toBeNull());
  expect(screen.getByText('Player 2007')).toBeTruthy();
  expect(screen.getByText('Multiple accounts')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'fc-2003' } });
  await waitFor(() => expect(screen.queryByText('Player 2000')).toBeNull());
  expect(screen.getByText('Player 2003')).toBeTruthy();
});

it('bans from the list with a reason and unbans, sending the reason only on a ban', async () => {
  renderPage();
  const spy = vi.spyOn(getFreecrocoMock(), 'setPlayerStatus');
  await screen.findByText('Player 2004');

  fireEvent.click(within(row('Player 2004')).getByRole('button', { name: 'Ban' }));
  fireEvent.change(await screen.findByLabelText('Reason (optional)'), { target: { value: '  bot account  ' } });
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ban player' }));
  await waitFor(() => expect(within(row('Player 2004')).getByText('Banned')).toBeTruthy());
  expect(within(row('Player 2004')).getByText('bot account')).toBeTruthy();
  expect(spy).toHaveBeenLastCalledWith('fc-2004', 'block', 'bot account');
  expect(toast.success).toHaveBeenCalledWith('Player 2004 is banned');

  fireEvent.click(within(row('Player 2004')).getByRole('button', { name: 'Unban' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Unban' }));
  await waitFor(() => expect(within(row('Player 2004')).getByText('Active')).toBeTruthy());
  expect(spy).toHaveBeenLastCalledWith('fc-2004', 'unblock', null);
});

it('tells a viewer that only editors can ban, and leaves the player as they were', async () => {
  renderPage();
  const { ApiClientError } = await import('@/services');
  const spy = vi.spyOn(getFreecrocoMock(), 'setPlayerStatus').mockRejectedValueOnce(
    new ApiClientError({ code: 'forbidden', message: 'Editor access is required' } as never, 403),
  );
  await screen.findByText('Player 2005');
  fireEvent.click(within(row('Player 2005')).getByRole('button', { name: 'Ban' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ban player' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Only editors can ban or unban players.'));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ban player' })).toBeTruthy();
  expect(within(row('Player 2005')).getByText('Active')).toBeTruthy();
});

it('opens a player to show today and can ban from there', async () => {
  renderPage();
  await screen.findByText('Player 2001');
  fireEvent.click(screen.getByText('Player 2001'));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText('Plays today');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Ban' }));
  expect(await screen.findByText('Ban Player 2001?')).toBeTruthy();
});

it('is in Georgian for Freecroco staff', async () => {
  const { AuthContext } = await import('@/providers/auth-provider');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <AuthContext.Provider value={{ user: { role: 'partner_staff' } as never, isLoading: false, isAuthenticated: true, login: vi.fn(), logout: vi.fn() }}>
      <QueryClientProvider client={client}>
        <FreecrocoPlayersPage />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  expect(await screen.findByText('Freecroco-ს მოთამაშეები')).toBeTruthy();
  await screen.findByText('Player 2000');
  expect(screen.getAllByRole('button', { name: 'დაბლოკვა' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: 'განბლოკვა' })).toBeTruthy();
});

it('steps back a page when a ban empties the page it was on', async () => {
  const mock = getFreecrocoMock();
  const real = mock.listPlayers.bind(mock);
  // Pretend there are 51 active players: page 2 holds one, and after the ban the list has 50.
  let total = 51;
  vi.spyOn(mock, 'listPlayers').mockImplementation(async (query) => {
    const page = await real({ ...query, offset: 0 });
    const items = query.offset >= total ? [] : page.items.slice(0, 1);
    return { total, items };
  });
  renderPage();
  await screen.findByText(/of 51/);
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await screen.findByText(/51–51 of 51/);
  total = 50;
  fireEvent.click(screen.getAllByRole('button', { name: 'Ban' })[0]);
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ban player' }));
  await screen.findByText(/1–50 of 50/);
});
