'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, Columns3, List, Loader2, MessageSquare, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { boardCollision } from '@/lib/hq-board-collision';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { hqKeys, useDebouncedValue, useHqMembers, useHqTasks, useUpdateHqTask } from '@/hooks';
import { cn } from '@/lib/utils';
import {
  HQ_BOARD_COLUMNS,
  HQ_PRIORITY_LABELS,
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
import { EmptyState, HQ_LABEL, HQ_PAGE, LoadErrorState, MemberAvatar, PageHeader, Panel, RefreshErrorBanner, Section, errorMessage, useTaskSheet } from '../hq-ui';
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

// Text colour per priority (index = priority); Normal is never shown on a card.
const PRIORITY_TEXT = ['font-semibold text-red-700', 'font-semibold text-amber-700', 'text-slate-500', 'text-slate-500'];

const OPEN_STATUSES: HqTaskStatus[] = ['backlog', 'todo', 'in_progress', 'needs_approval', 'blocked'];
const OPEN_LIMIT = 500;

const FINISHED_PAGE = 100;
// GET /admin/hq/tasks accepts limit ≤ 500.
const FINISHED_MAX = 500;
const ALL = '__all__';

// ── Board / List view, remembered per browser ──
// Default: List at every width; a saved choice wins. The server snapshot is null so the first
// client render matches the server's; the real value arrives right after hydration.
type View = 'board' | 'list';
const VIEW_KEY = 'hq-work-view';
const viewListeners = new Set<() => void>();
let memoryView: View | null = null;

function getView(): View {
  if (memoryView) return memoryView;
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === 'board' || stored === 'list') return stored;
  } catch {
    // Storage blocked: fall through to the default.
  }
  return 'list';
}

