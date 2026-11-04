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
const { TdQuestionsTab } = await import('../tabs/questions-tab');
const { ReleaseReportView, TdReleasesTab } = await import('../tabs/releases-tab');
const { TdCardImage } = await import('../content/td-card-image');
const { useTdWrite } = await import('@/hooks/use-td-content');
const { CorrectionForm, OpsReviews, Replay } = await import('../tabs/players-tab');
const { MaintenanceSetting, TdSettingsTab, TicketsSetting } = await import('../tabs/ops-tabs');
const { TD_ADMIN_CONTRACT_VERSION } = await import('@/lib/td/contract');
const { TdIntegrationTab } = await import('../tabs/integration-tab');
const { TdTeam } = await import('../td-team');
const { TdApiError } = await import('@/lib/td/api-client');
const { createFakeLockManager, deferred, sleep } = await import('@/lib/td/__tests__/helpers');
const { browserPendingPublications } = await import('@/lib/td/pending-publications');
const { addDays } = await import('@/lib/td/georgia');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let generation = 0;

const COLLEAGUE = 'colleague@demo.tablederby.test';

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

async function signIn(role: TdRole, email?: string) {
  const client = await clientFor(role, email);
  Object.assign(h, { admin: client.admin, api: client.api, tokens: client.tokens, user: client.user });
  return client;
}

/** `staleTime`: as the console's own client (td-providers) keeps reads, where a test depends on refetching. */
function renderTd(ui: ReactNode, staleTime = 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const penalty = (key: string) => ({ key, q: 'Who won Euro 2024?', display: 'Spain', aliases: ['spain'] });

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
  const start = Date.now();
  // The mock's clock runs 40× faster, so publication phases pass in milliseconds.
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => start + (Date.now() - start) * 40, blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => cleanup());

