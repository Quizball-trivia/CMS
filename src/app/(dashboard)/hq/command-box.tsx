'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateHqTask } from '@/hooks';
import { HQ_PRIORITY_LABELS, isOwnPipelineAgent, isRunnableHqAgent, sortAgentsForPicker } from '@/lib/hq-board';
import { HQ_DEPARTMENTS } from '@/lib/hq-departments';
import { taskFromCommand } from '@/lib/hq-pulse';
import type { HqMember, HqPriority } from '@/types';
import { errorMessage } from './hq-ui';
import { OwnPipelineHint, agentOptionLabel } from './task-sheet';

// ── "Tell your team…" ──

const NOBODY = '__nobody__';

export function CommandBox({ members, onOpenTask }: { members: HqMember[]; onOpenTask: (id: string) => void }) {
  const create = useCreateHqTask();
  const [text, setTextState] = useState('');
  // Refs: a second ⌘↵ in the same tick, or an error arriving later, must see the latest state.
  const textRef = useRef('');
  const sendingRef = useRef(false);
  const setText = (value: string) => {
    textRef.current = value;
    setTextState(value);
  };
  const [assigneeId, setAssigneeId] = useState<string>(NOBODY);
  const [priority, setPriority] = useState<HqPriority>(2);

  const active = members.filter((m) => m.status !== 'archived');
  const agentsByDept = HQ_DEPARTMENTS.map((d) => ({
    dept: d,
    agents: sortAgentsForPicker(active.filter((m) => m.kind === 'agent' && m.department === d.key)),
  })).filter((g) => g.agents.length > 0);
  const people = active.filter((m) => m.kind === 'human');

  const selected = active.find((m) => m.id === assigneeId);

  const send = () => {
    const submitted = text;
    if (!submitted.trim() || create.isPending || sendingRef.current) return;
    sendingRef.current = true;
    const { title, body } = taskFromCommand(submitted);
    const assignee = selected;
    // Clear now so the next instruction can be typed while this one is sent;
    // on failure, put it back unless something new was typed meanwhile.
    setText('');
    create.mutate(
      { title, body, assigneeId: assignee?.id ?? null, priority, status: 'todo' },
      {
        onSuccess: (task) => {
          toast.success(
            assignee
              ? isRunnableHqAgent(assignee)
                ? `${assignee.name} is on it — #${task.number}`
                : `Sent to ${assignee.name} — #${task.number}`
              : `#${task.number} added to Work`,
            { action: { label: 'Open', onClick: () => onOpenTask(task.id) } }
          );
        },
        onError: (e) => {
          toast.error(errorMessage(e, 'Could not send'));
          if (!textRef.current.trim()) setText(submitted);
        },
        onSettled: () => {
          sendingRef.current = false;
        },
      }
    );
  };

  return (
    <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        <Send className="h-4 w-4 text-slate-300" />
        <h2 className="text-base font-bold">Tell your team…</h2>
        <span className="text-xs text-slate-400">Agents start right away; people see it in their work.</span>
      </div>
      <Textarea
        aria-label="Tell your team"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="e.g. Write this week's Instagram posts about the Champions League — 3 posts, in Georgian."
        className="resize-none border-slate-700 bg-slate-900 text-[15px] text-white placeholder:text-slate-500 focus-visible:ring-slate-500"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="w-64">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger aria-label="Who should do it" className="w-full border-slate-700 bg-slate-900 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Anyone — decide later</SelectItem>
              {agentsByDept.map(({ dept, agents }) => (
                <SelectGroup key={dept.key}>
                  <SelectLabel>
                    {dept.emoji} {dept.name}
                  </SelectLabel>
                  {agents.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {agentOptionLabel(m)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {people.length > 0 && (
                <SelectGroup>
                  <SelectLabel>People</SelectLabel>
                  {people.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.avatar} {m.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="w-32">
          <Select value={String(priority)} onValueChange={(v) => setPriority(Number(v) as HqPriority)}>
            <SelectTrigger aria-label="Priority" className="w-full border-slate-700 bg-slate-900 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HQ_PRIORITY_LABELS.map((label, i) => (
                <SelectItem key={label} value={String(i)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto hidden text-xs text-slate-500 sm:inline">⌘↵ to send</span>
        <Button onClick={send} disabled={!text.trim() || create.isPending} className="bg-white text-slate-950 hover:bg-slate-200">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
      {isOwnPipelineAgent(selected) && <OwnPipelineHint className="text-amber-300" />}
    </section>
  );
}
