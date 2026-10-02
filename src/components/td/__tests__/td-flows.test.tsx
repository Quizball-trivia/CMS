import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { useState, type ReactNode } from 'react';
import type { TdAdminApi, TdContentRow } from '@/lib/td/admin-api';
import type { TdApiClient } from '@/lib/td/api-client';
import type { TdTokenStore } from '@/lib/td/token-store';
import type { TdRole, TdStaff } from '@/types/td';
import type { OpsReview } from '@/lib/td/contract';

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
const { TdContentEditorDialog } = await import('../content/td-content-editor');
const { TdImportTab } = await import('../tabs/import-tab');
const { TdQuestionsTab } = await import('../tabs/questions-tab');
const { TdCategoriesTab } = await import('../tabs/categories-tab');
const { TdReleasesTab } = await import('../tabs/releases-tab');
const { useTdWrite } = await import('@/hooks/use-td-content');
const { CorrectionForm, OpsReviews, Replay } = await import('../tabs/players-tab');
const { MaintenanceSetting, TdSettingsTab, TicketsSetting } = await import('../tabs/ops-tabs');
const { TD_ADMIN_CONTRACT_VERSION } = await import('@/lib/td/contract');
const { TdIntegrationTab } = await import('../tabs/integration-tab');
const { TdTeam } = await import('../td-team');
const { TdApiError } = await import('@/lib/td/api-client');
const { createFakeLockManager, deferred, sleep } = await import('@/lib/td/__tests__/helpers');
const { browserPendingPublications } = await import('@/lib/td/pending-publications');

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
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
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
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved')).toBeTruthy();

    // A publisher's own edit waits for another publisher.
    const own = await h.admin.content('penalty-questions').create({ data: penalty('own-edit') });
    const ready = await h.admin.content('penalty-questions').ready(own.id, own.version);
    cleanup();
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: ready }} onClose={() => {}} />);
    expect(await screen.findByText('You made the last edit, so another publisher approves it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('shows what the API would refuse before sending, by field', async () => {
    const { admin } = await signIn('editor');
    const before = (await admin.content('penalty-questions').list({ limit: 200 })).items.length;
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('ID'), { target: { value: 'Not A Key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText(/^Lower-case letters/)).toBeTruthy();
    expect(screen.getAllByText('Required').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Add at least one')).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ limit: 200 })).items).toHaveLength(before);
  });

  it('merges a stale save unit by unit: a question and its answer clash as one, my note is kept', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('merge-me') });
    const other = await clientFor('publisher');
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Mine?' } });
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'checked with the rules' } });
    const theirs = await other.admin.content('penalty-questions').edit(row.id, { version: row.version, data: { ...row.data, display: 'Theirs', aliases: ['spain', 'españa'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Someone changed this while you were editing')).toBeTruthy();
    // The question, its answer and its spellings are one unit: never my question with their answer.
    const clash = screen.getByText('q + display + aliases').closest('li')!;
    fireEvent.click(within(clash).getByRole('radio', { name: /Theirs/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with the merge' }));
    expect(await screen.findByText('Merged onto the newer version. Review it, then save.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).version).toBe(theirs.version + 1));
    const saved = await admin.content('penalty-questions').get(row.id);
    expect(saved.data).toEqual({ key: 'merge-me', q: 'Who won Euro 2024?', display: 'Theirs', aliases: ['spain', 'españa'] });
    expect(saved.note).toBe('checked with the rules');
  });

  it('holds Save while a number field shows text that is not a number, rather than saving the old number', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('numbers') });
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Changed?' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(false);

    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '12abc' } });
    expect(screen.getByText('Not a number')).toBeTruthy();
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '' } });
    expect(screen.getByText('Enter a number')).toBeTruthy();
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(save);
    expect((await admin.content('penalty-questions').get(row.id)).version).toBe(row.version);
    // Still held on the other tabs of the editor, and the typed text is still there on the way back.
    fireEvent.click(screen.getByRole('tab', { name: /History/ }));
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByText('Enter a number')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '7' } });
    expect(screen.queryByText('Enter a number')).toBeNull();
    fireEvent.click(save);
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).position).toBe(7));
  });

  it('holds Save while an item’s sort value is not a number, instead of saving it as 0', async () => {
    await signIn('editor');
    renderTd(<TdContentEditorDialog target={{ type: 'put-in-order', row: null }} onClose={() => {}} />);
    const sort = await screen.findByLabelText('Item 1 sort value');
    fireEvent.change(sort, { target: { value: 'x' } });
    expect(screen.getByText('Not a number')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create draft' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(sort, { target: { value: '1990' } });
    expect(screen.queryByText('Not a number')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create draft' }).hasAttribute('disabled')).toBe(false);
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
    renderTd(<TdContentEditorDialog target={{ type: 'card-categories', row: ready }} onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: /Approve the category/ });
    expect(await within(dialog).findByText('2 ready to approve with it · 0 approved already')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(async () => expect((await publisher.admin.content('card-categories').get(category.id)).status).toBe('approved'));
    const cards = await publisher.admin.content('cards').list({ category: 'coaches' });
    expect(cards.items.map((c: TdContentRow<'cards'>) => c.status)).toEqual(['approved', 'approved']);
  });
});

