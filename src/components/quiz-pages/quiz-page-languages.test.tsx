import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_QUIZ_PAGE, type QuizPageInput } from '@/types';
import { alignedBlocks, editionsForSave, emptyEdition, QuizPageLanguages } from './quiz-page-languages';

const form = (overrides: Partial<QuizPageInput> = {}): QuizPageInput => ({
  ...EMPTY_QUIZ_PAGE,
  slug: 'northwick',
  h1: 'Northwick Rovers Quiz',
  lede: 'Ten questions on Northwick Rovers.',
  about_blocks: [{ id: 'intro', type: 'paragraph', text: 'English body' }, { id: 'facts', type: 'bullet', text: 'English fact' }],
  ...overrides,
});

describe('alignedBlocks', () => {
  it('keeps the English ids and types, and sends nothing when every block is empty', () => {
    const english = form().about_blocks;
    expect(alignedBlocks(english, [{ id: 'x', type: 'bullet', text: 'Corps' }])).toEqual([
      { id: 'intro', type: 'paragraph', text: 'Corps' },
      { id: 'facts', type: 'bullet', text: '' },
    ]);
    expect(alignedBlocks(english, [{ id: 'x', type: 'bullet', text: '  ' }])).toBeNull();
    expect(alignedBlocks(english, null)).toBeNull();
  });
});

describe('editionsForSave', () => {
  it('keeps the four Georgian legacy fields in step with the Georgian edition', () => {
    const georgian = { ...emptyEdition(), h1: 'ka h1', lede: 'ka lede', seo_title: 'ka seo', meta_description: 'ka meta' };
    const saved = editionsForSave(form({ editions: { ka: georgian }, ka_h1: 'old' }));
    expect(saved).toMatchObject({ ka_h1: 'ka h1', ka_lede: 'ka lede', ka_seo_title: 'ka seo', ka_meta_description: 'ka meta' });
    expect(editionsForSave(form({ ka_h1: 'legacy' })).ka_h1).toBe('legacy');
  });
});

describe('QuizPageLanguages', () => {
  it("shows each language's readiness, edits the active language and locks live URLs", () => {
    const onEditionChange = vi.fn();
    const onPublicSlugChange = vi.fn();
    render(
      <QuizPageLanguages
        form={form({ public_slugs: { fr: 'quiz-northwick' } })}
        readiness={[
          { locale: 'en', ready: true, problems: [] },
          { locale: 'fr', ready: false, problems: ['copy: lede is not translated'] },
        ]}
        publishedSlugs={{ fr: 'quiz-northwick' }}
        onEditionChange={onEditionChange}
        onPublicSlugChange={onPublicSlugChange}
        onLocaleModeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('1 to fix')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'French' }));
    expect(screen.getByText('• copy: lede is not translated')).toBeTruthy();
    expect((screen.getByDisplayValue('quiz-northwick') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Quiz Northwick' } });
    expect(onEditionChange).toHaveBeenCalledWith('fr', expect.objectContaining({ title: 'Quiz Northwick' }));
  });
});
