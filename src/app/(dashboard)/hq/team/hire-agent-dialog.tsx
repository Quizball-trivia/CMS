'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqMember } from '@/hooks';
import type { HqAutonomy, HqMember } from '@/types';
import { errorMessage } from '../hq-ui';
import { AgentSettingsFields, type AgentSettingsValue } from './agent-settings-fields';

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // drop combining accents: "Müller" → "muller", not "mu-ller"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 41);
}

const EMPTY: AgentSettingsValue = {
  avatar: '🤖',
  color: 'slate',
  model: '',
  tools: ['web'],
  autonomy: 'autonomous' as HqAutonomy,
  maxTurns: 25,
  department: 'leadership',
};

export function HireAgentDialog({
  open,
  onOpenChange,
  onHired,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onHired?: (member: HqMember) => void;
}) {
  const create = useCreateHqMember();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [settings, setSettings] = useState<AgentSettingsValue>(EMPTY);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugValid = /^[a-z0-9][a-z0-9-]{1,40}$/.test(effectiveSlug);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setTitle('');
    setDescription('');
    setInstructions('');
    setSettings(EMPTY);
  };

  const submit = () => {
    if (!name.trim()) return toast.error('Give the agent a name');
    if (!slugValid) return toast.error('Handle must be 2–41 lowercase letters, numbers or dashes');
    if (!instructions.trim()) return toast.error('Write the agent’s instructions — this is its job description');
    create.mutate(
      {
        slug: effectiveSlug,
        name: name.trim(),
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        avatar: settings.avatar || '🤖',
        color: settings.color,
        model: settings.model.trim() || null,
        tools: settings.tools,
        autonomy: settings.autonomy,
        maxTurns: settings.maxTurns,
        department: settings.department,
      },
      {
        onSuccess: (member) => {
          toast.success(`${member.name} joined the team`);
          reset();
          onOpenChange(false);
          onHired?.(member);
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not hire the agent')),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Hire an agent</DialogTitle>
          <DialogDescription>
            Describe the job like you would for a new employee. Assign it tasks or give it a schedule once it&apos;s hired.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Community Manager" maxLength={80} />
            </Labeled>
            <Labeled label="Handle (other agents use this to assign work)">
              <Input
                value={effectiveSlug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                placeholder="community-manager"
                className={!effectiveSlug || slugValid ? '' : 'border-red-300'}
              />
            </Labeled>
            <Labeled label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Community lead" />
            </Labeled>
            <Labeled label="One-line description">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does, for the team page" />
            </Labeled>
          </div>
          <Labeled label="Instructions (job description / system prompt)">
            <Textarea
              rows={10}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={'You are the … at QuizBall, a football trivia game.\n\nEach run:\n1. …\n2. …\n\nYour result: …'}
              className="font-mono text-xs"
            />
          </Labeled>
          <AgentSettingsFields value={settings} onChange={setSettings} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            Hire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}