describe('stepping through a list', () => {
  it('← and → step to the neighbours; on the tabs they move along the tabs instead', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('step-keys') });
    const onGo = vi.fn();
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} nav={{ index: 1, total: 3, more: false, onGo }} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onGo.mock.calls).toEqual([[2], [0]]);

    const content = screen.getByRole('tab', { name: 'Content' });
    content.focus();
    fireEvent.keyDown(content, { key: 'ArrowRight' });
    expect(onGo).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tab', { name: /Preview/ }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Preview/ }));
  });

  it('asks before leaving text that is not a valid number, as it does for any unsaved change', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('step-held') });
    const onGo = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} nav={{ index: 0, total: 2, more: false, onGo }} />);
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '-' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onGo).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onGo).toHaveBeenCalledWith(1);
    confirm.mockRestore();
  });

  it('locks the form while the next row’s page is on its way', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('step-wait') });
    const onGo = vi.fn();
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} nav={{ index: 0, total: 1, more: true, waiting: true, onGo }} />);
    expect((screen.getByLabelText('Question') as HTMLInputElement).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onGo).not.toHaveBeenCalled();
  });

  it('a step past the last loaded question loads the next page and opens its first row', async () => {
    const { admin } = await signIn('editor');
    for (let i = 1; i <= 51; i++) await admin.content('penalty-questions').create({ data: { ...penalty(`page-${String(i).padStart(2, '0')}`), q: `Question ${String(i).padStart(2, '0')}?` } });
    // The search leaves the mock's own questions out.
    window.history.replaceState(null, '', '?mode=penalties&q=Question');
    renderTd(<TdQuestionsTab />);
    const rows = await screen.findAllByText(/^Question \d\d\?$/);
    expect(rows).toHaveLength(50);
    fireEvent.click(rows[49]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe('Question 50?');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('heading').textContent).toBe('Question 51?'));
    expect(screen.getAllByText(/^Question \d\d\?$/).length).toBeGreaterThanOrEqual(51);
    window.history.replaceState(null, '', window.location.pathname);
  });
});

describe('categories', () => {
  it('every category has an Edit button; an editor deletes only a draft of their own and restores nothing', async () => {
    const publisher = await clientFor('publisher');
    await publisher.admin.content('card-categories').create({ data: { key: 'theirs', prompt: 'Made by a publisher' } });
    const gone = await publisher.admin.content('card-categories').create({ data: { key: 'gone', prompt: 'Deleted before' } });
    await publisher.admin.content('card-categories').archive(gone.id, gone.version);
    const { admin } = await signIn('editor');
    await admin.content('card-categories').create({ data: { key: 'mine', prompt: 'Made by me' } });
    renderTd(<TdCategoriesTab />);
    const theirs = (await screen.findByText('Made by a publisher')).closest('tr')!;
    const mine = screen.getByText('Made by me').closest('tr')!;
    expect(within(theirs).getByRole('button', { name: 'Edit the category' })).toBeTruthy();
    expect(within(theirs).queryByRole('button', { name: 'Delete the category' })).toBeNull();
    expect(within(mine).getByRole('button', { name: 'Delete the category' })).toBeTruthy();
    fireEvent.click(within(theirs).getByRole('button', { name: 'Edit the category' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    cleanup();

    renderTd(<TdCategoriesTab />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'archived' }))[0]);
    const archived = (await screen.findByText('Deleted before')).closest('tr')!;
    expect(within(archived).queryByRole('button', { name: 'Restore the category' })).toBeNull();
    cleanup();

    await signIn('publisher');
    renderTd(<TdCategoriesTab />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'archived' }))[0]);
    expect(within((await screen.findByText('Deleted before')).closest('tr')!).getByRole('button', { name: 'Restore the category' })).toBeTruthy();
  });
});

