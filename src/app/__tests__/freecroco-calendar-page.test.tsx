import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import { addDays, formatDay, georgiaToday } from '@/lib/td/georgia';
import FreecrocoCalendarPage from '../(dashboard)/freecroco/calendar/page';

const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_FREECROCO_MOCK', '1'));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  Object.values(toast).forEach((fn) => fn.mockClear());
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FreecrocoCalendarPage />
    </QueryClientProvider>,
  );
  return client;
}

async function editTomorrow(value: string) {
  const day = addDays(georgiaToday(), 1);
  fireEvent.click(await screen.findByLabelText(formatDay(day)));
  fireEvent.change(await screen.findByLabelText("Pick 'em override"), { target: { value } });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
}

it('edits a day override, keeps it through a stale conflict, then saves', async () => {
  const day = addDays(georgiaToday(), 1);
  renderPage();
  fireEvent.click(await screen.findByLabelText(formatDay(day)));
  fireEvent.change(await screen.findByLabelText("Pick 'em override"), { target: { value: '0' } });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  expect(save.disabled).toBe(false);
  expect(screen.getAllByText('1 pending').length).toBeGreaterThan(0);

  getFreecrocoMock().simulateOtherEditor();
  fireEvent.click(save);
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/pending changes were kept/)));
  expect(screen.getAllByText('1 pending').length).toBeGreaterThan(0);

  await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved 1 change'));
});

it('keeps the version the draft started from when the user changes month', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  const putSpy = vi.spyOn(mock, 'putCalendar');
  await editTomorrow('2');
  const pinned = (await mock.getCalendar('2000-01-01', '2000-01-02')).version;

  mock.simulateOtherEditor();
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

  // The month now shown is newer than the draft: saving is blocked until the user reloads and reviews.
  await screen.findByText(/The calendar changed after you started editing/);
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  fireEvent.click(save);
  expect(putSpy).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Reload and review' }));
  await waitFor(() => expect(screen.queryByText(/The calendar changed after you started editing/)).toBeNull());
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved 1 change'));
  expect(putSpy.mock.calls[0][0].version).toBe(pinned + 1);
});

it('locks editing while a save is on its way, so nothing typed meanwhile is dropped', async () => {
  renderPage();
  await editTomorrow('5');
  const day = addDays(georgiaToday(), 1);

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Saving…');
  fireEvent.click(screen.getByLabelText(formatDay(day)));
  expect(((await screen.findByLabelText("Pick 'em override")) as HTMLInputElement).disabled).toBe(true);

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved 1 change'));
  await waitFor(() => expect(((screen.getByLabelText("Pick 'em override")) as HTMLInputElement).disabled).toBe(false));
});

it('refuses to rebase onto ranges that never agree: the old edit cannot be saved over a change it never saw', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  const putSpy = vi.spyOn(mock, 'putCalendar');
  await editTomorrow('3');

  // Another editor saves; then every range read answers a different version.
  mock.simulateOtherEditor();
  let version = 1000;
  vi.spyOn(mock, 'getCalendar').mockImplementation(async () => ({ version: ++version, overrides: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  await screen.findByText(/The calendar changed after you started editing/);

  fireEvent.click(screen.getByRole('button', { name: 'Reload and review' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/keeps changing/)));
  expect(screen.getByText(/The latest calendar could not be loaded/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  expect(putSpy).not.toHaveBeenCalled();
});

it('keeps editing locked through conflict recovery, so a value typed then is not wiped', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await editTomorrow('6');
  const day = addDays(georgiaToday(), 1);

  mock.simulateOtherEditor();
  // After the refused save: read 1 is the hook's reload (the mutation ends with it); read 2 is the page's
  // recovery reload, held open here. That is the window where the mutation no longer holds the page.
  const original = mock.getCalendar.bind(mock);
  let reads = 0;
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => (openGate = resolve));
  vi.spyOn(mock, 'getCalendar').mockImplementation(async (from, to) => {
    reads++;
    if (reads === 2) await gate;
    return original(from, to);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(reads).toBe(2), { timeout: 4000 });

  expect(toast.warning).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy();
  fireEvent.click(screen.getByLabelText(formatDay(day)));
  expect(((await screen.findByLabelText("Pick 'em override")) as HTMLInputElement).disabled).toBe(true);

  openGate();
  await waitFor(() => expect(toast.warning).toHaveBeenCalled(), { timeout: 4000 });
  await waitFor(() => expect(((screen.getByLabelText("Pick 'em override")) as HTMLInputElement).disabled).toBe(false));
  // The pending edit survived recovery.
  expect(((screen.getByLabelText("Pick 'em override")) as HTMLInputElement).value).toBe('6');
});

it('keeps the draft and the editor when a conflict is followed by failed reloads, and recovers on retry', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  const putSpy = vi.spyOn(mock, 'putCalendar');
  await editTomorrow('7');
  const day = addDays(georgiaToday(), 1);

  mock.simulateOtherEditor();
  const original = mock.getCalendar.bind(mock);
  const getSpy = vi.spyOn(mock, 'getCalendar').mockRejectedValue(new Error('offline'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  // The editor is still there, with its pending edit, a retry control and Save blocked.
  await screen.findByText(/The latest calendar could not be loaded/);
  expect(screen.queryByText('Failed to load the calendar.')).toBeNull();
  expect(screen.getAllByText('1 pending').length).toBeGreaterThan(0);
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  expect(toast.warning).not.toHaveBeenCalled();
  expect(putSpy).toHaveBeenCalledTimes(1);

  // Retrying while still offline changes nothing.
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);

  // Back online: a consistent reload unblocks Save, and the saved version is the reloaded one.
  getSpy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByText(/The latest calendar could not be loaded/)).toBeNull());
  await waitFor(() => expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText(formatDay(day)));
  expect(((await screen.findByLabelText("Pick 'em override")) as HTMLInputElement).value).toBe('7');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved 1 change'));
  expect(putSpy).toHaveBeenCalledTimes(2);
  expect(putSpy.mock.calls[1][0].version).toBeGreaterThan(putSpy.mock.calls[0][0].version);
});

it('shows the saved values, with a way to refresh, when the confirming reload fails', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  const day = addDays(georgiaToday(), 1);
  await editTomorrow('8');
  const original = mock.getCalendar.bind(mock);
  const getSpy = vi.spyOn(mock, 'getCalendar').mockRejectedValue(new Error('offline'));

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved 1 change'));

  // No error screen, no stale pre-save value: the grid shows the saved override and the pending edit is gone.
  expect(screen.queryByText('Failed to load the calendar.')).toBeNull();
  await screen.findByText(/Could not refresh the calendar/);
  expect(screen.queryAllByText('1 pending')).toHaveLength(0);
  fireEvent.click(screen.getByLabelText(formatDay(day)));
  expect(((await screen.findByLabelText("Pick 'em override")) as HTMLInputElement).value).toBe('8');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

  getSpy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh again' }));
  await waitFor(() => expect(screen.queryByText(/Could not refresh the calendar/)).toBeNull());
});
