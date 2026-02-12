'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { McqOption } from '@/types';
import { Plus, Trash2, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { generateAnswerId } from '@/lib/question-utils';

interface McqEditorProps {
  options: McqOption[];
  onChange: (options: McqOption[]) => void;
  locale?: 'en' | 'ka';
}

export function McqEditor({ options, onChange, locale }: McqEditorProps) {
  const [activeLang, setActiveLang] = useState<'en' | 'ka'>(locale ?? 'en');

  // Sync with parent locale toggle
  useEffect(() => {
    if (locale) setActiveLang(locale);
  }, [locale]);
  const addOption = () => {
    const newOption: McqOption = {
      id: generateAnswerId(),
      text: { en: '' },
      is_correct: options.length === 0, // First option is correct by default
    };
    onChange([...options, newOption]);
  };

  const removeOption = (id: string) => {
    const newOptions = options.filter((o) => o.id !== id);
    // If we removed the correct answer, make the first one correct
    if (newOptions.length > 0 && !newOptions.some((o) => o.is_correct)) {
      const [first, ...rest] = newOptions;
      onChange([{ ...first, is_correct: true }, ...rest.map((o) => ({ ...o }))]);
      return;
    }
    onChange(newOptions.map((o) => ({ ...o })));
  };

  const updateOptionText = (id: string, lang: string, value: string) => {
    onChange(
      options.map((o) =>
        o.id === id ? { ...o, text: { ...o.text, [lang]: value } } : o
      )
    );
  };

  const setCorrectAnswer = (id: string) => {
    onChange(
      options.map((o) => ({ ...o, is_correct: o.id === id }))
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-0.5">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">Answer Options</Label>
          <p className="text-[9px] text-muted-foreground/40 font-medium italic">2-4 choices recommended</p>
        </div>
        <Button 
          type="button" 
          size="sm" 
          onClick={addOption}
          className="h-7 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 border-none font-bold text-[9px] uppercase tracking-wider transition-all active:scale-95"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {options.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 rounded-2xl border border-dashed border-white/5 bg-white/[0.02]">
          <p className="text-[9px] font-bold text-white/10 uppercase tracking-widest text-center">
            No options added
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((option, index) => (
            <div 
              key={option.id} 
              className={cn(
                "group relative rounded-2xl border transition-all duration-200 overflow-hidden",
                option.is_correct 
                  ? "bg-primary/[0.05] border-primary/30 shadow-lg shadow-primary/5" 
                  : "bg-white/[0.03] border-white/5 hover:border-white/10"
              )}
            >
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectAnswer(option.id)}
                      className={cn(
                        "h-5 w-5 rounded-full flex items-center justify-center border transition-all duration-200",
                        option.is_correct
                          ? "bg-primary border-primary text-primary-foreground scale-110 shadow-lg shadow-primary/10"
                          : "bg-white/5 border-white/10 text-transparent hover:border-primary/50"
                      )}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                    </button>
                    <span className={cn(
                      "text-[9px] font-black uppercase tracking-widest transition-colors",
                      option.is_correct ? "text-primary" : "text-muted-foreground/40"
                    )}>
                      #{index + 1}
                    </span>
                  </div>
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-md text-muted-foreground/30 hover:text-rose-500 hover:bg-rose-500/10 transition-all opacity-0 group-hover:opacity-100"
                    onClick={() => removeOption(option.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                  <div className="flex items-center gap-2">
                    <div className="flex flex-col bg-white/5 p-0.5 rounded-lg border border-white/5 self-start">
                    <button
                      type="button"
                      onClick={() => setActiveLang('en')}
                      className={cn(
                        "px-1.5 py-1 text-[8px] font-black rounded-md transition-colors",
                        activeLang === 'en'
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white"
                      )}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveLang('ka')}
                      className={cn(
                        "px-1.5 py-1 text-[8px] font-black rounded-md transition-colors",
                        activeLang === 'ka'
                          ? "bg-white/10 text-white"
                          : "text-white/40 hover:text-white"
                      )}
                    >
                      KA
                    </button>
                    </div>
                  <Input
                    placeholder="Option text..."
                    value={option.text[activeLang] || ''}
                    onChange={(e) => updateOptionText(option.id, activeLang, e.target.value)}
                    className="h-9 bg-white/5 border-white/5 rounded-xl focus:ring-1 focus:ring-primary/30 transition-all text-xs placeholder:text-white/10 border-none shadow-inner"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {options.length > 0 && options.length < 2 && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/5 text-[9px] text-amber-500/60 font-bold uppercase tracking-widest border border-amber-500/10">
          <Info className="w-3 h-3" />
          Add 1 more option
        </div>
      )}
    </div>
  );
}
