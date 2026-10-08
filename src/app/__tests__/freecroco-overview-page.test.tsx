import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import { addDays, georgiaToday } from '@/lib/td/georgia';
import FreecrocoOverviewPage from '../(dashboard)/freecroco/page';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1');
  // recharts' ResponsiveContainer measures with a ResizeObserver, which jsdom lacks.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FreecrocoOverviewPage />
    </QueryClientProvider>,
  );
}

it('shows today and yesterday side by side on every KPI card, from the last 14 Georgian days', async () => {
  const today = georgiaToday();
  const spy = vi.spyOn(getFreecrocoMock(), 'getStats');
  renderPage();
  const stats = await getFreecrocoMock().getStats(addDays(today, -13), today);
  await screen.findByTestId('kpi-activePlayers-today');
  expect(spy).toHaveBeenCalledWith(addDays(today, -13), today);
  for (const metric of ['activePlayers', 'newPlayers', 'playsStarted', 'pointsSent'] as const) {
    expect(screen.getByTestId(`kpi-${metric}-today`).textContent).toBe(stats.todayStats[metric].toLocaleString('en-US'));
    expect(screen.getByTestId(`kpi-${metric}-yesterday`).textContent).toBe(stats.yesterdayStats[metric].toLocaleString('en-US'));
  }
  expect(screen.getByText('By game')).toBeTruthy();
  expect(screen.getByText('Vs Freecroco players')).toBeTruthy();
  expect(screen.getByText('Oldest pending')).toBeTruthy();
});

it('asks for a preset range and for a custom one', async () => {
  const today = georgiaToday();
  const spy = vi.spyOn(getFreecrocoMock(), 'getStats');
  renderPage();
  await screen.findByTestId('kpi-activePlayers-today');

  fireEvent.click(screen.getByRole('button', { name: '30 days' }));
  await waitFor(() => expect(spy).toHaveBeenLastCalledWith(addDays(today, -29), today));

  fireEvent.change(screen.getByLabelText('From'), { target: { value: addDays(today, -3) } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: addDays(today, -1) } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => expect(spy).toHaveBeenLastCalledWith(addDays(today, -3), addDays(today, -1)));
});

it('refuses a range the backend would refuse', async () => {
  const today = georgiaToday();
  renderPage();
  await screen.findByTestId('kpi-activePlayers-today');
  fireEvent.change(screen.getByLabelText('From'), { target: { value: addDays(today, -100) } });
  expect(screen.getByText('At most 92 days at a time')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('From'), { target: { value: today } });
  fireEvent.change(screen.getByLabelText('To'), { target: { value: addDays(today, -1) } });
  expect(screen.getByText('From must be on or before To')).toBeTruthy();
});

it('offers Retry after a failed load', async () => {
  const mock = getFreecrocoMock();
  const original = mock.getStats.bind(mock);
  const spy = vi.spyOn(mock, 'getStats').mockRejectedValue(new Error('offline'));
  renderPage();
  await screen.findByText('Failed to load the overview.');
  spy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByTestId('kpi-activePlayers-today');
});
