import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdAdminApi, TdContentData, TdContentType } from '@/lib/td/admin-api';
import type { TdApiClient } from '@/lib/td/api-client';
import type { TdTokenStore } from '@/lib/td/token-store';
import type { TdRole, TdStaff } from '@/types/td';

const h = vi.hoisted(() => ({
  admin: null as unknown as TdAdminApi,
  api: null as unknown as TdApiClient,
  tokens: null as unknown as TdTokenStore,
  user: null as TdStaff | null,
}));

vi.mock('@/lib/td/client', () => ({
  get tdAdmin() {
    return h.admin;
  },
  get tdApi() {
    return h.api;
  },
  get tdTokens() {
    return h.tokens;
  },
  TD_CONFIG: { deployEnv: 'local', apiUrl: 'https://td-api.mock', apiOrigin: null, mock: true },
}));
vi.mock('@/providers/td-auth-provider', () => ({ useTdAuth: () => ({ user: h.user, status: 'authenticated' }) }));

const { createTdAdminApi } = await import('@/lib/td/admin-api');
const { createTdApiClient, createTransport, requestTokenRefresh } = await import('@/lib/td/api-client');
const { createRefreshCoordinator } = await import('@/lib/td/refresh-coordinator');
const { memoryBlobStore } = await import('@/lib/td/mock/blob-store');
const { createMockTdApi, MOCK_PASSWORD, MOCK_STAFF } = await import('@/lib/td/mock-api');
const { createOrigin, MemoryStorage, put } = await import('@/lib/td/__tests__/helpers');
const { addDays, formatDay, georgiaToday } = await import('@/lib/td/georgia');
const { TdDailiesTab } = await import('../tabs/dailies-tab');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let generation = 0;

/** A signed-in client of the shared mock server, with its own session store (another browser). */
async function clientFor(role: TdRole) {
  const origin = createOrigin();
  const transport = createTransport(BASE, server);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: (token, id) => requestTokenRefresh(transport, token, id) });
  const api = createTdApiClient({ transport, tokens, coordinator });
  const staff = MOCK_STAFF.find((s) => s.role === role && s.status === 'active')!;
  const session = await api.login(staff.email, MOCK_PASSWORD);
  await put(tokens, { ...session, generation: `gen-${++generation}`, staffId: staff.id, refreshPendingSince: null });
  return { api, tokens, admin: createTdAdminApi(api), user: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } };
}

async function signIn(role: TdRole) {
  const client = await clientFor(role);
  Object.assign(h, { admin: client.admin, api: client.api, tokens: client.tokens, user: client.user });
  return client;
}

