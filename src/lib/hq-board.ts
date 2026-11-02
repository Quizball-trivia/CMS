// Pure helpers for the HQ kanban board and HQ formatting. Kept free of React
// so they can be unit-tested directly.

import type { HqMemberRef, HqMessage, HqTask, HqTaskStatus } from '@/types';

export const HQ_BOARD_COLUMNS: HqTaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'needs_approval',
  'blocked',
  'done',
];

export const HQ_STATUS_LABELS: Record<HqTaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To do',
  in_progress: 'In progress',
  needs_approval: 'Needs approval',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const HQ_PRIORITY_LABELS = ['Urgent', 'High', 'Normal', 'Low'] as const;

/** Sort inside a column: position asc, then priority asc, then oldest first. */
export function compareTasks(a: HqTask, b: HqTask): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Groups tasks into board columns (every column present, each sorted). */
export function groupTasksByStatus(
  tasks: HqTask[],
  columns: HqTaskStatus[] = HQ_BOARD_COLUMNS
): Record<HqTaskStatus, HqTask[]> {
  const grouped = Object.fromEntries(
    (Object.keys(HQ_STATUS_LABELS) as HqTaskStatus[]).map((s) => [s, [] as HqTask[]])
  ) as Record<HqTaskStatus, HqTask[]>;
  for (const task of tasks) {
    if (columns.includes(task.status)) grouped[task.status].push(task);
  }
  for (const status of columns) {
    grouped[status].sort(status === 'done' || status === 'cancelled' ? compareFinished : compareTasks);
  }
  return grouped;
}

/** Finished columns read like a log: most recently finished first. */
function compareFinished(a: HqTask, b: HqTask): number {
  return (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt);
}

/**
 * A position that places a dropped card at `index` in `column` (the column as
 * it will look *without* the dragged card). Uses midpoints so only the moved
 * task needs a PATCH.
 */
export function positionForIndex(column: HqTask[], index: number): number {
  const before = column[index - 1];
  const after = column[index];
  if (!before && !after) return Date.now() / 1000;
  if (!before) return after!.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}

/** Only the HQ worker moves an agent's task into in_progress (by claiming it). */
export function isHqAgent(member: Pick<HqMemberRef, 'kind'> | null, runtimeById?: Map<string, string>, id?: string): boolean {
  if (!member || member.kind !== 'agent') return false;
  if (runtimeById && id) return runtimeById.get(id) === 'hq';
  return true;
}

/** Where a person may move a task an HQ agent is currently working on (backend rule). */
export const AGENT_WORKING_EXITS: HqTaskStatus[] = ['cancelled', 'blocked', 'done'];

export function canDropInto(
  task: Pick<HqTask, 'status' | 'assignee'>,
  target: HqTaskStatus,
  runtimeById?: Map<string, string>
): { ok: true } | { ok: false; reason: string } {
  if (task.status === target) return { ok: true };
  if (target === 'in_progress' && task.assignee && isHqAgent(task.assignee, runtimeById, task.assignee.id)) {
    return { ok: false, reason: 'Agents start their own tasks — move it to "To do" and the agent will pick it up.' };
  }
  if (
    task.status === 'in_progress' &&
    task.assignee &&
    isHqAgent(task.assignee, runtimeById, task.assignee.id) &&
    !AGENT_WORKING_EXITS.includes(target)
  ) {
    return { ok: false, reason: 'The agent is working on this. You can cancel, block or mark it done.' };
  }
  return { ok: true };
}

