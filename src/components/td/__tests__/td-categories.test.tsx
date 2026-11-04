import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const { TdCategoriesTab } = await import('../tabs/categories-tab');

const BASE = 'https://td-api.mock';
const ROUND_1 = 'Round I · ბარათონი';
const ROUND_3 = 'Round III · პაპა კარლოს ყუთი';
let server: typeof fetch;
let generation = 0;

/** A signed-in client of the shared mock server, with its own session store (another browser); `email` picks a colleague of the role. */
async function clientFor(role: TdRole, email?: string) {
  const origin = createOrigin();
  const transport = createTransport(BASE, server);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: (token, id) => requestTokenRefresh(transport, token, id) });
  const api = createTdApiClient({ transport, tokens, coordinator });
  const staff = MOCK_STAFF.find((s) => s.role === role && s.status === 'active' && (email === undefined || s.email === email))!;
  const session = await api.login(staff.email, MOCK_PASSWORD);
  await put(tokens, { ...session, generation: `gen-${++generation}`, staffId: staff.id, refreshPendingSince: null });
  return { api, tokens, admin: createTdAdminApi(api), user: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } };
}

async function signIn(role: TdRole) {
  const client = await clientFor(role);
  Object.assign(h, { admin: client.admin, api: client.api, tokens: client.tokens, user: client.user });
  return client;
}