describe('content editor', () => {
  it('a member creates a draft, which waits as a draft; a colleague publishes it in one step, their own too', async () => {
    await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Capital of Georgia?' } });
    fireEvent.change(screen.getByLabelText('Answer (as shown)'), { target: { value: 'Tbilisi' } });
    const spellings = screen.getByLabelText('Accepted spellings');
    fireEvent.change(spellings, { target: { value: 'tbilisi' } });
    fireEvent.keyDown(spellings, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    // Saved, it opens on its preview, as the Quizball dialog shows a question.
    expect(await screen.findByRole('heading', { name: 'Question Preview' })).toBeTruthy();
    expect(screen.getByText('Capital of Georgia?')).toBeTruthy();
    // No review step: nothing to mark ready or approve.
    for (const name of ['Mark ready', 'Approve']) expect(screen.queryByRole('button', { name })).toBeNull();
    cleanup();

    await signIn('betsson_admin', COLLEAGUE);
    const [row] = (await h.admin.content('penalty-questions').list({ status: 'draft', q: 'Capital of Georgia' })).items;
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} startOn="preview" />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await h.admin.content('penalty-questions').get(row.id)).status).toBe('approved'));
    // Opened outside the Questions page, the dialog sends the release itself.
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    cleanup();

    // As in the Quizball CMS, a member publishes their own edit.
    const own = await h.admin.content('penalty-questions').create({ data: penalty('own-edit') });
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: own }} onClose={() => {}} startOn="preview" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await h.admin.content('penalty-questions').get(own.id)).status).toBe('approved'));
  });

  it('saves the shown answer among the accepted spellings, once, as the rounds count only those', async () => {
    const { admin } = await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Who captained Georgia at Euro 2024?' } });
    fireEvent.change(screen.getByLabelText('Answer (as shown)'), { target: { value: 'Guram Kashia' } });
    const spellings = screen.getByLabelText('Accepted spellings');
    fireEvent.change(spellings, { target: { value: 'Kashia' } });
    fireEvent.keyDown(spellings, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(await screen.findByRole('heading', { name: 'Question Preview' })).toBeTruthy();
    const [row] = (await admin.content('penalty-questions').list({ q: 'captained Georgia' })).items;
    expect(row!.data.aliases).toEqual(['Guram Kashia', 'Kashia']);
  });

  it('asks five clues of a Round II subject, as a match plays only those', async () => {
    const { admin } = await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'whoami-subjects', row: null }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Answer (as shown)'), { target: { value: 'ანდრეი შევჩენკო' } });
    const add = screen.getByRole('button', { name: 'Add a clue' });
    for (const [i, clue] of ['კიევის „დინამოში“ დავიწყე', 'ოქროს ბურთი 2004 წელს'].entries()) {
      fireEvent.click(add);
      fireEvent.change(await screen.findByLabelText(`Clues, in the order they are read ${i + 1}`), { target: { value: clue } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect(await screen.findByText(/Round II needs at least 5 clues: a match shows the first 5/)).toBeTruthy();
    expect((await admin.content('whoami-subjects').list({ q: 'შევჩენკო' })).items).toEqual([]);
  });

  it('shows what the API would refuse before sending, by field', async () => {
    const { admin } = await signIn('betsson_admin');
    const before = (await admin.content('penalty-questions').list({ limit: 200 })).items.length;
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row: null }} onClose={() => {}} />);
    expect(screen.queryByLabelText('ID')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    expect((await screen.findAllByText('Required')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Add at least one')).toBeTruthy();
    expect((await admin.content('penalty-questions').list({ limit: 200 })).items).toHaveLength(before);
  });

  it('merges a stale save unit by unit: a question and its answer clash as one', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: penalty('merge-me') });
    const other = await clientFor('betsson_admin', COLLEAGUE);
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Mine?' } });
    const theirs = await other.admin.content('penalty-questions').edit(row.id, { version: row.version, data: { ...row.data, display: 'Theirs', aliases: ['spain', 'españa'] } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('Someone changed this while you were editing')).toBeTruthy();
    // The question, its answer and its spellings are one unit: never my question with their answer.
    const clash = screen.getByText('Question + Answer (as shown) + Accepted spellings').closest('li')!;
    fireEvent.click(within(clash).getByRole('radio', { name: /Yours/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue with the merge' }));
    expect(await screen.findByText('Merged onto the newer version. Review it, then save.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).version).toBe(theirs.version + 1));
    const saved = await admin.content('penalty-questions').get(row.id);
    // Mine as a whole: my question with my answer and spellings, never with theirs.
    expect(saved.data).toEqual({ key: 'merge-me', q: 'Mine?', display: 'Spain', aliases: ['spain'] });
  });

  it('holds Save while a number field shows text that is not a number, rather than saving the old number', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('put-in-order').create({
      data: { key: 'numbers', puzzle: 'pio-1', prompt: 'Order these', items: [{ key: 'item-1', label: 'Italy', sortValue: 2006 }, { key: 'item-2', label: 'Spain', sortValue: 2010 }] },
    });
    renderTd(<TdContentEditorDialog target={{ type: 'put-in-order', row }} onClose={() => {}} />);
    expect(screen.queryByLabelText('Item 1 key')).toBeNull();
    const save = screen.getByRole('button', { name: 'Save Changes' });
    const sort = screen.getByLabelText('Item 1 sort value');
    fireEvent.change(sort, { target: { value: '12abc' } });
    expect(screen.getByText('Not a number')).toBeTruthy();
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.click(save);
    expect((await admin.content('put-in-order').get(row.id)).version).toBe(row.version);

    fireEvent.change(sort, { target: { value: '2014' } });
    expect(screen.queryByText('Not a number')).toBeNull();
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    await waitFor(async () => expect(((await admin.content('put-in-order').get(row.id)).data as { items: { sortValue: number }[] }).items[0].sortValue).toBe(2014));
  });

  it('holds Save while an item’s sort value is not a number, instead of saving it as 0', async () => {
    await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'put-in-order', row: null }} onClose={() => {}} />);
    const sort = await screen.findByLabelText('Item 1 sort value');
    fireEvent.change(sort, { target: { value: 'x' } });
    expect(screen.getByText('Not a number')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Question' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(sort, { target: { value: '1990' } });
    expect(screen.queryByText('Not a number')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create Question' }).hasAttribute('disabled')).toBe(false);
  });

  it('a question’s image is published with the question, as there is no Media page', async () => {
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    const upload = await colleague.admin.media.upload(new Blob([png], { type: 'image/png' }), 'image/png');
    await colleague.admin.content('media').create({ data: { key: 'stadium-photo', url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: 'A. Photographer', license: 'CC BY 4.0', source: 'https://example.org/stadium' } });
    const question = await colleague.admin.content('practice-questions').create({
      data: { key: 'with-image', difficulty: 'easy', category: 'Stadiums', prompt: 'Which stadium is this?', options: ['Dinamo Arena', 'Mikheil Meskhi'], answer: 0, explanation: null, imageKey: 'stadium-photo' },
    });
    const image = () => colleague.admin.content('media').list({ q: 'stadium-photo' }).then((page) => page.items[0]!);
    expect((await image()).status).toBe('draft');

    const member = await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'practice-questions', row: question }} onClose={() => {}} startOn="preview" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await member.admin.content('practice-questions').get(question.id)).status).toBe('approved'));
    expect((await image()).status).toBe('approved');
  });

  it('publishing a question never approves a waiting replacement of an image already approved', async () => {
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    const upload = await colleague.admin.media.upload(new Blob([png], { type: 'image/png' }), 'image/png');
    const made = await colleague.admin.content('media').create({ data: { key: 'shared-photo', url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: 'A', license: 'CC0', source: 'https://example.org' } });
    const ready = await colleague.admin.content('media').ready(made.id, made.version);
    const approved = await colleague.admin.content('media').approve(ready.id, ready.version);
    // A replacement waits: a new credit, marked ready.
    const replaced = await colleague.admin.content('media').edit(approved.id, { version: approved.version, data: { ...approved.data, author: 'B' } });
    await colleague.admin.content('media').ready(replaced.id, replaced.version);
    const q = await colleague.admin.content('practice-questions').create({
      data: { key: 'shared-q', difficulty: 'easy', category: 'Stadiums', prompt: 'Which?', options: ['A', 'B'], answer: 0, explanation: null, imageKey: 'shared-photo' },
    });
    const qReady = await colleague.admin.content('practice-questions').ready(q.id, q.version);
    await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'practice-questions', row: qReady }} onClose={() => {}} startOn="preview" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await colleague.admin.content('practice-questions').get(q.id)).status).toBe('approved'));
    const image = await colleague.admin.content('media').get(made.id);
    expect(image.status).toBe('ready');
    expect(image.approved?.author).toBe('A');
  });

  it('an image is not published for a question that changed since it was opened', async () => {
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    const upload = await colleague.admin.media.upload(new Blob([png], { type: 'image/png' }), 'image/png');
    const media = await colleague.admin.content('media').create({ data: { key: 'changed-photo', url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: 'A', license: 'CC0', source: 'https://example.org' } });
    await colleague.admin.content('media').ready(media.id, media.version);
    const made = await colleague.admin.content('practice-questions').create({
      data: { key: 'changed-q', difficulty: 'easy', category: 'Stadiums', prompt: 'Which?', options: ['A', 'B'], answer: 0, explanation: null, imageKey: 'changed-photo' },
    });
    const ready = await colleague.admin.content('practice-questions').ready(made.id, made.version);
    await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'practice-questions', row: ready }} onClose={() => {}} startOn="preview" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    // Changed after it was opened: the publish is refused, and its image stays as it was.
    await colleague.admin.content('practice-questions').edit(ready.id, { version: ready.version, data: { ...ready.data, prompt: 'Which one?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await colleague.admin.content('practice-questions').get(made.id)).status).not.toBe('approved'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await colleague.admin.content('media').get(media.id)).status).toBe('ready');
  });

});

