'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanSquare, Loader2, MessageSquare, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { hqKeys, useDebouncedValue, useHqMembers, useHqTasks, useUpdateHqTask } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  HQ_BOARD_COLUMNS,
  HQ_STATUS_LABELS,
  canDropInto,
  createDropWriter,
  dropIndex,
  filterTasks,
  formatRelative,
  groupTasksByStatus,
  mergeTaskLists,
  positionForIndex,
} from '@/lib/hq-board';
import type { HqTask, HqTaskStatus } from '@/types';
import { LoadErrorState, MemberAvatar, PageHeader, PriorityBadge, RefreshErrorBanner, errorMessage, useTaskSheet } from '../hq-ui';
import { NewTaskDialog } from '../new-task-dialog';

const COLUMN_ACCENTS: Record<HqTaskStatus, string> = {
  backlog: 'bg-slate-300',
  todo: 'bg-slate-500',
  in_progress: 'bg-blue-500',
  needs_approval: 'bg-amber-500',
  blocked: 'bg-red-500',
  done: 'bg-emerald-500',
  cancelled: 'bg-slate-300',
  proposed: 'bg-violet-400',
};

const OPEN_STATUSES: HqTaskStatus[] = ['backlog', 'todo', 'in_progress', 'needs_approval', 'blocked'];
const OPEN_LIMIT = 500;
const FINISHED_PAGE = 100;
// GET /admin/hq/tasks accepts limit ≤ 500.
const FINISHED_MAX = 500;
const ALL = '__all__';

/** Optimistic placement of a dropped card; `req` ties it to the PATCH that created it. */
type Override = { status: HqTaskStatus; position: number; req: number };

