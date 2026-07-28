'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useAuctionPipelinePrompts,
  useResetAuctionPipelinePrompt,
  useSaveAuctionPipelinePrompt,
} from '@/hooks';
import { cn } from '@/lib/utils';
import type {
  AuctionPipelinePrompt,
  AuctionPipelinePromptKey,
  AuctionPipelinePromptMode,
} from '@/types/auction-pipeline';

interface PromptMeta {
  key: AuctionPipelinePromptKey;
  label: string;
  description: string;
}

const PROMPT_META: PromptMeta[] = [
  {
    key: 'generator_rules',
    label: 'Generator',
    description: 'Rules for the agent that drafts the three clues.',
  },
  {
    key: 'verifier_rules',
    label: 'Fact-checker',
    description: 'Rules for the web-search agent that verifies each claim.',
  },
  {
    key: 'judge_rules',
    label: 'Final judge',
    description: 'Rules for the independent accept/reject gate.',
  },
  {
    key: 'variant_medium',
    label: 'Medium variant',
    description: 'Difficulty guidance applied to medium cards only.',
  },
  {
    key: 'variant_hard',
    label: 'Hard variant',
    description: 'Difficulty guidance applied to hard cards only.',
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
  const resetPrompt = useResetAuctionPipelinePrompt();

  const savedMode: AuctionPipelinePromptMode = prompt?.mode ?? 'append';
  const [mode, setMode] = useState<AuctionPipelinePromptMode>(savedMode);
  const [text, setText] = useState(prompt?.text ?? '');
  const [showEffective, setShowEffective] = useState(false);

  const effectiveLineCount = effective ? effective.text.split('\n').length : 0;
  const dirty = text !== (prompt?.text ?? '') || mode !== savedMode;
  const blankReplacement = mode === 'replace' && !text.trim();

  // Switching into replace pre-fills the editor with the rules actually in
  // force, so the operator edits the real text instead of an empty box.
  const handleModeChange = (next: AuctionPipelinePromptMode) => {
    if (next === mode) return;
    if (next === 'replace' && !text.trim() && effective) {
      setText(effective.text);
    }
    setMode(next);
  };

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error('Prompt cannot be empty');
      return;
    }
    const consequence =
      mode === 'replace'
        ? `Replace the ${meta.label} rules entirely with this text? The built-in rules will no longer be sent.`
        : `Save extra ${meta.label} rules? They are appended to the built-in rules.`;
    if (!window.confirm(`${consequence} Takes effect on the next batch.`)) return;
    try {
      await savePrompt.mutateAsync({ key: meta.key, text, mode });
      toast.success(`${meta.label} prompt saved`);
    } catch {
      toast.error('Failed to save prompt');
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        `Reset the ${meta.label} prompt to defaults? Your override is deleted and the built-in rules apply on the next batch.`
      )
    ) {
      return;
    }
    try {
      await resetPrompt.mutateAsync(meta.key);
      setText('');
      setMode('append');
      toast.success(`${meta.label} prompt reset to defaults`);
    } catch {
      toast.error('Failed to reset prompt');
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{meta.label}</h3>
            {prompt ? (
              <Badge
                variant="outline"
                className={
                  prompt.mode === 'replace'
                    ? 'border-violet-200 bg-violet-50 text-violet-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }
              >
                {prompt.mode === 'replace' ? 'replaced' : 'extra rules'}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                defaults
              </Badge>
            )}
            {blankReplacement ? (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                empty — defaults will be used
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 break-words text-xs text-slate-500">{meta.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {prompt ? (
            <Button variant="ghost" size="sm" onClick={handleReset} disabled={resetPrompt.isPending}>
              {resetPrompt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Reset to defaults
            </Button>
          ) : null}
          <Button size="sm" onClick={handleSave} disabled={savePrompt.isPending || !dirty}>
            {savePrompt.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(['append', 'replace'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleModeChange(option)}
            className={cn(
              mode === option
                ? 'rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white'
                : 'rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50'
            )}
          >
            {option === 'append' ? 'Add extra rules' : 'Replace all rules'}
          </button>
        ))}
        {mode === 'replace' && effective && text !== effective.text ? (
          <button
            type="button"
            onClick={() => setText(effective.text)}
            className="text-xs text-blue-600 hover:underline"
          >
            Load current rules
          </button>
        ) : null}
      </div>

      <Label className="mt-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">
        {mode === 'replace' ? 'Replacement rules' : 'Extra rules'}
      </Label>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        className="mt-1 min-h-[120px] resize-y font-mono text-xs leading-relaxed"
        placeholder={
          mode === 'replace'
            ? 'These rules are sent instead of the built-in rules. One per line.'
            : 'One extra rule per line. Appended to the rules above.'
        }
      />
      {blankReplacement ? (
        <p className="mt-1 text-xs text-amber-600">
          A blank replacement is ignored — the built-in rules are used instead.
        </p>
      ) : null}
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
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          <span className="font-semibold">Replace all rules</span> swaps what is sent to the model;{' '}
          <span className="font-semibold">Add extra rules</span> appends to it. Either way the
          deterministic checks — JSON parsing, the 15-word cap, the movement-clue limit, and the
          evidence and source-URL requirements — run against the model&apos;s response in code and{' '}
          <span className="font-semibold">cannot be disabled from here</span>. Changes take effect
          on the next batch.
        </p>
      </div>
      {PROMPT_META.map((meta) => (
        <PromptEditor
          key={`${meta.key}:${byKey.get(meta.key)?.updated_at ?? 'none'}:${byKey.get(meta.key)?.mode ?? 'none'}`}
          meta={meta}
          prompt={byKey.get(meta.key)}
          effective={effectiveByKey[meta.key]}
        />
      ))}
    </div>
  );
}
