import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoPlayersPage from '../(dashboard)/freecroco/players/page';

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FreecrocoPlayersPage />
    </QueryClientProvider>,
  );
}

it('sends the lookup again when Look up is pressed for the same id after a failure', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  const original = mock.getPlayer.bind(mock);
  const spy = vi.spyOn(mock, 'getPlayer').mockRejectedValueOnce(new Error('offline'));

  fireEvent.change(screen.getByLabelText('Player id'), { target: { value: 'fc-2001' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await screen.findByText('Failed to look up the player.');
  expect(spy).toHaveBeenCalledTimes(1);

  spy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await screen.findByText('Player 2001');
  expect(spy).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Failed to look up the player.')).toBeNull();
});

it('looks up a different id as before', async () => {
  renderPage();
  fireEvent.change(screen.getByLabelText('Player id'), { target: { value: 'fc-2002' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await screen.findByText('Player 2002');
  fireEvent.change(screen.getByLabelText('Player id'), { target: { value: 'fc-2003' } });
  fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
  await waitFor(() => expect(screen.getByText('Player 2003')).toBeTruthy());
});