describe('media', () => {
  it('uploads a crest from the club editor and saves it as an image to pick', async () => {
    const { admin } = await signIn('editor');
    renderTd(<TdContentEditorDialog target={{ type: 'clubs', row: null, preset: { key: 'torpedo' } }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an image' });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    fireEvent.change(within(dialog).getByTestId('td-upload-input'), { target: { files: [new File([png], 'crest.png', { type: 'image/png' })] } });
    expect(await within(dialog).findByText(/Uploaded · 16 × 9 px/)).toBeTruthy();
    expect((within(dialog).getByLabelText('ID') as HTMLInputElement).value).toBe('crest-torpedo');
    fireEvent.change(within(dialog).getByLabelText('Licence'), { target: { value: 'CC0' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and use it' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
    expect(await screen.findByText('crest-torpedo')).toBeTruthy();
    const [image] = (await admin.content('media').list({ q: 'crest-torpedo' })).items;
    expect(image).toMatchObject({ status: 'draft', data: { key: 'crest-torpedo', width: 16, height: 9, license: 'CC0', author: null } });
  });
});

describe('match inputs that are not on hand', () => {
  it('says why, names the archive’s two reasons, and shows when the inputs went to the archive', async () => {
    const ops = await signIn('ops');
    const player = (await ops.admin.players.search('Nika')).items[0];
    const played = (await ops.admin.players.matches(player.id)).items.find((m) => m.status === 'settled')!;
    const record = await ops.admin.matches.get(played.matchId);
    const withInputs = (inputs: typeof record.inputs) => <Replay record={{ ...record, inputs }} />;

    const { rerender } = renderTd(withInputs({ kept: false, entries: null, missing: 'archived', archivedAt: '2026-03-01T08:30:00Z' }));
    expect(screen.getByText('Its inputs are in the archive, which cannot be read just now. Try again in a moment.')).toBeTruthy();
    expect(screen.getByText(/^Archived .*2026/)).toBeTruthy();

    rerender(<QueryClientProvider client={new QueryClient()}>{withInputs({ kept: false, entries: null, missing: 'expired', archivedAt: '2026-03-01T08:30:00Z' })}</QueryClientProvider>);
    expect(screen.getByText('Its inputs were deleted from the archive, 730 days after the match.')).toBeTruthy();
    expect(screen.getByText(/^Archived .*2026/)).toBeTruthy();

    // Without archivedAt (never archived) nothing is said about the archive.
    rerender(<QueryClientProvider client={new QueryClient()}>{withInputs({ kept: false, entries: null, missing: 'not_recorded' })}</QueryClientProvider>);
    expect(screen.getByText('Its inputs were not kept.')).toBeTruthy();
    expect(screen.queryByText(/^Archived/)).toBeNull();

    // Inputs read back from the archive still replay, and say when they went there.
    rerender(<QueryClientProvider client={new QueryClient()}>{withInputs({ kept: true, entries: [{ kind: 'ready', seat: 'me', at: 1_000 }], missing: null, archivedAt: '2026-03-01T08:30:00Z' })}</QueryClientProvider>);
    expect(screen.getByText(/^Archived .*2026/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });
});

describe('drafts stay bound to the revision reviewed', () => {
  it('a correction draft whose match was corrected meanwhile is flagged, never sent at the newer version', async () => {
    const ops = await signIn('ops');
    const player = (await ops.admin.players.search('Nika')).items[0];
    const played = (await ops.admin.players.matches(player.id)).items.find((m) => m.status === 'settled')!;
    const record = await ops.admin.matches.get(played.matchId);
    const { rerender } = renderTd(<CorrectionForm record={record} />);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Question 7 had two right answers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Correct the result' }));
    expect(await screen.findByRole('button', { name: 'Confirm: void this match (result v1)' })).toBeTruthy();
    // Another operator sets the winner meanwhile; the record refreshes.
    const other = await clientFor('ops');
    const loser = record.players.find((p) => p.outcome === 'loss')!;
    const newer = await other.admin.matches.correct(record.id, { version: 1, outcome: { kind: 'win', winner: loser.playerId }, reason: 'Wrong answer accepted' });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CorrectionForm record={newer} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/changed while you were reviewing it: now result v2 \(winner set by Demo Ops\)/);
    expect((screen.getByRole('button', { name: /void this match|Correct the result/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Review the new result' }));
    expect((screen.getByRole('button', { name: 'Correct the result' }) as HTMLButtonElement).disabled).toBe(false);
    expect((await ops.admin.matches.get(record.id)).resultVersion).toBe(2);
  });

  it('tickets per day: an edited value whose setting changed meanwhile cannot be saved; an untouched one follows', async () => {
    const ops = await signIn('ops');
    const settings = await ops.admin.settings.get();
    const { rerender } = renderTd(<TicketsSetting settings={settings} onChanged={() => {}} onConflict={() => {}} />);
    fireEvent.change(screen.getByLabelText('Tickets per day'), { target: { value: '7' } });
    const other = await clientFor('ops');
    const newer = await other.admin.settings.ticketsPerDay(settings.ticketsPerDay.version, 6);
    const wrap = (ui: ReactNode) => <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
    rerender(wrap(<TicketsSetting settings={newer} onChanged={() => {}} onConflict={() => {}} />));
    expect(screen.getByRole('alert').textContent).toMatch(/Changed meanwhile to 6 by Demo Ops\. Your 7 was not saved/);
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Load the new value' }));
    expect((screen.getByLabelText('Tickets per day') as HTMLInputElement).value).toBe('6');
    cleanup();

    const untouched = renderTd(<TicketsSetting settings={settings} onChanged={() => {}} onConflict={() => {}} />);
    untouched.rerender(wrap(<TicketsSetting settings={newer} onChanged={() => {}} onConflict={() => {}} />));
    expect((screen.getByLabelText('Tickets per day') as HTMLInputElement).value).toBe('6');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tickets per day: nothing can be typed while a save is on its way, so the answer never drops an edit', async () => {
    const ops = await signIn('ops');
    const settings = await ops.admin.settings.get();
    const answer = deferred<void>();
    const save = ops.admin.settings.ticketsPerDay;
    h.admin = { ...ops.admin, settings: { ...ops.admin.settings, ticketsPerDay: async (...args: Parameters<typeof save>) => (await answer.promise, save(...args)) } };
    function Page() {
      const [current, setCurrent] = useState(settings);
      return <TicketsSetting settings={current} onChanged={setCurrent} onConflict={() => {}} />;
    }
    renderTd(<Page />);
    const input = screen.getByLabelText('Tickets per day') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(input.disabled).toBe(true));
    answer.resolve();
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe('7');
  });

  it('the settings note names the admin contract version this CMS is pinned to', async () => {
    await signIn('ops');
    renderTd(<TdSettingsTab />);
    expect(await screen.findByText(new RegExp(`not in the admin contract \\(v${TD_ADMIN_CONTRACT_VERSION}\\)`))).toBeTruthy();
  });

  it('a maintenance confirmation closes when the setting changes under it, instead of flipping its meaning', async () => {
    const ops = await signIn('ops');
    const settings = await ops.admin.settings.get();
    const { rerender } = renderTd(<MaintenanceSetting settings={settings} onChanged={() => {}} onConflict={() => {}} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText('Close the game to new play for every player?')).toBeTruthy();
    const other = await clientFor('ops');
    const newer = await other.admin.settings.maintenance(settings.maintenance.version, true);
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MaintenanceSetting settings={newer} onChanged={() => {}} onConflict={() => {}} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/changed meanwhile: maintenance is on now/);
    expect(screen.queryByRole('button', { name: /Turn (on|off)/ })).toBeNull();
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

describe('penalties to review', () => {
  it('pages through every review, not only the first 50', async () => {
    const client = await signIn('ops');
    const review = (n: number): OpsReview => ({
      id: `review-${n}`,
      kind: 'penalty',
      playerId: 'player-1',
      matchId: `match-${n}`,
      georgiaDate: '2026-09-29',
      source: 'correction',
      correctionId: null,
      countedThen: 2,
      countedNow: 1,
      createdAt: '2026-09-29T10:00:00.000Z',
      status: 'open',
      closedAt: null,
      closedBy: null,
      closingCorrectionId: null,
      note: null,
    });
    const list = vi.fn(async (_status?: 'open' | 'all', query?: { cursor?: string; limit?: number }) =>
      query?.cursor === 'page-2' ? { items: [review(51)], nextCursor: null } : { items: Array.from({ length: 50 }, (_, i) => review(i + 1)), nextCursor: 'page-2' },
    );
    h.admin = { ...client.admin, reviews: { ...client.admin.reviews, list } };
    renderTd(<OpsReviews onMatch={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open the match' })).toHaveLength(50));
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Open the match' })).toHaveLength(51));
    expect(list).toHaveBeenLastCalledWith('open', { cursor: 'page-2', limit: 50 }, expect.anything());
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});

describe('team', () => {
  it('a team manager makes a one-time reset link for an active member; none for themselves, ops or someone not signed up', async () => {
    const admin = await signIn('betsson_admin');
    const who = async (accessToken: string) => ((await (await server(`${BASE}/admin/me`, { headers: { Authorization: `Bearer ${accessToken}` } })).json()) as { email: string }).email;
    renderTd(<TdTeam />);
    expect(await screen.findByRole('button', { name: 'Reset link for Demo Editor' })).toBeTruthy();
    for (const name of ['Demo Betsson Admin', 'Demo Ops', 'Invited Editor']) expect(screen.queryByRole('button', { name: `Reset link for ${name}` })).toBeNull();

    // Each member's link is theirs: redeeming it signs in as that member.
    for (const [name, email] of [
      ['Demo Publisher', 'publisher@demo.tablederby.test'],
      ['Demo Editor', 'editor@demo.tablederby.test'],
    ] as const) {
      const button = screen.getByRole('button', { name: `Reset link for ${name}` });
      fireEvent.click(button);
      const link = (await screen.findByLabelText('Reset link')) as HTMLInputElement;
      expect(link.value).toMatch(new RegExp(`^${window.location.origin}/td/reset#token=tdr_[A-Za-z0-9_-]{20,}$`));
      expect(screen.getByRole('region', { name: `Reset link for ${email}` })).toBeTruthy();
      expect(screen.getByText(/Shown once: it cannot be seen again.*\(Georgia\)\. Making another reset link for them stops this one\./)).toBeTruthy();
      // Focus goes to the link, and back to the member's button when it is closed.
      await waitFor(() => expect(document.activeElement).toBe(link));
      const token = decodeURIComponent(link.value.split('#token=')[1]);
      const session = await admin.api.resetPassword(token, `a brand new passphrase for ${name}`);
      expect(await who(session!.accessToken)).toBe(email);
      await expect(admin.api.resetPassword(token, 'a brand new passphrase')).rejects.toMatchObject({ code: 'invalid_token' });
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByLabelText('Reset link')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: `Reset link for ${name}` }));
    }
    cleanup();

    // Ops may make one for a Betsson admin, never for an ops member (themselves included).
    await signIn('ops');
    renderTd(<TdTeam />);
    expect(await screen.findByRole('button', { name: 'Reset link for Demo Betsson Admin' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reset link for Demo Ops' })).toBeNull();
  });

  it('says in plain words why a reset link was not made', async () => {
    const admin = await signIn('betsson_admin');
    const refusals = [
      new TdApiError(409, 'conflict', 'Re-enable them first'),
      new TdApiError(403, 'forbidden', 'Your role cannot manage the team'),
      new TdApiError(404, 'not_found', 'No such member'),
      new TypeError('Failed to fetch'),
    ];
    h.admin = { ...admin.admin, staff: { ...admin.admin.staff, resetLink: async () => Promise.reject(refusals.shift()) } };
    const reads = vi.spyOn(admin.api, 'get');
    const staffReads = () => reads.mock.calls.filter(([path]) => path === '/admin/staff').length;
    renderTd(<TdTeam />);
    const make = async () => fireEvent.click(await screen.findByRole('button', { name: 'Reset link for Demo Editor' }));
    await make();
    expect(await screen.findByText('No reset link for editor@demo.tablederby.test: Re-enable them first.')).toBeTruthy();
    // The list may be behind: it is read again after a refusal.
    await waitFor(() => expect(staffReads()).toBe(2));
    await make();
    expect(await screen.findByText('No reset link for editor@demo.tablederby.test: Your role cannot manage the team.')).toBeTruthy();
    await make();
    expect(await screen.findByText('editor@demo.tablederby.test is no longer on the team.')).toBeTruthy();
    await make();
    expect(await screen.findByText(/No answer from the Table Derby API, so a link may have been made\. Make another/)).toBeTruthy();
    expect(screen.queryByLabelText('Reset link')).toBeNull();
  });

  it('a team manager makes a one-time invitation link to copy; an editor sees no invite', async () => {
    await signIn('betsson_admin');
    renderTd(<TdTeam />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not an email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    expect(await screen.findByText(/Enter a valid email address/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'editor@demo.tablederby.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    expect(await screen.findByText(/already has an account/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New.Publisher@example.test' } });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'publisher' } });
    expect(screen.queryByRole('option', { name: 'Ops (Quizball)' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    const link = (await screen.findByLabelText('Invitation link')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/td/accept-invite#token=tdi_[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByText(/Shown once: it cannot be seen again/)).toBeTruthy();
    // The team list shows them as invited.
    expect(await screen.findByRole('cell', { name: 'new.publisher@example.test' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(link));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Invitation link')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite member' })));
    cleanup();

    await signIn('editor');
    renderTd(<TdTeam />);
    expect(screen.queryByRole('button', { name: 'Invite member' })).toBeNull();
  });
});

describe('integration', () => {
  const rows = () => screen.queryAllByText(/^td-evt-\d{4}$/, { selector: 'span' });
  const search = async (q: string) => {
    fireEvent.change(screen.getByLabelText('Search webhook events'), { target: { value: q } });
    fireEvent.submit(screen.getByLabelText('Search webhook events').closest('form')!);
    await waitFor(() => expect(rows().every((row) => row.closest('tr')?.textContent?.includes(q) || q.startsWith('7c1d'))).toBe(true));
  };
  const open = async (eventId: string) => {
    await search(eventId);
    fireEvent.click(await screen.findByText(eventId, { selector: 'span' }));
    // The sheet for this event (a closing one for the last event may still be there).
    return waitFor(() => {
      const sheet = screen.getAllByRole('dialog').find((dialog) => within(dialog).queryByText(eventId, { selector: 'span' }));
      if (!sheet) throw new Error(`no sheet for ${eventId}`);
      return sheet;
    });
  };

  it('lists events newest first, a page at a time, and finds a player’s by their Betsson id', async () => {
    await signIn('betsson_admin');
    renderTd(<TdIntegrationTab />);
    await waitFor(() => expect(rows()).toHaveLength(50));
    expect(rows()[0].textContent).toBe('td-evt-0056');
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await waitFor(() => expect(rows()).toHaveLength(56));
    fireEvent.change(screen.getByLabelText('Delivery status'), { target: { value: 'dead' } });
    await waitFor(() => expect(rows().map((r) => r.textContent)).toEqual(['td-evt-0018', 'td-evt-0010', 'td-evt-0004', 'td-evt-0001']));
    fireEvent.change(screen.getByLabelText('Delivery status'), { target: { value: '' } });
    await search('bet-40017');
    expect(rows().length).toBeGreaterThan(0);
    for (const row of rows()) expect(row.closest('tr')!.textContent).toContain('bet-40017');
  });

  it('opens an event with its envelope and attempts; a Betsson admin sees no retry', async () => {
    await signIn('betsson_admin');
    renderTd(<TdIntegrationTab />);
    const sheet = await open('td-evt-0004');
    expect(await within(sheet).findByText('Given up')).toBeTruthy();
    expect(within(sheet).getByText(/"eventId": "td-evt-0004"/)).toBeTruthy();
    expect(within(sheet).getAllByText('webhook_http_503').length).toBeGreaterThan(0);
    // The partner's HTML answer is shown as text.
    expect(within(sheet).getAllByText('<html><body>Service Unavailable</body></html>').length).toBeGreaterThan(0);
    expect(sheet.querySelectorAll('tbody tr')).toHaveLength(31);
    expect(within(sheet).queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('ops retries a given-up event, and moves one bound to an earlier address only once confirmed', async () => {
    await signIn('ops');
    renderTd(<TdIntegrationTab />);
    let sheet = await open('td-evt-0018');
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Retry now' }));
    // The retry's answer, then a fresh read: its next attempt (the partner answers again) shows at once, never the older answer.
    expect(await within(sheet).findByText('Delivered: nothing to retry.')).toBeTruthy();
    expect(within(sheet).getAllByText('HTTP 200')).toHaveLength(1);
    expect(within(sheet).queryByText('Retried by hand')!.nextElementSibling!.textContent).not.toBe('—');
    fireEvent.keyDown(sheet, { key: 'Escape' });

    sheet = await open('td-evt-0010');
    expect(await within(sheet).findByText('earlier address')).toBeTruthy();
    expect(within(sheet).queryByRole('button', { name: 'Retry now' })).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry to the current address' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send to the current address' }));
    await waitFor(() => expect(within(sheet).queryByText('earlier address')).toBeNull());
    expect(await within(sheet).findByText('Delivered: nothing to retry.')).toBeTruthy();
    fireEvent.keyDown(sheet, { key: 'Escape' });

    sheet = await open('td-evt-0002');
    expect(await within(sheet).findByText('Delivered: nothing to retry.')).toBeTruthy();
    fireEvent.keyDown(sheet, { key: 'Escape' });
    sheet = await open('td-evt-0056');
    expect(await within(sheet).findByText('Being sent now; look again in a moment.')).toBeTruthy();
  });

  it('never retries in the name of someone who signed in meanwhile', async () => {
    const ops = await signIn('ops');
    renderTd(<TdIntegrationTab />);
    const sheet = await open('td-evt-0004');
    await within(sheet).findByRole('button', { name: 'Retry now' });
    const next = await clientFor('ops');
    await put(ops.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: 'someone-else' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry now' }));
    expect(await within(sheet).findByText(/switched accounts; the retry was cancelled/)).toBeTruthy();
    expect((await next.admin.integration.webhook('td-evt-0004')).event).toMatchObject({ status: 'dead', revivedAt: null });
  });

  it('says why a retry was refused: the API’s words for a conflict, and the hourly limit in plain words', async () => {
    const ops = await signIn('ops');
    renderTd(<TdIntegrationTab />);
    const sheet = await open('td-evt-0018');
    await within(sheet).findByRole('button', { name: 'Retry now' });
    // Meanwhile another ops member retries it and it is delivered.
    const other = await clientFor('ops');
    await other.admin.integration.retryWebhook('td-evt-0018', false);
    await other.admin.integration.webhook('td-evt-0018');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Retry now' }));
    expect(await within(sheet).findByText('This event was delivered already')).toBeTruthy();
    expect(await within(sheet).findByText('Delivered: nothing to retry.')).toBeTruthy();

    h.admin = { ...ops.admin, integration: { ...ops.admin.integration, retryWebhook: async () => Promise.reject(new TdApiError(429, 'rate_limited', 'Too many requests; try again later')) } };
    fireEvent.keyDown(sheet, { key: 'Escape' });
    const dead = await open('td-evt-0004');
    fireEvent.click(await within(dead).findByRole('button', { name: 'Retry now' }));
    expect(await within(dead).findByText(/retried 60 events in the last hour/)).toBeTruthy();
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
    // The key is retired before the batch shows it undone (its Undo button goes).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Undo this import' })).toBeNull());
    expect((await admin.content('penalty-questions').list({ q: 'imp-' })).items).toHaveLength(0);

    // The same cells after an undo are a new import, not the undone batch answered again.
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: /Import 2 as drafts/ }));
    expect(await screen.findByText(/Imported 2 drafts as batch/)).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ q: 'imp-' })).items).toHaveLength(2);
  });

  it('an import whose answer was lost is answered with its own batch when the same cells are read again', async () => {
    const inner = server;
    let lose = true;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (lose && init?.method === 'POST' && String(input).endsWith('/admin/content/imports')) {
        lose = false;
        throw new TypeError('Failed to fetch');
      }
      return response;
    }) as typeof fetch;
    const { admin } = await signIn('editor');
    renderTd(<TdImportTab />);
    fireEvent.change(screen.getByLabelText(/Or paste the cells here/), { target: { value: 'key\tq\tdisplay\taliases\nlost-1\tFirst?\tOne\tone\nlost-2\tSecond?\tTwo\ttwo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: /Import 2 as drafts/ }));
    await waitFor(() => expect(lose).toBe(false));
    await waitFor(() => expect(screen.getByRole('button', { name: /Import 2 as drafts/ }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByText(/Imported 2 drafts/)).toBeNull();
    expect((await admin.content('penalty-questions').list({ q: 'lost-' })).items).toHaveLength(2);

    // Read again: asked with the same key before any check (which would call its own rows duplicates).
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    expect(await screen.findByText(/Already imported as batch cms:/)).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ q: 'lost-' })).items).toHaveLength(2);
    expect((await admin.imports.list()).items).toHaveLength(1);
  });

  it('never replays a saved import key under someone else’s sign-in', async () => {
    const inner = server;
    const applied: string[] = [];
    server = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(input).endsWith('/admin/content/imports')) applied.push((JSON.parse(String(init.body)) as { batchKey: string }).batchKey);
      return inner(input, init);
    }) as typeof fetch;
    const editor = await signIn('editor');
    const next = await clientFor('ops');
    renderTd(<TdImportTab />);
    const cells = 'key\tq\tdisplay\taliases\nswitch-1\tFirst?\tOne\tone';
    fireEvent.change(screen.getByLabelText(/Or paste the cells here/), { target: { value: cells } });
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Check' }));
    fireEvent.click(await screen.findByRole('button', { name: /Import 1 as drafts/ }));
    expect(await screen.findByText(/Imported 1 drafts as batch/)).toBeTruthy();
    expect(applied).toHaveLength(1);

    // Someone else signs in in this browser; this view has not caught up yet.
    await put(editor.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: next.user.id });
    fireEvent.click(screen.getByRole('button', { name: 'Read the pasted cells' }));
    expect(await screen.findByText(/1 item read/)).toBeTruthy();
    await sleep(50);
    expect(applied).toHaveLength(1);
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
    await waitFor(() => expect(localStorage.getItem(`td_pending_publications:${publisher.user.id}`)).toBeNull(), { timeout: 4000 });
  });

  it('says “Publishing…” as the publish goes out, before its answer, and not for one refused before sending', async () => {
    const said = vi.spyOn(toast, 'message');
    const editor = await clientFor('editor');
    const row = await editor.admin.content('penalty-questions').create({ data: penalty('announce-publish') });
    const ready = await editor.admin.content('penalty-questions').ready(row.id, row.version);
    const publisher = await signIn('publisher');
    await publisher.admin.content('penalty-questions').approve(ready.id, ready.version);
    const answer = deferred<void>();
    const publish = publisher.admin.releases.publish;
    h.admin = { ...publisher.admin, releases: { ...publisher.admin.releases, publish: async (...args: Parameters<typeof publish>) => (await answer.promise, publish(...args)) } };
    renderTd(<TdReleasesTab />);
    await screen.findByText('Valid: it can be published.');
    const confirmPublish = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await act(async () => fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' })));
    };
    // Someone else signed in meanwhile: refused here, nothing said.
    const own = publisher.tokens.read()!;
    const next = await clientFor('ops');
    await put(publisher.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: next.user.id });
    await confirmPublish();
    expect(await screen.findByText(/switched accounts/)).toBeTruthy();
    expect(said).not.toHaveBeenCalled();

    await put(publisher.tokens, own);
    await confirmPublish();
    // Said while the publish still waits for its answer.
    await waitFor(() => expect(said).toHaveBeenCalledWith('Publishing…'));
    answer.resolve();
  });

  it('a kept publish that waited while its member signed out is never sent as the next member', async () => {
    const locks = createFakeLockManager();
    Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
    try {
      const inner = server;
      const sent: string[] = [];
      server = ((input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).endsWith('/admin/releases/publish')) sent.push((JSON.parse(String(init?.body)) as { idemKey: string }).idemKey);
        return inner(input, init);
      }) as typeof fetch;
      const publisher = await signIn('publisher');
      const next = await clientFor('ops');
      const kept = `td_pending_publications:${publisher.user.id}`;
      await (await browserPendingPublications(publisher.user.id)).keep({ kind: 'publish', idemKey: 'publish:mine', releaseId: null, publicationId: null });
      // Another tab holds the kept list while this one mounts, so the recovery waits.
      const release = deferred<void>();
      const holding = deferred<void>();
      void locks.request('td-pending-publications', () => {
        holding.resolve();
        return release.promise;
      });
      await holding.promise;
      renderTd(<TdReleasesTab />);
      await sleep(20);
      // Meanwhile someone else signs in in this browser.
      await put(publisher.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: next.user.id });
      release.resolve();
      await sleep(50);
      expect(sent).toEqual([]);
      expect(Object.keys(JSON.parse(localStorage.getItem(kept)!) as object)).toEqual(['publish:mine']);
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    }
  });

  it('after a reload asks again for this tab’s unanswered publish only; its refusal clears that one, never another tab’s', async () => {
    const storage = new MemoryStorage();
    const frozen = Date.now();
    // A stopped clock keeps the publication started elsewhere running, so the asked-again publish is refused.
    const inner = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => frozen, blobs: memoryBlobStore(), lock: undefined });
    const sent: string[] = [];
    server = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/admin/releases/publish')) sent.push((JSON.parse(String(init?.body)) as { idemKey: string }).idemKey);
      return inner(input, init);
    }) as typeof fetch;
    const publisher = await signIn('publisher');
    const elsewhere = await publisher.admin.releases.publish('publish:elsewhere');
    sent.length = 0;
    const kept = `td_pending_publications:${publisher.user.id}`;
    await (await browserPendingPublications(publisher.user.id)).keep({ kind: 'publish', idemKey: 'publish:mine', releaseId: null, publicationId: null });
    const theirs = { kind: 'publish', idemKey: 'publish:theirs', releaseId: null, publicationId: null, tab: 'another-open-tab', holder: 'another-open-tab' };
    localStorage.setItem(kept, JSON.stringify({ ...JSON.parse(localStorage.getItem(kept)!), 'publish:theirs': theirs }));

    renderTd(<TdReleasesTab />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(kept)!)).toEqual({ 'publish:theirs': theirs }));
    expect(sent).toEqual(['publish:mine']);
    expect(await screen.findByText('Another publish or rollback is under way')).toBeTruthy();
    expect(screen.queryByText(/got no answer/)).toBeNull();
    expect(elsewhere.status).toBe('running');
  });
});
