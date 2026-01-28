'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AnswerWithId } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';

// Re-export for backwards compatibility
export type { AnswerWithId } from '@/types';

interface TextInputEditorProps {
  acceptedAnswers: AnswerWithId[];
  caseSensitive: boolean;
  locale?: 'en' | 'ka';
  onChange: (acceptedAnswers: AnswerWithId[], caseSensitive: boolean) => void;
}

export function TextInputEditor({ acceptedAnswers, caseSensitive, locale = 'en', onChange }: TextInputEditorProps) {
  const updateAnswer = (value: string) => {
    // Preserve existing answer data and update only the current locale
    const existingAnswer = acceptedAnswers[0] || { id: generateAnswerId() };
    const id = existingAnswer.id ?? generateAnswerId();
    const newAnswers = [{ ...existingAnswer, id, [locale]: value }];
    onChange(newAnswers, caseSensitive);
  };

  return (
    <div className="space-y-2">
      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
        Correct Answer *
      </Label>
      <Input
        placeholder="Enter the correct answer..."
        value={acceptedAnswers[0]?.[locale] || ''}
        onChange={(e) => updateAnswer(e.target.value)}
        className="h-11 rounded-xl border-slate-200 bg-white focus:ring-slate-100 focus:ring-offset-2 transition-all font-medium"
      />
    </div>
  );
}
