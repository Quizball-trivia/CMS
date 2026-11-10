// Display helpers for the Executive Director page.

import type { HqTask } from '@/types';

/** `claude-fable-5-2` → "Fable 5.2", `claude-opus-4-8` → "Opus 4.8"; a trailing date stamp is ignored. */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return 'Default model';
  const [name, ...rest] = model.replace(/^claude-/, '').split('-');
  const version: string[] = [];
  for (const part of rest) {
    if (!/^\d{1,2}$/.test(part)) break;
    version.push(part);
  }
  const label = `${name.charAt(0).toUpperCase()}${name.slice(1)}${version.length ? ` ${version.join('.')}` : ''}`;
  return label || model;
}

/** "Fable 5.2 · medium" */
export function modelBadgeLabel(model: string | null | undefined, effort: string | null | undefined): string {
  return effort ? `${modelLabel(model)} · ${effort}` : modelLabel(model);
}

export interface FounderActions {
  /** The Director sent it up and it is still waiting for the founder. */
  handled: boolean;
  doIt: boolean;
  notNow: boolean;
}

/**
 * What the founder may do with a task on the Director page. Besides open ideas, he can overrule the Director:
 * "Do it" on an idea he declined, "Not now" on one he approved that hasn't finished.
 */
export function founderActions(task: HqTask): FounderActions {
  const decision = task.director?.decision ?? null;
  const proposed = task.status === 'proposed';
  return {
    // Ideas are settled with Do it / Not now; "Handled" is for everything else he sent up.
    handled: !!task.director?.escalatedAt && !proposed,
    doIt: proposed || (task.status === 'cancelled' && decision === 'declined'),
    notNow: proposed || ((task.status === 'todo' || task.status === 'in_progress') && decision === 'approved'),
  };
}