export default function HqBoardPage() {
  const [showCancelled, setShowCancelled] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>(ALL);
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<HqTask | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [finishedLimit, setFinishedLimit] = useState(FINISHED_PAGE);
  const debouncedQ = useDebouncedValue(q.trim(), 300);

  const columns = useMemo<HqTaskStatus[]>(
    () => (showCancelled ? [...HQ_BOARD_COLUMNS, 'cancelled'] : HQ_BOARD_COLUMNS),
    [showCancelled]
  );
  const finishedStatuses = useMemo<HqTaskStatus[]>(() => (showCancelled ? ['done', 'cancelled'] : ['done']), [showCancelled]);

  // Open work and finished work are fetched separately so a long "done" history
  // can never push open tasks out of a capped list.
  // Search and assignee go to the API so filtering happens before the limit.
  // "Unassigned" has no API param and stays a local filter.
  const serverAssigneeId = assigneeId !== ALL && assigneeId !== 'unassigned' ? assigneeId : undefined;
  const serverFilter = { q: debouncedQ || undefined, assigneeId: serverAssigneeId };
  const openQuery = useHqTasks({ status: OPEN_STATUSES, limit: OPEN_LIMIT, ...serverFilter }, { keepPrevious: true });
  const finishedQuery = useHqTasks({ status: finishedStatuses, limit: finishedLimit, ...serverFilter }, { keepPrevious: true });
  const { data: members = [] } = useHqMembers();
  const update = useUpdateHqTask();
  const [writer] = useState(() => createDropWriter((id, data) => update.mutateAsync({ id, data })));
  const queryClient = useQueryClient();
  const { openTask } = useTaskSheet();

  const openTasks = openQuery.data;
  const finishedTasks = finishedQuery.data;
  const isLoading = openQuery.isLoading || finishedQuery.isLoading;
  const loadError = openQuery.error ?? finishedQuery.error;
  // Nothing cached for a list that failed → the board would be misleading; show the error instead.
  const boardUnavailable = (!!openQuery.error && !openTasks) || (!!finishedQuery.error && !finishedTasks);
  const retryLoad = () => {
    void openQuery.refetch();
    void finishedQuery.refetch();
  };
  const finishedMayHaveMore = (finishedTasks?.length ?? 0) >= finishedLimit;

  // Runtimes from every member, archived included; undefined until loaded (or if it
  // failed), and canDropInto then refuses ownership-sensitive moves.
  const { data: everyone } = useHqMembers(true);
  const runtimeById = useMemo(() => (everyone ? new Map(everyone.map((m) => [m.id, m.runtime])) : undefined), [everyone]);

  // Local text filter only while the server results don't reflect the typed
  // query yet (debounce pending or previous results shown as a placeholder);
  // once they do, trust the server's matching.
  const serverCaughtUp = q.trim() === debouncedQ && !openQuery.isPlaceholderData && !finishedQuery.isPlaceholderData;
  const localQ = serverCaughtUp ? undefined : q;

  const serverStatusById = useMemo(
    () => new Map(mergeTaskLists(openTasks ?? [], finishedTasks ?? []).map((t) => [t.id, t.status])),
    [openTasks, finishedTasks]
  );

  const grouped = useMemo(() => {
    const merged = mergeTaskLists(openTasks ?? [], finishedTasks ?? []);
    const withOverrides = merged.map((t) => (overrides[t.id] ? { ...t, status: overrides[t.id].status, position: overrides[t.id].position } : t));
    const filtered = filterTasks(withOverrides, { assigneeId: assigneeId === ALL ? undefined : assigneeId, q: localQ });
    return groupTasksByStatus(filtered, columns);
  }, [openTasks, finishedTasks, overrides, assigneeId, localQ, columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const clearOverride = (taskId: string, req: number) =>
    setOverrides((prev) => {
      // A newer drop of the same card owns the override now — leave it.
      if (prev[taskId]?.req !== req) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });

  /** Put the server's copy into every cached task list so the card doesn't jump back while lists refetch. */
  const applyServerTask = (updated: HqTask) => {
    queryClient.setQueriesData<HqTask[]>({ queryKey: hqKeys.tasks() }, (old) =>
      Array.isArray(old) ? old.map((t) => (t.id === updated.id ? updated : t)) : old
    );
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask((event.active.data.current?.task as HqTask | undefined) ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const task = event.active.data.current?.task as HqTask | undefined;
    const over = event.over;
    if (!task || !over) return;

    const overData = over.data.current as { type: 'column'; status: HqTaskStatus } | { type: 'card'; task: HqTask } | undefined;
    if (!overData) return;
    if (overData.type === 'card' && overData.task.id === task.id) return; // dropped on itself
    const target: HqTaskStatus = overData.type === 'column' ? overData.status : overData.task.status;

    const check = canDropInto(task, target, runtimeById);
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }

    const column = grouped[target].filter((t) => t.id !== task.id);
    // Dropped on a card: before or after it depending on which half the dragged
    // card's centre is in, so a card can also land below the last one.
    const translated = event.active.rect.current.translated;
    let direction: 'up' | 'down' | null = null;
    if (overData.type === 'card' && task.status === target) {
      const full = grouped[target];
      const from = full.findIndex((t) => t.id === task.id);
      const to = full.findIndex((t) => t.id === overData.task.id);
      if (from >= 0 && to >= 0) direction = from < to ? 'down' : 'up';
    }
    const index =
      overData.type === 'card'
        ? dropIndex(column, overData.task.id, translated ? translated.top + translated.height / 2 : null, over.rect, direction)
        : column.length;
    const position = positionForIndex(column, index);

    // Status as the server last reported it (the dragged copy may be optimistic).
    const serverStatus = serverStatusById.get(task.id) ?? task.status;
    const { req, result } = writer.drop(task.id, serverStatus, target, position);
    setOverrides((prev) => ({ ...prev, [task.id]: { status: target, position, req } }));
    try {
      const updated = await result;
      // Skipped (superseded) or a newer drop of this card is pending: its response wins.
      if (!updated || !writer.isLatest(task.id, req)) return;
      applyServerTask(updated);
      if (target !== task.status) toast.success(`#${task.number} → ${HQ_STATUS_LABELS[target]}`);
    } catch (e) {
      if (writer.isLatest(task.id, req)) toast.error(errorMessage(e, 'Could not move the task'));
    } finally {
      // Success: the cache now holds the server copy. Failure: dropping the
      // override rolls the card back to where the server has it.
      clearOverride(task.id, req);
    }
  };

  const agents = members.filter((m) => m.kind === 'agent');
  const people = members.filter((m) => m.kind === 'human');

  return (
    <div className="space-y-5">
      <PageHeader
        icon={<KanbanSquare className="h-6 w-6 text-slate-700" />}
        title="Work"
        description="Every task in the company, by stage. Drag a card to move it; give a task to an agent and it starts on its own."
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="bg-white pl-8" />
        </div>
        <div className="w-56">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectGroup>
                <SelectLabel>Agents</SelectLabel>
                {agents.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.avatar} {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>People</SelectLabel>
                {people.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.avatar} {m.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <Checkbox checked={showCancelled} onCheckedChange={(v) => setShowCancelled(v === true)} />
          Show cancelled
        </label>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        <Button className="ml-auto" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> New task
        </Button>
      </div>

      {boardUnavailable && <LoadErrorState error={loadError} fallback="Could not load the board." onRetry={retryLoad} />}
      {loadError && !boardUnavailable && <RefreshErrorBanner />}

      {!boardUnavailable && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveTask(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-4">
            {columns.map((status) => {
              const tasks = grouped[status];
              const finishedColumn = status === 'done' || status === 'cancelled';
              return (
                <Column key={status} status={status} count={tasks.length} countIsPartial={finishedColumn && finishedMayHaveMore}>
                  {tasks.map((task) => (
                    <DraggableCard key={task.id} task={task} onOpen={openTask} />
                  ))}
                  {finishedColumn && finishedMayHaveMore && finishedLimit < FINISHED_MAX && (
                    <button
                      type="button"
                      className="w-full py-1 text-xs text-slate-500 hover:underline disabled:opacity-50"
                      disabled={finishedQuery.isFetching}
                      onClick={() => setFinishedLimit((n) => Math.min(n + FINISHED_PAGE, FINISHED_MAX))}
                    >
                      {finishedQuery.isFetching ? 'Loading…' : 'Show more'}
                    </button>
                  )}
                  {finishedColumn && finishedMayHaveMore && finishedLimit >= FINISHED_MAX && (
                    <p className="py-1 text-center text-xs text-slate-400">
                      Showing the latest {FINISHED_MAX}. Use search to find older tasks.
                    </p>
                  )}
                </Column>
              );
            })}
          </div>
          <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      <NewTaskDialog open={newOpen} onOpenChange={setNewOpen} members={members} />
    </div>
  );
}

function Column({
  status,
  count,
  countIsPartial,
  children,
}: {
  status: HqTaskStatus;
  count: number;
  countIsPartial?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { type: 'column', status } });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={cn('h-2 w-2 rounded-full', COLUMN_ACCENTS[status])} />
        <span className="text-sm font-bold text-slate-700">{HQ_STATUS_LABELS[status]}</span>
        <span className="text-xs text-slate-400">
          {count}
          {countIsPartial ? '+' : ''}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'min-h-[24rem] flex-1 space-y-2 rounded-xl border border-slate-200 bg-slate-100/60 p-2 transition-colors',
          isOver && 'border-blue-300 bg-blue-50/60'
        )}
      >
        {children}
      </div>
    </div>
  );
}

function DraggableCard({ task, onOpen }: { task: HqTask; onOpen: (id: string) => void }) {
  // Same id for the draggable and the droppable (like useSortable): the
  // keyboard coordinate getter looks up the active card's droppable by the
  // active id to work out where arrow keys should move it.
  const data = { type: 'card' as const, task };
  const drag = useDraggable({ id: task.id, data });
  const drop = useDroppable({ id: task.id, data });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.attributes}
      {...drag.listeners}
      className={cn('touch-none', drag.isDragging && 'opacity-30', drop.isOver && !drag.isDragging && 'border-t-2 border-blue-400 pt-1')}
    >
      <TaskCard task={task} onOpen={onOpen} />
    </div>
  );
}

