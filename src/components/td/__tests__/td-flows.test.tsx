import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdAdminApi, TdContentRow } from '@/lib/td/admin-api';
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
const { TdContentEditorSheet } = await import('../content/td-content-editor');
const { TdImportTab } = await import('../tabs/import-tab');
const { TdReleasesTab } = await import('../tabs/releases-tab');
const { useTdWrite } = await import('@/hooks/use-td-content');
const { deferred } = await import('@/lib/td/__tests__/helpers');

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

const penalty = (key: string) => ({ key, q: 'Who won Euro 2024?', display: 'Spain', aliases: ['spain'] });

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => 'blob:td-test');
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  const storage = new MemoryStorage();
  const start = Date.now();
  // The mock's clock runs 40× faster, so publication phases pass in milliseconds.
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => start + (Date.now() - start) * 40, blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('content editor', () => {
  it('an editor creates a draft and marks it ready; approval is a publisher’s, never the last editor’s', async () => {
    await signIn('editor');
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Capital of Georgia?' } });
    fireEvent.change(screen.getByLabelText('Answer (as shown)'), { target: { value: 'Tbilisi' } });
    const spellings = screen.getByLabelText('Accepted spellings');
    fireEvent.change(spellings, { target: { value: 'tbilisi' } });
    fireEvent.keyDown(spellings, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Draft')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark ready' }));
    expect(await screen.findByText('Ready for review')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Ready for a publisher to approve.')).toBeTruthy();
    cleanup();

    await signIn('publisher');
    const [row] = (await h.admin.content('penalty-questions').list({ status: 'ready', q: 'Capital of Georgia' })).items;
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved')).toBeTruthy();

    // A publisher's own edit waits for another publisher.
    const own = await h.admin.content('penalty-questions').create({ data: penalty('own-edit') });
    const ready = await h.admin.content('penalty-questions').ready(own.id, own.version);
    cleanup();
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row: ready }} onClose={() => {}} />);
    expect(await screen.findByText('You made the last edit, so another publisher approves it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows what the API would refuse before sending, by field', async () => {
    const { admin } = await signIn('editor');
    const before = (await admin.content('penalty-questions').list({ limit: 200 })).items.length;
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'Not A Key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText(/^Lower-case letters/)).toBeTruthy();
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Add at least one')).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ limit: 200 })).items).toHaveLength(before);
  });

  it('merges a stale save field by field: their untouched changes kept, a clash chosen', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('merge-me') });
    const other = await clientFor('publisher');
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Mine?' } });
    fireEvent.change(screen.getByLabelText('Answer (as shown)'), { target: { value: 'Mine' } });
    const theirs = await other.admin.content('penalty-questions').edit(row.id, { version: row.version, data: { ...row.data, display: 'Theirs', aliases: ['spain', 'españa'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Someone changed this while you were editing')).toBeTruthy();
    const clash = screen.getByText('display').closest('li')!;
    fireEvent.click(within(clash).getByRole('radio', { name: /Theirs/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with the merge' }));
    expect(await screen.findByText('Merged onto the newer version. Review it, then save.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).version).toBe(theirs.version + 1));
    expect((await admin.content('penalty-questions').get(row.id)).data).toEqual({ key: 'merge-me', q: 'Mine?', display: 'Theirs', aliases: ['spain', 'españa'] });
  });

  it('approves a category with its ready cards in one step', async () => {
    const editor = await clientFor('editor');
    const category = await editor.admin.content('card-categories').create({ data: { key: 'coaches', prompt: 'Famous coaches' } });
    for (const key of ['pep', 'klopp']) {
      const card = await editor.admin.content('cards').create({ data: { categoryKey: 'coaches', key, value: 1, lines: [], display: key, aliases: [key], photo: null, imageKey: null } });
      await editor.admin.content('cards').ready(card.id, card.version);
    }
    const ready = await editor.admin.content('card-categories').ready(category.id, category.version);
    const publisher = await signIn('publisher');
    renderTd(<TdContentEditorSheet target={{ type: 'card-categories', row: ready }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: /Approve the category/ });
    expect(await within(dialog).findByText('2 ready to approve with it · 0 approved already')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(async () => expect((await publisher.admin.content('card-categories').get(category.id)).status).toBe('approved'));
    const cards = await publisher.admin.content('cards').list({ category: 'coaches' });
    expect(cards.items.map((c: TdContentRow<'cards'>) => c.status)).toEqual(['approved', 'approved']);
  });
});

describe('media', () => {
  it('uploads a crest from the club editor and saves it as an image to pick', async () => {
    const { admin } = await signIn('editor');
    renderTd(<TdContentEditorSheet target={{ type: 'clubs', row: null, preset: { key: 'torpedo' } }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an image' });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    fireEvent.change(within(dialog).getByTestId('td-upload-input'), { target: { files: [new File([png], 'crest.png', { type: 'image/png' })] } });
    expect(await within(dialog).findByText(/Uploaded · 16 × 9 px/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Key') as HTMLInputElement).value).toBe('crest-torpedo');
    fireEvent.change(within(dialog).getByLabelText('Licence'), { target: { value: 'CC0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and use it' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
    expect(await screen.findByText('crest-torpedo')).toBeTruthy();
    const [image] = (await admin.content('media').list({ q: 'crest-torpedo' })).items;
    expect(image).toMatchObject({ status: 'draft', data: { key: 'crest-torpedo', width: 16, height: 9, license: 'CC0', author: null } });
  });
});

describe('operations and the session', () => {
  it('a write that finishes after another sign-in ends as cancelled and refreshes nothing', async () => {
    const editor = await signIn('editor');
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTdWrite(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    const answer = deferred<string>();
    const running = result.current(() => answer.promise);
    await put(editor.tokens, { accessToken: 'other', refreshToken: 'other-refresh-token-000000', expiresAt: Date.now() + 60_000, generation: 'someone-else', staffId: null, refreshPendingSince: null });
    answer.resolve('old result');
    await expect(running).rejects.toMatchObject({ code: 'session_changed' });
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe('import', () => {
  it('reads pasted cells, checks them, imports all as drafts once, and undoes the batch', async () => {
    const { admin } = await signIn('editor');
    renderTd(<TdImportTab />);
    fireEvent.change(screen.getByLabelText(/Or paste the cells here/), { target: { value: 'key\tq\tdisplay\taliases\nimp-1\tFirst?\tOne\tone|1\nimp-2\tSecond?\tTwo\ttwo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    expect(await screen.findByText(/2 items read/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText(/2 ready to import · 0 with problems/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Import 2 as drafts/ }));
    expect(await screen.findByText(/Imported 2 drafts as batch/)).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ q: 'imp-' })).items).toHaveLength(2);
    fireEvent.click(await screen.findByText(/^cms:/, { selector: 'span' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo this import' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').list({ q: 'imp-' })).items).toHaveLength(0));

    // The same cells after an undo are a new import, not the undone batch answered again.
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: /Import 2 as drafts/ }));
    expect(await screen.findByText(/Imported 2 drafts as batch/)).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ q: 'imp-' })).items).toHaveLength(2);
  });
});

describe('releases', () => {
  it('publishes the approved content and follows it phase by phase until it is current', async () => {
    const editor = await clientFor('editor');
    const row = await editor.admin.content('penalty-questions').create({ data: penalty('new-for-release') });
    const ready = await editor.admin.content('penalty-questions').ready(row.id, row.version);
    const publisher = await signIn('publisher');
    await publisher.admin.content('penalty-questions').approve(ready.id, ready.version);
    renderTd(<TdReleasesTab />);
    expect(await screen.findByText('Valid: it can be published.')).toBeTruthy();
    expect(screen.getByText('Penalty questions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' })));
    expect(await screen.findByText(/is current now\./, {}, { timeout: 5000 })).toBeTruthy();
    const list = await publisher.admin.releases.list();
    expect(list.pointer.version).toBe(3);
    // Cleared once the replica notice is confirmed too (the next poll, a second later).
    await waitFor(() => expect(localStorage.getItem(`td_pending_publication:${publisher.user.id}`)).toBeNull(), { timeout: 4000 });
  });
});