export function filterTasks(tasks: HqTask[], opts: { assigneeId?: string; q?: string }): HqTask[] {
  const q = opts.q?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (opts.assigneeId === 'unassigned' && t.assignee) return false;
    if (opts.assigneeId && opts.assigneeId !== 'unassigned' && t.assignee?.id !== opts.assigneeId) return false;
    if (q && !`#${t.number} hq-${t.number} ${t.title} ${t.body}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ── Formatting ──

export const HQ_TIMEZONE = 'Asia/Tbilisi';

/** "3m ago" / "in 2h" — works for past and future timestamps. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const fmt = (n: number, unit: string) => (diffSec < 0 ? `${n}${unit} ago` : `in ${n}${unit}`);
  if (abs < 60) return diffSec < 0 ? 'just now' : 'in <1m';
  if (abs < 3600) return fmt(Math.round(abs / 60), 'm');
  if (abs < 86400) return fmt(Math.round(abs / 3600), 'h');
  return fmt(Math.round(abs / 86400), 'd');
}

/** Absolute time in Tbilisi, e.g. "Nov 2, 08:00". */
export function formatTbilisi(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: HQ_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function formatUsd(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

/** Human-readable gloss for common 5-field cron expressions; falls back to the raw expression. */
export function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, mon, dow] = parts;
  const isNum = (v: string) => /^\d+$/.test(v);
  if (!isNum(min) || !isNum(hour) || mon !== '*') return cron;
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (dom === '*' && dow === '*') return `Every day at ${time}`;
  if (dom === '*' && isNum(dow) && Number(dow) <= 7) return `Every ${days[Number(dow) % 7]} at ${time}`;
  if (dom === '*' && dow === '1-5') return `Weekdays at ${time}`;
  if (isNum(dom) && dow === '*') return `Monthly on day ${dom} at ${time}`;
  return cron;
}

/**
 * Tracks the latest drag-and-drop request per task, so responses from
 * superseded drops of the same card are ignored.
 */
export function createRequestSequencer() {
  let seq = 0;
  const latest = new Map<string, number>();
  return {
    begin(key: string): number {
      seq += 1;
      latest.set(key, seq);
      return seq;
    },
    isLatest(key: string, req: number): boolean {
      return latest.get(key) === req;
    },
  };
}

/**
 * Runs async jobs one at a time per key: a job for a key starts only after the
 * previous job for that key has settled (resolved or rejected). Used so a
 * second drop of a card can't race the first one's PATCH to the database.
 */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, job: () => Promise<T>): Promise<T> {
      const prev = tails.get(key) ?? Promise.resolve();
      const next = prev.then(job, job);
      const tail = next.catch(() => undefined);
      tails.set(key, tail);
      // Drop the entry once this is the last job, so the map doesn't grow.
      void tail.then(() => {
        if (tails.get(key) === tail) tails.delete(key);
      });
      return next;
    },
  };
}

export type DropWrite = { status?: HqTaskStatus; position: number };

/**
 * Board drag-and-drop writer. Per card, writes run one at a time in drop order
 * (latest drop reaches the DB last); a queued write superseded before it
 * starts is skipped. Each write decides *when it runs* whether to include the
 * status, by comparing the drop's intended column with the last status the
 * server confirmed — never the optimistic one — so skipping an intermediate
 * cross-column write can't lose the status change.
 */
export function createDropWriter(send: (taskId: string, data: DropWrite) => Promise<HqTask>) {
  const requests = createRequestSequencer();
  const queue = createKeyedQueue();
  const confirmed = new Map<string, HqTaskStatus>();
  const pending = new Map<string, number>();

  return {
    isLatest: (taskId: string, req: number) => requests.isLatest(taskId, req),
    /**
     * @param serverStatus the task's status in the last server data (not the optimistic board state)
     * @returns the request id and the server's copy (null if this write was skipped as superseded)
     */
    drop(taskId: string, serverStatus: HqTaskStatus, target: HqTaskStatus, position: number) {
      const req = requests.begin(taskId);
      // With nothing in flight for this card, the server data is the freshest truth.
      if (!pending.get(taskId)) confirmed.set(taskId, serverStatus);
      pending.set(taskId, (pending.get(taskId) ?? 0) + 1);

      const result = queue
        .run(taskId, async () => {
          if (!requests.isLatest(taskId, req)) return null;
          const known = confirmed.get(taskId);
          const data: DropWrite = target !== known ? { status: target, position } : { position };
          try {
            const updated = await send(taskId, data);
            confirmed.set(taskId, updated.status);
            return updated;
          } catch (e) {
            // Unknown outcome: the next write must send its status explicitly.
            confirmed.delete(taskId);
            throw e;
          }
        })
        .finally(() => {
          const left = (pending.get(taskId) ?? 1) - 1;
          if (left > 0) pending.set(taskId, left);
          else pending.delete(taskId);
        });
      return { req, result };
    },
  };
}

/**
 * Index in `column` (the target column without the dragged card) at which to
 * insert a card dropped on `overTaskId`: after it when the dragged card's
 * centre is below the over card's centre, otherwise before it. Unknown card →
 * end of column.
 */
export function dropIndex(
  column: Pick<HqTask, 'id'>[],
  overTaskId: string,
  activeCenterY: number | null,
  overRect: { top: number; height: number } | null,
  /**
   * Within the same column, the direction the card moved (its original index
   * vs. the target's). Like a sortable list, moving down lands after the
   * target and moving up before it. Keyboard drags align the dragged card
   * exactly on the target, so the centre heuristic can't tell these apart.
   */
  sameColumnDirection: 'up' | 'down' | null = null
): number {
  const i = column.findIndex((t) => t.id === overTaskId);
  if (i < 0) return column.length;
  if (sameColumnDirection) return sameColumnDirection === 'down' ? i + 1 : i;
  const after = activeCenterY !== null && overRect !== null && activeCenterY > overRect.top + overRect.height / 2;
  return after ? i + 1 : i;
}

/** Normalizes board search for the API: `#123` → `123`; `HQ-123` and text pass through (trimmed). */
export function normalizeTaskSearch(q: string | undefined): string | undefined {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;
  return /^#\d+$/.test(trimmed) ? trimmed.slice(1) : trimmed;
}

/** Inbox order: unread first, then newest first. */
export function sortInbox(messages: HqMessage[]): HqMessage[] {
  return [...messages].sort((a, b) => {
    if (!a.readAt !== !b.readAt) return a.readAt ? 1 : -1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/**
 * Merges task lists from several queries (e.g. open work + finished work),
 * keeping the most recently updated copy of a task that appears in both
 * (it may have moved between them since one of the lists was fetched).
 */
export function mergeTaskLists(...lists: HqTask[][]): HqTask[] {
  const byId = new Map<string, HqTask>();
  for (const list of lists) {
    for (const t of list) {
      const prev = byId.get(t.id);
      if (!prev || t.updatedAt > prev.updatedAt) byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}
