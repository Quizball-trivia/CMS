'use client';

import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrueFalseOption {
  id?: string;
  text: Record<string, string>;
  is_correct: boolean;
}

interface TrueFalseEditorProps {
  options: TrueFalseOption[];
  locale?: 'en' | 'ka';
  onChange: (options: TrueFalseOption[]) => void;
}

const DEFAULT_LABELS = {
  en: { true: 'True', false: 'False' },
  ka: { true: 'True', false: 'False' },
} as const;

function ensureOptions(options: TrueFalseOption[]): [TrueFalseOption, TrueFalseOption] {
  const [trueOption, falseOption] = options;
  return [
    trueOption ?? { id: 'true', text: { en: 'True' }, is_correct: true },
    falseOption ?? { id: 'false', text: { en: 'False' }, is_correct: false },
  ];
}

export function TrueFalseEditor({ options, locale = 'en', onChange }: TrueFalseEditorProps) {
  const [trueOption, falseOption] = ensureOptions(options);

  const handleSelect = (selectedId: 'true' | 'false') => {
    onChange([
      {
        id: 'true',
        text: {
          en: trueOption.text.en || DEFAULT_LABELS.en.true,
          ...(locale === 'ka' ? { ka: trueOption.text.ka || DEFAULT_LABELS.ka.true } : {}),
        },
        is_correct: selectedId === 'true',
      },
      {
        id: 'false',
        text: {
          en: falseOption.text.en || DEFAULT_LABELS.en.false,
          ...(locale === 'ka' ? { ka: falseOption.text.ka || DEFAULT_LABELS.ka.false } : {}),
        },
        is_correct: selectedId === 'false',
      },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-0.5 px-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Correct Answer</p>
        <p className="text-[9px] text-muted-foreground/40 font-medium italic">The answer choices are fixed for this type.</p>
      </div>

      <div className="space-y-2">
        {([
          { id: 'true', label: trueOption.text[locale] || trueOption.text.en || DEFAULT_LABELS[locale].true, isCorrect: trueOption.is_correct },
          { id: 'false', label: falseOption.text[locale] || falseOption.text.en || DEFAULT_LABELS[locale].false, isCorrect: falseOption.is_correct },
        ] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => handleSelect(option.id)}
            className={cn(
              'w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200',
              option.isCorrect
                ? 'bg-primary/[0.05] border-primary/30 shadow-lg shadow-primary/5'
                : 'bg-white/[0.03] border-white/5 hover:border-white/10'
            )}
          >
            <div
              className={cn(
                'h-6 w-6 rounded-full flex items-center justify-center border transition-all duration-200',
                option.isCorrect
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-white/5 border-white/10 text-transparent'
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