function TaskCard({ task, onOpen, dragging }: { task: HqTask; onOpen?: (id: string) => void; dragging?: boolean }) {
  return (
    <div
      onClick={() => onOpen?.(task.id)}
      className={cn(
        'cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-xs transition hover:border-slate-300 hover:shadow-sm',
        dragging && 'rotate-1 shadow-lg ring-2 ring-blue-200'
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        {onOpen ? (
          // The draggable wrapper owns Enter/Space (start drag), so keyboard
          // users open the task with this button; it keeps its events from
          // reaching the drag listeners.
          <button
            type="button"
            aria-label={`Open task #${task.number}`}
            className="rounded font-mono text-[11px] text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-500"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(task.id);
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            #{task.number}
          </button>
        ) : (
          <span className="font-mono text-[11px] text-slate-400">#{task.number}</span>
        )}
        <PriorityBadge priority={task.priority} hideNormal />
        {task.status === 'in_progress' && task.assignee?.kind === 'agent' && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-blue-500" />
        )}
      </div>
      <div className="line-clamp-3 text-sm font-semibold leading-snug text-slate-900">{task.title}</div>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <MemberAvatar member={task.assignee} size="xs" />
        <span className="truncate">{task.assignee?.name ?? 'Unassigned'}</span>
        {task.messageCount > 0 && (
          <span className="ml-auto flex items-center gap-0.5">
            <MessageSquare className="h-3 w-3" />
            {task.messageCount}
          </span>
        )}
        <span className={cn(task.messageCount > 0 ? '' : 'ml-auto')}>{formatRelative(task.createdAt)}</span>
      </div>
    </div>
  );
}
