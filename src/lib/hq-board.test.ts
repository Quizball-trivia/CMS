import { describe, expect, it } from 'vitest';
import type { HqTask } from '@/types';
import {
  canDropInto,
  createDropWriter,
  createKeyedQueue,
  createRequestSequencer,
  dropIndex,
  describeCron,
  filterTasks,
  formatRelative,
  groupTasksByStatus,
  mergeTaskLists,
  normalizeTaskSearch,
  positionForIndex,
  sortInbox,
} from './hq-board';

const agent = { id: 'a1', slug: 'ops-reporter', name: 'Ops Reporter', avatar: '📊', color: 'blue', kind: 'agent' as const };
const human = { id: 'h1', slug: 'u-1', name: 'Nika', avatar: '🧑', color: 'slate', kind: 'human' as const };

function task(overrides: Partial<HqTask>): HqTask {
  return {
    id: 't', number: 1, title: 'Task', body: '', status: 'todo', priority: 2, assignee: null, createdBy: null,
    parentId: null, depth: 0, scheduleId: null, result: null, position: 0, attempts: 0, dueAt: null,
    completedAt: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', messageCount: 0,
    kind: 'task', goalId: null, proposal: null,
    ...overrides,
  };
}

describe('groupTasksByStatus', () => {
  it('puts tasks in their columns sorted by position, then priority', () => {
    const grouped = groupTasksByStatus([
      task({ id: 'b', position: 2 }),
      task({ id: 'a', position: 1 }),
      task({ id: 'c', position: 2, priority: 0 }),
      task({ id: 'x', status: 'blocked' }),
      task({ id: 'gone', status: 'cancelled' }),
    ]);
    expect(grouped.todo.map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(grouped.blocked.map((t) => t.id)).toEqual(['x']);
    expect(grouped.cancelled).toEqual([]); // not a default column
    expect(grouped.backlog).toEqual([]);
  });

  it('lists done tasks most recently finished first', () => {
    const grouped = groupTasksByStatus([
      task({ id: 'old', status: 'done', completedAt: '2026-11-01T01:00:00Z' }),
      task({ id: 'new', status: 'done', completedAt: '2026-11-02T01:00:00Z' }),
    ]);
    expect(grouped.done.map((t) => t.id)).toEqual(['new', 'old']);
  });
});

describe('positionForIndex', () => {
  const col = [task({ id: 'a', position: 10 }), task({ id: 'b', position: 20 })];
  it('places between, before and after neighbours', () => {
    expect(positionForIndex(col, 1)).toBe(15);
    expect(positionForIndex(col, 0)).toBe(9);
    expect(positionForIndex(col, 2)).toBe(21);
  });
  it('handles an empty column', () => {
    expect(positionForIndex([], 0)).toBeGreaterThan(0);
  });
});

describe('canDropInto', () => {
  const runtimes = new Map([['a1', 'hq'], ['legacy', 'question_agents']]);
  it('blocks moving an HQ agent task into in_progress (only the worker claims)', () => {
    expect(canDropInto(task({ assignee: agent }), 'in_progress', runtimes).ok).toBe(false);
  });
  it('only lets people cancel, block or finish a task an HQ agent is working on', () => {
    const working = task({ assignee: agent, status: 'in_progress' });
    for (const target of ['todo', 'backlog', 'needs_approval'] as const) {
      expect(canDropInto(working, target, runtimes).ok).toBe(false);
    }
    for (const target of ['cancelled', 'blocked', 'done'] as const) {
      expect(canDropInto(working, target, runtimes).ok).toBe(true);
    }
  });
  it('blocks every ordinary move of a proposed idea (only Do it / Not now move it)', () => {
    for (const target of ['todo', 'backlog', 'in_progress', 'blocked', 'done', 'cancelled'] as const) {
      const check = canDropInto(task({ status: 'proposed', assignee: human }), target, runtimes);
      expect(check.ok).toBe(false);
      expect(!check.ok && check.reason).toBe('Accept or decline this idea first.');
    }
  });

  it('treats an agent whose runtime is unknown as possibly the worker’s (members loading/failed/archived)', () => {
    const working = task({ assignee: agent, status: 'in_progress' });
    for (const map of [undefined, new Map<string, string>(), new Map([['someone-else', 'hq']])]) {
      for (const target of ['todo', 'backlog'] as const) {
        const check = canDropInto(working, target, map);
        expect(check.ok).toBe(false);
        expect(!check.ok && check.reason).toMatch(/Still loading/);
      }
      expect(canDropInto(task({ assignee: agent, status: 'todo' }), 'in_progress', map).ok).toBe(false);
      // Exits the backend allows for any agent stay open.
      for (const target of ['done', 'blocked', 'cancelled'] as const) expect(canDropInto(working, target, map).ok).toBe(true);
    }
    // People's tasks don't depend on the map.
    expect(canDropInto(task({ assignee: human, status: 'in_progress' }), 'todo', undefined).ok).toBe(true);
  });

  it('lets people move their own tasks anywhere', () => {
    expect(canDropInto(task({ assignee: human }), 'in_progress', runtimes).ok).toBe(true);
  });
  it('lets people move tasks of agents that run on other pipelines', () => {
    const legacy = { ...agent, id: 'legacy' };
    expect(canDropInto(task({ assignee: legacy }), 'in_progress', runtimes).ok).toBe(true);
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ id: '1', number: 7, title: 'Morning briefing', assignee: agent }),
    task({ id: '2', title: 'Fix login', assignee: human }),
    task({ id: '3', title: 'Unowned' }),
  ];
  it('filters by assignee, unassigned and text (incl. #number)', () => {
    expect(filterTasks(tasks, { assigneeId: 'a1' }).map((t) => t.id)).toEqual(['1']);
    expect(filterTasks(tasks, { assigneeId: 'unassigned' }).map((t) => t.id)).toEqual(['3']);
    expect(filterTasks(tasks, { q: 'login' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTasks(tasks, { q: '#7' }).map((t) => t.id)).toEqual(['1']);
  });
});

describe('formatting', () => {
  const now = Date.parse('2026-11-02T08:00:00Z');
  it('formats past and future relative times', () => {
    expect(formatRelative('2026-11-02T07:55:00Z', now)).toBe('5m ago');
    expect(formatRelative('2026-11-02T10:00:00Z', now)).toBe('in 2h');
    expect(formatRelative(null, now)).toBe('—');
  });
  it('describes common cron expressions', () => {
    expect(describeCron('0 8 * * *')).toBe('Every day at 08:00');
    expect(describeCron('0 10 * * 1')).toBe('Every Monday at 10:00');
    expect(describeCron('*/5 * * * *')).toBe('*/5 * * * *');
  });
});

describe('mergeTaskLists', () => {
  it('dedupes tasks across lists, keeping the most recently updated copy', () => {
    const stale = task({ id: 'm', status: 'todo', updatedAt: '2026-11-01T00:00:00Z' });
    const fresh = task({ id: 'm', status: 'done', updatedAt: '2026-11-02T00:00:00Z' });
    const merged = mergeTaskLists([stale, task({ id: 'o' })], [fresh]);
    expect(merged).toHaveLength(2);
    expect(merged.find((t) => t.id === 'm')?.status).toBe('done');
  });
});

describe('sortInbox', () => {
  const msg = (id: number, createdAt: string, readAt: string | null) => ({
    id, taskId: null, author: null, recipient: null, kind: 'comment' as const, body: '', readAt, createdAt,
  });
  it('lists unread first, newest first within each group', () => {
    const sorted = sortInbox([
      msg(1, '2026-11-01T00:00:00Z', null),
      msg(2, '2026-11-03T00:00:00Z', '2026-11-03T01:00:00Z'),
      msg(3, '2026-11-02T00:00:00Z', null),
    ]);
    expect(sorted.map((m) => m.id)).toEqual([3, 1, 2]);
  });
});

describe('createRequestSequencer', () => {
  it('only the latest request per task counts; other tasks are independent', () => {
    const seq = createRequestSequencer();
    const first = seq.begin('t1');
    const other = seq.begin('t2');
    const second = seq.begin('t1'); // card dropped again before the first PATCH returned
    expect(seq.isLatest('t1', first)).toBe(false);
    expect(seq.isLatest('t1', second)).toBe(true);
    expect(seq.isLatest('t2', other)).toBe(true);
  });
});

describe('filterTasks HQ-number search', () => {
  it('matches the HQ-123 form the backend accepts', () => {
    expect(filterTasks([task({ id: 'x', number: 123 })], { q: 'HQ-123' }).map((t) => t.id)).toEqual(['x']);
  });
});

describe('createKeyedQueue', () => {
  function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('starts a second write for the same task only after the first settles (even on failure)', async () => {
    const queue = createKeyedQueue();
    const first = deferred<string>();
    const order: string[] = [];
    const a = queue.run('t1', () => { order.push('first:start'); return first.promise; });
    const b = queue.run('t1', async () => { order.push('second:start'); return 'second'; });
    await flush();
    expect(order).toEqual(['first:start']); // second is waiting
    first.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('second');
    expect(order).toEqual(['first:start', 'second:start']);
  });

  it('runs writes for different tasks independently', async () => {
    const queue = createKeyedQueue();
    const slow = deferred<void>();
    const started: string[] = [];
    void queue.run('t1', () => { started.push('t1'); return slow.promise; });
    void queue.run('t2', async () => { started.push('t2'); });
    await flush();
    expect(started).toEqual(['t1', 't2']);
    slow.resolve();
  });
});

describe('normalizeTaskSearch', () => {
  it('strips the # from task numbers and trims; leaves HQ-123 and text', () => {
    expect(normalizeTaskSearch(' #123 ')).toBe('123');
    expect(normalizeTaskSearch('HQ-123')).toBe('HQ-123');
    expect(normalizeTaskSearch('  login bug ')).toBe('login bug');
    expect(normalizeTaskSearch('#abc')).toBe('#abc');
    expect(normalizeTaskSearch('   ')).toBeUndefined();
  });
});

describe('createDropWriter', () => {
  /** A fake server where each PATCH takes `delay` ms and applies the payload to the stored task. */
  function slowServer(initial: HqTask['status'], delay = 20) {
    const state = { status: initial, position: 0 };
    const sent: Array<{ status?: string; position: number }> = [];
    const send = async (_id: string, data: { status?: HqTask['status']; position: number }) => {
      sent.push(data);
      await new Promise((r) => setTimeout(r, delay));
      if (data.status) state.status = data.status;
      state.position = data.position;
      return task({ id: 't1', status: state.status, position: state.position });
    };
    return { state, sent, send };
  }

  it('todo → backlog → blocked → reorder in blocked, with slow PATCHes, ends blocked', async () => {
    const server = slowServer('todo');
    const writer = createDropWriter(server.send);
    // Rapid drops; the board only knows the server said "todo" (optimistic state differs).
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const a = writer.drop('t1', 'todo', 'backlog', 1);
    await tick(); // a's PATCH is now in flight (slow)
    const b = writer.drop('t1', 'todo', 'blocked', 2); // queued behind a, superseded by c → skipped
    await tick();
    const c = writer.drop('t1', 'todo', 'blocked', 3); // a reorder within blocked
    const results = await Promise.all([a.result, b.result, c.result]);

    expect(server.state).toEqual({ status: 'blocked', position: 3 });
    expect(results[1]).toBeNull();
    // The reorder had to carry the status itself because the blocked move was skipped.
    expect(server.sent).toEqual([{ status: 'backlog', position: 1 }, { status: 'blocked', position: 3 }]);
    expect(writer.isLatest('t1', c.req)).toBe(true);
  });

  it('sends only the position for a reorder the server already has in that column', async () => {
    const server = slowServer('todo', 1);
    const writer = createDropWriter(server.send);
    await writer.drop('t1', 'todo', 'todo', 5).result;
    expect(server.sent).toEqual([{ position: 5 }]);
  });

  it('skips writes superseded before they start: only the latest of rapid drops is sent', async () => {
    const server = slowServer('todo', 1);
    const writer = createDropWriter(server.send);
    const drops = [writer.drop('t1', 'todo', 'backlog', 1), writer.drop('t1', 'todo', 'blocked', 2)];
    const results = await Promise.all(drops.map((d) => d.result));
    expect(results[0]).toBeNull();
    expect(server.sent).toEqual([{ status: 'blocked', position: 2 }]);
  });

  it('when an in-flight write fails, the queued next one sends its status explicitly', async () => {
    let fail = true;
    const sent: unknown[] = [];
    const writer = createDropWriter(async (_id, data) => {
      sent.push(data);
      if (fail) {
        fail = false;
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('409');
      }
      return task({ id: 't1', status: data.status ?? 'todo' });
    });
    const first = writer.drop('t1', 'todo', 'backlog', 1);
    first.result.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0)); // first write is in flight; it will fail
    const second = writer.drop('t1', 'todo', 'todo', 2);
    await expect(first.result).rejects.toThrow('409');
    await second.result;
    expect(sent).toEqual([{ status: 'backlog', position: 1 }, { status: 'todo', position: 2 }]);
  });
});

describe('dropIndex', () => {
  const col = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const rect = { top: 100, height: 40 }; // centre at 120
  it('inserts before the over card when the dragged centre is in its top half', () => {
    expect(dropIndex(col, 'c', 110, rect)).toBe(2);
  });
  it('inserts after the over card when the dragged centre is in its bottom half — incl. after the last card', () => {
    expect(dropIndex(col, 'c', 130, rect)).toBe(3);
    expect(dropIndex(col, 'a', 130, rect)).toBe(1);
  });
  it('falls back to before without geometry, and to the end for an unknown card', () => {
    expect(dropIndex(col, 'b', null, null)).toBe(1);
    expect(dropIndex(col, 'zzz', 130, rect)).toBe(3);
  });
  it('uses the movement direction within a column (keyboard drags align centres exactly)', () => {
    // Column without the dragged card: first card 'x' moved down onto 'a' → after 'a'.
    expect(dropIndex(col, 'a', 120, rect, 'down')).toBe(1);
    // Moved up onto 'c' → before 'c', even with the centre in its bottom half.
    expect(dropIndex(col, 'c', 130, rect, 'up')).toBe(2);
  });
});
