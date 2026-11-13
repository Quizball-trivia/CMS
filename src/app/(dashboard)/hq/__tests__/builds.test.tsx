import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqBuild, HqBuildJob } from '@/types';

const api = vi.hoisted(() => ({ listBuilds: vi.fn(), submitBuild: vi.fn(), cancelBuild: vi.fn(), analytics: vi.fn() }));
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
  api.analytics.mockReset().mockResolvedValue({ days: 30, modeLabels: { 'invented-duel': 'Invented Duel' } });
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
  // One state badge: once there is a build, its stage replaces "Approved".
  const approved = screen.getByText('Club page banner').closest('li') as HTMLElement;
  expect(within(approved).getByText('Testing')).toBeTruthy();
  expect(within(approved).queryByText('Approved')).toBeNull();
});

it('names the state and what happens next, links the draft PR on the row, and puts the PR waiting for the founder first', async () => {
  const job = (stage: HqBuildJob['stage']): HqBuildJob => ({ id: `j-${stage}`, number: 9, stage, note: null, runsUsed: 1, runLimit: 5, startedAt: '2026-11-10T09:05:00Z', finishedAt: null });
  const ready = build({ id: 'b5', number: 16, title: 'Ready banner', status: 'approved', job: job('ready_to_publish') });
  const prOpen = build({
    id: 'b6', number: 17, title: 'Open PR banner', status: 'approved',
    job: { ...job('published'), prs: [{ repo: 'web', url: 'https://github.com/invented/web/pull/123' }, { repo: 'cms', url: 'javascript:alert(1)' }, { repo: 'backend', url: 'https://github.com@evil.example/pull/9' }] },
  });
  const merged = build({ id: 'b7', number: 18, title: 'Merged banner', status: 'approved', job: job('done') });
  api.listBuilds.mockResolvedValue({ items: [waiting, ready, merged, prOpen, failed, declined] });
  renderPage();
  await screen.findByText('Open PR banner');
  const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
  expect(within(row('Open PR banner')).getByText('PR open')).toBeTruthy();
  // A draft PR waiting for his merge is the row's main visual: an amber callout with the PR link.
  expect(within(row('Open PR banner')).getByText('Next: merge to staging — you')).toBeTruthy();
  const waitingFor = within(row('Open PR banner')).getByText('Waiting for your merge');
  const link = within(row('Open PR banner')).getByRole('link', { name: 'Draft PR #123' }) as HTMLAnchorElement;
  expect(link.href).toBe('https://github.com/invented/web/pull/123');
  expect(waitingFor.parentElement).toBe(link.parentElement);
  expect(link.parentElement?.className).toContain('bg-amber-50');
  // Neither the script URL nor the one with credentials (its real host is evil.example) is a link.
  expect(within(row('Open PR banner')).getAllByRole('link')).toHaveLength(1);
  // The badge and the sentence agree: the build passed, a draft PR is next ("Ready to publish" would overstate it).
  expect(within(row('Ready banner')).getByText('Ready for draft PR')).toBeTruthy();
  expect(within(row('Ready banner')).queryByText('Ready to publish')).toBeNull();
  expect(within(row('Ready banner')).getByText('Next: open draft PR — Publisher')).toBeTruthy();
  expect(screen.getByText('The PR is merged.')).toBeTruthy();
  // The row says when it last changed.
  expect(within(row('Ready banner')).getByText(/^Updated /)).toBeTruthy();
  // Why it stopped is on the row.
  expect(within(row('Fix the lobby timer')).getByText('Tests kept failing')).toBeTruthy();
  expect(within(row('Rewrite everything')).getByText('Too big for one build.')).toBeTruthy();

  const titles = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
  const at = (t: string) => titles.findIndex((x) => x.includes(t));
  expect(at('Open PR banner')).toBeLessThan(at('Ready banner'));
  expect(at('Ready banner')).toBeLessThan(at('Friends penalty mode'));
  // A merged build is finished; a draft PR still waiting for his merge is not.
  expect(at('Friends penalty mode')).toBeLessThan(at('Merged banner'));
});

