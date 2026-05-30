'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CountdownPayload } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';
import { Plus, Trash2 } from 'lucide-react';
import { AnswersInput } from './answers-input';

interface CountdownListEditorProps {
  payload: CountdownPayload;
  locale: 'en' | 'ka';
  onChange: (payload: CountdownPayload) => void;
}

export function CountdownListEditor({ payload, locale, onChange }: CountdownListEditorProps) {
  const updateGroup = (groupId: string, updater: (group: CountdownPayload['answer_groups'][number]) => CountdownPayload['answer_groups'][number]) => {
    onChange({
      ...payload,
      answer_groups: payload.answer_groups.map((group) => (group.id === groupId ? updater(group) : group)),
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Round Prompt *</Label>
        <Input
          className="h-9 rounded-lg text-sm"
          value={payload.prompt[locale] || ''}
          onChange={(e) => onChange({ ...payload, prompt: { ...payload.prompt, [locale]: e.target.value } })}
          placeholder="Name as many valid answers as you can..."
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Answer Groups <span className="text-slate-300">({payload.answer_groups.length})</span>
          </Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg px-2.5 text-xs"
            onClick={() =>
              onChange({
                ...payload,
                answer_groups: [
                  ...payload.answer_groups,
                  { id: generateAnswerId(), display: { en: '' }, accepted_answers: [''] },
                ],
              })}
          >
            <Plus className="mr-2 h-3 w-3" />
            Add Group
          </Button>
        </div>

        {payload.answer_groups.map((group, index) => (
          <div key={group.id} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Group {index + 1}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-lg text-slate-400 hover:text-red-500"
                onClick={() =>
                  onChange({
                    ...payload,
                    answer_groups: payload.answer_groups.filter((item) => item.id !== group.id),
                  })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Display Label</Label>
                <Input
                  className="h-8 rounded-lg bg-white text-sm"
                  value={group.display[locale] || ''}
                  onChange={(e) => updateGroup(group.id, (current) => ({
                    ...current,
                    display: { ...current.display, [locale]: e.target.value },
                  }))}
                  placeholder="Premier League clubs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Accepted Answers</Label>
                <AnswersInput
                  className="h-8 rounded-lg bg-white text-sm"
                  value={group.accepted_answers}
                  onCommit={(answers) =>
                    updateGroup(group.id, (current) => ({
                      ...current,
                      accepted_answers: answers,
                    }))}
                  placeholder="arsenal, chelsea, liverpool"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
