import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { HarnessFeedback, HarnessFeedbackItem } from '@/types';

const h = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, read: vi.fn(), bring: vi.fn() }));
vi.mock('@/hooks', () => ({
  useHarnessFeedback: () => ({ data: h.data, error: h.error, isLoading: !h.data && !h.error, refetch: vi.fn() }),
  useReadFeedback: () => ({ mutate: h.read, isPending: false }),
  useImportFeedbackEmails: () => ({ mutate: h.bring, isPending: false }),
  useHqClock: () => new Date('2026-11-28T10:00:00Z'),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { default: FeedbackPage } = await import('../feedback/page');
const { arrivedWithin, countByKind, filterFeedback, languageName, safeAttachment, safeEmail } = await import('../feedback/feedback');

const item = (number: number, over: Partial<HarnessFeedbackItem> = {}): HarnessFeedbackItem => ({
  id: `f${number}`, number, source: 'form', category: 'feedback', message: `Message ${number}`, language: 'en', english: null, nickname: null, email: null, hasAccount: false,
  context: null, attachments: [], game: null, rating: null, locale: null, receivedAt: '2026-11-27T10:00:00Z', ...over,
});
const feedback = (items: HarnessFeedbackItem[], over: Partial<HarnessFeedback> = {}): HarnessFeedback => ({
  items, total: items.length, stats: { last7Days: items.length, last30Days: items.length, bugs: items.filter((i) => i.category === 'bug').length, translated: items.filter((i) => i.english).length }, waiting: 0, newSinceRecap: 0, recap: null, reading: false, readError: null,
  pastEmails: { running: false, scanned: 0, found: 0, added: 0, error: null, startedBy: null, finishedAt: null, possible: true },
  ...over,
});
const recap = (over: Partial<NonNullable<HarnessFeedback['recap']>> = {}): NonNullable<HarnessFeedback['recap']> => ({
  id: 'r1', number: 1, status: 'ready', items: 3, translated: 1, newestAt: '2026-11-27T10:00:00Z', requestedBy: 'schedule', error: null, createdAt: '2026-11-28T09:00:00Z', updatedAt: '2026-11-28T09:02:00Z',
  recap: { summary: 'Players mostly report freezes in ranked.', themes: [{ title: 'Ranked matches freeze', count: 2, points: ['The match stops after the first half.'], refs: [2, 99] }], praise: ['The daily games.'], urgent: ['Two players lost coins (#2).'] },
  ...over,
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  h.data = undefined;
  h.error = null;
  h.read.mockClear();
  h.bring.mockClear();
});

it('shows Georgian as written and puts the English next to any other language', () => {
  h.data = feedback([
    item(3, { message: 'ძალიან მაგარი თამაშია', language: 'ka' }),
    item(2, { category: 'bug', message: 'El partido se congela', language: 'es', english: 'The match freezes', nickname: 'Lucho', email: 'lucho@example.com', hasAccount: true, context: '/play/ranked' }),
    item(1, { message: 'Love it', language: 'en' }),
  ]);
  render(<FeedbackPage />);
  const georgian = screen.getByRole('article', { name: 'Feedback 3' });
  expect(within(georgian).getByText('ძალიან მაგარი თამაშია')).toBeTruthy();
  expect(within(georgian).queryByText('In English')).toBeNull();

  const spanish = screen.getByRole('article', { name: 'Feedback 2' });
  expect(within(spanish).getByText('In English')).toBeTruthy();
  expect(within(spanish).getByText('The match freezes')).toBeTruthy();
  expect(within(spanish).getByText('Original · Spanish')).toBeTruthy();
  expect(within(spanish).getByText('El partido se congela')).toBeTruthy();
  expect((within(spanish).getByRole('link', { name: /lucho@example.com/ }) as HTMLAnchorElement).href).toBe('mailto:lucho@example.com');
  expect(within(spanish).getByText(/Lucho · has an account/)).toBeTruthy();

  expect(within(screen.getByRole('article', { name: 'Feedback 1' })).queryByText('In English')).toBeNull();
});

it('says when a message has not been read yet, or came back without English', () => {
  h.data = feedback([item(2, { message: 'Oyun çok yavaş', language: null }), item(1, { message: 'Jogo lento', language: 'pt', english: null })], { waiting: 1 });
  render(<FeedbackPage />);
  expect(within(screen.getByRole('article', { name: 'Feedback 2' })).getByText(/Not read by the Feedback Reader yet/)).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'Feedback 1' })).getByText(/Written in Portuguese. The Feedback Reader gave no English/)).toBeTruthy();
});

