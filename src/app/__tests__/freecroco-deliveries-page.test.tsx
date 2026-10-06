import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoDeliveriesPage from '../(dashboard)/freecroco/deliveries/page';

const h = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('@/providers', () => ({ useAuth: () => ({ user: { role: h.role } }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FreecrocoDeliveriesPage />
    </QueryClientProvider>,
  );
}

it('offers Resend to admins on dead deliveries only', async () => {
  h.role = 'admin';
  renderPage();
  await within(await screen.findByRole('table')).findAllByText('Failed');
  const dead = within(screen.getByRole('table')).getAllByText('Failed').length;
  expect(screen.getAllByRole('button', { name: /Resend/ })).toHaveLength(dead);
});

it('never shows Resend to partner staff', async () => {
  h.role = 'partner_staff';
  renderPage();
  await within(await screen.findByRole('table')).findAllByText('Failed');
  expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull();
});

it('expands a row to its attempt history', async () => {
  h.role = 'admin';
  renderPage();
  const [toggle] = await screen.findAllByRole('button', { name: /attempts for evt_/ });
  fireEvent.click(toggle);
  await waitFor(() => expect(screen.getByText('#1')).toBeTruthy());
});

it('offers Retry after a failed load', async () => {
  h.role = 'admin';
  const mock = getFreecrocoMock();
  const original = mock.listDeliveries.bind(mock);
  const spy = vi.spyOn(mock, 'listDeliveries').mockRejectedValue(new Error('offline'));
  renderPage();
  await screen.findByText('Failed to load deliveries.');

  spy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await within(await screen.findByRole('table')).findAllByText('Failed');
  expect(screen.queryByText('Failed to load deliveries.')).toBeNull();
});

it('sends the request again when Apply or Reset is pressed with unchanged filters', async () => {
  h.role = 'admin';
  const mock = getFreecrocoMock();
  const original = mock.listDeliveries.bind(mock);
  const spy = vi.spyOn(mock, 'listDeliveries').mockRejectedValueOnce(new Error('offline'));
  renderPage();
  await screen.findByText('Failed to load deliveries.');
  expect(spy).toHaveBeenCalledTimes(1);

  spy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await within(await screen.findByRole('table')).findAllByText('Failed');
  expect(spy).toHaveBeenCalledTimes(2);

  // Reset with nothing changed asks again too.
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
});
