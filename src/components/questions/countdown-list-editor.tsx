'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CountdownPayload } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';
import { Plus, Trash2 } from 'lucide-react';

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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Round Prompt *</Label>
        <Input
          value={payload.prompt[locale] || ''}
          onChange={(e) => onChange({ ...payload, prompt: { ...payload.prompt, [locale]: e.target.value } })}
          placeholder="Name as many valid answers as you can..."
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Answer Groups</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
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
          <div key={group.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Group {index + 1}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...payload,
                    answer_groups: payload.answer_groups.filter((item) => item.id !== group.id),
                  })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Display Label</Label>
              <Input
                value={group.display[locale] || ''}
                onChange={(e) => updateGroup(group.id, (current) => ({
                  ...current,
                  display: { ...current.display, [locale]: e.target.value },
                }))}
                placeholder="Premier League clubs"
              />
            </div>
            <div className="space-y-2">
              <Label>Accepted Answers</Label>
              <Input
                value={group.accepted_answers.join(', ')}
                onChange={(e) =>
                  updateGroup(group.id, (current) => ({
                    ...current,
                    accepted_answers: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                  }))}
                placeholder="arsenal, chelsea, liverpool"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