it('shows the recap, says what it does not cover, and leads from a theme to the message', () => {
  h.data = feedback([item(3), item(2, { category: 'bug' }), item(1)], { recap: recap(), newSinceRecap: 2 });
  render(<FeedbackPage />);
  expect(screen.getByText('Players mostly report freezes in ranked.')).toBeTruthy();
  expect(screen.getByText('Look at this first')).toBeTruthy();
  expect(screen.getByText('2 players say this')).toBeTruthy();
  expect(screen.getByText(/2 more arrived since and are not in it yet/)).toBeTruthy();
  expect(screen.getByText(/It can be wrong: the messages below are the source/)).toBeTruthy();
  // A number that is not on the page is not a button.
  expect(screen.queryByRole('button', { name: '#99' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Bugs 1' }));
  expect(screen.queryByRole('article', { name: 'Feedback 3' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '#2' }));
  // The filter is cleared so the message is there to scroll to.
  expect(screen.getByRole('article', { name: 'Feedback 3' })).toBeTruthy();
  expect(screen.getByRole('article', { name: 'Feedback 2' }).className).toContain('ring-2');
});

it('asks for a new recap, and not while one is being written', () => {
  h.data = feedback([item(1)]);
  const view = render(<FeedbackPage />);
  expect(screen.getByText(/No recap yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New recap' }));
  expect(h.read).toHaveBeenCalledTimes(1);
  h.data = feedback([item(1)], { reading: true });
  view.rerender(<FeedbackPage />);
  expect((screen.getByRole('button', { name: 'Reading…' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/reading everything for the first time/)).toBeTruthy();
});

it('filters by kind, language and words', () => {
  h.data = feedback([item(4, { category: 'idea', source: 'season3', message: 'ახალი რეჟიმი', language: 'ka' }), item(3, { category: 'rating', source: 'game', game: 'tenable', rating: 2, message: 'Too hard' }), item(2, { category: 'bug', message: 'Lento', language: 'es', english: 'Slow' }), item(1)]);
  render(<FeedbackPage />);
  expect(screen.getAllByRole('article')).toHaveLength(4);
  expect(within(screen.getByRole('article', { name: 'Feedback 3' })).getByRole('img', { name: '2 of 5 stars' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'translated' } });
  expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Feedback 2']);
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ka' } });
  expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Feedback 4']);
  fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'all' } });
  fireEvent.change(screen.getByLabelText('Search the feedback'), { target: { value: 'slow' } });
  expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Feedback 2']);
  fireEvent.change(screen.getByLabelText('Search the feedback'), { target: { value: 'zzz' } });
  expect(screen.getByText(/Nothing matches/)).toBeTruthy();
});

it('takes its numbers from the server, and says so when only the newest are listed', () => {
  h.data = feedback([item(2), item(1)], { total: 950, stats: { last7Days: 460, last30Days: 900, bugs: 77, translated: 120 } });
  render(<FeedbackPage />);
  expect(screen.getByText('950')).toBeTruthy();
  expect(screen.getByText('460')).toBeTruthy();
  expect(screen.getByText('900 in 30 days')).toBeTruthy();
  expect(screen.getByText('77')).toBeTruthy();
  expect(screen.getByText('120')).toBeTruthy();
  expect(screen.getByText(/Only the newest 2 of 950 are listed, and the filters work on those/)).toBeTruthy();
});

it('brings in past emails and reports how it went', () => {
  h.data = feedback([]);
  const view = render(<FeedbackPage />);
  fireEvent.click(screen.getByRole('button', { name: /Bring in the last 30 days/ }));
  expect(h.bring).toHaveBeenCalledTimes(1);
  h.data = feedback([], { pastEmails: { running: true, scanned: 300, found: 4, added: 4, error: null, startedBy: 'Nika', finishedAt: null, possible: true } });
  view.rerender(<FeedbackPage />);
  expect(screen.getByText(/300 looked at, 4 from the contact form so far/)).toBeTruthy();
  expect((screen.getByRole('button', { name: /Bring in the last 30 days/ }) as HTMLButtonElement).disabled).toBe(true);
  h.data = feedback([], { pastEmails: { running: false, scanned: 8000, found: 12, added: 9, error: null, partial: true, startedBy: 'Nika', finishedAt: '2026-11-28T09:59:00Z', possible: true } });
  view.rerender(<FeedbackPage />);
  expect(screen.getByText(/Not finished: 8,000 emails looked at so far, 12 from the contact form, 9 of them new here\. Press again to carry on/)).toBeTruthy();
  h.data = feedback([], { pastEmails: { running: false, scanned: 900, found: 0, added: 0, error: 'The email service key on the server may only send emails.', startedBy: 'Nika', finishedAt: '2026-11-28T09:59:00Z', possible: true } });
  view.rerender(<FeedbackPage />);
  expect(screen.getByText(/It stopped: The email service key on the server may only send emails/)).toBeTruthy();
});

it('never turns what a player typed into a link it should not be', () => {
  expect(safeAttachment('https://x.supabase.co/a.png')).toBe('https://x.supabase.co/a.png');
  expect(safeAttachment('javascript:alert(1)')).toBeNull();
  expect(safeAttachment('http://x.example/a.png')).toBeNull();
  expect(safeEmail('a@b.co')).toBe('a@b.co');
  expect(safeEmail('a@b.co?subject=x<script>')).toBeNull();
  expect(safeEmail('not an email')).toBeNull();
  expect(safeEmail(null)).toBeNull();
});

it('counts and names things', () => {
  const items = [item(1, { category: 'bug', receivedAt: '2026-11-27T10:00:00Z' }), item(2, { category: 'bug', receivedAt: '2026-11-01T10:00:00Z' }), item(3, { category: 'idea', receivedAt: '2026-09-01T10:00:00Z' })];
  expect(countByKind(items)).toEqual({ all: 3, bug: 2, feedback: 0, idea: 1, rating: 0, other: 0 });
  const now = new Date('2026-11-28T10:00:00Z').getTime();
  expect(arrivedWithin(items, 7, now)).toBe(1);
  expect(arrivedWithin(items, 30, now)).toBe(2);
  expect(languageName('tr')).toBe('Turkish');
  expect(languageName('unknown')).toBe('Unknown language');
  expect(languageName(null)).toBe('Unknown language');
  expect(filterFeedback(items, { kind: 'all', language: 'all', search: '#2' }).map((i) => i.number)).toEqual([2]);
});