it('the row says who does what next; the seven-step path is in the details', async () => {
  const job = (stage: HqBuildJob['stage']): HqBuildJob => ({ id: `j-${stage}`, number: 9, stage, note: null, runsUsed: 1, runLimit: 5, startedAt: '2026-11-10T09:05:00Z', finishedAt: null });
  const ready = build({ id: 'b5', number: 16, title: 'Ready banner', status: 'approved', job: job('ready_to_publish') });
  const prOpen = build({ id: 'b6', number: 17, title: 'Open PR banner', status: 'approved', job: job('published') });
  const notStarted = build({ id: 'b7', number: 18, title: 'Not started banner', status: 'approved' });
  api.listBuilds.mockResolvedValue({ items: [waiting, running, ready, prOpen, notStarted, failed, declined] });
  renderPage();
  await screen.findByText('Club page banner');
  const row = (title: string) => screen.getByText(title).closest('li') as HTMLElement;
  // The row: one next step with its owner, and no path until it is opened.
  expect(within(row('Friends penalty mode')).getByText('Next: review the request — Director')).toBeTruthy();
  expect(within(row('Not started banner')).getByText('Next: start the build — Builder')).toBeTruthy();
  expect(within(row('Club page banner')).getByText('Next: play-test on a phone and a desktop — Play-testers')).toBeTruthy();
  expect(row('Club page banner').querySelector('[data-step-state]')).toBeNull();

  const path = (title: string) => {
    open(title);
    const steps = [...row(title).querySelectorAll('[data-step-state]')].map((el) => `${el.textContent}:${el.getAttribute('data-step-state')}`);
    open(title);
    return steps;
  };
  const labels = ['Request', 'Director', 'Building', 'Review', 'Play-test', 'Draft PR', 'Merged'];
  // Waiting for the Director.
  expect(path('Friends penalty mode')).toEqual(['Request:done', 'Director:current', 'Building:todo', 'Review:todo', 'Play-test:todo', 'Draft PR:todo', 'Merged:todo']);
  // Approved, the Builder not started.
  expect(path('Not started banner')).toEqual(['Request:done', 'Director:done', 'Building:current', 'Review:todo', 'Play-test:todo', 'Draft PR:todo', 'Merged:todo']);
  // Testing is the play-test step.
  expect(path('Club page banner')).toEqual(['Request:done', 'Director:done', 'Building:done', 'Review:done', 'Play-test:current', 'Draft PR:todo', 'Merged:todo']);
  // Ready for a draft PR: the Draft PR step is next. A PR on staging is waiting for the merge.
  expect(path('Ready banner')).toEqual(['Request:done', 'Director:done', 'Building:done', 'Review:done', 'Play-test:done', 'Draft PR:current', 'Merged:todo']);
  expect(path('Open PR banner')).toEqual(['Request:done', 'Director:done', 'Building:done', 'Review:done', 'Play-test:done', 'Draft PR:done', 'Merged:current']);
  expect(path('Open PR banner').map((p) => p.split(':')[0])).toEqual(labels);
  // A failed or declined request has no path; the badge and reason say it.
  expect(path('Fix the lobby timer')).toEqual([]);
  expect(path('Rewrite everything')).toEqual([]);
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
  expect(screen.queryByRole('button', { name: 'Send to the Director' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'New build' }));
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

  await waitFor(() => expect(api.submitBuild).toHaveBeenCalledWith({ title: 'Free-kick wall mode', spec, kind: 'feature', repos: ['backend', 'web'], game: null }));
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Request #15 sent — the Director reviews it next'));
  await waitFor(() => expect(api.listBuilds).toHaveBeenCalledTimes(2));
  expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Spec') as HTMLTextAreaElement).value).toBe('');
});

