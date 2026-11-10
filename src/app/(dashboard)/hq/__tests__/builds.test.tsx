import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqBuild } from '@/types';

const api = vi.hoisted(() => ({ listBuilds: vi.fn(), submitBuild: vi.fn(), cancelBuild: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/hq-api', () => ({ hqApi: api }));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({ usePathname: () => '/hq/builds', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

// jsdom has no ResizeObserver; Radix's checkbox measures itself inside a form.
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const { default: BuildsPage } = await import('../builds/page');

function build(extra: Partial<HqBuild> & Pick<HqBuild, 'id' | 'number' | 'title'>): HqBuild {
  return {
    kind: 'feature', repos: ['web'], status: 'submitted', requestedBy: 'Nika', spec: 'Add a banner to the invented club page.',
    directorSpec: null, directorNote: null, createdAt: '2026-11-10T08:00:00Z', decidedAt: null, job: null, ...extra,
  };
}

const waiting = build({ id: 'b1', number: 11, title: 'Friends penalty mode', kind: 'game_mode', repos: ['backend', 'web'], spec: 'A friends-only shootout with a lobby code.' });
const running = build({
  id: 'b2', number: 12, title: 'Club page banner', status: 'approved', decidedAt: '2026-11-10T09:00:00Z',
  directorNote: 'Scoped to the invented club page only.', directorSpec: '## Plan\n\nAdd a banner.',
  job: { id: 'j1', number: 3, stage: 'testing', note: 'Waiting on the web test run', runsUsed: 2, runLimit: 5, startedAt: '2026-11-10T09:05:00Z', finishedAt: null },
});
const failed = build({
  id: 'b3', number: 13, title: 'Fix the lobby timer', kind: 'bug_fix', status: 'approved',
  job: { id: 'j2', number: 4, stage: 'failed', note: 'Tests kept failing', runsUsed: 5, runLimit: 5, startedAt: '2026-11-10T09:05:00Z', finishedAt: '2026-11-10T10:00:00Z' },
});
const declined = build({ id: 'b4', number: 14, title: 'Rewrite everything', kind: 'other', status: 'declined', directorNote: 'Too big for one build.', decidedAt: '2026-11-10T09:30:00Z' });

let client: QueryClient;

function renderPage() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BuildsPage />
    </QueryClientProvider>
  );
}

const open = (title: string) => fireEvent.click(screen.getByText(title).closest('button') as HTMLButtonElement);

beforeEach(() => {
  api.listBuilds.mockReset().mockResolvedValue({ items: [waiting, running, failed, declined] });
  api.submitBuild.mockReset().mockResolvedValue({ ...waiting, id: 'b9', number: 15 });
  api.cancelBuild.mockReset().mockResolvedValue({ result: 'cancelled' });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => {
  cleanup();
  client.clear();
});

it('lists requests with kind, repos, status, requester and the build stage', async () => {
  renderPage();
  await screen.findByText('Friends penalty mode');
  const row = screen.getByText('Friends penalty mode').closest('li') as HTMLElement;
  expect(within(row).getByText('#11')).toBeTruthy();
  for (const text of ['Game mode', 'Backend', 'Web', 'Submitted', 'Nika']) expect(within(row).getByText(text)).toBeTruthy();
  const approved = screen.getByText('Club page banner').closest('li') as HTMLElement;
  expect(within(approved).getByText('Approved')).toBeTruthy();
  expect(within(approved).getByText('Testing')).toBeTruthy();
});

it('expands to the spec, the Director’s note and version, and the build progress', async () => {
  renderPage();
  await screen.findByText('Club page banner');
  open('Club page banner');
  expect(screen.getByText('Add a banner to the invented club page.')).toBeTruthy();
  expect(screen.getByText('Director’s note')).toBeTruthy();
  expect(screen.getByText('Scoped to the invented club page only.')).toBeTruthy();
  expect(screen.getByText('Director’s version')).toBeTruthy();
  expect(screen.getByText('Plan')).toBeTruthy();
  const steps = within(screen.getByRole('list', { name: 'Build progress' })).getAllByRole('listitem');
  expect(steps.map((s) => s.textContent)).toEqual(['Queued', 'Building', 'Reviewing', 'Testing', 'Rating', 'Ready']);
  expect(steps.filter((s) => s.getAttribute('aria-current') === 'step').map((s) => s.textContent)).toEqual(['Testing']);
  expect(screen.getByText('Runs 2/5')).toBeTruthy();
  expect(screen.getByText('Waiting on the web test run')).toBeTruthy();
});

it('shows a failed build as an outcome at the end of the line', async () => {
  renderPage();
  await screen.findByText('Fix the lobby timer');
  open('Fix the lobby timer');
  const steps = within(screen.getByRole('list', { name: 'Build progress' })).getAllByRole('listitem');
  expect(steps[steps.length - 1].textContent).toBe('Failed');
  expect(steps.some((s) => s.getAttribute('aria-current') === 'step')).toBe(false);
});

it('offers Cancel only on requests that are not finished', async () => {
  renderPage();
  await screen.findByText('Friends penalty mode');
  for (const [title, cancellable] of [['Friends penalty mode', true], ['Club page banner', true], ['Fix the lobby timer', false], ['Rewrite everything', false]] as const) {
    open(title);
    expect(!!screen.queryByRole('button', { name: 'Cancel' })).toBe(cancellable);
    open(title);
  }
});

it('cancelling needs a note and says whether the build was stopped', async () => {
  api.cancelBuild.mockResolvedValue({ result: 'build_stopped' });
  renderPage();
  await screen.findByText('Club page banner');
  open('Club page banner');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  const confirm = screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Cancel note'), { target: { value: '  Superseded by the new design  ' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(api.cancelBuild).toHaveBeenCalledWith('b2', 'Superseded by the new design'));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Build #12 stopped'));
  // The list is refreshed.
  await waitFor(() => expect(api.listBuilds).toHaveBeenCalledTimes(2));
});

