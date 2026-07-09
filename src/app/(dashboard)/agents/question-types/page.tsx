'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, Layers, Loader2, Pencil, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useQuestionTypes, useUpdateQuestionType } from '@/hooks';
import type { AgentQuestionType } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AgentNav } from '../agent-ui';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

function QuestionTypeCard({ type }: { type: AgentQuestionType }) {
  const updateType = useUpdateQuestionType();
  const [description, setDescription] = useState(type.description);

  const dirty = description !== type.description;

  const handleToggle = async (enabled: boolean) => {
    try {
      await updateType.mutateAsync({ type: type.type, data: { enabled } });
      toast.success(enabled ? `${type.label} enabled` : `${type.label} disabled`);
    } catch {
      toast.error('Failed to update question type');
    }
  };

  const handleSaveDescription = async () => {
    try {
      await updateType.mutateAsync({
        type: type.type,
        data: { description: description.trim() },
      });
      toast.success(`${type.label} description saved`);
    } catch {
      toast.error('Failed to save description');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{type.label}</h2>
              <Badge variant="outline" className="border-slate-200 bg-slate-50 font-mono text-[10px] text-slate-500">
                {type.type}
              </Badge>
              {type.enabled ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                  Disabled
                </Badge>
              )}
            </div>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <Checkbox
              checked={type.enabled}
              onCheckedChange={(checked) => handleToggle(checked === true)}
              disabled={updateType.isPending}
            />
            Enabled
          </label>
        </div>

        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          spellCheck={false}
          className="min-h-[72px] resize-y text-xs leading-relaxed"
          placeholder="Describe this question type."
        />

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/agents/prompts?type=${type.type}`}>
              <Pencil className="h-4 w-4" />
              Edit prompts for this type
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={handleSaveDescription}
            disabled={updateType.isPending || !dirty}
          >
            {updateType.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function QuestionTypesPage() {
  const { data: types, isLoading } = useQuestionTypes();

  const sorted = [...(types ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          asChild
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <Link href="/agents">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
            <Layers className="h-6 w-6 text-slate-400" />
            Question Types
          </h1>
          <p className="text-sm text-slate-500">
            Enable, describe and tune the question formats agents can generate.
          </p>
        </div>
      </div>

      <AgentNav />

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          Only enabled types appear in the spawn form. Each type can have its own prompts —
          use &ldquo;Edit prompts for this type&rdquo; to override the role defaults.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading question types…
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No question types configured.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((type) => (
            <QuestionTypeCard key={type.type} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}
