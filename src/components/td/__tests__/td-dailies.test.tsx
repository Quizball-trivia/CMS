import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdAdminApi } from '@/lib/td/admin-api';
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
const { toast } = await import('sonner');
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
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}


beforeAll(() => {
  // What Radix's Select asks of a browser and jsdom lacks.
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  URL.createObjectURL = vi.fn(() => 'blob:td-test');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  const storage = new MemoryStorage();
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => Date.now(), blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', window.location.pathname);
});

/** `count` Football Logic questions in the upload format. */
const logic = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) => `${from + i}. Prompt: Question ${from + i}?\nAnswer: Answer ${from + i}`).join('\n');

async function uploadFile(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Upload Questions' }));
  const dialog = await screen.findByRole('dialog');
  // Football Logic's own label for its questions.
  fireEvent.keyDown(within(dialog).getByRole('combobox', { name: /Topic/ }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: 'Clubs' }));
  fireEvent.change(within(dialog).getByLabelText(/Question File/), { target: { files: [new File([text], 'logic.txt', { type: 'text/plain' })] } });
  return dialog;
}

describe('the Daily page', () => {
  it('shows the three games, one at a time, with their days and what each still needs', async () => {
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    for (const name of ['Football Logic', 'Put in Order', 'Career Path']) expect(await screen.findByRole('button', { name: new RegExp(name) })).toBeTruthy();
    // The seeded days are short of a whole day (10 questions), and repeat in turn.
    expect(await screen.findByText('Add 8 more questions')).toBeTruthy();
    expect(screen.getByText('Add 9 more questions')).toBeTruthy();
    // A day without a date says so, and that it is played all the same.
    expect(screen.getAllByText('No date')).toHaveLength(2);
    expect(screen.getAllByText('Played in turn, after the dated days')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Put in Order/ }));
    expect(await screen.findByRole('heading', { name: 'Put in Order' })).toBeTruthy();
    expect((await screen.findAllByText('Add 3 more questions')).length).toBeGreaterThan(0);
  });

  it('cuts an upload into days, publishes a whole one onto the next free date, and keeps the short one a draft', async () => {
    const { admin } = await signIn('publisher');
    renderTd(<TdDailiesTab />);
    await screen.findByText('Add 8 more questions');
    const dialog = await uploadFile(logic(12));
    expect(await within(dialog).findByText(/These make 2 new days of 10\./)).toBeTruthy();
    expect(within(dialog).getByText('The last day has 2 of 10: it stays a draft until it has 10.')).toBeTruthy();
    expect(within(dialog).getAllByText('Day 2')).toHaveLength(2);
    const upload = await within(dialog).findByRole('button', { name: 'Upload 12 Questions' });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(await screen.findByText('Ready to publish')).toBeTruthy();
    // The new short day, and the seeded one.
    expect(screen.getAllByText('Add 8 more questions')).toHaveLength(2);
    const said = vi.spyOn(toast, 'success');
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const today = georgiaToday();
    await waitFor(() => expect(said).toHaveBeenCalledWith(`Published 1 day: ${formatDay(addDays(today, 1))}. Players get it with the next release.`));
    // Today keeps the day it plays; the new day plays tomorrow; after them the days repeat.
    const schedule = (await admin.content('daily-schedule').list({ game: 'footballLogic', status: 'draft,ready,approved' })).items;
    expect(schedule.map((row) => [row.data.date, row.status])).toEqual([
      [today, 'approved'],
      [addDays(today, 1), 'approved'],
    ]);
    expect(await screen.findByText(formatDay(addDays(today, 1)))).toBeTruthy();
    const settings = (await admin.content('daily-settings').list({ game: 'footballLogic' })).items[0]!;
    expect(settings.approved?.cycle?.anchor).toBe(addDays(today, 2));
    // Today's day, the new one, then the seeded day the rotation repeated already (none drops out).
    const sets = settings.approved?.cycle?.sets ?? [];
    expect(sets).toHaveLength(3);
    expect(sets[0]).toBe(schedule[0]!.data.puzzle);
    expect(sets[1]).toBe(schedule[1]!.data.puzzle);
    expect(new Set([sets[0], sets[2]])).toEqual(new Set(['fl-1', 'fl-2']));
    // The short day: nothing to publish yet.
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('publishes every ready day at once, in the order they were made', async () => {
    const { admin } = await signIn('publisher');
    renderTd(<TdDailiesTab />);
    await screen.findByText('Add 8 more questions');
    const dialog = await uploadFile(logic(20));
    const upload = await within(dialog).findByRole('button', { name: 'Upload 20 Questions' });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(await screen.findByRole('button', { name: 'Publish all 2 ready days' }));
    const today = georgiaToday();
    await waitFor(async () => expect((await admin.content('daily-schedule').list({ game: 'footballLogic' })).items).toHaveLength(3));
    const rows = (await admin.content('football-logic').list({ q: 'Question 1?', status: 'approved' })).items;
    const firstDay = rows.find((row) => row.data.prompt === 'Question 1?')!.data.puzzle;
    const dated = (await admin.content('daily-schedule').list({ game: 'footballLogic' })).items;
    expect(dated.find((row) => row.data.puzzle === firstDay)?.data.date).toBe(addDays(today, 1));
  });

  it('lets an editor upload and write, and leaves publishing to a publisher', async () => {
    await signIn('editor');
    renderTd(<TdDailiesTab />);
    await screen.findByText('Add 8 more questions');
    expect(screen.getByRole('button', { name: 'Upload Questions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New Question' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Publish/ })).toBeNull();
  });

  it('lists archived questions to open (and restore) them, and opens a question a link names', async () => {
    const { admin } = await signIn('publisher');
    const [first] = (await admin.content('football-logic').list({ status: 'draft,ready,approved' })).items;
    await admin.content('football-logic').archive(first!.id, first!.version);
    renderTd(<TdDailiesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archived question (1)' }));
    fireEvent.click(await screen.findByText(String(first!.data.prompt || first!.data.displayAnswer)));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    cleanup();

    // From the release report: /td/dailies?game=…&q=<key> opens that question in its day.
    const [linked] = (await admin.content('football-logic').list({ status: 'draft,ready,approved' })).items;
    window.history.replaceState(null, '', `?game=footballLogic&q=${linked!.data.key}`);
    renderTd(<TdDailiesTab />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(String(linked!.data.displayAnswer))).toBeTruthy();
    cleanup();

    // A link to an archived question opens it, with the archived list open.
    window.history.replaceState(null, '', `?game=footballLogic&q=${first!.data.key}`);
    renderTd(<TdDailiesTab />);
    expect(within(await screen.findByRole('dialog')).getByText(String(first!.data.displayAnswer))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archived question (1)', hidden: true }).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens a linked live question even when the archived list cannot be read', async () => {
    const inner = server;
    server = (input, init) =>
      String(input).includes('status=archived')
        ? Promise.resolve(new Response(JSON.stringify({ code: 'busy', message: 'Try again in a moment' }), { status: 503, headers: { 'content-type': 'application/json' } }))
        : inner(input, init);
    const { admin } = await signIn('publisher');
    const [linked] = (await admin.content('football-logic').list({ status: 'draft,ready,approved' })).items;
    window.history.replaceState(null, '', `?game=footballLogic&q=${linked!.data.key}`);
    renderTd(<TdDailiesTab />);
    expect(within(await screen.findByRole('dialog')).getByText(String(linked!.data.displayAnswer))).toBeTruthy();
  });

  it('publishes only the chosen days that are still whole', async () => {
    const { admin } = await signIn('publisher');
    const { client } = renderTd(<TdDailiesTab />);
    await screen.findByText('Add 8 more questions');
    const dialog = await uploadFile(logic(20));
    const upload = await within(dialog).findByRole('button', { name: 'Upload 20 Questions' });
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    for (const box of await screen.findAllByRole('checkbox', { name: 'Choose Not published' })) fireEvent.click(box);
    expect(await screen.findByRole('button', { name: 'Publish 2 chosen days' })).toBeTruthy();

    // Meanwhile one of them loses a question (another tab): it is no longer whole, and is not sent.
    const gone = (await admin.content('football-logic').list({ q: 'Question 1?', status: 'draft' })).items.find((row) => row.data.prompt === 'Question 1?')!;
    await admin.content('football-logic').archive(gone.id, gone.version);
    await client.invalidateQueries();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish 1 chosen day' }));
    const today = georgiaToday();
    await waitFor(async () => expect((await admin.content('daily-schedule').list({ game: 'footballLogic' })).items).toHaveLength(2));
    const dated = (await admin.content('daily-schedule').list({ game: 'footballLogic' })).items;
    expect(dated.map((row) => row.data.date)).toEqual([today, addDays(today, 1)]);
    expect(dated.some((row) => row.data.puzzle === gone.data.puzzle)).toBe(false);
  });

  it('opens a day’s questions, and changes the seconds per question from the gear', async () => {
    const { admin } = await signIn('publisher');
    renderTd(<TdDailiesTab />);
    fireEvent.click((await screen.findAllByRole('button', { name: /No date/ }))[0]!);
    // Its questions listed under it (the first also names the day in the row).
    await waitFor(() => expect(screen.getAllByText('What links these two images?')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Seconds per question' }));
    fireEvent.change(await screen.findByLabelText('Seconds'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await admin.content('daily-settings').list({ game: 'footballLogic' })).items[0]!.approved?.seconds).toBe(40));
  });
  it('keeps the seconds dialog as it is while it saves: it cannot be closed, reopened and typed over meanwhile', async () => {
    const inner = server;
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method && init.method !== 'GET' && String(input).includes('/admin/content/daily-settings')) await held;
      return inner(input, init);
    }) as typeof fetch;
    await signIn('publisher');
    renderTd(<TdDailiesTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seconds per question' }));
    fireEvent.change(await screen.findByLabelText('Seconds'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true));
    expect(screen.getByLabelText('Seconds').hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