it('shows the API message when cancelling is refused', async () => {
  api.cancelBuild.mockRejectedValue(new Error('This build has already finished.'));
  renderPage();
  await screen.findByText('Friends penalty mode');
  open('Friends penalty mode');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.change(screen.getByLabelText('Cancel note'), { target: { value: 'Not needed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This build has already finished.'));
  expect(toast.success).not.toHaveBeenCalled();
});

it('sends a request once it has a title, a long enough spec and a repo', async () => {
  renderPage();
  await screen.findByText('Friends penalty mode');
  const send = screen.getByRole('button', { name: 'Send to the Director' }) as HTMLButtonElement;
  expect(screen.getByText(/the Director reviews it before the Builder starts/)).toBeTruthy();
  expect(send.disabled).toBe(true);

  fireEvent.change(screen.getByLabelText('Title'), { target: { value: '  Free-kick wall mode  ' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Web' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Backend' }));
  fireEvent.change(screen.getByLabelText('Spec'), { target: { value: 'too short' } });
  expect(screen.getByText(/At least 20 characters/)).toBeTruthy();
  expect(send.disabled).toBe(true);

  const spec = 'Players line up a wall, then take turns bending free kicks around it.';
  fireEvent.change(screen.getByLabelText('Spec'), { target: { value: `  ${spec}  ` } });
  expect(send.disabled).toBe(false);
  fireEvent.click(send);

  await waitFor(() => expect(api.submitBuild).toHaveBeenCalledWith({ title: 'Free-kick wall mode', spec, kind: 'feature', repos: ['backend', 'web'] }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request #15 sent — the Director reviews it next'));
  await waitFor(() => expect(api.listBuilds).toHaveBeenCalledTimes(2));
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Spec') as HTMLTextAreaElement).value).toBe('');
});

it('keeps the form and shows the API message when a request is refused', async () => {
  api.submitBuild.mockRejectedValue(new Error('You may not ask for builds.'));
  renderPage();
  await screen.findByText('Friends penalty mode');
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Free-kick wall mode' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'CMS' }));
  fireEvent.change(screen.getByLabelText('Spec'), { target: { value: 'Players line up a wall, then take turns.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send to the Director' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You may not ask for builds.'));
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Free-kick wall mode');
});

it('says so when there are no requests, and when they cannot be loaded', async () => {
  api.listBuilds.mockResolvedValue({ items: [] });
  renderPage();
  await screen.findByText('No build requests yet.');
  cleanup();
  api.listBuilds.mockRejectedValue(new Error('HQ is down'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('HQ is down');
});
