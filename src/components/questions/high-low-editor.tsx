'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { HighLowPayload } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';
import { Plus, Trash2 } from 'lucide-react';

interface HighLowEditorProps {
  payload: HighLowPayload;
  locale: 'en' | 'ka';
  onChange: (payload: HighLowPayload) => void;
}

export function HighLowEditor({ payload, locale, onChange }: HighLowEditorProps) {
  const updateMatchup = (
    matchupId: string,
    updater: (matchup: HighLowPayload['matchups'][number]) => HighLowPayload['matchups'][number]
  ) => {
    onChange({
      ...payload,
      matchups: payload.matchups.map((matchup) => (matchup.id === matchupId ? updater(matchup) : matchup)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stat Label</Label>
        <Input
          value={payload.stat_label[locale] || ''}
          onChange={(event) =>
            onChange({
              ...payload,
              stat_label: { ...payload.stat_label, [locale]: event.target.value },
            })}
          placeholder="All-time Premier League goals"
          className="h-10"
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Matchups</Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...payload,
              matchups: [
                ...payload.matchups,
                {
                  id: generateAnswerId(),
                  left_name: { en: '' },
                  left_value: 0,
                  right_name: { en: '' },
                  right_value: 1,
                },
              ],
            })}
        >
          <Plus className="mr-2 h-3 w-3" />
          Add Matchup
        </Button>
      </div>

      <div className="space-y-3">
        {payload.matchups.map((matchup, index) => (
          <div key={matchup.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-slate-500">Matchup {index + 1}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...payload,
                    matchups: payload.matchups.filter((item) => item.id !== matchup.id),
                  })}
                disabled={payload.matchups.length <= 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Left Name</Label>
                <Input
                  value={matchup.left_name[locale] || ''}
                  onChange={(event) =>
                    updateMatchup(matchup.id, (current) => ({
                      ...current,
                      left_name: { ...current.left_name, [locale]: event.target.value },
                    }))}
                  placeholder="Michael Owen"
                />
              </div>
              <div className="space-y-2">
                <Label>Left Value</Label>
                <Input
                  type="number"
                  value={matchup.left_value}
                  onChange={(event) =>
                    updateMatchup(matchup.id, (current) => ({
                      ...current,
                      left_value: Number(event.target.value) || 0,
                    }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Right Name</Label>
                <Input
                  value={matchup.right_name[locale] || ''}
                  onChange={(event) =>
                    updateMatchup(matchup.id, (current) => ({
                      ...current,
                      right_name: { ...current.right_name, [locale]: event.target.value },
                    }))}
                  placeholder="Robin van Persie"
                />
              </div>
              <div className="space-y-2">
                <Label>Right Value</Label>
                <Input
                  type="number"
                  value={matchup.right_value}
                  onChange={(event) =>
                    updateMatchup(matchup.id, (current) => ({
                      ...current,
                      right_value: Number(event.target.value) || 0,
                    }))}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
