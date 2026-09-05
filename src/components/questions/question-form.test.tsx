import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@/types';
import { QuestionForm } from './question-form';
import { QuestionDialog } from './question-dialog';

const { update, create } = vi.hoisted(() => ({ update: vi.fn(), create: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/hooks', () => ({
  useCategories: () => ({ data: [] }),
  useQuestion: () => ({ data: undefined }),
  useUpdateQuestionStatus: () => ({ isPending: false }),
  useDeleteQuestion: () => ({ isPending: false }),
  useCheckDuplicates: () => ({ isPending: false }),
  useCreateQuestion: () => ({ mutateAsync: create, isPending: false }),
  useUpdateQuestion: () => ({ mutateAsync: update, isPending: false }),
}));

const image = { url: 'https://example.com/photo.jpg', width: 800, height: 600 };
function question(type: 'mcq_single' | 'true_false'): Question {
  const options = (type === 'true_false' ? ['true', 'false'] : ['a', 'b', 'c', 'd'])
    .map((id, index) => ({ id, text: { en: id, ka: `ka-${id}`, es: `es-${id}` }, is_correct: index === 0 }));
  return {
    id: '10000000-0000-4000-8000-000000000001',
    category_id: '10000000-0000-4000-8000-000000000002',
    type, difficulty: 'medium', status: 'draft', visibility: 'public',
    prompt: { en: 'Original prompt', ka: 'Georgian prompt', es: 'Spanish prompt' },
    explanation: { en: 'Original explanation', ka: 'Georgian explanation', es: 'Spanish explanation' },
    payload: type === 'mcq_single' ? { type, image, options } : { type, options },
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as Question;
}

beforeEach(() => { update.mockReset().mockResolvedValue({}); create.mockReset(); });
afterEach(cleanup);

describe('question editor saves', () => {
  it.each(['mcq_single', 'true_false'] as const)('preserves untouched image and translations when editing %s', async (type) => {
    const existing = question(type);
    render(<QuestionForm question={existing} />);
    fireEvent.change(screen.getByPlaceholderText('Type the question content here...'), { target: { value: 'Edited prompt' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    const saved = update.mock.calls[0][0].data;
    expect(saved.prompt).toEqual({ ...existing.prompt, en: 'Edited prompt' });
    expect(saved.explanation).toEqual(existing.explanation);
    expect(saved.payload).toEqual(existing.payload);
  });
});

it('clears an explanation in the full editor while preserving the other locales', async () => {
  const existing = question('mcq_single');
  render(<QuestionForm question={existing} />);
  fireEvent.change(screen.getByPlaceholderText('Provide context for the correct answer...'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0][0].data.explanation).toEqual({ ka: 'Georgian explanation', es: 'Spanish explanation' });
});

it('allows explicit image and explanation removal in the dialog without erasing other locales', async () => {
  const existing = question('mcq_single');
  render(<QuestionDialog open question={existing} initialLocale="ka" />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
  fireEvent.change(screen.getByPlaceholderText('https://example.com/question-image.png'), { target: { value: '' } });
  fireEvent.change(screen.getByPlaceholderText('Context for the correct answer...'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  const saved = update.mock.calls[0][0].data;
  expect(saved.prompt).toEqual(existing.prompt);
  expect(saved.explanation).toEqual({ en: 'Original explanation', es: 'Spanish explanation' });
  expect(saved.payload.options).toEqual(existing.payload?.type === 'mcq_single' ? existing.payload.options : []);
  expect(saved.payload.image).toBeUndefined();
});

it('preserves localized true/false labels when saving a question through the dialog', async () => {
  const existing = question('true_false');
  render(<QuestionDialog open question={existing} initialLocale="ka" />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
  fireEvent.change(screen.getByPlaceholderText('Enter your question here...'), { target: { value: 'Edited Georgian prompt' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  const saved = update.mock.calls[0][0].data;
  expect(saved.prompt).toEqual({ ...existing.prompt, ka: 'Edited Georgian prompt' });
  expect(saved.payload).toEqual(existing.payload);
});

it('removes an explicitly cleared option translation instead of restoring it from the saved question', async () => {
  render(<QuestionForm question={question('mcq_single')} />);
  fireEvent.click(screen.getByRole('button', { name: 'GEORGIAN' }));
  fireEvent.change(screen.getByDisplayValue('ka-a'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'ENGLISH' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0][0].data.payload.options[0].text).toEqual({ en: 'a', es: 'es-a' });
  expect(update.mock.calls[0][0].data.prompt).toEqual(question('mcq_single').prompt);
  expect(update.mock.calls[0][0].data.explanation).toEqual(question('mcq_single').explanation);
});

it.each([false, true])('does not create absent true/false translations when changing correctness=%s', async (changeCorrectness) => {
  const existing = question('true_false');
  if (existing.payload?.type !== 'true_false') throw new Error('expected true/false fixture');
  for (const option of existing.payload.options) delete option.text.ka;
  const expected = structuredClone(existing.payload);
  render(<QuestionDialog open question={existing} initialLocale="ka" />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit Details' }));
  fireEvent.change(screen.getByPlaceholderText('Enter your question here...'), { target: { value: 'Edited Georgian prompt' } });
  if (changeCorrectness) {
    fireEvent.click(screen.getByRole('button', { name: 'False' }));
    expected.options.forEach(option => { option.is_correct = option.id === 'false'; });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0][0].data.payload).toEqual(expected);
});
