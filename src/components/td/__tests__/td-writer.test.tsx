import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { TdAdminApi, TdWriterMode } from '@/lib/td/admin-api';
import type { TdApiClient } from '@/lib/td/api-client';
import type { TdTokenStore } from '@/lib/td/token-store';
import type { TdRole, TdStaff } from '@/types/td';

// Every question here is invented (the repository is public): the mock's stand-in agent writes them.

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
const { createOrigin, put } = await import('@/lib/td/__tests__/helpers');
const { MemoryStorage } = await import('@/lib/td/__tests__/helpers');
const { TdWriterTab } = await import('../tabs/writer-tab');
const { TdQuestionsTab } = await import('../tabs/questions-tab');

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let generation = 0;
/** Moves the mock's clock on, so its stand-in agent writes a job's questions at once. */
let skipped = 0;

async function clientFor(role: TdRole, email?: string) {
  const origin = createOrigin();
  const transport = createTransport(BASE, (input, init) => server(input, init));
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

function renderTd(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

/** A finished job of the mode: the stand-in agent starts it, then writes every question. */
async function aiJob(admin: TdAdminApi, mode: TdWriterMode, requested: number, categoryKey?: string, autoPublish = false) {
  const job = await admin.writer.generate({ requestId: crypto.randomUUID(), mode, requested, ...(categoryKey ? { categoryKey } : {}), ...(autoPublish ? { autoPublish } : {}) });
  skipped += 10_000;
  await admin.writer.overview();
  skipped += 20_000;
  const detail = await admin.writer.job(job.id);
  expect(detail.job.status).toBe('done');
  return detail;
}

const choose = async (combobox: HTMLElement, option: string) => {
  fireEvent.click(combobox);
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  const storage = new MemoryStorage();
  const start = Date.now();
  skipped = 0;
  // 40× faster, so a release's phases pass in milliseconds.
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => start + skipped + (Date.now() - start) * 40, blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', window.location.pathname);
});

const review = () => screen.findByRole('tablist', { name: 'Game mode' }).then((tabs) => tabs.closest('section')!);

describe('AI drafts to review', () => {
  it('lists each mode’s drafts as the player sees them, with the answer, its spellings and the AI’s checks', async () => {
    const { admin } = await signIn('betsson_admin');
    await aiJob(admin, 'penalty-questions', 1);
    await aiJob(admin, 'whoami-subjects', 1);
    await aiJob(admin, 'practice-questions', 1);
    await aiJob(admin, 'cards', 1, (await admin.content('card-categories').list({ limit: 1 })).items[0]!.data.key);
    await aiJob(admin, 'box-questions', 1);
    const categoryOf = async (mode: TdWriterMode) => (await admin.writer.review({ mode })).items[0]!.category!;
    const [cardCategory, boxCategory] = [await categoryOf('cards'), await categoryOf('box-questions')];
    renderTd(<TdWriterTab />);
    const section = await review();

    // Penalties first: the question, the answer and the other spellings, the score and the fact-check with its source.
    const penalty = (await within(section).findByText(/Which club of the invented league plays in Riverton/)).closest('li')!;
    expect(within(penalty).getByText('Riverton FC')).toBeTruthy();
    expect(within(penalty).getByText('Also accepted: Riverton')).toBeTruthy();
    expect(within(penalty).getByText('Difficulty 2/5')).toBeTruthy();
    expect(within(penalty).getByText('Draft')).toBeTruthy();
    expect(within(penalty).getByText(/The invented league's archive agrees/)).toBeTruthy();
    expect(within(penalty).getByRole('link', { name: 'Source' }).getAttribute('href')).toBe('https://example.org/invented-league');
    expect(within(penalty).queryByText('Changed since the check')).toBeNull();
    expect(within(penalty).getByRole('button', { name: 'Publish' })).toBeTruthy();
    expect(within(penalty).queryByRole('button', { name: /Approve|Mark ready/ })).toBeNull();

    fireEvent.click(within(section).getByRole('tab', { name: /^Round II ·/ }));
    const subject = (await within(section).findByText('Riverton Captain')).closest('li')!;
    expect(within(subject).getAllByRole('listitem')).toHaveLength(5);
    expect(within(subject).getByText('(AI, invented) I was born in Riverton')).toBeTruthy();

    fireEvent.click(within(section).getByRole('tab', { name: /^Practice/ }));
    const practice = (await within(section).findByText(/Where does Riverton FC play/)).closest('li')!;
    for (const option of ['Riverton', 'Northport', 'Southbay', 'Midvale']) expect(within(practice).getByText(option)).toBeTruthy();
    expect(within(practice).getByLabelText('Correct').parentElement!.textContent).toBe('Riverton');
    expect(within(practice).getByText('Invented league')).toBeTruthy();

    fireEvent.click(within(section).getByRole('tab', { name: /^Round I ·/ }));
    const card = (await within(section).findByText('Riverton Keeper')).closest('li')!;
    expect(within(card).getByText('Invented Riverton')).toBeTruthy();
    expect(within(card).getByText(cardCategory)).toBeTruthy();

    fireEvent.click(within(section).getByRole('tab', { name: /^Round III/ }));
    const box = (await within(section).findByText(/plays in Riverton/)).closest('li')!;
    expect(within(box).getByText(boxCategory)).toBeTruthy();
  });

  it('a draft publishes through the Questions page’s path: approved, then the release goes out on its own', async () => {
    const { admin } = await signIn('betsson_admin');
    const { questions } = await aiJob(admin, 'penalty-questions', 2);
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(await within(section).findByRole('checkbox', { name: /plays in Riverton/ }));
    fireEvent.click(within(section).getByRole('checkbox', { name: /plays in Northgate/ }));
    fireEvent.click(within(section).getByRole('button', { name: 'Publish 2' }));
    const asked = await screen.findByRole('dialog', { name: 'Publish' });
    expect(within(asked).getByText(/Publish 2 questions\? Players get them in a minute, with anything else waiting/)).toBeTruthy();
    fireEvent.click(within(asked).getByRole('button', { name: 'Publish' }));

    await waitFor(async () => {
      for (const q of questions) expect((await admin.content('penalty-questions').get(q.id!)).status).toBe('approved');
    });
    expect(await screen.findByText(/is current now\./, undefined, { timeout: 5000 })).toBeTruthy();
    // Said published only once the current release holds both.
    expect(await within(section).findByText('Published: players have all 2 now.', undefined, { timeout: 5000 })).toBeTruthy();
    const current = (await admin.releases.list({ limit: 1 })).items[0]!;
    expect(current.id).not.toBe(before);
    // Live now: nothing of the mode waits any more.
    expect((await admin.writer.review({ mode: 'penalty-questions' })).items).toEqual([]);
  });

  it('a question whose category cannot go live is not published, and no release goes out for it', async () => {
    const { admin } = await signIn('betsson_admin');
    // A new category, held back by a question of it nobody has published: the AI's question cannot reach players alone.
    await admin.content('box-categories').create({ data: { key: 'invented-new-box', title: 'Invented new box' } });
    await admin.content('box-questions').create({ data: { categoryKey: 'invented-new-box', key: 'invented-sibling', q: 'Invented sibling question?', display: 'Sibling', aliases: ['sibling'] } });
    const { questions } = await aiJob(admin, 'box-questions', 1, 'invented-new-box');
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Round III/ }));
    const item = (await within(section).findByText(/plays in Riverton/)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Publish' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Publish' })).getByRole('button', { name: 'Publish' }));

    const alert = await within(section).findByRole('alert');
    expect(within(alert).getByText('Invented new box').closest('li')!.textContent).toMatch(/The category goes live once all its questions are published: 1 more still to publish/);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(section).queryByRole('status')).toBeNull();
    expect(screen.queryByText(/Published: players have/)).toBeNull();
    expect((await admin.releases.list({ limit: 1 })).items[0]!.id).toBe(before);
    expect((await admin.content('box-questions').get(questions[0]!.id!)).status).toBe('approved');
  });

  it('new drafts of the mode shown appear without a reload, as the overview’s count moves', async () => {
    const { admin } = await signIn('betsson_admin');
    const { client } = renderTd(<TdWriterTab />);
    const section = await review();
    expect(await within(section).findByText('Nothing waits')).toBeTruthy();
    await aiJob(admin, 'penalty-questions', 1);
    // As its poll does: the overview alone is read again (never the list itself).
    await client.refetchQueries({ queryKey: ['td', 'writer'], exact: true });
    expect(await within(section).findByText(/plays in Riverton/)).toBeTruthy();
  });

  it('a rejection takes a reason and a note: the draft is archived, never deleted, and leaves the list', async () => {
    const { admin } = await signIn('ops');
    const { questions } = await aiJob(admin, 'penalty-questions', 2);
    renderTd(<TdWriterTab />);
    const section = await review();
    const item = (await within(section).findByText(/plays in Riverton/)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject' });
    const send = within(dialog).getByRole('button', { name: 'Reject' }) as HTMLButtonElement;
    // A reason first.
    expect(send.disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Too easy' }));
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Invented note: the club is in the question' } });
    fireEvent.click(send);

    await waitFor(async () => expect((await admin.content('penalty-questions').get(questions[0]!.id!)).status).toBe('archived'));
    await waitFor(() => expect(within(section).queryByText(/plays in Riverton/)).toBeNull());
    expect(within(section).getByText(/plays in Northgate/)).toBeTruthy();
    expect((await admin.content('penalty-questions').get(questions[1]!.id!)).status).toBe('draft');
  });

  it('select many: a draft someone changed, or published meanwhile, is refused by name, in plain words; the rest go', async () => {
    const { admin } = await signIn('betsson_admin');
    const { questions } = await aiJob(admin, 'penalty-questions', 3);
    renderTd(<TdWriterTab />);
    const section = await review();
    await within(section).findByText(/plays in Riverton/);
    const colleague = await clientFor('ops');
    const [changed, published] = await Promise.all(questions.slice(0, 2).map((q) => colleague.admin.content('penalty-questions').get(q.id!)));
    await colleague.admin.content('penalty-questions').edit(changed!.id, { version: changed!.version, data: { ...changed!.data, q: 'Invented: reworded by a colleague?' } });
    const ready = await colleague.admin.content('penalty-questions').ready(published!.id, published!.version);
    await colleague.admin.content('penalty-questions').approve(ready.id, ready.version);

    fireEvent.click(within(section).getByRole('checkbox', { name: 'Select all shown' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Reject 3' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject' });
    expect(within(dialog).getByText(/Reject 3 drafts\?/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Wrong' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    const alert = await within(section).findByRole('alert');
    expect(within(alert).getByText('2 refused')).toBeTruthy();
    expect(within(alert).getByText(/plays in Riverton/).closest('li')!.textContent).toMatch(/Someone changed it: refresh$/);
    expect(within(alert).getByText(/plays in Northgate/).closest('li')!.textContent).toMatch(/Already published: archive it from the Questions page$/);
    expect((await admin.content('penalty-questions').get(changed!.id)).status).toBe('draft');
    expect((await admin.content('penalty-questions').get(published!.id)).status).toBe('approved');
    expect((await admin.content('penalty-questions').get(questions[2]!.id!)).status).toBe('archived');
    // The published one waits for its release; it cannot be rejected from here any more.
    const waiting = (await within(section).findByText('Waiting to publish')).closest('li')!;
    expect((within(waiting).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Edit opens the content editor on the row; after a save the AI’s check reads as stale', async () => {
    const { admin } = await signIn('betsson_admin');
    await aiJob(admin, 'penalty-questions', 1);
    renderTd(<TdWriterTab />);
    const section = await review();
    const item = (await within(section).findByText(/plays in Riverton/)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    const question = await screen.findByLabelText('Question');
    fireEvent.change(question, { target: { value: 'Invented: which club plays in Riverton, reworded?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await within(section).findByText('Changed since the check', undefined, { timeout: 3000 })).toBeTruthy();
    expect(within(section).getByText('Invented: which club plays in Riverton, reworded?')).toBeTruthy();
  });
});

describe('jobs', () => {
  it('Generate now and each daily schedule take a difficulty (like ours by default)', async () => {
    const { admin } = await signIn('betsson_admin');
    const { container } = renderTd(<TdWriterTab />);
    expect(await within(await review()).findByText('Nothing waits')).toBeTruthy();
    const generate = (await screen.findAllByRole('combobox', { name: 'Difficulty' }))[0]!;
    expect(generate.textContent).toBe('Betsson’s style, a little easier');
    await choose(generate, 'Hard');
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(async () => expect((await admin.writer.overview()).jobs[0]?.difficulty).toBe('hard'));

    const daily = container.querySelector<HTMLElement>('#writer-schedule-penalty-questions-difficulty')!;
    expect(daily.textContent).toBe('Betsson’s style, a little easier');
    await choose(daily, 'Easy');
    fireEvent.click(within(daily.closest('div.grid')!).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await admin.writer.overview()).schedules.find((s) => s.mode === 'penalty-questions')!.difficulty).toBe('easy'));
  });

  it('a job shows what the AI turned away, by check, with each candidate’s line, and why it stopped short', async () => {
    const { admin } = await signIn('betsson_admin');
    const { job } = await aiJob(admin, 'penalty-questions', 8);
    const inner = server;
    // The stand-in agent always makes what was asked: a short job is the API's answer here.
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (!String(input).endsWith(`/admin/writer/jobs/${job.id}`)) return response;
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, job: { ...body.job, stopReason: 'no_subjects: every subject the planner found is already in the game' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    renderTd(<TdWriterTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'See the questions' }));
    const sheet = await screen.findByRole('dialog');
    const away = await within(sheet).findByRole('region', { name: 'Turned away by the AI' });
    expect(away.querySelector('p')!.textContent).toBe('Turned away by the AI: 2');
    expect(within(away).getByText('Duplicate answer: 1')).toBeTruthy();
    expect(within(away).getByText('Too easy for the level: 1')).toBeTruthy();
    expect(within(away).getByText('Invented candidate 8 → Invented Answer 8')).toBeTruthy();
    expect(within(sheet).getByText('Made 8 of 8: Ran out of new answers: twice in a row, nothing the AI wrote passed the checks')).toBeTruthy();

    // Its drafts open in the review list, that job's only.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Review this job’s drafts' }));
    const section = await review();
    expect(await within(section).findByText(/^Job: /)).toBeTruthy();
    await waitFor(() => expect(within(section).getAllByRole('checkbox', { name: /^Select \(AI, invented\)/ })).toHaveLength(8));
  });
});

describe('a job’s practice questions', () => {
  it('show the right answer only, never the other options as its spellings', async () => {
    const { admin } = await signIn('betsson_admin');
    await aiJob(admin, 'practice-questions', 1);
    renderTd(<TdWriterTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'See the questions' }));
    const sheet = await screen.findByRole('dialog');
    const line = await within(sheet).findByText(/^Answer: Riverton/);
    expect(line.textContent).toBe('Answer: Riverton · Invented league');
  });
});

describe('the agent’s stop reasons, in Georgian', async () => {
  const { writerStopReasonText } = await import('../writer/writer-modes');
  it('says each of the agent’s six codes in a sentence of the workspace, its checks by name', () => {
    expect(writerStopReasonText('no_subjects: twice in a row, nothing the writer wrote passed the checks (no new answers left?)')).toBe(
      'Ran out of new answers: twice in a row, nothing the AI wrote passed the checks',
    );
    expect(writerStopReasonText('turned_away: 14 candidates did not pass (duplicate 9, too_easy 3, fact 2)')).toBe(
      'Too many turned away: 14 did not pass the checks (Duplicate answer 9, Too easy for the level 3, Fact check 2)',
    );
    expect(writerStopReasonText('turned_away: 3 candidates did not pass')).toBe('Too many turned away: 3 did not pass the checks');
    expect(writerStopReasonText('out_of_rounds: the writer wrote too few items in 6 rounds')).toBe('Ran out of rounds (6): the AI wrote too few questions');
    expect(writerStopReasonText('category_gone: The job’s category was archived; it cannot take more questions')).toBe(
      'The job’s category was archived: it takes no more questions',
    );
    expect(writerStopReasonText('plan_limit: usage limit reached, resets at 15:00')).toBe('The AI subscription’s limit was reached: the job stopped');
    expect(writerStopReasonText('error: two failed rounds in a row')).toBe('Stopped on an error: two failed rounds in a row');
  });

  it('shows anything else as it came, after a Georgian lead', () => {
    expect(writerStopReasonText('ran out of distinct subjects')).toBe('Stopped: ran out of distinct subjects');
    expect(writerStopReasonText('unknown_code: something')).toBe('Stopped: unknown_code: something');
  });
});

describe('why a job did not publish, in Georgian', async () => {
  const { writerPublishErrorText } = await import('../writer/writer-modes');
  it('says the API’s reasons in a sentence of the workspace', () => {
    expect(writerPublishErrorText('auto_publish_skipped: content changed during the job')).toBe(
      'Nothing was published automatically: someone changed questions of this round while the job ran, so all of its questions wait for review.',
    );
    expect(writerPublishErrorText('release_held: other pending changes')).toBe('Other changes wait to be published with them: a member publishes from the Releases page.');
    expect(writerPublishErrorText('the release check refused it: invented pool too small')).toBe('The release check refused it: invented pool too small');
  });
});

describe('the Questions page’s source filter', () => {
  it('shows the AI’s questions, or the others', async () => {
    const { admin } = await signIn('betsson_admin');
    await admin.content('penalty-questions').create({ data: { key: 'invented-by-hand', q: 'Invented by hand: which club plays in Hilltop?', display: 'Hilltop FC', aliases: ['hilltop fc'] } });
    await aiJob(admin, 'penalty-questions', 1);
    window.history.replaceState(null, '', '?mode=penalties&q=invented');
    renderTd(<TdQuestionsTab />);
    expect(await screen.findByText('Invented by hand: which club plays in Hilltop?')).toBeTruthy();
    expect(screen.getByText(/plays in Riverton/)).toBeTruthy();

    await choose(screen.getByRole('combobox', { name: 'Source' }), 'AI');
    await waitFor(() => {
      expect(screen.getByText(/plays in Riverton/)).toBeTruthy();
      expect(screen.queryByText('Invented by hand: which club plays in Hilltop?')).toBeNull();
    });
    expect(screen.getByRole('button', { name: /Source: AI/ })).toBeTruthy();

    await choose(screen.getByRole('combobox', { name: 'Source' }), 'Other');
    await waitFor(() => {
      expect(screen.getByText('Invented by hand: which club plays in Hilltop?')).toBeTruthy();
      expect(screen.queryByText(/plays in Riverton/)).toBeNull();
    });
  });
});

// Releases run in the mock's clock: under a loaded full run they take longer than a test's default 5 s.
describe('publishing automatically', { timeout: 30_000 }, async () => {
  const { mockSampled } = await import('@/lib/td/mock/writer');
  /** A release of everything approved now, gone out: the current release then records its rows. */
  async function releaseNow(admin: TdAdminApi) {
    await admin.releases.publish(`publish:${crypto.randomUUID()}`);
    await waitFor(async () => expect((await admin.releases.list({ limit: 1 })).active).toBeNull(), { timeout: 15_000 });
  }

  it('Generate now and each daily schedule take it (off by default); a schedule sends only what changed, at the version read', async () => {
    const { admin } = await signIn('betsson_admin');
    const { container } = renderTd(<TdWriterTab />);
    expect(await within(await review()).findByText('Nothing waits')).toBeTruthy();
    const now = screen.getByRole('heading', { name: 'Generate now' }).closest('section')!;
    const box = within(now).getByRole('checkbox', { name: 'Publish automatically' });
    expect(box.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(box);
    fireEvent.click(within(now).getByRole('button', { name: 'Generate' }));
    await waitFor(async () => expect((await admin.writer.overview()).jobs[0]?.autoPublish).toBe(true));

    const row = container.querySelector<HTMLElement>('#writer-schedule-penalty-questions-auto')!.closest('div.grid') as HTMLElement;
    expect(within(row).queryByLabelText('At most a day')).toBeNull();
    fireEvent.click(within(row).getByRole('checkbox', { name: 'Publish automatically' }));
    fireEvent.change(within(row).getByLabelText('At most a day'), { target: { value: '40' } });
    expect(within(row).getByText('Published on their own today: 0 of 100')).toBeTruthy();
    const sent: unknown[] = [];
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/admin/writer/schedules/') && init?.method === 'PATCH') sent.push(JSON.parse(String(init.body)));
      return inner(input, init);
    }) as typeof fetch;
    fireEvent.click(within(row).getByRole('button', { name: 'Save' }));
    await waitFor(async () =>
      expect((await admin.writer.overview()).schedules.find((s) => s.mode === 'penalty-questions')).toMatchObject({ autoPublish: true, autoDailyCap: 40 }),
    );
    expect(sent).toEqual([{ revision: 1, autoPublish: true, autoDailyCap: 40 }]);
    // A member who saw an older version is refused, never silently overwrites the change.
    await expect(admin.writer.schedule('penalty-questions', { revision: 1, hour: 5 })).rejects.toMatchObject({ status: 409 });
  });

  it('nothing goes while the job runs; at its finish it publishes what passed, keeps one in ten (by row id), and releases only its own rows', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    const { job, questions } = await aiJob(admin, 'penalty-questions', 12, undefined, true);
    const kept = questions.filter((q) => mockSampled(q.id!)).length;
    expect(job).toMatchObject({ autoPublish: true, autoPublished: 12 - kept, autoSampled: kept, toReview: kept });
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    expect((await admin.releases.list({ limit: 1 })).items[0]!.id).not.toBe(before);

    renderTd(<TdWriterTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'See the questions' }));
    const sheet = await screen.findByRole('dialog');
    const auto = await within(sheet).findByRole('region', { name: 'Published automatically' });
    expect(within(auto).getByText(`Published automatically: ${12 - kept}`)).toBeTruthy();
    expect(within(auto).getByText(`Kept for review (one in ten): ${kept}`)).toBeTruthy();
    expect(within(auto).getByText('Released: players have them')).toBeTruthy();
  });

  it('a release that would carry other changes too is left to a member, and says so', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    // A colleague's approval waits to be published.
    const other = await admin.content('penalty-questions').create({ data: { key: 'invented-waiting', q: 'Invented waiting question?', display: 'Waiting FC', aliases: ['waiting fc'] } });
    const ready = await admin.content('penalty-questions').ready(other.id, other.version);
    await admin.content('penalty-questions').approve(ready.id, ready.version);
    const { job } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('held'));
    renderTd(<TdWriterTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'See the questions' }));
    const auto = await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Published automatically' });
    expect(within(auto).getByText('Not released automatically: other changes wait to be published too. Publish them from the Releases page.')).toBeTruthy();
    expect(within(auto).getByText('Other changes wait to be published with them: a member publishes from the Releases page.')).toBeTruthy();
  });

  it('a refused release is said on the job, in a sentence of the workspace', async () => {
    const { admin } = await signIn('betsson_admin');
    const { job } = await aiJob(admin, 'penalty-questions', 2, undefined, true);
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (!String(input).endsWith(`/admin/writer/jobs/${job.id}`)) return response;
      const body = await response.json();
      return new Response(
        JSON.stringify({ ...body, job: { ...body.job, autoPublish: true, releaseState: 'failed', publishError: 'the release check refused it: practice needs 3 more invented questions' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    renderTd(<TdWriterTab />);
    fireEvent.click(await screen.findByRole('button', { name: 'See the questions' }));
    const auto = await within(await screen.findByRole('dialog')).findByRole('region', { name: 'Published automatically' });
    expect(within(auto).getByText('The release did not go out: the questions stay approved')).toBeTruthy();
    expect(within(auto).getByText('The release check refused it: practice needs 3 more invented questions')).toBeTruthy();
  });

  it('the review page lists them apart, marked, and takes one out of the game in one click: archived, then a release of that removal alone', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const live = questions.find((q) => !mockSampled(q.id!))!;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    expect(within(item).getByText('AI · automatic')).toBeTruthy();
    expect(within(item).getByText('In the game')).toBeTruthy();
    expect(within(item).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: 'Remove from the game' }));
    const asked = await screen.findByRole('dialog', { name: 'Archive Question' });
    expect(within(asked).getByText('Archive this question? It leaves the game at the next publish and can be restored.')).toBeTruthy();
    fireEvent.click(within(asked).getByRole('button', { name: 'Archive' }));
    await waitFor(async () => expect((await admin.content('penalty-questions').get(live.id!)).status).toBe('archived'));
    await waitFor(async () => expect((await admin.writer.review({ mode: 'penalty-questions', filter: 'auto' })).items.map((i) => i.id)).not.toContain(live.id), {
      timeout: 15_000,
    });
    // The current release (a withdrawal may make an earlier, identical release current again).
    const current = (await admin.releases.list({ limit: 1 })).pointer.releaseId!;
    expect((await admin.releases.get(current)).members.map((m: { id: string }) => m.id)).not.toContain(live.id);
  });

  it('a removal whose release would carry other waiting changes is not published blindly: the member gets every change to confirm', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const live = questions.find((q) => !mockSampled(q.id!))!;
    // A colleague's approval waits to be published.
    const other = await admin.content('penalty-questions').create({ data: { key: 'invented-other', q: 'Invented other question?', display: 'Other FC', aliases: ['other fc'] } });
    const ready = await admin.content('penalty-questions').ready(other.id, other.version);
    await admin.content('penalty-questions').approve(ready.id, ready.version);
    const before = (await admin.releases.list({ limit: 1 })).items[0]!.id;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Remove from the game' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Question' })).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(/Other changes wait to be published too, so the question was not taken out on its own/, undefined, { timeout: 15_000 })).toBeTruthy();
    // Nothing went out on its own; the removal waits, listed as such.
    expect((await admin.releases.list({ limit: 1 })).items[0]!.id).toBe(before);
    expect((await admin.writer.review({ mode: 'penalty-questions', filter: 'auto' })).items.find((i) => i.id === live.id)).toMatchObject({ removalPending: true });
  });

  it('a row taken out is listed as removal pending; "Publish again" releases that removal alone', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const live = questions.find((q) => !mockSampled(q.id!))!;
    const row = await admin.content('penalty-questions').get(live.id!);
    await admin.content('penalty-questions').archive(row.id, row.version);
    const listed = (await admin.writer.review({ mode: 'penalty-questions', filter: 'auto' })).items.find((i) => i.id === live.id);
    expect(listed).toMatchObject({ status: 'archived', removalPending: true });
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    expect(within(item).getByText('Removal pending')).toBeTruthy();
    expect(within(item).queryByRole('button', { name: 'Remove from the game' })).toBeNull();
    fireEvent.click(within(item).getByRole('button', { name: 'Publish again' }));
    await waitFor(async () => expect((await admin.writer.review({ mode: 'penalty-questions', filter: 'auto' })).items.map((i) => i.id)).not.toContain(live.id), {
      timeout: 15_000,
    });
  });

  it('a removal is said done only when the release players get no longer holds the question', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const live = questions.find((q) => !mockSampled(q.id!))!;
    // The release the removal made still lists it (as when it was restored meanwhile).
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (!/\/admin\/releases\/r-[0-9a-f]+$/.test(String(input)) || (init?.method ?? 'GET') !== 'GET') return response;
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, members: [...body.members, { type: 'penalty-questions', id: live.id, label: 'x', contentVersion: 1 }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Remove from the game' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Question' })).getByRole('button', { name: 'Archive' }));
    const alert = await within(section).findByRole('alert', undefined, { timeout: 15_000 });
    expect(within(alert).getByText(/Still in the game: the release still holds it\. Try again\./)).toBeTruthy();
  });

  it('a removal is checked against the CURRENT release: after a rollback that brought the question back, it is still in the game', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const withIt = (await admin.releases.list({ limit: 1 })).pointer.releaseId!;
    const live = questions.find((q) => !mockSampled(q.id!))!;
    // As if the release with the question were made current again (a rollback) once the removal went out.
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      if (!/\/admin\/releases\?/.test(String(input)) || (init?.method ?? 'GET') !== 'GET') return response;
      const body = await response.json();
      return new Response(JSON.stringify({ ...body, pointer: { ...body.pointer, releaseId: withIt } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Remove from the game' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Question' })).getByRole('button', { name: 'Archive' }));
    const alert = await within(section).findByRole('alert', undefined, { timeout: 15_000 });
    expect(within(alert).getByText(/Still in the game: the release still holds it\. Try again\./)).toBeTruthy();
  });

  it('a removal is not said done when the release moved while it was checked (re-read last)', async () => {
    const { admin } = await signIn('betsson_admin');
    await releaseNow(admin);
    const { job, questions } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await waitFor(async () => expect((await admin.writer.job(job.id)).job.releaseState).toBe('published'), { timeout: 15_000 });
    const live = questions.find((q) => !mockSampled(q.id!))!;
    // After the current release's rows were read, the pointer moves (a rollback): the last read sees another release.
    let detailRead = false;
    const inner = server;
    server = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await inner(input, init);
      const url = String(input);
      if ((init?.method ?? 'GET') !== 'GET') return response;
      if (/\/admin\/releases\/r-[0-9a-f]+$/.test(url)) detailRead = true;
      else if (/\/admin\/releases\?/.test(url) && detailRead) {
        const body = await response.json();
        return new Response(JSON.stringify({ ...body, pointer: { ...body.pointer, releaseId: 'r-0000000000000000', version: body.pointer.version + 1 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return response;
    }) as typeof fetch;
    renderTd(<TdWriterTab />);
    const section = await review();
    fireEvent.click(within(section).getByRole('tab', { name: /^Published automatically/ }));
    const item = (await within(section).findByText(live.q)).closest('li')!;
    fireEvent.click(within(item).getByRole('button', { name: 'Remove from the game' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Archive Question' })).getByRole('button', { name: 'Archive' }));
    const alert = await within(section).findByRole('alert', undefined, { timeout: 15_000 });
    expect(within(alert).getByText(/Still in the game: the release still holds it\. Try again\./)).toBeTruthy();
  });

  it('the Questions page marks a row the AI published itself', async () => {
    const { admin } = await signIn('betsson_admin');
    const { job } = await aiJob(admin, 'penalty-questions', 3, undefined, true);
    await aiJob(admin, 'penalty-questions', 1);
    window.history.replaceState(null, '', '?mode=penalties&q=invented&source=ai');
    renderTd(<TdQuestionsTab />);
    expect(await screen.findAllByText(/plays in/)).toHaveLength(4);
    expect(screen.getAllByTitle('Published by the AI writer without a member')).toHaveLength(job.autoPublished);
    expect(screen.queryAllByTitle('Written by the AI writer')).toHaveLength(4 - job.autoPublished);
  });
});