function renderPage(ui: ReactNode = <TdCategoriesTab />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** The grid of one section of the page, by its header. */
const section = (title: string) => screen.getByRole('heading', { name: title }).closest('section')!;
/** The card with this name (the name also stands in an open dialog, so the card is the one in the page). */
const cardOf = (name: string) => screen.getAllByText(name).map((element) => element.closest('[data-slot="card"]')).find((card): card is HTMLElement => card !== null)!;

async function openDialog(name: string) {
  fireEvent.click(await screen.findByText(name));
  return screen.findByRole('dialog', { name: 'Edit Category' });
}

async function createCategory(name: string, round: 'I' | 'III') {
  fireEvent.click(screen.getByRole('button', { name: 'New Category' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create Category' });
  if (round === 'III') {
    // Radix opens its select on a mouse press and takes the option on a click.
    fireEvent.pointerDown(within(dialog).getByRole('combobox'), { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('option', { name: ROUND_3 }));
  }
  fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: name } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Draft' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

const card = (key: string, categoryKey: string) => ({ categoryKey, key, value: 1 as const, lines: [], display: key, aliases: [key], photo: null, imageKey: null });

const listOf = async (admin: TdAdminApi, type: 'card-categories' | 'box-categories', query: Record<string, string> = {}) => (await admin.content(type).list(query)).items as TdContentRow<typeof type>[];
/** The mock server starts with the demo content, so a row is told by its key. */
const rowOf = async (admin: TdAdminApi, key: string, status = 'draft,ready,approved,archived') => (await listOf(admin, 'card-categories', { status })).find((row) => row.data.key === key)!;

beforeAll(() => {
  // What jsdom lacks and Radix's select wants.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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

describe('the Categories page', () => {
  it('creates a category in each round and shows it in its round', async () => {
    const { admin } = await signIn('betsson_admin');
    renderPage();
    await createCategory('Famous coaches', 'I');
    await createCategory('Cup finals', 'III');

    expect(within(await waitFor(() => section(ROUND_1))).getByText('Famous coaches')).toBeTruthy();
    expect(within(section(ROUND_3)).getByText('Cup finals')).toBeTruthy();
    expect(within(section(ROUND_1)).queryByText('Cup finals')).toBeNull();

    // Each is a draft, with a key nobody typed.
    const [cards] = [await listOf(admin, 'card-categories', { q: 'Famous coaches' })];
    expect(cards).toHaveLength(1);
    expect(cards[0].status).toBe('draft');
    expect(cards[0].data.key).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
    const boxes = await listOf(admin, 'box-categories', { q: 'Cup finals' });
    expect(boxes).toHaveLength(1);
    expect('title' in boxes[0].data && boxes[0].data.title).toBe('Cup finals');
    expect(within(cardOf('Famous coaches')).getByText('Draft')).toBeTruthy();
  });

  it('shows the real number of a category’s cards and filters both sections by name', async () => {
    const { admin } = await signIn('betsson_admin');
    const coaches = await admin.content('card-categories').create({ data: { key: 'coaches', prompt: 'Famous coaches' } });
    await admin.content('card-categories').create({ data: { key: 'keepers', prompt: 'Goalkeepers of the 90s' } });
    for (const key of ['ferguson', 'wenger', 'klopp']) await admin.content('cards').create({ data: card(key, 'coaches') });
    await admin.content('box-categories').create({ data: { key: 'finals', title: 'Cup finals' } });
    expect(coaches.status).toBe('draft');
    renderPage();
    expect(await within(await screen.findByText('Famous coaches').then(() => cardOf('Famous coaches'))).findByText('3 cards')).toBeTruthy();
    expect(within(cardOf('Cup finals')).getByText('0 questions')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Search categories...'), { target: { value: 'FINALS' } });
    expect(screen.getByText('Cup finals')).toBeTruthy();
    expect(screen.queryByText('Famous coaches')).toBeNull();
    expect(within(section(ROUND_1)).getByText('No categories found')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Famous coaches')).toBeTruthy();
  });

  it('opens on the category a publish-report link names by its key', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('card-categories').create({ data: { key: 'coaches', prompt: 'Famous coaches' } });
    await admin.content('card-categories').create({ data: { key: 'keepers', prompt: 'Goalkeepers of the 90s' } });
    window.history.replaceState(null, '', '?q=keepers');
    try {
      renderPage();
      expect(await screen.findByText('Goalkeepers of the 90s')).toBeTruthy();
      expect(screen.queryByText('Famous coaches')).toBeNull();
      expect((screen.getByPlaceholderText('Search categories...') as HTMLInputElement).value).toBe('keepers');
    } finally {
      window.history.replaceState(null, '', window.location.pathname);
    }
  });

  it('edits a category’s name; its key stays', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('card-categories').create({ data: { key: 'coaches', prompt: 'Famous coaches' } });
    renderPage();
    const dialog = await openDialog('Famous coaches');
    const save = within(dialog).getByRole('button', { name: 'Save Changes' });
    expect(save.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).queryByLabelText('Round')).toBeNull();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Great coaches' } });
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Great coaches')).toBeTruthy();
    expect(screen.queryByText('Famous coaches')).toBeNull();
    expect((await rowOf(admin, 'coaches')).data).toEqual({ key: 'coaches', prompt: 'Great coaches' });
  });

  it('refuses a name that is too long, in the form', async () => {
    const { admin } = await signIn('betsson_admin');
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'New Category' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create Category' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'x'.repeat(301) } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save as Draft' }));
    expect((await within(dialog).findAllByRole('alert')).length).toBeGreaterThan(0);
    expect(await listOf(admin, 'card-categories', { q: 'xxxxxxxxxx' })).toHaveLength(0);
  });

  it('deletes (archives) a colleague’s category into the Archived section, and restores it', async () => {
    const colleague = await clientFor('betsson_admin', 'colleague@demo.tablederby.test');
    await colleague.admin.content('card-categories').create({ data: { key: 'mine', prompt: 'Made by me' } });
    const { admin } = await signIn('betsson_admin');
    renderPage();
    expect(screen.queryByRole('heading', { name: 'Archived' })).toBeNull();
    fireEvent.click(within(await screen.findByText('Made by me').then(() => cardOf('Made by me'))).getByRole('button', { name: 'Delete the category' }));
    const asked = await screen.findByRole('dialog', { name: 'Delete Category: "Made by me"' });
    // It archives, and the modal says so.
    expect(within(asked).getByText(/leaves the game at the next publish/)).toBeTruthy();
    await waitFor(() => expect(within(asked).getByRole('button', { name: 'Delete' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(within(asked).getByRole('button', { name: 'Delete' }));
    const archived = await waitFor(() => section('Archived'));
    expect(within(archived).getByText('Made by me')).toBeTruthy();
    expect(within(archived).getByText(ROUND_1)).toBeTruthy();
    expect(within(section(ROUND_1)).queryByText('Made by me')).toBeNull();
    expect((await rowOf(admin, 'mine')).status).toBe('archived');

    fireEvent.click(within(cardOf('Made by me')).getByRole('button', { name: 'Restore the category' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Archived' })).toBeNull());
    expect(within(section(ROUND_1)).getByText('Made by me')).toBeTruthy();
    expect((await rowOf(admin, 'mine')).status).toBe('draft');
  });

  it('publishes a colleague’s draft category with its draft cards in one step, then sends the release', async () => {
    const colleague = await clientFor('betsson_admin', 'colleague@demo.tablederby.test');
    await colleague.admin.content('card-categories').create({ data: { key: 'coaches', prompt: 'Famous coaches' } });
    for (const key of ['ferguson', 'wenger']) await colleague.admin.content('cards').create({ data: card(key, 'coaches') });

    const member = await signIn('betsson_admin');
    renderPage();
    const dialog = await openDialog('Famous coaches');
    expect(await within(dialog).findByText('Cards (2)')).toBeTruthy();
    // No review step in between: nothing to mark ready or approve on its own.
    expect(within(dialog).queryByRole('button', { name: 'Mark ready' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Publish 2' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm?' }));
    const release = await screen.findByRole('dialog', { name: 'Publish' });
    expect(within(release).getByText('Your questions are published; the game gets them with this release.')).toBeTruthy();

    expect((await rowOf(member.admin, 'coaches')).status).toBe('approved');
    const cards = (await member.admin.content('cards').list({ category: 'coaches' })).items;
    expect(cards.map((row) => row.status)).toEqual(['approved', 'approved']);
    cleanup();

    // A new name for a published category: published on its own, the cards already being out.
    const live = await rowOf(member.admin, 'coaches');
    await member.admin.content('card-categories').edit(live.id, { version: live.version, data: { ...live.data, prompt: 'Great coaches' }, position: live.position, note: live.note });
    renderPage();
    const renamed = await openDialog('Great coaches');
    fireEvent.click(await within(renamed).findByRole('button', { name: 'Publish' }));
    fireEvent.click(within(renamed).getByRole('button', { name: 'Confirm?' }));
    expect(await screen.findByRole('dialog', { name: 'Publish' })).toBeTruthy();
    const now = await rowOf(member.admin, 'coaches');
    expect(now.status).toBe('approved');
    expect(now.approvedVersion).toBe(now.contentVersion);
  });

  it('lists a category’s cards in its dialog', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('box-categories').create({ data: { key: 'finals', title: 'Cup finals' } });
    await admin.content('box-questions').create({ data: { categoryKey: 'finals', key: 'q1', q: 'Who won in 2022?', display: 'Argentina', aliases: ['argentina'] } });
    renderPage();
    const dialog = await openDialog('Cup finals');
    expect(await within(dialog).findByText('Questions (1)')).toBeTruthy();
    expect(within(dialog).getByText('Who won in 2022?')).toBeTruthy();
  });
});
