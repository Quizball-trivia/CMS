'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CareerPathPayload } from '@/types';
import { Plus, Trash2 } from 'lucide-react';

interface CareerPathEditorProps {
  payload: CareerPathPayload;
  locale: 'en' | 'ka';
  onChange: (payload: CareerPathPayload) => void;
}

export function CareerPathEditor({ payload, locale, onChange }: CareerPathEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Club Path</Label>
        <div className="space-y-2">
          {payload.clubs.map((club, index) => (
            <div key={`${index}-${club.en}`} className="flex items-center gap-2">
              <span className="w-6 text-xs font-black text-slate-400">{index + 1}</span>
              <Input
                value={club[locale] || ''}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    clubs: payload.clubs.map((currentClub, clubIndex) =>
                      clubIndex === index
                        ? { ...currentClub, [locale]: event.target.value }
                        : currentClub
                    ),
                  })}
                placeholder="Club name"
                className="h-10"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...payload,
                    clubs: payload.clubs.filter((_, clubIndex) => clubIndex !== index),
                  })}
                disabled={payload.clubs.length <= 2}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...payload,
              clubs: [...payload.clubs, { en: '' }],
            })}
        >
          <Plus className="mr-2 h-3 w-3" />
          Add Club
        </Button>
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
          placeholder="Kylian Mbappé"
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
          placeholder="Kylian Mbappé, Mbappe"
          className="h-10"
        />
      </div>
    </div>
  );
}