function renderTd(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Content written by one role and approved by another, as the workflow wants. */
async function approved<T extends TdContentType>(type: T, data: TdContentData<T>, writer: TdRole = 'ops', approver: TdRole = 'publisher') {
  const first = await clientFor(writer);
  const created = await first.admin.content(type).create({ data });
  const ready = await first.admin.content(type).ready(created.id, created.version);
  const second = await clientFor(approver);
  return second.admin.content(type).approve(ready.id, ready.version);
}

async function settingsOf(game: 'footballLogic' | 'putInOrder' | 'careerPath') {
  return (await h.admin.content('daily-settings').list({ game, status: 'draft,ready,approved,archived' })).items[0];
}

/** A change of the settings by `role`, left as a draft (or marked ready). */
async function changeSettings(role: TdRole, game: 'footballLogic' | 'putInOrder' | 'careerPath', change: (data: TdContentData<'daily-settings'>) => TdContentData<'daily-settings'>, ready = false) {
  const { admin } = await clientFor(role);
  const row = (await admin.content('daily-settings').list({ game })).items[0];
  const edited = await admin.content('daily-settings').edit(row.id, { version: row.version, data: change(row.data) });
  return ready ? admin.content('daily-settings').ready(edited.id, edited.version) : edited;
}

const gameButton = (name: string) => screen.findByRole('button', { name: new RegExp(name) });
const setBox = (key: string) => screen.getByRole('checkbox', { name: new RegExp(`^${key}\\b`) });

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:td-test');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  const storage = new MemoryStorage();
  const start = Date.now();
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => start + (Date.now() - start) * 40, blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('the Daily Challenges page', () => {
  it('lists the three daily games with their categories and seconds, and a dot for approved and covered', async () => {
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    expect(await gameButton('Football Logic')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Put in Order/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Career Path/ })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Football Logic/ })).getByText('2 categories')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Football Logic/ })).getByText('30 s')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Put in Order/ })).getByText('60 s')).toBeTruthy();
    // Career Path has no seconds.
    expect(within(screen.getByRole('button', { name: /Career Path/ })).queryByText(/ s$/)).toBeNull();
    await waitFor(() => expect(screen.getAllByRole('img', { name: 'Approved, and the next 30 days are covered' })).toHaveLength(3));
  });

  it('shows the selected game’s settings and its categories with their approved questions', async () => {
    const { admin } = await signIn('publisher');
    await admin.content('football-logic').create({ data: { key: 'fl-3-a', puzzle: 'fl-3', category: 'Clubs', prompt: '', imageA: null, imageB: null, displayAnswer: 'Roma', acceptedAnswers: ['roma'] } });
    renderTd(<TdDailiesTab />);
    expect(await screen.findByRole('heading', { name: 'Football Logic' })).toBeTruthy();
    expect(screen.getByText('Approved', { selector: '[data-slot="badge"]' })).toBeTruthy();
    expect(screen.getByText('2 categories', { selector: '[data-slot="badge"]' })).toBeTruthy();
    expect((screen.getByLabelText('Seconds / Question') as HTMLInputElement).value).toBe('30');
    expect(setBox('fl-1').closest('label')!.textContent).toContain('Day 1 · 2 approved · 2 total');
    expect(setBox('fl-2').closest('label')!.textContent).toContain('Day 2 · 1 approved · 1 total');
    expect(setBox('fl-3').closest('label')!.textContent).toBe('fl-30 approved · 1 total');
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(screen.queryByLabelText('Cycle starts')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 selected')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Select all' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Cycle starts') as HTMLInputElement).value).toBe('2026-09-01');

    fireEvent.change(screen.getByPlaceholderText('Search categories...'), { target: { value: 'fl-3' } });
    expect(screen.queryByRole('checkbox', { name: /^fl-1\b/ })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('Search categories...'), { target: { value: 'zzz' } });
    expect(screen.getByText('No categories match this search.')).toBeTruthy();
  });

  it('Career Path has no seconds, Put in Order has them per round, and what is typed stays while another game is open', async () => {
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '45' } });

    fireEvent.click(screen.getByRole('button', { name: /Put in Order/ }));
    expect((await screen.findByLabelText('Seconds / Round') as HTMLInputElement).value).toBe('60');
    expect(screen.queryByLabelText('Seconds / Question')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Career Path/ }));
    expect(await screen.findByLabelText('Cycle starts')).toBeTruthy();
    expect(screen.queryByLabelText(/^Seconds/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Football Logic/ }));
    expect((await screen.findByLabelText('Seconds / Question') as HTMLInputElement).value).toBe('45');
    expect(within(screen.getByRole('button', { name: /Football Logic/ })).getByText('45 s')).toBeTruthy();
  });

  it('holds Save for seconds outside 1 to 600', async () => {
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    const seconds = await screen.findByLabelText('Seconds / Question');
    fireEvent.change(seconds, { target: { value: '0' } });
    expect(screen.getByText('1 to 600 seconds.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(seconds, { target: { value: '90' } });
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('an editor changes the seconds and the categories in turn, saves and marks ready; another publisher approves', async () => {
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '45' } });
    // Taken out and put back: it now plays last.
    fireEvent.click(setBox('fl-1'));
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(setBox('fl-1'));
    expect(setBox('fl-1').closest('label')!.textContent).toContain('Day 2');
    expect(setBox('fl-2').closest('label')!.textContent).toContain('Day 1');
    expect(screen.queryByRole('button', { name: 'Mark ready' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Draft', { selector: '[data-slot="badge"]' })).toBeTruthy());
    const draft = await settingsOf('footballLogic');
    expect(draft.status).toBe('draft');
    expect(draft.data.seconds).toBe(45);
    expect(draft.data.cycle?.sets).toEqual(['fl-2', 'fl-1']);
    expect(draft.approved?.cycle?.sets).toEqual(['fl-1', 'fl-2']);

    // The status moves only on what is saved.
    const markReady = await screen.findByRole('button', { name: 'Mark ready' });
    fireEvent.change(screen.getByLabelText('Seconds / Question'), { target: { value: '46' } });
    expect(screen.getByText('Unsaved changes. Save before changing the status.')).toBeTruthy();
    expect((markReady as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Seconds / Question'), { target: { value: '45' } });
    expect((markReady as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(markReady);
    await waitFor(() => expect(screen.getByText('Ready for review', { selector: '[data-slot="badge"]' })).toBeTruthy());
    // An editor does not approve; the page says who does.
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Ready for a publisher to approve.')).toBeTruthy();
    // What a release would play is still the approved cycle.
    expect(screen.getByText(/Settings waiting for approval are not counted\./)).toBeTruthy();
    cleanup();

    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('Approved', { selector: '[data-slot="badge"]' })).toBeTruthy());
    const approvedRow = await settingsOf('footballLogic');
    expect(approvedRow.status).toBe('approved');
    expect(approvedRow.approved?.seconds).toBe(45);
    expect(approvedRow.approved?.cycle?.sets).toEqual(['fl-2', 'fl-1']);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByText(/Settings waiting for approval/)).toBeNull();
  });

  it('a save made on an older revision is refused, the edit kept; saving again is then a choice', async () => {
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '41' } });
    // Meanwhile someone else takes fl-2 out of the rotation.
    await changeSettings('publisher', 'footballLogic', (data) => ({ ...data, cycle: data.cycle ? { ...data.cycle, sets: ['fl-1'] } : null }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Someone changed this since you opened it.')).toBeTruthy());
    expect((await settingsOf('footballLogic')).data.cycle?.sets).toEqual(['fl-1']);
    expect((screen.getByLabelText('Seconds / Question') as HTMLInputElement).value).toBe('41');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await settingsOf('footballLogic')).data.seconds).toBe(41));
    // Their change to the rotation stays: this edit only changed the seconds.
    expect((await settingsOf('footballLogic')).data.cycle?.sets).toEqual(['fl-1']);
  });

  it('a draft typed while a save is on its way stays, and saves next on the revision that save made', async () => {
    await signIn('editor');
    // Saves of the settings wait for the gate.
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/daily-settings/') && init?.method === 'PATCH') await gate;
      return inner(input, init);
    }) as typeof fetch;
    const { admin } = await signIn('editor');
    h.admin = admin;
    renderTd(<TdDailiesTab />);
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '41' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Away and back while it is saving: the fields are free again, and a new value is typed.
    fireEvent.click(await gameButton('Put in Order'));
    fireEvent.click(await gameButton('Football Logic'));
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '30' } });
    open();
    await waitFor(async () => expect((await settingsOf('footballLogic')).data.seconds).toBe(41));
    expect((screen.getByLabelText('Seconds / Question') as HTMLInputElement).value).toBe('30');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await settingsOf('footballLogic')).data.seconds).toBe(30));
  });

  it('lists the days that play a category of their own, and a publisher sends them back to the rotation', async () => {
    const day = addDays(georgiaToday(), 3);
    await approved('daily-schedule', { game: 'footballLogic', date: day, puzzle: 'fl-2' });
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    expect(await screen.findByText(new RegExp(`1 day has a category of its own.*${formatDay(day)} \\(fl-2\\)`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play the rotation on those days' }));
    await waitFor(() => expect(screen.queryByText(/has a category of its own/)).toBeNull());
  });

  it('a publisher’s own edit waits for another publisher', async () => {
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    fireEvent.change(await screen.findByLabelText('Seconds / Question'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready' }));
    expect(await screen.findByText('You made the last edit, so another publisher approves it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    cleanup();

    await signIn('ops');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('Approved', { selector: '[data-slot="badge"]' })).toBeTruthy());
    expect((await settingsOf('footballLogic')).approved?.seconds).toBe(40);
  });

  it('an editor sees a ready row without Approve, and why', async () => {
    await changeSettings('publisher', 'putInOrder', (data) => ({ ...data, seconds: 50 }), true);
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await gameButton('Put in Order'));
    expect(await screen.findByText('Ready for review', { selector: '[data-slot="badge"]' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark ready' })).toBeNull();
    expect(screen.getByText('Ready for a publisher to approve.')).toBeTruthy();
  });

  it('refuses to approve a rotation that names a category with nothing approved, and says which', async () => {
    const { admin } = await signIn('editor');
    await admin.content('football-logic').create({ data: { key: 'fl-3-a', puzzle: 'fl-3', category: 'Clubs', prompt: '', imageA: null, imageB: null, displayAnswer: 'Roma', acceptedAnswers: ['roma'] } });
    renderTd(<TdDailiesTab />);
    await screen.findByLabelText('Seconds / Question');
    fireEvent.click(setBox('fl-3'));
    expect(setBox('fl-3').closest('label')!.textContent).toBe('fl-3Day 3 · 0 approved · 1 total');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready' }));
    await waitFor(() => expect(screen.getByText('Ready for review', { selector: '[data-slot="badge"]' })).toBeTruthy());
    cleanup();

    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approve what this refers to first.')).toBeTruthy();
    expect(screen.getByText(/Football Logic question in puzzle “fl-3”/)).toBeTruthy();
    expect((await settingsOf('footballLogic')).status).toBe('ready');
  });

  it('says that each of the next 30 days has a playable category, and which days have none once the rotation is gone', async () => {
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    expect(await screen.findByText('The next 30 days all have a playable category.')).toBeTruthy();
    cleanup();

    // A cycle cleared and approved: only a date's own entry plays.
    const row = await changeSettings('ops', 'footballLogic', (data) => ({ ...data, cycle: null }), true);
    await clientFor('publisher').then((client) => client.admin.content('daily-settings').approve(row.id, row.version));
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    const first = formatDay(georgiaToday());
    expect(await screen.findByText(`30 of the next 30 days have no playable category (from ${first}). A release needs all 30.`)).toBeTruthy();
    expect(screen.getByText('0 selected')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Football Logic/ })).getByText('0 categories')).toBeTruthy();
    // Not approved with a cycle any more: the dot goes grey; the other games keep theirs.
    expect(screen.getAllByRole('img', { name: 'Approved, and the next 30 days are covered' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Not approved, or some of the next 30 days have no playable category' })).toBeTruthy();
    cleanup();

    // Dates with their own approved entry count, though the page shows no calendar.
    const today = georgiaToday();
    await approved('daily-schedule', { game: 'footballLogic', date: today, puzzle: 'fl-1' });
    await approved('daily-schedule', { game: 'footballLogic', date: addDays(today, 1), puzzle: 'fl-2' });
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    expect(await screen.findByText(`28 of the next 30 days have no playable category (from ${formatDay(addDays(today, 2))}). A release needs all 30.`)).toBeTruthy();
  });

  it('a game without settings starts from the defaults, and Save creates them', async () => {
    const { admin } = await signIn('editor');
    const create = vi.fn<(body: unknown, options?: unknown) => Promise<never>>(async () => ({}) as never);
    const content = ((type: TdContentType) =>
      type === 'daily-settings' ? { ...admin.content(type), list: async () => ({ items: [], nextCursor: null }), create } : admin.content(type)) as TdAdminApi['content'];
    h.admin = { ...admin, content };
    renderTd(<TdDailiesTab />);
    fireEvent.click(await gameButton('Career Path'));
    expect(await screen.findByText('No settings yet', { selector: '[data-slot="badge"]' })).toBeTruthy();
    expect(screen.getByText('30 of the next 30 days have no playable category', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create.mock.calls[0][0]).toMatchObject({ data: { game: 'careerPath', seconds: null, cycle: null } });

    fireEvent.click(screen.getByRole('button', { name: /Football Logic/ }));
    expect((await screen.findByLabelText('Seconds / Question') as HTMLInputElement).value).toBe('30');
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][0]).toMatchObject({ data: { game: 'footballLogic', seconds: 30, cycle: { sets: ['fl-1', 'fl-2'] } } });
  });

  it('shows an archived settings row as archived, to be restored by a publisher and not by an editor', async () => {
    const { admin } = await signIn('publisher');
    const row = (await admin.content('daily-settings').list({ game: 'careerPath' })).items[0];
    await admin.content('daily-settings').archive(row.id, row.version);
    renderTd(<TdDailiesTab />);
    fireEvent.click(await gameButton('Career Path'));
    expect(await screen.findByText('Archived', { selector: '[data-slot="badge"]' })).toBeTruthy();
    expect(screen.getByText('Restore it before editing.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(screen.queryByText('Archived', { selector: '[data-slot="badge"]' })).toBeNull());
    expect((await settingsOf('careerPath')).status).not.toBe('archived');
    cleanup();

    const fresh = (await settingsOf('careerPath'))!;
    await admin.content('daily-settings').archive(fresh.id, fresh.version);
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await gameButton('Career Path'));
    expect(await screen.findByText('A publisher restores archived content.', { exact: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });
});