function subscribeView(listener: () => void) {
  viewListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    viewListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function chooseView(view: View) {
  memoryView = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Not persisted; the choice still holds for this page load.
  }
  viewListeners.forEach((l) => l());
}

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
  const view = useSyncExternalStore(subscribeView, getView, () => null);
  // Done is the long tail: a header button until someone opens it.
  const [doneOpen, setDoneOpen] = useState(false);
  // List view: every stage heading folds; open stages start expanded, Done and Cancelled folded.
  const [listOpen, setListOpen] = useState<Partial<Record<HqTaskStatus, boolean>>>({});

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

  // Raw viewport pointer position during a drag (dnd-kit's event.delta includes
  // scroll adjustments, so activator + delta drifts when the board scrolls).
  const pointerY = useRef<number | null>(null);
  const stopPointerTracking = useRef<(() => void) | null>(null);
  useEffect(() => () => stopPointerTracking.current?.(), []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTask((event.active.data.current?.task as HqTask | undefined) ?? null);
    const activator = event.activatorEvent as PointerEvent | MouseEvent | null;
    pointerY.current = activator && 'clientY' in activator ? activator.clientY : null;
    if (pointerY.current !== null) {
      const onMove = (e: PointerEvent) => {
        pointerY.current = e.clientY;
      };
      window.addEventListener('pointermove', onMove);
      stopPointerTracking.current = () => window.removeEventListener('pointermove', onMove);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveTask(null);
    const lastPointerY = pointerY.current;
    stopPointerTracking.current?.();
    stopPointerTracking.current = null;
    pointerY.current = null;
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
    // Before/after is decided by where the POINTER is (not the dragged card's
    // centre, which depends on where the card was grabbed). Keyboard drags have
    // no pointer and use the card's centre.
    const dropY = lastPointerY ?? (translated ? translated.top + translated.height / 2 : null);
    let direction: 'up' | 'down' | null = null;
    if (overData.type === 'card' && task.status === target) {
      const full = grouped[target];
      const from = full.findIndex((t) => t.id === task.id);
      const to = full.findIndex((t) => t.id === overData.task.id);
      if (from >= 0 && to >= 0) direction = from < to ? 'down' : 'up';
    }
    const index =
      overData.type === 'card'
        ? dropIndex(column, overData.task.id, dropY, over.rect, direction)
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

  const isFinished = (status: HqTaskStatus) => status === 'done' || status === 'cancelled';
  // A finished stage can have more than the loaded page even when the current filter shows none.
  const hasTasks = (status: HqTaskStatus) => grouped[status].length > 0 || (isFinished(status) && finishedMayHaveMore);
  const listStages = columns.filter(hasTasks);
  const emptyStages = columns.filter((st) => !hasTasks(st));
  // Every stage is always a lane, left to right; Done goes last and starts as a header button.
  const laneStages = [...columns.filter((st) => st !== 'done'), ...columns.filter((st) => st === 'done')];
  const boardTemplate = laneStages.map((st) => (st === 'done' && !doneOpen ? 'auto' : 'minmax(13.5rem,1fr)')).join(' ');

  const finishedFooter = () =>
    finishedLimit < FINISHED_MAX ? (
      <button
        type="button"
        className="w-full py-1 text-[13px] text-slate-500 hover:underline disabled:opacity-50"
        disabled={finishedQuery.isFetching}
        onClick={() => setFinishedLimit((n) => Math.min(n + FINISHED_PAGE, FINISHED_MAX))}
      >
        {finishedQuery.isFetching ? 'Loading…' : 'Show more'}
      </button>
    ) : (
      <p className="py-1 text-center text-[13px] text-slate-500">Showing the latest {FINISHED_MAX}. Use search to find older tasks.</p>
    );

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Work"
        description="Every task in the company, by stage. On the board, drag a card to move it; give a task to an agent and it starts on its own."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />

      <Section title="Tasks by stage" actions={isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : undefined}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" className="bg-white pl-8" />
          </div>
          <div className="w-full sm:w-56">
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
          <div role="group" aria-label="View" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 sm:ml-auto">
            {([
              ['board', 'Board', Columns3],
              ['list', 'List', List],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => chooseView(value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-3 py-1 text-sm font-medium transition-colors',
                  view === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {boardUnavailable && <LoadErrorState error={loadError} fallback="Could not load the board." onRetry={retryLoad} />}
        {loadError && !boardUnavailable && <RefreshErrorBanner />}

        {!boardUnavailable && view === 'list' && (
          <div className="space-y-4">
            {listStages.map((status) => {
              const open = listOpen[status] ?? !isFinished(status);
              const total = `${grouped[status].length}${isFinished(status) && finishedMayHaveMore ? '+' : ''}`;
              return (
                <Panel key={status} className="overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setListOpen((prev) => ({ ...prev, [status]: !open }))}
                    className={cn(
                      'flex w-full items-center gap-2 bg-slate-50 px-3 py-2 text-left transition-colors hover:bg-slate-100',
                      open && 'border-b border-slate-200'
                    )}
                  >
                    <span className={cn('h-2 w-2 rounded-full', COLUMN_ACCENTS[status])} />
                    <h3 className={cn(HQ_LABEL, 'text-slate-700')}>{HQ_STATUS_LABELS[status]}</h3>
                    <span className="text-[13px] text-slate-500" aria-hidden>
                      ·
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-slate-700">{total}</span>
                    {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
                  </button>
                  {open && (
                    <>
                      <ul className="divide-y divide-slate-100">
                        {grouped[status].map((task) => (
                          <TaskListRow key={task.id} task={task} onOpen={openTask} />
                        ))}
                      </ul>
                      {isFinished(status) && finishedMayHaveMore && <div className="border-t border-slate-100 px-3 py-1">{finishedFooter()}</div>}
                    </>
                  )}
                </Panel>
              );
            })}
            {listStages.length === 0 && !isLoading && <EmptyState>No tasks match.</EmptyState>}
            {emptyStages.length > 0 && listStages.length > 0 && (
              <p className="text-sm text-slate-500">No tasks in {emptyStages.map((st) => HQ_STATUS_LABELS[st]).join(', ')}.</p>
            )}
          </div>
        )}

        {!boardUnavailable && view === 'board' && (
          <DndContext
            sensors={sensors}
            collisionDetection={boardCollision}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => {
              setActiveTask(null);
              stopPointerTracking.current?.();
              stopPointerTracking.current = null;
              pointerY.current = null;
            }}
          >
            <div className="grid items-start gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: boardTemplate }}>
              {laneStages.map((status) => {
                const tasks = grouped[status];
                const partial = isFinished(status) && finishedMayHaveMore;
                if (status === 'done' && !doneOpen) {
                  return <DoneToggle key={status} count={tasks.length} partial={partial} onOpen={() => setDoneOpen(true)} />;
                }
                return (
                  <Column
                    key={status}
                    status={status}
                    count={tasks.length}
                    countIsPartial={partial}
                    onCollapse={status === 'done' ? () => setDoneOpen(false) : undefined}
                  >
                    {tasks.map((task) => (
                      <DraggableCard key={task.id} task={task} onOpen={openTask} />
                    ))}
                    {isFinished(status) && finishedMayHaveMore && finishedFooter()}
                  </Column>
                );
              })}
            </div>
            <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
          </DndContext>
        )}
      </Section>

      <NewTaskDialog open={newOpen} onOpenChange={setNewOpen} members={members} />
    </div>
  );
}

/** The collapsed Done lane: a header button at the end of the lane row. Still a drop target. */
function DoneToggle({ count, partial, onOpen }: { count: number; partial: boolean; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'column:done', data: { type: 'column', status: 'done' as const } });
  const total = `${count}${partial ? '+' : ''}`;
  return (
    <div
      id="lane-done"
      ref={setNodeRef}
      className={cn('rounded-lg border border-slate-200 bg-slate-50 transition-colors', isOver && 'border-blue-300 bg-blue-50/60')}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Show Done (${total})`}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <span className={cn('h-2 w-2 rounded-full', COLUMN_ACCENTS.done)} />
        Done · <span className="tabular-nums">{total}</span>
        <ChevronRight className="size-4 text-slate-500" />
      </button>
    </div>
  );
}

function Column({
  status,
  count,
  countIsPartial,
  onCollapse,
  children,
}: {
  status: HqTaskStatus;
  count: number;
  countIsPartial?: boolean;
  /** Set when the open lane can be folded back into its header button (Done). */
  onCollapse?: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { type: 'column', status } });
  const label = HQ_STATUS_LABELS[status];
  const total = `${count}${countIsPartial ? '+' : ''}`;

  // A long lane scrolls inside; say how many cards are out of sight below.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(0);
  useEffect(() => {
    if (!scroller || !content) return;
    const measure = () => {
      const visibleBottom = scroller.scrollTop + scroller.clientHeight;
      let hidden = 0;
      scroller.querySelectorAll<HTMLElement>('[data-lane-card]').forEach((card) => {
        if (card.offsetTop + card.offsetHeight / 2 > visibleBottom) hidden += 1;
      });
      setMoreBelow(hidden);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(content);
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', measure);
    };
  }, [scroller, content, count]);

  return (
    <div
      id={`lane-${status}`}
      ref={setNodeRef}
      className={cn(
        'flex max-h-[calc(100vh-14rem)] min-w-0 flex-col rounded-lg border border-slate-200 bg-slate-50 transition-colors',
        isOver && 'border-blue-300 bg-blue-50/60'
      )}
    >
      <div className="flex shrink-0 items-center gap-2 rounded-t-lg border-b border-slate-200 bg-inherit px-3 py-2">
        <span className={cn('h-2 w-2 rounded-full', COLUMN_ACCENTS[status])} />
        <h3 className={cn(HQ_LABEL, 'text-slate-700')}>{label}</h3>
        <span className="ml-auto rounded bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">{total}</span>
        {onCollapse && (
          <button type="button" onClick={onCollapse} aria-label={`Hide ${label}`} className="text-[13px] text-slate-500 hover:text-slate-900 hover:underline">
            Hide
          </button>
        )}
      </div>
      <div ref={setScroller} className="relative min-h-0 flex-1 overflow-y-auto p-2">
        <div ref={setContent} className="space-y-2">
          {count === 0 && (
            <div
              className={cn(
                'grid min-h-[5rem] place-items-center rounded-md border border-dashed border-slate-300 px-2 text-center text-[13px] text-slate-500 transition-colors',
                isOver && 'border-blue-400 bg-blue-50 text-blue-700'
              )}
            >
              No tasks — drop here
            </div>
          )}
          {children}
        </div>
      </div>
      {moreBelow > 0 && (
        <button
          type="button"
          onClick={() => scroller?.scrollBy({ top: Math.max(scroller.clientHeight * 0.8, 120), behavior: 'smooth' })}
          className="shrink-0 rounded-b-lg border-t border-slate-200 px-3 py-1.5 text-left text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          {moreBelow} more below ↓
        </button>
      )}
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
      data-lane-card=""
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
        'cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition hover:border-slate-300',
        dragging && 'rotate-1 ring-2 ring-blue-200'
      )}
    >
      <div className="flex items-start gap-2">
        {onOpen ? (
          // The draggable wrapper owns Enter/Space (start drag), so keyboard
          // users open the task with this button; it keeps its events from
          // reaching the drag listeners.
          <button
            type="button"
            aria-label={`Open task #${task.number}`}
            className="shrink-0 rounded font-mono text-[13px] leading-snug tabular-nums text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500"
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
          <span className="shrink-0 font-mono text-[13px] leading-snug tabular-nums text-slate-500">#{task.number}</span>
        )}
        <div className="line-clamp-3 min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-950">{task.title}</div>
        {task.status === 'in_progress' && task.assignee?.kind === 'agent' && (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        )}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[13px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <MemberAvatar member={task.assignee} size="xs" />
          <span className="min-w-0 truncate">{task.assignee?.name ?? 'Unassigned'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {task.priority !== 2 && (
            <>
              <span className={PRIORITY_TEXT[task.priority]}>{HQ_PRIORITY_LABELS[task.priority]}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="tabular-nums">{formatRelative(task.createdAt)}</span>
          {task.messageCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageSquare className="h-3 w-3" />
                {task.messageCount}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One task in the List view: the full title wraps, nothing is truncated. */
function TaskListRow({ task, onOpen }: { task: HqTask; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
      >
        <span className="w-11 shrink-0 pt-px font-mono text-[13px] leading-snug tabular-nums text-slate-500">#{task.number}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-semibold leading-snug text-slate-950">{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-slate-500">
            <MemberAvatar member={task.assignee} size="xs" />
            <span>{task.assignee?.name ?? 'Unassigned'}</span>
            {task.priority !== 2 && (
              <>
                <span aria-hidden>·</span>
                <span className={PRIORITY_TEXT[task.priority]}>{HQ_PRIORITY_LABELS[task.priority]}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatRelative(task.createdAt)}</span>
            {task.messageCount > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageSquare className="h-3 w-3" />
                {task.messageCount}
              </span>
            )}
          </span>
        </span>
        {task.status === 'in_progress' && task.assignee?.kind === 'agent' && (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
        )}
      </button>
    </li>
  );
}
