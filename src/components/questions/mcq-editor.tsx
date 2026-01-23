'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { McqOption } from '@/types';

interface McqEditorProps {
  options: McqOption[];
  onChange: (options: McqOption[]) => void;
}

export function McqEditor({ options, onChange }: McqEditorProps) {
  const addOption = () => {
    const newOption: McqOption = {
      id: crypto.randomUUID(),
      text: { en: '' },
      is_correct: options.length === 0, // First option is correct by default
    };
    onChange([...options, newOption]);
  };

  const removeOption = (id: string) => {
    const newOptions = options.filter((o) => o.id !== id);
    // If we removed the correct answer, make the first one correct
    if (newOptions.length > 0 && !newOptions.some((o) => o.is_correct)) {
      newOptions[0].is_correct = true;
    }
    onChange(newOptions);
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
      <div className="flex items-center justify-between">
        <Label>Answer Options</Label>
        <Button type="button" variant="outline" size="sm" onClick={addOption}>
          Add Option
        </Button>
      </div>

      {options.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No options added yet. Click &quot;Add Option&quot; to create answer choices.
        </p>
      ) : (
        <div className="space-y-3">
          {options.map((option, index) => (
            <Card key={option.id} className={option.is_correct ? 'ring-2 ring-green-500' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setCorrectAnswer(option.id)}
                    className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      option.is_correct
                        ? 'border-green-500 bg-green-500'
                        : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {option.is_correct && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Option {index + 1}
                        {option.is_correct && (
                          <span className="ml-2 text-green-600">(Correct)</span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeOption(option.id)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                    </div>

                    <Tabs defaultValue="en" className="w-full">
                      <TabsList className="mb-2 h-8">
                        <TabsTrigger value="en" className="text-xs">EN</TabsTrigger>
                        <TabsTrigger value="ka" className="text-xs">KA</TabsTrigger>
                      </TabsList>
                      <TabsContent value="en">
                        <Input
                          placeholder="Option text in English"
                          value={option.text.en || ''}
                          onChange={(e) => updateOptionText(option.id, 'en', e.target.value)}
                        />
                      </TabsContent>
                      <TabsContent value="ka">
                        <Input
                          placeholder="Option text in Georgian"
                          value={option.text.ka || ''}
                          onChange={(e) => updateOptionText(option.id, 'ka', e.target.value)}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {options.length > 0 && options.length < 2 && (
        <p className="text-sm text-amber-600">
          Add at least 2 options for a valid multiple choice question.
        </p>
      )}
    </div>
  );
}