it('keeps the form and shows the API message when a request is refused', async () => {
  api.submitBuild.mockRejectedValue(new Error('You may not ask for builds.'));
  renderPage();
  await screen.findByText('Friends penalty mode');
  fireEvent.click(screen.getByRole('button', { name: 'New build' }));
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

it('shows the play-test screenshots before and after, phone and desktop', async () => {
  const shot = (side: string, size: 'phone' | 'desktop') => ({ size, url: `https://example.test/${side}-${size}.png` });
  const withShots = {
    ...running,
    job: { ...running.job!, screenshots: { at: '2026-11-10T10:00:00Z', before: [shot('before', 'phone'), shot('before', 'desktop')], after: [shot('after', 'phone'), shot('after', 'desktop')] } },
  };
  api.listBuilds.mockResolvedValue({ items: [withShots] });
  renderPage();
  await screen.findByText('Club page banner');
  open('Club page banner');
  const imgs = () => screen.getAllByRole('img').map((i) => i.getAttribute('src'));
  expect(imgs()).toEqual(['https://example.test/before-phone.png', 'https://example.test/after-phone.png']);
  expect(screen.getByRole('button', { name: 'Phone' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Desktop' }));
  expect(screen.getByRole('button', { name: 'Desktop' }).getAttribute('aria-pressed')).toBe('true');
  expect(imgs()).toEqual(['https://example.test/before-desktop.png', 'https://example.test/after-desktop.png']);
});

it('says why a before shot is missing instead of showing nothing', async () => {
  const onlyAfter = { ...running, job: { ...running.job!, screenshots: { at: null, before: [], after: [{ size: 'phone' as const, url: 'https://example.test/a.png' }] } } };
  api.listBuilds.mockResolvedValue({ items: [onlyAfter] });
  renderPage();
  await screen.findByText('Club page banner');
  open('Club page banner');
  expect(screen.getByText(/No before shot/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Desktop' })).toBeNull();
});


it('tells a screen reader that a step the build went past without trying was skipped', async () => {
  const backendOnly = build({
    id: 'b8', number: 19, title: 'Backend only fix', status: 'approved',
    job: { id: 'j8', number: 6, stage: 'ready_to_publish', note: null, runsUsed: 1, runLimit: 5, startedAt: '2026-11-10T09:05:00Z', finishedAt: null, proof: { redGreen: true, reviews: 1, playtests: 0 } },
  });
  api.listBuilds.mockResolvedValue({ items: [backendOnly] });
  renderPage();
  await screen.findByText('Backend only fix');
  open('Backend only fix');
  const playTest = screen.getByText('Play-test', { selector: '[data-step-state]' });
  expect(playTest.getAttribute('data-step-state')).toBe('skipped');
  expect(playTest.textContent).toBe('Play-test (skipped)');
  expect(screen.getByText('Review', { selector: '[data-step-state]' }).textContent).toBe('Review');
});

it('says the games list is loading, and lets the user retry when it fails', async () => {
  let fail = true;
  api.analytics.mockImplementation(() => (fail ? Promise.reject(new Error('Analytics is down')) : Promise.resolve({ days: 30, modeLabels: { 'invented-duel': 'Invented Duel' } })));
  renderPage();
  await screen.findByText('Friends penalty mode');
  fireEvent.click(screen.getByRole('button', { name: 'New build' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Analytics is down');
  fail = false;
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(api.analytics).toHaveBeenCalledTimes(2);
  expect(screen.getByText(/Games played in the last 30 days/)).toBeTruthy();
});

it('disables the game selector with a loading label until the games list arrives', async () => {
  api.analytics.mockReturnValue(new Promise(() => {}));
  renderPage();
  await screen.findByText('Friends penalty mode');
  fireEvent.click(screen.getByRole('button', { name: 'New build' }));
  const trigger = screen.getByText('Loading games…').closest('button') as HTMLButtonElement;
  expect(trigger.disabled).toBe(true);
});