describe('stepping through a list', () => {
  it('← and → step to the neighbours on the preview, not in the form', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: penalty('step-keys') });
    const onGo = vi.fn();
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} startOn="preview" nav={{ index: 1, total: 3, more: false, onGo }} />);
    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    expect(onGo.mock.calls).toEqual([[2], [0]]);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
    expect(await screen.findByRole('heading', { name: 'Edit Question' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onGo).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('Cancel in the form asks before it drops a change, then goes back to the preview', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: penalty('cancel-held') });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} startOn="preview" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Changed?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Edit Question' })).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Question Preview' })).toBeTruthy();
    expect(screen.getByText('Who won Euro 2024?')).toBeTruthy();
    confirm.mockRestore();
  });

  it('asks before the dialog closes on a change, and closes at once when nothing was changed', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: penalty('close-held') });
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Changed?' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    // A spelling typed but not entered yet is not in the draft: closing would lose it, so it asks too.
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Who won Euro 2024?' } });
    fireEvent.change(screen.getByLabelText('Accepted spellings'), { target: { value: 'espana' } });
    confirm.mockClear();
    confirm.mockReturnValue(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('a step opens the next row on its preview', async () => {
    const { admin } = await signIn('betsson_admin');
    const one = await admin.content('penalty-questions').create({ data: { ...penalty('step-one'), q: 'First question?' } });
    const two = await admin.content('penalty-questions').create({ data: { ...penalty('step-two'), q: 'Second question?' } });
    const nav = { index: 0, total: 2, more: false, onGo: () => {} };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <TdContentEditorDialog target={{ type: 'penalty-questions', row: one }} onClose={() => {}} startOn="preview" nav={nav} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('First question?')).toBeTruthy();
    view.rerender(
      <QueryClientProvider client={client}>
        <TdContentEditorDialog target={{ type: 'penalty-questions', row: two }} onClose={() => {}} startOn="preview" nav={{ ...nav, index: 1 }} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Question Preview' })).toBeTruthy();
    expect(screen.getByText('Second question?')).toBeTruthy();
  });

  it('holds the steps while the next row’s page is on its way', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: penalty('step-wait') });
    const onGo = vi.fn();
    renderTd(<TdContentEditorDialog target={{ type: 'penalty-questions', row }} onClose={() => {}} startOn="preview" nav={{ index: 0, total: 1, more: true, waiting: true, onGo }} />);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(onGo).not.toHaveBeenCalled();
  });

  it('a row opens from the keyboard', async () => {
    await signIn('betsson_admin');
    window.history.replaceState(null, '', '?mode=penalties');
    renderTd(<TdQuestionsTab />);
    const row = (await screen.findAllByRole('button', { name: /\?$/ }))[0]!;
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByRole('heading', { name: 'Question Preview' })).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('a step past the last loaded question loads the next page and opens its row', async () => {
    const { admin } = await signIn('betsson_admin');
    for (let i = 1; i <= 51; i++) await admin.content('penalty-questions').create({ data: { ...penalty(`page-${String(i).padStart(2, '0')}`), q: `Question ${String(i).padStart(2, '0')}?` } });
    // The search leaves the mock's own questions out.
    window.history.replaceState(null, '', '?mode=penalties&q=Question');
    renderTd(<TdQuestionsTab />);
    expect(await screen.findAllByText(/^Question \d\d\?$/)).toHaveLength(10);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(await screen.findByText('Question 50?'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Question 50?')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Question 51?')).toBeTruthy());
    window.history.replaceState(null, '', window.location.pathname);
  });
});

