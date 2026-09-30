import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
const { TdContentEditorSheet } = await import('../content/td-content-editor');
const { TdImportTab } = await import('../tabs/import-tab');
const { TdReleasesTab } = await import('../tabs/releases-tab');
const { useTdWrite } = await import('@/hooks/use-td-content');
const { CorrectionForm, OpsReviews } = await import('../tabs/players-tab');
const { MaintenanceSetting, TicketsSetting } = await import('../tabs/ops-tabs');
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

  it('merges a stale save unit by unit: a question and its answer clash as one, my note is kept', async () => {
    const { admin } = await signIn('editor');
    const row = await admin.content('penalty-questions').create({ data: penalty('merge-me') });
    const other = await clientFor('publisher');
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
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
    renderTd(<TdContentEditorSheet target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
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
    renderTd(<TdContentEditorSheet target={{ type: 'put-in-order', row: null }} onClose={() => {}} />);
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
