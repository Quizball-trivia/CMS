import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getFreecrocoMock } from '@/lib/freecroco/mock';
import FreecrocoGamesPage from '../(dashboard)/freecroco/games/page';

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
      <FreecrocoGamesPage />
    </QueryClientProvider>,
  );
  return client;
}

const save = () => screen.getByRole('button', { name: 'Save' });

it('saves an edit through the mock, then tells the user when someone else saved first', async () => {
  renderPage();
  await screen.findByText('Countdown');
  expect((save() as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '4' } });
  expect((save() as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(save());
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Games saved'));
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('4');

  getFreecrocoMock().simulateOtherEditor();
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '6' } });
  fireEvent.click(save());
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Someone else saved/)));
  // The draft is dropped for the latest saved copy.
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('4');
});

it('blocks Save on an out-of-bound value', async () => {
  renderPage();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '11' } });
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/from 0 to 10/)).toBeTruthy();
});

it('saves the version the draft was based on, not whatever a later refetch brought in', async () => {
  const client = renderPage();
  await screen.findByText('Countdown');
  const loaded = await getFreecrocoMock().getGames();
  const putSpy = vi.spyOn(getFreecrocoMock(), 'putGames');

  fireEvent.change(screen.getByLabelText('Pick \'em plays per day'), { target: { value: '3' } });
  getFreecrocoMock().simulateOtherEditor();
  await client.invalidateQueries();

  await screen.findByText(/can no longer be saved/);
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(save());
  expect(putSpy).not.toHaveBeenCalled();
  expect(loaded.version).toBeLessThan((await getFreecrocoMock().getGames()).version);

  // Discarding shows the latest copy without the draft.
  fireEvent.click(screen.getByRole('button', { name: /Discard my changes/ }));
  expect((screen.getByLabelText('Pick \'em plays per day') as HTMLInputElement).value).toBe('1');
  expect(screen.queryByText(/can no longer be saved/)).toBeNull();
});

it('locks the form while a save is on its way, so no edit is lost when it finishes', async () => {
  renderPage();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '7' } });
  fireEvent.click(save());

  await screen.findByText('Saving…');
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Countdown enabled') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Move Countdown up') as HTMLButtonElement).disabled).toBe(true);

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Games saved'));
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('7');
});

it('keeps the form locked through conflict recovery, so a value typed then is not wiped', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '8' } });

  mock.simulateOtherEditor();
  // After the refused save: read 1 is the hook's reload (the mutation ends with it); read 2 is the page's
  // own recovery reload, held open here. That is the window where the mutation no longer holds the form.
  const original = mock.getGames.bind(mock);
  let reads = 0;
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => (openGate = resolve));
  vi.spyOn(mock, 'getGames').mockImplementation(async () => {
    reads++;
    if (reads === 2) await gate;
    return original();
  });
  fireEvent.click(save());
  await vi.waitFor(() => expect(reads).toBe(2), { timeout: 4000 });

  expect(toast.warning).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).disabled).toBe(true);

  openGate();
  await waitFor(() => expect(toast.warning).toHaveBeenCalled(), { timeout: 4000 });
  const input = screen.getByLabelText('Countdown plays per day') as HTMLInputElement;
  expect(input.disabled).toBe(false);
  // The draft was dropped for the latest copy: the value is the server's, not the unsaved 8.
  const server = (await original()).games.find((g) => g.gameId === 'countdown')!.defaultLimit;
  expect(input.value).toBe(String(server));
  expect(server).not.toBe(8);
});

it('shows what was saved, with a way to refresh, when the confirming reload fails', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '9' } });
  const original = mock.getGames.bind(mock);
  const getSpy = vi.spyOn(mock, 'getGames').mockRejectedValue(new Error('offline'));

  fireEvent.click(save());
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Games saved'));

  // The form is still there with the saved value, not an error screen.
  expect(screen.queryByText('Failed to load the games.')).toBeNull();
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('9');
  await screen.findByText(/Could not refresh the games/);

  getSpy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh again' }));
  await waitFor(() => expect(screen.queryByText(/Could not refresh the games/)).toBeNull());
  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('9');
});

it('keeps the draft when a refused save is followed by a failed reload, and recovers on refresh', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '2' } });
  mock.simulateOtherEditor();
  const original = mock.getGames.bind(mock);
  const getSpy = vi.spyOn(mock, 'getGames').mockRejectedValue(new Error('offline'));

  fireEvent.click(save());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/)));

  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).value).toBe('2');
  expect((save() as HTMLButtonElement).disabled).toBe(true);
  expect(toast.warning).not.toHaveBeenCalled();

  getSpy.mockImplementation(original);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh again' }));
  await waitFor(() => expect(toast.warning).toHaveBeenCalledWith(expect.stringMatching(/Someone else saved/)));
  await waitFor(() => expect(screen.queryByText(/Could not refresh the games/)).toBeNull());
});

it('keeps the form locked while Refresh again reloads after a refused save, so nothing typed then is wiped', async () => {
  renderPage();
  const mock = getFreecrocoMock();
  await screen.findByText('Countdown');
  fireEvent.change(screen.getByLabelText('Countdown plays per day'), { target: { value: '2' } });
  mock.simulateOtherEditor();
  const original = mock.getGames.bind(mock);
  const getSpy = vi.spyOn(mock, 'getGames').mockRejectedValue(new Error('offline'));
  fireEvent.click(save());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/could not be loaded/)));

  // Back online, but the reload is held open.
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => (openGate = resolve));
  getSpy.mockImplementation(async () => {
    await gate;
    return original();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh again' }));
  await vi.waitFor(() => expect(getSpy).toHaveBeenCalledTimes(3));

  expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText('Countdown enabled') as HTMLButtonElement).disabled).toBe(true);

  openGate();
  await waitFor(() => expect(toast.warning).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByLabelText('Countdown plays per day') as HTMLInputElement).disabled).toBe(false));
});
