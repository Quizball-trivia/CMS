import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { ReactNode } from 'react';
import type { TdAdminApi, TdContentType } from '@/lib/td/admin-api';
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
const { checkContract } = await import('@/lib/td/contract');
const { parseSheet } = await import('@/lib/td/import-format');
const { careerClubs, matchClub, parseTdUpload, TD_UPLOAD_EXAMPLES, TD_UPLOAD_TYPES, toTdImportItem } = await import('@/lib/td/upload-format');
const { TdBulkUploadDialog } = await import('../questions/td-bulk-upload-dialog');

type UploadType = (typeof TD_UPLOAD_TYPES)[number];

const BASE = 'https://td-api.mock';
let server: typeof fetch;
let generation = 0;

async function signIn(role: TdRole) {
  const origin = createOrigin();
  const transport = createTransport(BASE, server);
  const tokens = origin.store();
  const refreshLock = origin.lock('td-refresh');
  const coordinator = createRefreshCoordinator({ tokens, refreshLock: () => refreshLock, requestRefresh: (token, id) => requestTokenRefresh(transport, token, id) });
  const api = createTdApiClient({ transport, tokens, coordinator });
  const staff = MOCK_STAFF.find((s) => s.role === role && s.status === 'active')!;
  const session = await api.login(staff.email, MOCK_PASSWORD);
  await put(tokens, { ...session, generation: `gen-${++generation}`, staffId: staff.id, refreshPendingSince: null });
  const admin = createTdAdminApi(api);
  Object.assign(h, { admin, api, tokens, user: { id: staff.id, email: staff.email, name: staff.name, role: staff.role } });
  return { admin, tokens };
}

let queryClient: QueryClient;

function renderTd(ui: ReactNode) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
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
  const start = Date.now();
  server = createMockTdApi({ storage: () => storage, latencyMs: 0, now: () => start + (Date.now() - start) * 40, blobs: memoryBlobStore(), lock: undefined });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => cleanup());

const dataOf = <T,>(item: unknown) => (item as { data: T }).data;

const txt = (text: string, name = 'questions.txt') => new File([text], name, { type: 'text/plain' });

/** The questions of a type that an upload made (their IDs are made up: `row-…`). */
async function uploaded<T extends TdContentType>(admin: TdAdminApi, type: T) {
  const out = await admin.content(type).list({ status: 'draft,ready,approved,archived', limit: 200 });
  return out.items.filter((row) => String((row.data as { key: string }).key).startsWith('row-'));
}

