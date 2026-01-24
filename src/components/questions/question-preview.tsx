'use client';

import { Button } from '@/components/ui/button';
import type { McqOption } from '@/types';
import type { AnswerWithId } from './text-input-editor';
import { cn } from '@/lib/utils';

interface QuestionPreviewProps {
  prompt: string | undefined;
  categoryName: string;
  difficulty: 'easy' | 'medium' | 'hard' | undefined;
  type: 'mcq_single' | 'input_text' | undefined;
  mcqOptions: McqOption[];
  acceptedAnswers: AnswerWithId[];
  previewLang: 'en' | 'ka';
  onLanguageChange: (lang: 'en' | 'ka') => void;
}

export function QuestionPreview({
  prompt,
  categoryName,
  difficulty,
  type,
  mcqOptions,
  acceptedAnswers,
  previewLang,
  onLanguageChange,
}: QuestionPreviewProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold tracking-tight">Live Preview</h3>
        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
          <Button
            type="button"
            size="sm"
            variant={previewLang === 'en' ? 'default' : 'ghost'}
            className="h-7 px-3"
            onClick={() => onLanguageChange('en')}
          >
            EN
          </Button>
          <Button
            type="button"
            size="sm"
            variant={previewLang === 'ka' ? 'default' : 'ghost'}
            className="h-7 px-3"
            onClick={() => onLanguageChange('ka')}
          >
            KA
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0a0a0a] p-6 text-white min-h-[280px]">
        {/* Progress bar */}
        <div className="h-1 bg-white/20 rounded-full mb-6">
          <div className="h-full w-1/3 bg-[#22c55e] rounded-full" />
        </div>

        {/* Category/difficulty badge */}
        <span
          className={cn(
            'inline-block px-3 py-1 rounded-lg text-xs font-bold mb-4',
            difficulty === 'easy' && 'bg-emerald-500/20 text-emerald-400',
            difficulty === 'medium' && 'bg-amber-500/20 text-amber-400',
            difficulty === 'hard' && 'bg-rose-500/20 text-rose-400'
          )}
        >
          {categoryName || 'Category'}
        </span>

        {/* Question prompt */}
        <p className="text-lg font-medium mb-6">
          {prompt || 'Your question will appear here...'}
        </p>

        {/* MCQ options OR Text input based on type */}
        {type === 'mcq_single' ? (
          <div className="space-y-3">
            {mcqOptions.length > 0 ? (
              mcqOptions.map((opt, i) => (
                <div
                  key={opt.id}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl border',
                    opt.is_correct
                      ? 'bg-emerald-500/10 border-emerald-500/50'
                      : 'bg-white/5 border-white/10'
                  )}
                >
                  <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-bold">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">
                    {(previewLang === 'ka' ? opt.text.ka : opt.text.en) ||
                      `Option ${i + 1}`}
                  </span>
                  {opt.is_correct && (
                    <svg
                      className="w-5 h-5 text-emerald-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              ))
            ) : (
              <p className="text-white/40 text-center py-4">
                Add options to see preview
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 h-12 rounded-xl bg-white/10 border border-white/20 px-4 flex items-center text-white/40">
                Type your answer...
              </div>
              <div className="px-6 h-12 rounded-xl bg-[#22c55e] font-bold flex items-center">
                Submit
              </div>
            </div>
            {acceptedAnswers.length > 0 && (
              <p className="text-xs text-white/40">
                Accepted:{' '}
                {acceptedAnswers
                  .map((a) => (previewLang === 'ka' ? a.ka : a.en) || a.en)
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
