'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PutInOrderPayload } from '@/types';
import { generateAnswerId } from '@/lib/question-utils';
import { Plus, Trash2 } from 'lucide-react';

interface PutInOrderEditorProps {
  payload: PutInOrderPayload;
  locale: 'en' | 'ka';
  onChange: (payload: PutInOrderPayload) => void;
}

export function PutInOrderEditor({ payload, locale, onChange }: PutInOrderEditorProps) {
  const updateItem = (itemId: string, updater: (item: PutInOrderPayload['items'][number]) => PutInOrderPayload['items'][number]) => {
    onChange({
      ...payload,
      items: payload.items.map((item) => (item.id === itemId ? updater(item) : item)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Round Prompt *</Label>
        <Input
          value={payload.prompt[locale] || ''}
          onChange={(e) => onChange({ ...payload, prompt: { ...payload.prompt, [locale]: e.target.value } })}
          placeholder="Put these titles in chronological order"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Items</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...payload,
                items: [
                  ...payload.items,
                  { id: generateAnswerId(), label: { en: '' }, sort_value: payload.items.length + 1, details: null, emoji: null },
                ],
              })}
          >
            <Plus className="mr-2 h-3 w-3" />
            Add Item
          </Button>
        </div>

        {payload.items.map((item, index) => (
          <div key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr,120px,120px,auto]">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={item.label[locale] || ''}
                onChange={(e) => updateItem(item.id, (current) => ({
                  ...current,
                  label: { ...current.label, [locale]: e.target.value },
                }))}
                placeholder={`Item ${index + 1}`}
              />
            </div>
            <div className="space-y-2">
              <Label>Order Value</Label>
              <Input
                type="number"
                value={String(item.sort_value)}
                onChange={(e) => updateItem(item.id, (current) => ({
                  ...current,
                  sort_value: Number(e.target.value),
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Emoji</Label>
              <Input
                value={item.emoji || ''}
                onChange={(e) => updateItem(item.id, (current) => ({
                  ...current,
                  emoji: e.target.value || null,
                }))}
                placeholder="🏆"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...payload,
                    items: payload.items.filter((current) => current.id !== item.id),
                  })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label>Details</Label>
              <Input
                value={item.details?.[locale] || ''}
                onChange={(e) => updateItem(item.id, (current) => ({
                  ...current,
                  details: e.target.value
                    ? { ...(current.details ?? {}), [locale]: e.target.value }
                    : null,
                }))}
                placeholder="Optional extra context"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