/** Opens the dialog; with a type, on that game mode. */
async function openDialog(props: { initialType?: TdContentType; initialCategory?: string | null } = {}) {
  renderTd(<TdBulkUploadDialog {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Upload Questions' }));
  return screen.findByRole('dialog');
}

const chooseFile = (file: File) => fireEvent.change(screen.getByLabelText(/Question File/), { target: { files: [file] } });

async function pick(trigger: HTMLElement, option: string | RegExp) {
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

const uploadButton = (count: number) => screen.findByRole('button', { name: `Upload ${count} Question${count === 1 ? '' : 's'}` });

describe('the question file format', () => {
  it('reads the example of every game mode, Georgian text and all, into an item the contract accepts', () => {
    const context = { categoryKey: 'legends', category: 'Clubs', puzzle: 'p-1', clubs: [{ key: 'napoli', label: 'Napoli', value: 'Napoli' }] };
    for (const type of TD_UPLOAD_TYPES) {
      const parsed = parseTdUpload(TD_UPLOAD_EXAMPLES[type], type);
      expect(parsed.errors, type).toEqual([]);
      expect(parsed.questions, type).toHaveLength(1);
      const item = toTdImportItem(parsed.questions[0]!, context);
      expect(item.type).toBe(type);
      expect(checkContract('ContentImportItem', item), type).toEqual([]);
    }
  });

  it('reads a card: clue lines, the answer and its spellings, points, an image key and a SoFIFA photo', () => {
    const parsed = parseTdUpload('1.\nClue 1: პირველი\nClue 2: მეორე\nAnswer: ლიონელ მესი | მესი | Messi | მესი\nPoints: 2\nImage: messi-face\nPhoto: 158023 | 25_1', 'cards');
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({ kind: 'cards', clues: ['პირველი', 'მეორე'], display: 'ლიონელ მესი', aliases: ['ლიონელ მესი', 'მესი', 'Messi'], points: 2, imageKey: 'messi-face', photo: { id: 158023, ver: '25_1' } });
    const item = toTdImportItem(parsed.questions[0]!, { categoryKey: 'legends', category: '', puzzle: '', clubs: [] });
    expect(item).toMatchObject({ type: 'cards', data: { categoryKey: 'legends', value: 2, lines: ['პირველი', 'მეორე'], photo: { id: 158023, ver: '25_1' }, imageKey: 'messi-face' } });
  });

  it('reads Round II clues in the order given, and Round III and Penalties as a question and an answer', () => {
    const who = parseTdUpload('1.\nClue 1: ა\nClue 2: ბ\nAnswer: გიორგი', 'whoami-subjects');
    expect(who.questions[0]).toMatchObject({ clues: ['ა', 'ბ'], display: 'გიორგი', aliases: ['გიორგი'] });
    for (const type of ['box-questions', 'penalty-questions'] as const) {
      const parsed = parseTdUpload('1. რომელი ქვეყანა?\nAnswer: საქართველო | Georgia\n2. Question: Two?\nAnswer: Two', type);
      expect(parsed.errors, type).toEqual([]);
      expect(parsed.questions.map((q) => (q as { q: string }).q)).toEqual(['რომელი ქვეყანა?', 'Two?']);
    }
  });

  it('reads Practice options A to H with the right one starred, the difficulty and a multi-line explanation', () => {
    const parsed = parseTdUpload('1. კითხვა?\nImage: dinamo-stadium\nA) ერთი\nB) ორი*\nC) სამი\nDifficulty: hard\nExplanation: პირველი ხაზი\nმეორე ხაზი', 'practice-questions');
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({ prompt: 'კითხვა?', difficulty: 'hard', explanation: 'პირველი ხაზი მეორე ხაზი', imageKey: 'dinamo-stadium' });
    const item = toTdImportItem(parsed.questions[0]!, { categoryKey: '', category: 'Clubs', puzzle: '', clubs: [] });
    expect(item).toMatchObject({ type: 'practice-questions', data: { category: 'Clubs', options: ['ერთი', 'ორი', 'სამი'], answer: 1, difficulty: 'hard', explanation: 'პირველი ხაზი მეორე ხაზი' } });
    const eight = parseTdUpload(`1. Q?\n${'ABCDEFGH'.split('').map((letter, i) => `${letter}) o${i}${i === 7 ? '*' : ''}`).join('\n')}\nDifficulty: easy`, 'practice-questions');
    expect(eight.errors).toEqual([]);
    expect(eight.questions).toHaveLength(1);
  });

  it('reads Football Logic with a path or an https address for each image, and none at all', () => {
    const parsed = parseTdUpload('1. Prompt: რა აკავშირებს?\nImage A: https://example.com/a.png\nImage B: /assets/b.png\nAnswer: ნაპოლი | Napoli\n2.\nAnswer: Milan', 'football-logic');
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({ prompt: 'რა აკავშირებს?', imageA: 'https://example.com/a.png', imageB: '/assets/b.png' });
    expect(parsed.questions[1]).toMatchObject({ prompt: '', imageA: null, imageB: null, display: 'Milan' });
    const item = toTdImportItem(parsed.questions[1]!, { categoryKey: '', category: 'Clubs', puzzle: 'fl-9', clubs: [] });
    expect(item).toMatchObject({ type: 'football-logic', data: { puzzle: 'fl-9', category: 'Clubs', prompt: '', imageA: null, displayAnswer: 'Milan' } });
  });

  it('gives each Put in Order item the sort value of its place in the right order, and keeps one question’s numbered answers from opening the next', () => {
    const file = '1. პირველი\nItems:\n- ბ\n- ა\n- გ\nAnswer:\n1. ა\n2. ბ\n3. გ\n2. მეორე\nItems:\n- x\n- y\nAnswer:\n1. y\n2. x';
    const parsed = parseTdUpload(file, 'put-in-order');
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions).toHaveLength(2);
    const [first, second] = parsed.questions.map((q) => dataOf<{ items: Array<{ key: string; label: string; sortValue: number }> }>(toTdImportItem(q, { categoryKey: '', category: '', puzzle: 'pio-1', clubs: [] })));
    expect(first!.items).toEqual([
      { key: 'item-1', label: 'ბ', sortValue: 2 },
      { key: 'item-2', label: 'ა', sortValue: 1 },
      { key: 'item-3', label: 'გ', sortValue: 3 },
    ]);
    expect(second!.items.map((item) => item.sortValue)).toEqual([2, 1]);
  });

  it('reads a Career Path chain with any arrow, and gives each club the key of the club of that name, or null', () => {
    const parsed = parseTdUpload('1. Question: Dinamo Tbilisi -> Rubin Kazan → NAPOLI ➔ Paris Saint-Germain\nPrompt: ვისი გზაა?\nAnswer: ხვიჩა', 'career-path');
    expect(parsed.errors).toEqual([]);
    const question = parsed.questions[0] as Extract<(typeof parsed.questions)[number], { kind: 'career-path' }>;
    expect(question.clubs).toEqual(['Dinamo Tbilisi', 'Rubin Kazan', 'NAPOLI', 'Paris Saint-Germain']);
    const clubs = [
      { key: 'dinamo-tbilisi', label: 'Dinamo Tbilisi', value: 'Dinamo Tbilisi' },
      { key: 'napoli', label: 'Napoli', value: 'Napoli' },
      { key: 'psg', label: 'Paris Saint-Germain', value: 'PSG' },
    ];
    expect(careerClubs(question, clubs).map((club) => club.clubKey)).toEqual(['dinamo-tbilisi', null, 'napoli', 'psg']);
    expect(matchClub('psg', clubs)).toBe('psg');
    expect(matchClub('Dínamo  Tbilisi', clubs)).toBe('dinamo-tbilisi');
    expect(toTdImportItem(question, { categoryKey: '', category: '', puzzle: 'cp-1', clubs })).toMatchObject({ data: { prompt: 'ვისი გზაა?', clubs: [{ name: 'Dinamo Tbilisi', clubKey: 'dinamo-tbilisi' }, { name: 'Rubin Kazan', clubKey: null }, { name: 'NAPOLI', clubKey: 'napoli' }, { name: 'Paris Saint-Germain', clubKey: 'psg' }] } });
  });

  it('reports a broken question by its line and number and reads the others', () => {
    const parsed = parseTdUpload('1. კარგი?\nAnswer: დიახ\n2. ცუდი?\n3. კარგი 2?\nAnswer: კი', 'penalty-questions');
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.errors).toEqual([{ lineNumber: 3, questionNumber: 2, message: 'Missing the “Answer:” line', severity: 'error' }]);
    const practice = parseTdUpload('1. Q?\nA) one\nB) two\nDifficulty: Easy', 'practice-questions');
    expect(practice.questions).toEqual([]);
    expect(practice.errors.map((e) => e.message)).toEqual(['No correct answer marked (use * after the correct option)']);
    const card = parseTdUpload('1.\nClue 2: x\nAnswer: y\nPoints: 5', 'cards');
    expect(card.errors.map((e) => e.message)).toEqual(['Clues must be numbered sequentially starting from 1', 'Points must be 1, 2 or 3']);
  });

  it('warns of numbering and of lines it does not use, without refusing the question', () => {
    const parsed = parseTdUpload('Heading\n1. One?\nAnswer: a\nDifficulty: Easy\n3. Three?\nAnswer: b', 'box-questions');
    expect(parsed.questions).toHaveLength(2);
    expect(parsed.errors.every((e) => e.severity === 'warning')).toBe(true);
    expect(parsed.errors.map((e) => e.message)).toEqual([
      'Content found before the first numbered question',
      'Expected question number 2, found 3',
      'This line is not part of the format and is ignored: Difficulty: Easy',
    ]);
  });

  it('names a row by what it says, so a file read twice gives the same IDs, and a question written twice is a problem', () => {
    const file = '1. რომელი ქვეყანა?\nAnswer: საქართველო | Georgia\n2. ვინ მოიგო?\nAnswer: ესპანეთი';
    const context = { categoryKey: '', category: '', puzzle: '', clubs: [] };
    const keys = (text: string) => parseTdUpload(text, 'penalty-questions').questions.map((q) => dataOf<{ key: string }>(toTdImportItem(q, context)).key);
    expect(keys(file)).toEqual(keys(file));
    expect(new Set(keys(file)).size).toBe(2);
    // Nor does the order of the questions in the file, or their numbers, matter.
    expect(keys('7. ვინ მოიგო?\nAnswer: ესპანეთი\n8. რომელი ქვეყანა?\nAnswer: საქართველო | Georgia').reverse()).toEqual(keys(file));

    // The same row as the spreadsheet import names it.
    const sheet = parseSheet('penalty-questions', 'q,display,aliases\nვინ მოიგო?,ესპანეთი,ესპანეთი');
    expect(dataOf<{ key: string }>(sheet.items[0]).key).toBe(keys(file)[1]);

    const twice = parseTdUpload('1. A?\nAnswer: a\n2. B?\nAnswer: b\n3. A?\nAnswer: a', 'penalty-questions');
    expect(twice.questions).toHaveLength(2);
    expect(twice.errors).toEqual([{ lineNumber: 5, questionNumber: 3, message: 'The same as line 1: remove one of them.', severity: 'error' }]);
  });
});

