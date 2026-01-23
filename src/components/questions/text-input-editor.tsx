'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { I18nField } from '@/types';

interface TextInputEditorProps {
  acceptedAnswers: I18nField[];
  caseSensitive: boolean;
  onChange: (acceptedAnswers: I18nField[], caseSensitive: boolean) => void;
}

export function TextInputEditor({ acceptedAnswers, caseSensitive, onChange }: TextInputEditorProps) {
  const addAnswer = () => {
    onChange([...acceptedAnswers, { en: '' }], caseSensitive);
  };

  const removeAnswer = (index: number) => {
    const newAnswers = acceptedAnswers.filter((_, i) => i !== index);
    onChange(newAnswers, caseSensitive);
  };

  const updateAnswer = (index: number, lang: string, value: string) => {
    const newAnswers = acceptedAnswers.map((answer, i) =>
      i === index ? { ...answer, [lang]: value } : answer
    );
    onChange(newAnswers, caseSensitive);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Accepted Answers</Label>
        <Button type="button" variant="outline" size="sm" onClick={addAnswer}>
          Add Answer
        </Button>
      </div>

      {acceptedAnswers.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">
          No accepted answers added yet. Click &quot;Add Answer&quot; to add correct answers.
        </p>
      ) : (
        <div className="space-y-3">
          {acceptedAnswers.map((answer, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Answer {index + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                    onClick={() => removeAnswer(index)}
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
                      placeholder="Accepted answer in English"
                      value={answer.en || ''}
                      onChange={(e) => updateAnswer(index, 'en', e.target.value)}
                    />
                  </TabsContent>
                  <TabsContent value="ka">
                    <Input
                      placeholder="Accepted answer in Georgian"
                      value={answer.ka || ''}
                      onChange={(e) => updateAnswer(index, 'ka', e.target.value)}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="case-sensitive"
          checked={caseSensitive}
          onChange={(e) => onChange(acceptedAnswers, e.target.checked)}
          className="rounded border-gray-300"
        />
        <Label htmlFor="case-sensitive" className="text-sm font-normal">
          Case sensitive matching
        </Label>
      </div>

      {acceptedAnswers.length === 0 && (
        <p className="text-sm text-amber-600">
          Add at least 1 accepted answer for a valid text input question.
        </p>
      )}
    </div>
  );
}
