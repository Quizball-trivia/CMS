'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { HqAutonomy, HqDepartmentKey, HqToolGroup } from '@/types';
import { HQ_DEPARTMENTS } from '@/lib/hq-departments';
import { HQ_AVATAR_COLOR_NAMES } from '../hq-ui';

export interface AgentSettingsValue {
  avatar: string;
  color: string;
  model: string;
  tools: string[];
  autonomy: HqAutonomy;
  maxTurns: number;
  department: HqDepartmentKey;
}

export const HQ_TOOL_OPTIONS: Array<{ id: HqToolGroup; label: string; hint: string }> = [
  { id: 'web', label: 'Web', hint: 'Search the web and read pages' },
  { id: 'metrics', label: 'Metrics', hint: 'Players, matches and signups (read-only)' },
  { id: 'feedback', label: 'Feedback', hint: 'Recent in-game player feedback (read-only)' },
];

const COLOR_SWATCH: Record<string, string> = {
  slate: 'bg-slate-400', gray: 'bg-gray-400', red: 'bg-red-400', orange: 'bg-orange-400', amber: 'bg-amber-400',
  yellow: 'bg-yellow-400', lime: 'bg-lime-400', green: 'bg-green-400', emerald: 'bg-emerald-400', teal: 'bg-teal-400',
  cyan: 'bg-cyan-400', sky: 'bg-sky-400', blue: 'bg-blue-400', indigo: 'bg-indigo-400', violet: 'bg-violet-400',
  purple: 'bg-purple-400', pink: 'bg-pink-400', rose: 'bg-rose-400',
};

export function AgentSettingsFields({ value, onChange }: { value: AgentSettingsValue; onChange: (v: AgentSettingsValue) => void }) {
  const set = <K extends keyof AgentSettingsValue>(key: K, v: AgentSettingsValue[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Avatar</span>
          <Input value={value.avatar} onChange={(e) => set('avatar', e.target.value.slice(0, 8))} className="text-center text-lg" />
        </label>
        <div className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Color</span>
          <div className="flex flex-wrap gap-1.5">
            {HQ_AVATAR_COLOR_NAMES.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                aria-label={c}
                onClick={() => set('color', c)}
                className={cn('h-6 w-6 rounded-full ring-offset-2', COLOR_SWATCH[c], value.color === c && 'ring-2 ring-slate-900')}
              />
            ))}
          </div>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-semibold text-slate-500">Department</span>
        <Select value={value.department} onValueChange={(v) => set('department', v as HqDepartmentKey)}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HQ_DEPARTMENTS.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.emoji} {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="block text-xs text-slate-400">Where this agent shows up: its department page, the sidebar and the Command Center.</span>
      </label>

      <div className="space-y-1">
        <span className="text-xs font-semibold text-slate-500">Tools</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {HQ_TOOL_OPTIONS.map((t) => {
            const checked = value.tools.includes(t.id);
            return (
              <label key={t.id} className={cn('flex cursor-pointer items-start gap-2 rounded-lg border p-2', checked ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200')}>
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => set('tools', v === true ? [...value.tools, t.id] : value.tools.filter((x) => x !== t.id))}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p className="text-xs text-slate-400">Every HQ agent can also read the board, create and hand off tasks, and message teammates.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Autonomy</span>
          <Select value={value.autonomy} onValueChange={(v) => set('autonomy', v as HqAutonomy)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="autonomous">Autonomous — results count right away</SelectItem>
              <SelectItem value="approval">Needs approval — I review results</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Model (blank = default)</span>
          <Input value={value.model} onChange={(e) => set('model', e.target.value)} placeholder="default" />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-slate-500">Max turns per run</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={value.maxTurns}
            onChange={(e) => set('maxTurns', Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
          />
        </label>
      </div>
    </div>
  );
}