const PENALTIES = '1. რომელი ქვეყნის ნაკრებმა მოიგო ევრო 2024?\nAnswer: ესპანეთი | Spain\n2. რომელ ქალაქში მდებარეობს ანფილდი?\nAnswer: ლივერპული | Liverpool';

describe('the upload dialog', () => {
  it('uploads a file as drafts, closes, says so, and refreshes the question lists', async () => {
    const { admin } = await signIn('editor');
    const said = vi.spyOn(toast, 'success');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    const upload = await uploadButton(2);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    expect(screen.getByText('2 questions selected for upload')).toBeTruthy();
    const refresh = vi.spyOn(queryClient, 'invalidateQueries');
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(said).toHaveBeenCalledWith('2 drafts imported');
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['td', 'content'] });

    const made = await uploaded(admin, 'penalty-questions');
    expect(made.map((row) => [row.status, row.data.q, row.data.display])).toEqual([
      ['draft', 'რომელი ქვეყნის ნაკრებმა მოიგო ევრო 2024?', 'ესპანეთი'],
      ['draft', 'რომელ ქალაქში მდებარეობს ანფილდი?', 'ლივერპული'],
    ]);
    expect(made[0]!.data.aliases).toEqual(['ესპანეთი', 'Spain']);
    // One batch, in the order of the file.
    expect((await admin.imports.list()).items).toHaveLength(1);
  });

  it('uploads cards into the category the page was showing', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'cards', initialCategory: 'legends' });
    chooseFile(txt(TD_UPLOAD_EXAMPLES.cards));
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [card] = await uploaded(admin, 'cards');
    expect(card!.data).toMatchObject({ categoryKey: 'legends', value: 1, display: 'ლიონელ მესი', imageKey: null, photo: null });
    expect(card!.data.lines).toHaveLength(3);
  });

  it('takes a category for Practice from the labels on file, or one typed', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'practice-questions' });
    chooseFile(txt(TD_UPLOAD_EXAMPLES['practice-questions']));
    // Without a category it only reads the file.
    expect(await screen.findByText('Parsed Questions (1)')).toBeTruthy();
    expect((await uploadButton(1)).hasAttribute('disabled')).toBe(true);
    await pick(screen.getByRole('combobox', { name: /Category/ }), 'New category…');
    fireEvent.change(screen.getByLabelText('New category'), { target: { value: 'Tournaments 2026' } });
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [question] = await uploaded(admin, 'practice-questions');
    expect(question!.data).toMatchObject({ category: 'Tournaments 2026', difficulty: 'easy', answer: 1, options: ['ბრაზილია', 'გერმანია', 'არგენტინა', 'ესპანეთი'] });

    // And one of the labels the questions on file already have.
    cleanup();
    await openDialog({ initialType: 'practice-questions' });
    await pick(screen.getByRole('combobox', { name: /Category/ }), 'Clubs');
    chooseFile(txt('1. სხვა კითხვა?\nA) ა\nB) ბ*\nDifficulty: Medium'));
    const next = await uploadButton(1);
    await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
    fireEvent.click(next);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await uploaded(admin, 'practice-questions')).map((row) => row.data.category).sort()).toEqual(['Clubs', 'Tournaments 2026']);
  });

  it('puts a daily’s questions in a new puzzle named for the upload, or in one that exists', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'put-in-order' });
    chooseFile(txt(TD_UPLOAD_EXAMPLES['put-in-order']));
    expect(await screen.findByText('Parsed Questions (1)')).toBeTruthy();
    const puzzle = screen.getByRole('combobox', { name: /Puzzle \(set\)/ });
    await pick(puzzle, 'New puzzle…');
    fireEvent.change(screen.getByLabelText('New puzzle key'), { target: { value: 'Not A Key' } });
    expect(await screen.findByText(/^Lower-case letters, digits/)).toBeTruthy();
    expect((await uploadButton(1)).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('New puzzle key'), { target: { value: 'pio-world-cups' } });
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [round] = (await admin.content('put-in-order').list({ puzzle: 'pio-world-cups' })).items;
    expect(round!.status).toBe('draft');
    expect([...round!.data.items].sort((a, b) => a.sortValue - b.sortValue).map((item) => item.label)).toEqual(['გერმანია 2006', 'სამხრეთ აფრიკა 2010', 'ბრაზილია 2014', 'რუსეთი 2018']);

    // An existing puzzle shows how many questions it has.
    cleanup();
    await openDialog({ initialType: 'put-in-order' });
    await pick(screen.getByRole('combobox', { name: /Puzzle \(set\)/ }), /^pio-1 · 1 question/);
    chooseFile(txt('1. Next?\nItems:\n- a\n- b\nAnswer:\n1. b\n2. a'));
    const next = await uploadButton(1);
    await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
    fireEvent.click(next);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await admin.content('put-in-order').list({ puzzle: 'pio-1' })).items).toHaveLength(2);
  });

  it('gives a Career Path club the crest of the club on file by that name, and shows which in the preview', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'career-path' });
    await pick(screen.getByRole('combobox', { name: /Puzzle \(set\)/ }), 'New puzzle…');
    fireEvent.change(screen.getByLabelText('New puzzle key'), { target: { value: 'cp-new' } });
    chooseFile(txt('1. Question: Dinamo Tbilisi ➔ Unknown FC ➔ Napoli\nAnswer: ვიღაც'));
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(await screen.findByText('Dinamo Tbilisi ➔ Unknown FC ➔ Napoli'));
    const preview = await screen.findByRole('dialog', { name: 'Question Preview' });
    expect(await within(preview).findByText('dinamo-tbilisi')).toBeTruthy();
    expect(within(preview).getByText('napoli')).toBeTruthy();
    expect(within(preview).getByText('No crest')).toBeTruthy();
    fireEvent.keyDown(preview, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Question Preview' })).toBeNull());
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [row] = (await admin.content('career-path').list({ puzzle: 'cp-new' })).items;
    expect(row!.data.clubs).toEqual([
      { name: 'Dinamo Tbilisi', clubKey: 'dinamo-tbilisi' },
      { name: 'Unknown FC', clubKey: null },
      { name: 'Napoli', clubKey: 'napoli' },
    ]);
    expect(row!.data.prompt).toBe('Whose career is this?');
  });

  it('shows the problem of a broken question and uploads nothing, not even the good ones', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt('1. კარგი?\nAnswer: დიახ\n2. ცუდი?\n3. კარგი 2?\nAnswer: კი'));
    expect(await screen.findByText('Found 1 issue in file (1 error):')).toBeTruthy();
    expect(screen.getByText(/Line 3/).textContent).toContain('Question 2');
    expect(screen.getByText(/Missing the “Answer:” line/)).toBeTruthy();
    expect(screen.getByText('Fix the file and choose it again: nothing is uploaded while it has errors.')).toBeTruthy();
    const upload = await uploadButton(2);
    await waitFor(() => expect(screen.queryByText(/Checking/)).toBeNull());
    expect(upload.hasAttribute('disabled')).toBe(true);
    fireEvent.click(upload);
    expect(await uploaded(admin, 'penalty-questions')).toEqual([]);
    expect((await admin.imports.list()).items).toEqual([]);

    // Fixed and chosen again, it uploads.
    chooseFile(txt('1. კარგი?\nAnswer: დიახ\n2. ცუდი?\nAnswer: არა'));
    await waitFor(() => expect(screen.queryByText(/Found 1 issue/)).toBeNull());
    const fixed = await uploadButton(2);
    await waitFor(() => expect(fixed.hasAttribute('disabled')).toBe(false));
  });

  it('shows what the API refuses in the list, by row, and uploads nothing until those rows are removed', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'practice-questions', initialCategory: 'Clubs' });
    chooseFile(txt('1. კარგი?\nA) ა\nB) ბ*\nDifficulty: Easy\n2. სურათით?\nImage: no-such-image\nA) ა\nB) ბ*\nDifficulty: Easy'));
    expect(await screen.findByText('Problem')).toBeTruthy();
    const rows = screen.getAllByRole('row');
    expect(within(rows[2]!).getByText(/Refers to something that does not exist \(data\.imageKey\)/)).toBeTruthy();
    expect(within(rows[1]!).getByText('New')).toBeTruthy();
    expect(screen.getByText('1 question has a problem: remove it or fix the file')).toBeTruthy();
    const upload = await uploadButton(2);
    expect(upload.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(rows[2]!).getByRole('button', { name: 'Remove' }));
    const next = await uploadButton(1);
    await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
    fireEvent.click(next);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'practice-questions')).toHaveLength(1);
  });

  it('does not create the questions of a file again when the same file is chosen a second time', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    const upload = await uploadButton(2);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
    cleanup();

    // The same session: the saved batch key answers with the batch that exists.
    const said = vi.spyOn(toast, 'success');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    await waitFor(() => expect(said).toHaveBeenCalledWith('These items were imported already; nothing was added'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
    expect((await admin.imports.list()).items).toHaveLength(1);
    cleanup();

    // Another session knows nothing of that key: the questions on file are called duplicates and none is selected.
    sessionStorage.clear();
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    expect(await screen.findByText('2 duplicates found and unselected')).toBeTruthy();
    expect(screen.getByText('0 questions selected for upload')).toBeTruthy();
    expect(screen.getAllByText('Exists already').length).toBeGreaterThan(0);
    const none = await uploadButton(0);
    expect(none.hasAttribute('disabled')).toBe(true);
    for (const box of screen.getAllByRole('checkbox', { name: /^Select (?!all shown)/ })) expect(box.hasAttribute('disabled')).toBe(true);
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
    expect((await admin.imports.list()).items).toHaveLength(1);
  });

  it('uploads again, after the same file was imported and the import undone', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    const upload = await uploadButton(2);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [batch] = (await admin.imports.list()).items;
    await admin.imports.undo(batch!.id);
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(0);
    cleanup();

    // The spent key is not asked again with: the questions are imported anew.
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    const again = await uploadButton(2);
    await waitFor(() => expect(again.hasAttribute('disabled')).toBe(false));
    fireEvent.click(again);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
  });

  it('asks again with the same key for an upload whose answer was lost, so the questions are not made twice', async () => {
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
    const failed = vi.spyOn(toast, 'error');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    const upload = await uploadButton(2);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(failed).toHaveBeenCalled());
    // The dialog stays; the questions were made, the answer was not heard.
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
    fireEvent.click(await uploadButton(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'penalty-questions')).toHaveLength(2);
    expect((await admin.imports.list()).items).toHaveLength(1);
  });

  it('does not ask the API to check more questions than an import takes, and uploads none until they are fewer', async () => {
    const inner = server;
    let checks = 0;
    server = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/admin/content/imports/preview')) checks += 1;
      return inner(input, init);
    }) as typeof fetch;
    await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(Array.from({ length: 2001 }, (_, i) => `${i + 1}. Question ${i + 1}?\nAnswer: a${i + 1}`).join('\n')));
    expect(await screen.findByText('Parsed Questions (2001)')).toBeTruthy();
    expect(screen.getByText('Maximum 2000 questions allowed')).toBeTruthy();
    expect((await uploadButton(2001)).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Page 1 of 21')).toBeTruthy();
    expect(checks).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await waitFor(() => expect(screen.queryByText('Maximum 2000 questions allowed')).toBeNull());
    const upload = await uploadButton(2000);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    expect(checks).toBe(1);
  });

  it('steps through the questions of the list with the arrows of the preview', async () => {
    await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    chooseFile(txt(PENALTIES));
    fireEvent.click(await screen.findByText('რომელი ქვეყნის ნაკრებმა მოიგო ევრო 2024?'));
    const preview = await screen.findByRole('dialog', { name: 'Question Preview' });
    expect(within(preview).getByText('1 of 2')).toBeTruthy();
    fireEvent.click(within(preview).getByRole('button', { name: 'Next' }));
    expect(within(preview).getByText('2 of 2')).toBeTruthy();
    expect(within(preview).getByText('რომელ ქალაქში მდებარეობს ანფილდი?')).toBeTruthy();
    expect(within(preview).getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(await within(preview).findByText('1 of 2')).toBeTruthy();
  });

  it('opens on the game mode and category it is given, and on the first mode for one that cannot be uploaded', async () => {
    await signIn('editor');
    await openDialog({ initialType: 'practice-questions', initialCategory: 'Clubs' });
    expect(screen.getByRole('combobox', { name: /Question Type/ }).textContent).toBe('Practice · ივარჯიშე');
    expect(screen.getByRole('combobox', { name: /Category/ }).textContent).toBe('Clubs');
    cleanup();

    await openDialog({ initialType: 'cards', initialCategory: 'legends' });
    expect(screen.getByRole('combobox', { name: /Question Type/ }).textContent).toBe('Round I · ბარათონი');
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Category/ }).textContent).toBe('ფეხბურთის ლეგენდები: გამოიცანი მოთამაშე'));
    cleanup();

    await openDialog({ initialType: 'clubs' });
    expect(screen.getByRole('combobox', { name: /Question Type/ }).textContent).toBe('Round I · ბარათონი');
  });

  it('shows the format of the game mode chosen, and asks only what that mode needs', async () => {
    await signIn('editor');
    await openDialog({ initialType: 'penalty-questions' });
    const example = (type: UploadType) => screen.getByText((_, element) => element?.tagName === 'PRE' && element.textContent === TD_UPLOAD_EXAMPLES[type]);
    expect(example('penalty-questions')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /Category/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Puzzle/ })).toBeNull();
    await pick(screen.getByRole('combobox', { name: /Question Type/ }), 'Daily · Football Logic');
    expect(example('football-logic')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Category/ })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Puzzle/ })).toBeTruthy();
    await pick(screen.getByRole('combobox', { name: /Question Type/ }), 'Round III · პაპა კარლოს ყუთი');
    expect(example('box-questions')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /Puzzle/ })).toBeNull();
  });

  it('uploads Football Logic into an existing puzzle, with a category of those on file and an https image', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'football-logic', initialCategory: 'Clubs' });
    await pick(screen.getByRole('combobox', { name: /Puzzle \(set\)/ }), /^fl-2 · 1 question/);
    chooseFile(txt(TD_UPLOAD_EXAMPLES['football-logic']));
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const made = (await admin.content('football-logic').list({ puzzle: 'fl-2' })).items.filter((row) => row.data.key.startsWith('row-'));
    expect(made).toHaveLength(1);
    expect(made[0]!.data).toMatchObject({ puzzle: 'fl-2', category: 'Clubs', imageA: 'https://example.com/stopwatch-9-minutes.png', imageB: '/assets/football-logic/five-fingers.png', displayAnswer: 'რობერტ ლევანდოვსკი' });
  });

  it('uploads Round III questions into the category the page was showing', async () => {
    const { admin } = await signIn('editor');
    await openDialog({ initialType: 'box-questions', initialCategory: 'world-cups' });
    chooseFile(txt(TD_UPLOAD_EXAMPLES['box-questions']));
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const [question] = await uploaded(admin, 'box-questions');
    expect(question!.data).toMatchObject({ categoryKey: 'world-cups', display: 'კილიან ემბაპე', aliases: ['კილიან ემბაპე', 'ემბაპე', 'Kylian Mbappé', 'Mbappe'] });
  });

  it('asks again with the saved key when the category is chosen only after the file, so nothing is made twice', async () => {
    const { admin } = await signIn('editor');
    const file = '1. სხვა კითხვა?\nA) ა\nB) ბ*\nDifficulty: Medium';
    await openDialog({ initialType: 'practice-questions', initialCategory: 'Clubs' });
    chooseFile(txt(file));
    const upload = await uploadButton(1);
    await waitFor(() => expect(upload.hasAttribute('disabled')).toBe(false));
    fireEvent.click(upload);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    cleanup();

    const said = vi.spyOn(toast, 'success');
    await openDialog({ initialType: 'practice-questions' });
    chooseFile(txt(file));
    expect(await screen.findByText('Parsed Questions (1)')).toBeTruthy();
    await pick(screen.getByRole('combobox', { name: /Category/ }), 'Clubs');
    await waitFor(() => expect(said).toHaveBeenCalledWith('These items were imported already; nothing was added'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await uploaded(admin, 'practice-questions')).toHaveLength(1);
  });
});
