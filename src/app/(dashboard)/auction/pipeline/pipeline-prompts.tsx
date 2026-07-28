'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

function PromptEditor({
  meta,
  prompt,
  effective,
}: {
  meta: PromptMeta;
  prompt: AuctionPipelinePrompt | undefined;
  effective: AuctionPipelinePrompt | undefined;
}) {
  const savePrompt = useSaveAuctionPipelinePrompt();
  const [text, setText] = useState(prompt?.text ?? '');
  const [showEffective, setShowEffective] = useState(false);

  const dirty = text !== (prompt?.text ?? '');
  const effectiveLineCount = effective ? effective.text.split('\n').length : 0;

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
      {/* The rules the runner will actually send, published by the runner itself. */}
      <button
        type="button"
        onClick={() => setShowEffective((open) => !open)}
        className="mt-2 flex w-full items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-left text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        {showEffective ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        )}
        {effective
          ? `Rules in effect (${effectiveLineCount})`
          : 'Rules in effect — not published yet'}
        {effective ? (
          <span className="ml-auto text-[11px] font-normal text-slate-400">
            read-only · from runner
          </span>
        ) : null}
      </button>
      {showEffective ? (
        effective ? (
          <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-600">
            {effective.text}
          </pre>
        ) : (
          <p className="mt-1 rounded-md bg-slate-50 p-2 text-xs text-slate-500">
            The runner publishes its assembled rules when it next starts a batch.
          </p>
        )
      ) : null}

      <Label className="mt-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">
        Add extra rules
      </Label>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        className="mt-1 min-h-[90px] resize-y font-mono text-xs leading-relaxed"
        placeholder="One extra rule per line. Appended to the rules above."
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

  const byKey = new Map((data?.items ?? []).map((prompt) => [prompt.key, prompt]));
  const effectiveByKey = data?.effective ?? {};

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Expand <span className="font-medium text-slate-700">Rules in effect</span> to read exactly
        what the runner sends. Anything you add below is{' '}
        <span className="font-medium text-slate-700">appended</span> to those rules, never replaces
        them, so an edit here cannot remove the safety rules. Takes effect on the next batch.
      </p>
      {PROMPT_META.map((meta) => (
        <PromptEditor
          key={`${meta.key}:${byKey.get(meta.key)?.updated_at ?? 'none'}`}
          meta={meta}
          prompt={byKey.get(meta.key)}
          effective={effectiveByKey[meta.key]}
        />
      ))}
      {AUCTION_PIPELINE_PROMPT_KEYS.length !== PROMPT_META.length ? (
        <p className="text-xs text-amber-600">Some prompt keys are not editable in this view.</p>
      ) : null}
    </div>
  );
}
