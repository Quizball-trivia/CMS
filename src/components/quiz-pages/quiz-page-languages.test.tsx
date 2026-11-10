import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_QUIZ_PAGE, type QuizPageInput } from '@/types';
import { alignedBlocks, editionsForSave, emptyEdition, georgianFromLegacy, publicSlugsForSave, QuizPageLanguages } from './quiz-page-languages';

const form = (overrides: Partial<QuizPageInput> = {}): QuizPageInput => ({
  ...EMPTY_QUIZ_PAGE,
  slug: 'northwick',
  h1: 'Northwick Rovers Quiz',
  lede: 'Ten questions on Northwick Rovers.',
  about_blocks: [{ id: 'intro', type: 'paragraph', text: 'English body' }, { id: 'facts', type: 'bullet', text: 'English fact' }],
  ...overrides,
});

describe('alignedBlocks', () => {
  it('matches translations by block id, so removing or reordering English blocks keeps each translation with its block', () => {
    const english = form().about_blocks;
    const translated = [{ id: 'facts', type: 'bullet' as const, text: 'Fait' }, { id: 'intro', type: 'paragraph' as const, text: 'Corps' }];
    expect(alignedBlocks(english, translated)).toEqual([
      { id: 'intro', type: 'paragraph', text: 'Corps' },
      { id: 'facts', type: 'bullet', text: 'Fait' },
    ]);
    expect(alignedBlocks([english[1]], translated)).toEqual([{ id: 'facts', type: 'bullet', text: 'Fait' }]);
  });

  it('leaves out blocks not translated yet (a draft still saves) and sends none when nothing is translated', () => {
    const english = [...form().about_blocks, { id: 'new', type: 'paragraph' as const, text: 'New English block' }];
    expect(alignedBlocks(english, [{ id: 'intro', type: 'paragraph', text: 'Corps' }])).toEqual([{ id: 'intro', type: 'paragraph', text: 'Corps' }]);
    expect(alignedBlocks(english, [{ id: 'intro', type: 'paragraph', text: '  ' }])).toBeNull();
    expect(alignedBlocks(english, null)).toBeNull();
  });
});

describe('Georgian and URLs', () => {
  it('starts Georgian from its four legacy fields when the page has no Georgian edition', () => {
    expect(georgianFromLegacy({ ka_h1: 'ka h1', ka_lede: 'ka lede', ka_seo_title: 'ka seo', ka_meta_description: 'ka meta' }))
      .toMatchObject({ h1: 'ka h1', lede: 'ka lede', seo_title: 'ka seo', meta_description: 'ka meta', about_blocks: null });
  });

  it('sends a cleared custom URL as the page slug and never sends English or Georgian', () => {
    expect(publicSlugsForSave(form({ public_slugs: { fr: '', de: 'northwick-quiz', en: 'x', ka: 'y' } })))
      .toEqual({ fr: 'northwick', de: 'northwick-quiz' });
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
        stale
      />,
    );
    expect(screen.getByText('Unsaved changes: these checks are from the last save.')).toBeTruthy();
    expect(screen.getByText('1 to fix')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'French' }));
    expect(screen.getByText('• copy: lede is not translated')).toBeTruthy();
    expect((screen.getByDisplayValue('quiz-northwick') as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'Quiz Northwick' } });
    expect(onEditionChange).toHaveBeenCalledWith('fr', expect.objectContaining({ title: 'Quiz Northwick' }));
  });
});
