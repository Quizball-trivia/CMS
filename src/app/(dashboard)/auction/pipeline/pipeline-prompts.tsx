'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuctionPipelinePrompts, useSaveAuctionPipelinePrompt } from '@/hooks';
import { AUCTION_PIPELINE_PROMPT_KEYS } from '@/types/auction-pipeline';
import type { AuctionPipelinePrompt, AuctionPipelinePromptKey } from '@/types/auction-pipeline';

interface PromptMeta {
  key: AuctionPipelinePromptKey;
  label: string;
  description: string;
}

const PROMPT_META: PromptMeta[] = [
  {
    key: 'generator_rules',
    label: 'Generator',
    description: 'Extra rules for the agent that drafts the three clues.',
  },
  {
    key: 'verifier_rules',
    label: 'Fact-checker',
    description: 'Extra rules for the web-search agent that verifies each claim.',
  },
  {
    key: 'judge_rules',
    label: 'Final judge',
    description: 'Extra rules for the independent accept/reject gate.',
  },
  {
    key: 'variant_medium',
    label: 'Medium variant',
    description: 'Extra difficulty guidance applied to medium cards only.',
  },
  {
    key: 'variant_hard',
    label: 'Hard variant',
    description: 'Extra difficulty guidance applied to hard cards only.',
  },
];

function PromptEditor({ meta, prompt }: { meta: PromptMeta; prompt: AuctionPipelinePrompt | undefined }) {
  const savePrompt = useSaveAuctionPipelinePrompt();
  const [text, setText] = useState(prompt?.text ?? '');

  const dirty = text !== (prompt?.text ?? '');

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error('Prompt cannot be empty');
      return;
    }
    const ok = window.confirm(
      `Save the ${meta.label} prompt override? These rules are appended to the built-in rules on the next batch the runner starts.`
    );
    if (!ok) return;
    try {
      await savePrompt.mutateAsync({ key: meta.key, text });
      toast.success(`${meta.label} prompt saved`);
    } catch {
      toast.error('Failed to save prompt');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{meta.label}</h3>
            {prompt ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                override active
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                default
              </Badge>
            )}
          </div>
          <p className="mt-0.5 break-words text-xs text-slate-500">{meta.description}</p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={handleSave}
          disabled={savePrompt.isPending || !dirty}
        >
          {savePrompt.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
      </div>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        className="mt-2 min-h-[110px] resize-y font-mono text-xs leading-relaxed"
        placeholder="No override — the built-in rules apply. One rule per line."
      />
    </div>
  );
}

export function PipelinePrompts() {
  const { data, isLoading } = useAuctionPipelinePrompts();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading prompts…
      </div>
    );
  }

  const byKey = new Map((data ?? []).map((prompt) => [prompt.key, prompt]));

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Overrides are <span className="font-medium text-slate-700">appended</span> to the built-in
        rules, never replace them, so an edit here cannot remove the safety rules. Blank or
        malformed overrides fall back to the defaults. Takes effect on the next batch.
      </p>
      {PROMPT_META.map((meta) => (
        <PromptEditor
          key={`${meta.key}:${byKey.get(meta.key)?.updated_at ?? 'none'}`}
          meta={meta}
          prompt={byKey.get(meta.key)}
        />
      ))}
      {AUCTION_PIPELINE_PROMPT_KEYS.length !== PROMPT_META.length ? (
        <p className="text-xs text-amber-600">Some prompt keys are not editable in this view.</p>
      ) : null}
    </div>
  );
}
