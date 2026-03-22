'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ClueChainPayload } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

interface ClueChainEditorProps {
  payload: ClueChainPayload;
  locale: 'en' | 'ka';
  onChange: (payload: ClueChainPayload) => void;
}

export function ClueChainEditor({ payload, locale, onChange }: ClueChainEditorProps) {
  const updateClue = (index: number, updater: (clue: ClueChainPayload['clues'][number]) => ClueChainPayload['clues'][number]) => {
    onChange({
      ...payload,
      clues: payload.clues.map((clue, currentIndex) => (currentIndex === index ? updater(clue) : clue)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Display Answer *</Label>
        <Input
          value={payload.display_answer[locale] || ''}
          onChange={(e) => onChange({ ...payload, display_answer: { ...payload.display_answer, [locale]: e.target.value } })}
          placeholder="Lionel Messi"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accepted Answers *</Label>
        <Input
          value={payload.accepted_answers.join(', ')}
          onChange={(e) =>
            onChange({
              ...payload,
              accepted_answers: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
            })}
          placeholder="lionel messi, messi"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clues</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...payload,
                clues: [...payload.clues, { type: 'text', content: { en: '' } }],
              })}
          >
            <Plus className="mr-2 h-3 w-3" />
            Add Clue
          </Button>
        </div>

        {payload.clues.map((clue, index) => (
          <div key={`${clue.type}-${index}`} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Clue {index + 1}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...payload,
                    clues: payload.clues.filter((_, currentIndex) => currentIndex !== index),
                  })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-[160px,1fr]">
              <div className="space-y-2">
                <Label>Type</Label>
                <select
                  value={clue.type}
                  onChange={(e) => updateClue(index, (current) => ({ ...current, type: e.target.value as 'text' | 'emoji' }))}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="emoji">Emoji</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Input
                  value={clue.content[locale] || ''}
                  onChange={(e) => updateClue(index, (current) => ({
                    ...current,
                    content: { ...current.content, [locale]: e.target.value },
                  }))}
                  placeholder={clue.type === 'emoji' ? '🐐 🇦🇷' : 'World Cup winner'}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
