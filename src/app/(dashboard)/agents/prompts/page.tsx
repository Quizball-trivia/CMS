'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, History, Info, Loader2, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  useActivatePromptVersion,
  useAgentPrompts,
  usePromptHistory,
  useQuestionTypes,
  useSavePrompt,
} from '@/hooks';
import { DEFAULT_PROMPT_TYPE } from '@/types';
import type { AgentPrompt, AgentPromptVersion } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatRelativeTime, AgentNav } from '../agent-ui';

interface RoleMeta {
  role: string;
  label: string;
  description: string;
}

const ROLE_META: RoleMeta[] = [
  {
    role: 'generator',
    label: 'Generator',
    description: 'Drafts the question prompt, answer options and correct answer from the topic.',
  },
  {
    role: 'factcheck',
    label: 'Fact-checker',
    description: 'Verifies the drafted question and answer are factually correct.',
  },
  {
    role: 'dedupe',
    label: 'Dedupe',
    description: 'Compares the draft against existing questions to reject near-duplicates.',
  },
  {
    role: 'judge',
    label: 'Final Judge',
    description: 'The editorial gate: accept → published live, reject → regenerate, unsure → review queue. Edit per-type contracts via the type selector.',
  },
];

function HistoryDialog({
  role,
  label,
  type,
  open,
  onOpenChange,
}: {
  role: string;
  label: string;
  type: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDefault = type === DEFAULT_PROMPT_TYPE;
  const { data: versions, isLoading } = usePromptHistory(
    role,
    isDefault ? undefined : type,
    open
  );
  const activate = useActivatePromptVersion();

  const handleRevert = async (version: AgentPromptVersion) => {
    if (version.isActive) return;
    const ok = window.confirm(
      `Revert the ${label} prompt to version ${version.version}? This becomes the active prompt for the next generation job.`
    );
    if (!ok) return;
    try {
      await activate.mutateAsync({
        promptId: version.id,
        role,
        type: isDefault ? undefined : type,
      });
      toast.success(`Reverted to version ${version.version}`);
    } catch {
      toast.error('Failed to revert prompt version');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label} prompt history</DialogTitle>
          <DialogDescription>Past versions. Revert to make one active again.</DialogDescription>
        </DialogHeader>
        <div className="-mr-2 max-h-[60vh] space-y-3 overflow-y-auto pr-2">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading history…</p>
          ) : !versions || versions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No previous versions.</p>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">v{version.version}</span>
                    {version.isActive ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-emerald-700"
                      >
                        Active
                      </Badge>
                    ) : null}
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(version.createdAt)}
                    </span>
                  </div>
                  {!version.isActive ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevert(version)}
                      disabled={activate.isPending}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Revert
                    </Button>
                  ) : null}
                </div>
                {version.note ? (
                  <p className="mt-1 break-words text-xs text-slate-500">{version.note}</p>
                ) : null}
                <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 font-mono text-[11px] leading-relaxed text-slate-600">
                  {version.content}
                </pre>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromptCard({
  meta,
  prompt,
  type,
}: {
  meta: RoleMeta;
  prompt: AgentPrompt | undefined;
  type: string;
}) {
  const savePrompt = useSavePrompt();
  const [content, setContent] = useState(prompt?.content ?? '');
  const [note, setNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const isDefault = type === DEFAULT_PROMPT_TYPE;
  const dirty = content !== (prompt?.content ?? '');

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Prompt cannot be empty');
      return;
    }
    const ok = window.confirm(
      `Save a new active version of the ${meta.label} prompt? This changes live agent behavior on the next generation job.`
    );
    if (!ok) return;
    try {
      await savePrompt.mutateAsync({
        role: meta.role,
        data: {
          content,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(isDefault ? {} : { type }),
        },
      });
      setNote('');
      toast.success(`${meta.label} prompt saved`);
    } catch {
      toast.error('Failed to save prompt');
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{meta.label}</h2>
              {prompt ? (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-slate-50 text-slate-500"
                >
                  v{prompt.version}
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 break-words text-xs text-slate-500">{meta.description}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" />
            History
          </Button>
        </div>

        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className="min-h-[220px] resize-y font-mono text-xs leading-relaxed"
          placeholder={prompt ? '' : 'No prompt configured yet.'}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Change note (optional)
            </Label>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What changed and why"
              className="h-9"
            />
          </div>
          <Button
            className="shrink-0"
            onClick={handleSave}
            disabled={savePrompt.isPending || !dirty}
          >
            {savePrompt.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save new version
          </Button>
        </div>
      </CardContent>

      <HistoryDialog
        role={meta.role}
        label={meta.label}
        type={type}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </Card>
  );
}

function PromptsEditor() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') || DEFAULT_PROMPT_TYPE;
  const [type, setType] = useState(initialType);

  const { data: questionTypes } = useQuestionTypes();
  const isDefault = type === DEFAULT_PROMPT_TYPE;
  const { data: prompts, isLoading } = useAgentPrompts(isDefault ? undefined : type);

  const sortedTypes = useMemo(
    () => [...(questionTypes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [questionTypes]
  );

  const activeTypeLabel = isDefault
    ? 'Default (all types)'
    : sortedTypes.find((t) => t.type === type)?.label ?? type;

  const byRole = new Map((prompts ?? []).map((p) => [p.role, p]));

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agent Prompts</h1>
          <p className="text-sm text-slate-500">
            Edit the system prompt each sub-agent runs.
          </p>
        </div>
      </div>

      <AgentNav />

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          Edits take effect on the next generation job (the VPS reads the active prompt per run,
          ~1 min cache). &ldquo;Default (all types)&rdquo; sets the role defaults; pick a question
          type to override its prompts.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-1.5 p-5 sm:max-w-sm">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Editing prompts for
          </Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 w-full">
              <SelectValue>{activeTypeLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_PROMPT_TYPE}>Default (all types)</SelectItem>
              {sortedTypes.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading prompts…
        </div>
      ) : (
        <div className="space-y-4">
          {ROLE_META.map((meta) => {
            const prompt = byRole.get(meta.role);
            return (
              <PromptCard
                key={`${type}:${meta.role}:${prompt?.version ?? 'none'}`}
                meta={meta}
                prompt={prompt}
                type={type}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AgentPromptsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading prompts…
        </div>
      }
    >
      <PromptsEditor />
    </Suspense>
  );
}
