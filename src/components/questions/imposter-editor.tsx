'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImposterMultiSelectPayload } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImposterEditorProps {
  payload: ImposterMultiSelectPayload;
  locale: 'en' | 'ka';
  onChange: (payload: ImposterMultiSelectPayload) => void;
}

export function ImposterEditor({ payload, locale, onChange }: ImposterEditorProps) {
  const updateOption = (
    optionId: string,
    updater: (option: ImposterMultiSelectPayload['options'][number]) => ImposterMultiSelectPayload['options'][number]
  ) => {
    onChange({
      ...payload,
      options: payload.options.map((option) => (option.id === optionId ? updater(option) : option)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Options</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...payload,
              options: [
                ...payload.options,
                { id: generateAnswerId(), text: { en: '' }, is_correct: false },
              ],
            })}
        >
          <Plus className="mr-2 h-3 w-3" />
          Add Option
        </Button>
      </div>

      <div className="space-y-2">
        {payload.options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <button
              type="button"
              onClick={() => updateOption(option.id, (current) => ({ ...current, is_correct: !current.is_correct }))}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border transition-all',
                option.is_correct
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                  : 'border-slate-200 bg-slate-50 text-slate-400 hover:border-emerald-300'
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <span className="w-5 text-xs font-black text-slate-400">{index + 1}</span>
            <Input
              value={option.text[locale] || ''}
              onChange={(event) =>
                updateOption(option.id, (current) => ({
                  ...current,
                  text: { ...current.text, [locale]: event.target.value },
                }))}
              placeholder="Option text"
              className="h-10"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...payload,
                  options: payload.options.filter((item) => item.id !== option.id),
                })}
              disabled={payload.options.length <= 4}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