describe('publish in one step', () => {
  const card = (key: string, categoryKey: string) => ({ categoryKey, key, value: 1 as const, lines: [], display: key, aliases: [key], photo: null, imageKey: null });

  it('a member picks drafts and publishes them: approved, and the release goes out on its own', async () => {
    const { admin } = await signIn('betsson_admin');
    const first = await admin.content('penalty-questions').create({ data: { ...penalty('one-step-1'), q: 'One step 1?' } });
    const second = await admin.content('penalty-questions').create({ data: { ...penalty('one-step-2'), q: 'One step 2?' } });
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    window.history.replaceState(null, '', '?mode=penalties&q=One step');
    renderTd(<TdQuestionsTab />, 30_000);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select One step 1?' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select One step 2?' }));
    expect(screen.queryByRole('button', { name: 'Mark ready' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Publish 2' }));
    const asked = await screen.findByRole('dialog', { name: 'Publish' });
    expect(within(asked).getByText(/Publish 2 questions\? Players get them in a minute, with anything else waiting/)).toBeTruthy();
    fireEvent.click(within(asked).getByRole('button', { name: 'Publish' }));

    await waitFor(async () => {
      expect((await admin.content('penalty-questions').get(first.id)).status).toBe('approved');
      expect((await admin.content('penalty-questions').get(second.id)).status).toBe('approved');
    });
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    const current = (await admin.releases.list({ limit: 1 })).items[0]!;
    expect(current.id).not.toBe(before);
    expect(current.current).toBe(true);
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('a step the API refuses as too many waits and goes again, so a large publish does not stop halfway', async () => {
    const inner = server;
    let approvals = 0;
    server = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/approve') && ++approvals === 1)
        return Promise.resolve(new Response(JSON.stringify({ code: 'rate_limited', message: 'Too many requests; try again in a minute' }), { status: 429, headers: { 'content-type': 'application/json' } }));
      return inner(input, init);
    }) as typeof fetch;
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: { ...penalty('one-step-paced'), q: 'Paced?' } });
    window.history.replaceState(null, '', '?mode=penalties&q=Paced');
    renderTd(<TdQuestionsTab />, 30_000);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Paced?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Publish' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).status).toBe('approved'), { timeout: 20_000 });
    expect(approvals).toBe(2);
    expect(screen.queryByText(/refused/)).toBeNull();
    // The release it starts finishes here, not in the next test.
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  }, 30_000);

  it('a draft publishes from its own window too', async () => {
    const { admin } = await signIn('betsson_admin');
    const row = await admin.content('penalty-questions').create({ data: { ...penalty('one-step-own'), q: 'From its window?' } });
    window.history.replaceState(null, '', '?mode=penalties&q=From its window');
    renderTd(<TdQuestionsTab />, 30_000);
    fireEvent.click(await screen.findByText('From its window?'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Mark ready' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    // Asked first, as the list asks: everything waiting goes out with it.
    expect(within(dialog).getByText(/with anything else waiting to publish/)).toBeTruthy();
    expect((await admin.content('penalty-questions').get(row.id)).status).toBe('draft');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm?' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(row.id)).status).toBe('approved'));
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('nothing goes out when the release check fails: the questions stay published for the next one, and it says why', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('penalty-questions').create({ data: { ...penalty('one-step-held'), q: 'Held back?' } });
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    const validate = admin.releases.validate;
    admin.releases.validate = async (...args) => ({ ...(await validate(...args)), ok: false, errors: [{ code: 'min_penalties', message: 'Too few penalty questions', path: null }] as never });
    window.history.replaceState(null, '', '?mode=penalties&q=Held back');
    renderTd(<TdQuestionsTab />, 30_000);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Held back?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/the game was not updated: fix what is listed below/)).toBeTruthy();
    expect((await admin.releases.list({ limit: 1 })).items[0]!.id).toBe(before);
    admin.releases.validate = validate;
    // Approved, but players do not have it yet: the list says so.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('waiting to publish')).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('a game still short of content elsewhere: it says the set is published and lists only what is missing, the full check behind Details', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('penalty-questions').create({ data: { ...penalty('one-step-short'), q: 'Short elsewhere?' } });
    const validate = admin.releases.validate;
    admin.releases.validate = async (...args) => {
      const report = await validate(...args);
      return {
        ...report,
        ok: false,
        errors: [{ code: 'pool', message: 'cannot run a match: round II needs 3 subjects with 5+ clues, has 0', path: null }] as never,
        pools: { ...report.pools, whoAmI: { ...report.pools.whoAmI, ready: 0, needed: 3, clues: 5 } },
      };
    };
    window.history.replaceState(null, '', '?mode=penalties&q=Short elsewhere');
    renderTd(<TdQuestionsTab />, 30_000);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Short elsewhere?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Publish' }));
    const release = await screen.findByRole('dialog', { name: 'Publish' });
    expect(await within(release).findByText('Published.')).toBeTruthy();
    expect(within(release).getByText('Round II: 3 subjects with 5+ clues (now 0)')).toBeTruthy();
    // Nothing of the other modes' error lists until asked.
    expect(within(release).queryByText(/cannot run a match/)).toBeNull();
    expect(within(release).queryByText('Next release')).toBeNull();
    fireEvent.click(within(release).getByRole('button', { name: 'Details' }));
    expect(within(release).getByText(/cannot run a match/)).toBeTruthy();
    admin.releases.validate = validate;
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('a question marked ready earlier publishes with the draft image it shows', async () => {
    const { admin, tokens } = await signIn('betsson_admin');
    const { approveForPublish } = await import('@/lib/td/publish-rows');
    const { beginOperation } = await import('@/lib/td/operation');
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    const upload = await admin.media.upload(new Blob([png], { type: 'image/png' }), 'image/png');
    await admin.content('media').create({ data: { key: 'ready-q-photo', url: null, uploadId: upload.id, width: upload.width, height: upload.height, author: 'A', license: 'CC0', source: 'https://example.org' } });
    const made = await admin.content('practice-questions').create({
      data: { key: 'ready-q', difficulty: 'easy', category: 'Stadiums', prompt: 'Which stadium?', options: ['Dinamo Arena', 'Mikheil Meskhi'], answer: 0, explanation: null, imageKey: 'ready-q-photo' },
    });
    // Marked ready on its own: the image stayed a draft.
    const ready = await admin.content('practice-questions').ready(made.id, made.version);
    const { results } = await approveForPublish(tokens, 'practice-questions', [ready as TdContentRow], beginOperation(tokens));
    expect(results.map((r) => r.ok)).toEqual([true]);
    expect((await admin.content('media').list({ q: 'ready-q-photo' })).items[0]!.status).toBe('approved');
  });

  it('every question the filters match can be chosen, not only the page shown', async () => {
    const { admin } = await signIn('betsson_admin');
    for (let i = 1; i <= 12; i++) await admin.content('penalty-questions').create({ data: { ...penalty(`many-${i}`), q: `Zebra ${String(i).padStart(2, '0')}?` } });
    window.history.replaceState(null, '', '?mode=penalties&q=Zebra');
    renderTd(<TdQuestionsTab />, 30_000);
    await waitFor(() => expect(screen.getAllByText(/^Zebra \d\d\?$/)).toHaveLength(10));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select every matching question' }));
    expect(await screen.findByRole('button', { name: 'Publish 12' })).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('an approved question players do not have yet publishes again, and a lost answer that went through counts', async () => {
    const { admin, tokens } = await signIn('betsson_admin');
    const { approveForPublish } = await import('@/lib/td/publish-rows');
    const { beginOperation } = await import('@/lib/td/operation');
    const made = await admin.content('penalty-questions').create({ data: { ...penalty('lost-answer'), q: 'Lost answer?' } });
    // The approval goes through, but its answer never arrives.
    const api = admin.content('penalty-questions');
    const approve = api.approve;
    const content = admin.content;
    admin.content = ((type: string) => (type === 'penalty-questions' ? { ...api, approve: async (...args: Parameters<typeof approve>) => { await approve(...args); throw new TdApiError(0, 'network', 'Network error'); } } : content(type as never))) as typeof admin.content;
    const out = await approveForPublish(tokens, 'penalty-questions', [made as TdContentRow], beginOperation(tokens));
    admin.content = content;
    expect(out.results.map((r) => r.ok)).toEqual([true]);
    const approved = await api.get(made.id);
    expect(approved.status).toBe('approved');

    // Approved, not in the release: Publish is offered again, and only the release is left to do.
    window.history.replaceState(null, '', '?mode=penalties&q=Lost answer');
    renderTd(<TdQuestionsTab />, 30_000);
    expect(await screen.findByText('waiting to publish')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lost answer?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Publish 1' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Close' }));
    expect(await screen.findByText('published')).toBeTruthy();
    window.history.replaceState(null, '', window.location.pathname);
  });

  it('a card whose category is archived is reported, not counted as live', async () => {
    const { admin, tokens } = await signIn('betsson_admin');
    const { approveForPublish } = await import('@/lib/td/publish-rows');
    const { beginOperation } = await import('@/lib/td/operation');
    const category = await admin.content('card-categories').create({ data: { key: 'gone-cat', prompt: 'Gone' } });
    await admin.content('card-categories').archive(category.id, category.version);
    const made = await admin.content('cards').create({ data: card('gone-card', 'gone-cat') }).catch(() => null);
    if (!made) return; // The API refuses a card in an archived category outright: nothing to publish.
    const out = await approveForPublish(tokens, 'cards', [made as TdContentRow], beginOperation(tokens));
    expect(out.categories.map((c) => c.key)).toEqual(['gone-cat']);
  });

  it('a card in a new category takes the category along once all its cards are in', async () => {
    const { admin, tokens } = await signIn('betsson_admin');
    const { approveForPublish } = await import('@/lib/td/publish-rows');
    const { beginOperation } = await import('@/lib/td/operation');
    await admin.content('card-categories').create({ data: { key: 'one-step-cat', prompt: 'One step category' } });
    const a = await admin.content('cards').create({ data: card('os-a', 'one-step-cat') });
    const b = await admin.content('cards').create({ data: card('os-b', 'one-step-cat') });
    const category = async () => (await admin.content('card-categories').list({ q: 'one-step-cat', status: 'draft,ready,approved' })).items[0]!;

    // One of two: that card is approved, the category waits for the other (and says so).
    const partly = await approveForPublish(tokens, 'cards', [a as TdContentRow], beginOperation(tokens));
    expect(partly.results.every((r) => r.ok)).toBe(true);
    expect(partly.categories.map((c) => c.key)).toEqual(['one-step-cat']);
    const { categoryHeldText } = await import('@/lib/td/publish-rows');
    expect(categoryHeldText(partly.categories[0]!.error, true)).toBe(
      'The category goes live once all its questions are published: 1 more still to publish. Select them in the list and publish them together.',
    );
    expect((await category()).approvedVersion).toBeNull();

    const rest = await approveForPublish(tokens, 'cards', [b as TdContentRow], beginOperation(tokens));
    expect(rest.categories).toEqual([]);
    expect((await category()).status).toBe('approved');
  });
});

describe('media', () => {
  it('uploads a crest from the club editor and saves it as an image to pick', async () => {
    const { admin } = await signIn('betsson_admin');
    renderTd(<TdContentEditorDialog target={{ type: 'clubs', row: null, preset: { key: 'torpedo' } }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an image' });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAFElEQVR42mP4GKVEEmIY1TAoNAAAV/DNUSF4ln8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));
    fireEvent.change(within(dialog).getByTestId('td-upload-input'), { target: { files: [new File([png], 'crest.png', { type: 'image/png' })] } });
    expect(await within(dialog).findByText(/Uploaded · 16 × 9 px/)).toBeTruthy();
    // Its ID is made, never typed.
    expect(within(dialog).queryByLabelText('ID')).toBeNull();
    // No credit, licence or source is asked.
    expect(within(dialog).queryByLabelText('Licence')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and use it' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
    expect(await screen.findByText('It is approved with the question.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image details' })).toBeTruthy();
    const [image] = (await admin.content('media').list({ q: 'crest-torpedo' })).items;
    expect(image).toMatchObject({ status: 'draft', data: { key: 'crest-torpedo', width: 16, height: 9, license: null, author: null, source: null } });
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
    const member = await signIn('betsson_admin');
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTdWrite(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    const answer = deferred<string>();
    const running = result.current(() => answer.promise);
    await put(member.tokens, { accessToken: 'other', refreshToken: 'other-refresh-token-000000', expiresAt: Date.now() + 60_000, generation: 'someone-else', staffId: null, refreshPendingSince: null });
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
      ['Demo Colleague', COLLEAGUE],
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

  it('a team manager disables a member, which signs them out; enabling brings them back as they were', async () => {
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const me = (client: { api: TdApiClient }) => client.api.get<{ role: string }>('/admin/me');
    await signIn('betsson_admin');
    renderTd(<TdTeam />);
    const status = (email: string) => screen.getByRole('cell', { name: email }).closest('tr')!.textContent;

    fireEvent.click(await screen.findByRole('button', { name: 'Disable Demo Colleague' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(() => expect(status(COLLEAGUE)).toContain('disabled'));
    await expect(me(colleague)).rejects.toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enable Demo Colleague' }));
    await waitFor(() => expect(status(COLLEAGUE)).toContain('active'));

    // Disabling someone takes their reset link off the screen: it stopped working.
    fireEvent.click(screen.getByRole('button', { name: 'Reset link for Demo Editor' }));
    expect(await screen.findByLabelText('Reset link')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Disable Demo Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(() => expect(screen.queryByLabelText('Reset link')).toBeNull());
    await waitFor(() => expect(status('editor@demo.tablederby.test')).toContain('disabled'));

    // Disabling someone just invited takes their invitation link off the screen too.
    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'gone.soon@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    expect(await screen.findByLabelText('Invitation link')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Disable gone.soon@example.test' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(() => expect(screen.queryByLabelText('Invitation link')).toBeNull());

    // Someone who never signed up comes back invited.
    fireEvent.click(screen.getByRole('button', { name: 'Disable Invited Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    await waitFor(() => expect(status('invited@demo.tablederby.test')).toContain('disabled'));
    fireEvent.click(screen.getByRole('button', { name: 'Enable Invited Editor' }));
    await waitFor(() => expect(status('invited@demo.tablederby.test')).toContain('invited'));

    // Never themselves or an ops member.
    for (const name of ['Demo Betsson Admin', 'Demo Ops']) expect(screen.queryByRole('button', { name: `Disable ${name}` })).toBeNull();
  });

  it('holds member actions while an invitation is on its way', async () => {
    const admin = await signIn('betsson_admin');
    let answer: () => void = () => {};
    h.admin = { ...admin.admin, staff: { ...admin.admin.staff, invite: (body, options) => new Promise((resolve) => (answer = () => resolve(admin.admin.staff.invite(body, options)))) } };
    renderTd(<TdTeam />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invited@demo.tablederby.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Disable Invited Editor' }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole('button', { name: 'Disable Demo Editor' }) as HTMLButtonElement).disabled).toBe(true);
    answer();
    expect(await screen.findByLabelText('Invitation link')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Disable Invited Editor' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('says in plain words why a member was not changed', async () => {
    const admin = await signIn('betsson_admin');
    h.admin = { ...admin.admin, staff: { ...admin.admin.staff, patch: async () => Promise.reject(new TdApiError(403, 'forbidden', 'Your role cannot manage the team')) } };
    renderTd(<TdTeam />);
    fireEvent.click(await screen.findByRole('button', { name: 'Disable Demo Editor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm?' }));
    expect(await screen.findByText('editor@demo.tablederby.test was not changed: Your role cannot manage the team.')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'editor@demo.tablederby.test' }).closest('tr')!.textContent).toContain('active');
  });

  it('a team manager makes a one-time invitation link to copy, for a member of Betsson’s one role', async () => {
    await signIn('betsson_admin');
    renderTd(<TdTeam />);
    fireEvent.click(await screen.findByRole('button', { name: 'Invite member' }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not an email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    expect(await screen.findByText(/Enter a valid email address/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'editor@demo.tablederby.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    expect(await screen.findByText(/already has an account/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New.Member@example.test' } });
    expect(screen.queryByLabelText('Role')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make the invitation link' }));
    const link = (await screen.findByLabelText('Invitation link')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp(`^${window.location.origin}/td/accept-invite#token=tdi_[A-Za-z0-9_-]{20,}$`));
    expect(screen.getByText(/Shown once: it cannot be seen again/)).toBeTruthy();
    // The team list shows them as invited, in the one role.
    const row = (await screen.findByRole('cell', { name: 'new.member@example.test' })).closest('tr')!;
    expect(row.textContent).toContain('invited');
    expect(row.textContent).toContain('Editor');
    await waitFor(() => expect(document.activeElement).toBe(link));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByLabelText('Invitation link')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite member' })));
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

describe('releases', () => {
  it('publishes the approved content and follows it phase by phase until it is current', async () => {
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const row = await colleague.admin.content('penalty-questions').create({ data: penalty('new-for-release') });
    const ready = await colleague.admin.content('penalty-questions').ready(row.id, row.version);
    const member = await signIn('betsson_admin');
    await member.admin.content('penalty-questions').approve(ready.id, ready.version);
    renderTd(<TdReleasesTab />);
    expect(await screen.findByText('Valid: it can be published.')).toBeTruthy();
    expect(screen.getByText('Penalty questions')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' })));
    expect(await screen.findByText(/is current now\./, {}, { timeout: 5000 })).toBeTruthy();
    const list = await member.admin.releases.list();
    expect(list.pointer.version).toBe(3);
    // Cleared once the replica notice is confirmed too (the next poll, a second later).
    await waitFor(() => expect(localStorage.getItem(`td_pending_publications:${member.user.id}`)).toBeNull(), { timeout: 4000 });
  });

  it('says “Publishing…” as the publish goes out, before its answer, and not for one refused before sending', async () => {
    const said = vi.spyOn(toast, 'message');
    const colleague = await clientFor('betsson_admin', COLLEAGUE);
    const row = await colleague.admin.content('penalty-questions').create({ data: penalty('announce-publish') });
    const ready = await colleague.admin.content('penalty-questions').ready(row.id, row.version);
    const member = await signIn('betsson_admin');
    await member.admin.content('penalty-questions').approve(ready.id, ready.version);
    const answer = deferred<void>();
    const publish = member.admin.releases.publish;
    h.admin = { ...member.admin, releases: { ...member.admin.releases, publish: async (...args: Parameters<typeof publish>) => (await answer.promise, publish(...args)) } };
    renderTd(<TdReleasesTab />);
    await screen.findByText('Valid: it can be published.');
    const confirmPublish = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await act(async () => fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publish' })));
    };
    // Someone else signed in meanwhile: refused here, nothing said.
    const own = member.tokens.read()!;
    const next = await clientFor('ops');
    await put(member.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: next.user.id });
    await confirmPublish();
    expect(await screen.findByText(/switched accounts/)).toBeTruthy();
    expect(said).not.toHaveBeenCalled();

    await put(member.tokens, own);
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
      const member = await signIn('betsson_admin');
      const next = await clientFor('ops');
      const kept = `td_pending_publications:${member.user.id}`;
      await (await browserPendingPublications(member.user.id)).keep({ kind: 'publish', idemKey: 'publish:mine', releaseId: null, publicationId: null });
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
      await put(member.tokens, { ...next.tokens.read()!, generation: 'gen-next', staffId: next.user.id });
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
    const member = await signIn('betsson_admin');
    const elsewhere = await member.admin.releases.publish('publish:elsewhere');
    sent.length = 0;
    const kept = `td_pending_publications:${member.user.id}`;
    await (await browserPendingPublications(member.user.id)).keep({ kind: 'publish', idemKey: 'publish:mine', releaseId: null, publicationId: null });
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

const practice = (key: string, category: string, prompt = `${key}?`) => ({ key, difficulty: 'easy' as const, category, prompt, options: ['one', 'two'], answer: 0, explanation: null, imageKey: null });

describe('practice categories', () => {
  it('a Practice question takes a category on file, or a new one typed', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('practice-questions').create({ data: practice('on-file', 'Clubs') });
    renderTd(<TdContentEditorDialog target={{ type: 'practice-questions', row: null }} onClose={() => {}} />);
    const category = (await screen.findByLabelText('Category')) as HTMLSelectElement;
    await waitFor(() => expect([...category.options].map((o) => o.text)).toContain('Clubs'));
    const shown = [...category.options].map((o) => o.text);
    expect([shown[0], shown.at(-1)]).toEqual(['Select a category', 'New category…']);
    fireEvent.change(category, { target: { value: 'Clubs' } });
    expect(category.value).toBe('Clubs');
    fireEvent.change(category, { target: { value: category.options[category.options.length - 1]!.value } });
    expect(document.activeElement).toBe(screen.getByLabelText('New category'));
    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Tournaments' } });
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Who won?' } });
    fireEvent.change(screen.getByLabelText('Options (choose the right one) 1'), { target: { value: 'Spain' } });
    fireEvent.change(screen.getByLabelText('Options (choose the right one) 2'), { target: { value: 'Italy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Question' }));
    await screen.findByRole('heading', { name: 'Question Preview' });
    const [made] = (await admin.content('practice-questions').list({ q: 'Who won?' })).items;
    expect(made!.data).toMatchObject({ category: 'Tournaments' });
  });

  it('the Practice list filters by the categories in use, and a new question starts in the one shown', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('practice-questions').create({ data: practice('in-clubs', 'Clubs', 'A clubs question?') });
    await admin.content('practice-questions').create({ data: practice('in-cups', 'Cups', 'A cups question?') });
    // Labels that look like the filter's own words or another round's category keys are labels all the same.
    await admin.content('practice-questions').create({ data: practice('in-all', 'all', 'An all question?') });
    window.history.replaceState(null, '', '/td/questions?mode=practice');
    renderTd(<TdQuestionsTab />);
    const pick = async (name: string) => {
      fireEvent.click(await screen.findByRole('combobox', { name: 'Category' }));
      fireEvent.click(await screen.findByRole('option', { name }));
    };
    await pick('Cups');
    expect(await screen.findByText('A cups question?')).toBeTruthy();
    expect(screen.queryByText('A clubs question?')).toBeNull();
    await pick('all');
    expect(await screen.findByText('An all question?')).toBeTruthy();
    expect(screen.queryByText('A cups question?')).toBeNull();
    await pick('Clubs');
    expect(await screen.findByText('A clubs question?')).toBeTruthy();
    expect(screen.queryByText('A cups question?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'New Question' }));
    expect((within(await screen.findByRole('dialog')).getByLabelText('Category') as HTMLSelectElement).value).toBe('Clubs');
  });
});

describe('the release report', () => {
  async function report() {
    await signIn('betsson_admin');
    return h.admin.releases.validate();
  }

  it('groups warnings by kind in one line each, the rest behind “Show all”', async () => {
    const base = await report();
    const warnings = Array.from({ length: 5 }, (_, i) => ({ code: 'image_external' as const, message: `the image practice-${i} is shown from its URL, not re-hosted: upload it to keep it` }));
    renderTd(<ReleaseReportView report={{ ...base, warnings }} />);
    expect(screen.getByText(/5 pictures are shown from links to another site’s storage/)).toBeTruthy();
    expect(screen.getAllByText(/is shown from its URL/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 5' }));
    expect(screen.getAllByText(/is shown from its URL/)).toHaveLength(5);
  });

  it('the same content as the current release lists no changes, even against a release with no recorded rows', async () => {
    const base = await report();
    const changes = { complete: false, types: [{ type: 'clubs' as const, added: 116, changed: 0, removed: 0 }] };
    renderTd(<ReleaseReportView report={{ ...base, ok: true, errors: [], unchanged: true, changes }} />);
    expect(screen.getByText('No changes since the current release.')).toBeTruthy();
    expect(screen.getByText(/Only published content goes out/)).toBeTruthy();
    cleanup();
    renderTd(<ReleaseReportView report={{ ...base, ok: true, errors: [], unchanged: false, changes }} />);
    expect(screen.getByText('+116')).toBeTruthy();
    expect(screen.getByText(/keeps no list of its rows, so everything shows as new here/)).toBeTruthy();
  });

  it('names the daily games the report holds: Stat Sniper from the game’s code, Football Logic in a report from before', async () => {
    const base = await report();
    renderTd(<ReleaseReportView report={base} />);
    expect(screen.getByText(/^Stat Sniper: next 30 days from/)).toBeTruthy();
    expect(screen.getByText(/^Put in Order: next 30 days from/)).toBeTruthy();
    expect(screen.getByText(/^Career Path: next 30 days from/)).toBeTruthy();
    expect(screen.queryByText(/^Football Logic:/)).toBeNull();
    cleanup();
    const missing = Array.from({ length: 6 }, (_, i) => addDays(base.from, 24 + i));
    renderTd(<ReleaseReportView report={{ ...base, dailies: { footballLogic: { covered: 24, missing } } as typeof base.dailies }} />);
    expect(screen.getByText(/^Football Logic: next 30 days from/)).toBeTruthy();
    expect(screen.getByText(/^Missing: /).textContent).toMatch(/…$/);
    expect(screen.queryByText(/^Stat Sniper:/)).toBeNull();
  });
});

describe('card pictures', () => {
  it('a SoFIFA face that does not load is a blank, not a broken image', async () => {
    renderTd(<TdCardImage card={{ display: 'Messi', imageKey: null, photo: { id: 158023, ver: '24' } }} />);
    const img = screen.getByRole('img', { name: 'Messi' });
    fireEvent.error(img);
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Messi' })).toBeNull());
  });
});
