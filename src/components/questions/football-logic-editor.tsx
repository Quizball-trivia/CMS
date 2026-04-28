'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FootballLogicPayload } from '@/types';

interface FootballLogicEditorProps {
  payload: FootballLogicPayload;
  locale: 'en' | 'ka';
  onChange: (payload: FootballLogicPayload) => void;
}

export function FootballLogicEditor({ payload, locale, onChange }: FootballLogicEditorProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Image A URL</Label>
          <Input
            value={payload.image_a_url}
            onChange={(event) => onChange({ ...payload, image_a_url: event.target.value })}
            placeholder="https://..."
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Image B URL</Label>
          <Input
            value={payload.image_b_url}
            onChange={(event) => onChange({ ...payload, image_b_url: event.target.value })}
            placeholder="https://..."
            className="h-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Optional Prompt</Label>
        <Input
          value={payload.prompt?.[locale] || ''}
          onChange={(event) =>
            onChange({
              ...payload,
              prompt: { ...(payload.prompt ?? { en: '' }), [locale]: event.target.value },
            })}
          placeholder="Who is this player?"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Display Answer</Label>
        <Input
          value={payload.display_answer[locale] || ''}
          onChange={(event) =>
            onChange({
              ...payload,
              display_answer: { ...payload.display_answer, [locale]: event.target.value },
            })}
          placeholder="Robert Lewandowski"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accepted Answers</Label>
        <Input
          value={payload.accepted_answers.join(', ')}
          onChange={(event) =>
            onChange({
              ...payload,
              accepted_answers: event.target.value.split(',').map((value) => value.trim()).filter(Boolean),
            })}
          placeholder="Robert Lewandowski, Lewandowski"
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Explanation</Label>
        <Textarea
          value={payload.explanation?.[locale] || ''}
          onChange={(event) =>
            onChange({
              ...payload,
              explanation: { ...(payload.explanation ?? { en: '' }), [locale]: event.target.value },
            })}
          placeholder="Explain the logic behind the images"
          className="min-h-[90px]"
        />
      </div>
    </div>
  );
}
