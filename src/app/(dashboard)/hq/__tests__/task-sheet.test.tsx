import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HqMember, HqTaskDetail } from '@/types';

const h = vi.hoisted(() => ({
  taskId: 'task-a',
  tasks: {} as Record<string, unknown>,
  taskError: null as unknown,
  run: { data: undefined, isLoading: false, error: null, refetch: vi.fn() } as Record<string, unknown>,
  members: [] as unknown[],
  updateMutate: vi.fn(),
  postMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/hq/board',
  useRouter: () => ({ replace: (url: string) => { h.taskId = new URL(url, 'http://x').searchParams.get('task') ?? ''; } }),
  useSearchParams: () => new URLSearchParams(h.taskId ? `task=${h.taskId}` : ''),
}));

const mutation = (mutate = vi.fn()) => ({ mutate, mutateAsync: vi.fn(), isPending: false });
vi.mock('@/hooks', () => ({
  useHqTask: (id: string) => ({ data: h.tasks[id], isLoading: false, error: h.taskError }),
  useHqMembers: () => ({ data: h.members }),
  useHqRun: () => h.run,
  useUpdateHqTask: () => mutation(h.updateMutate),
  usePostHqMessage: () => mutation(h.postMutate),
  useApproveHqTask: () => mutation(),
  useRejectHqTask: () => mutation(),
  useRunHqTask: () => mutation(),
}));

const { RunDetailDialog, TaskSheetHost } = await import('../task-sheet');

const human = { id: 'h1', slug: 'u-1', name: 'Nika', avatar: '🧑', color: 'slate', kind: 'human' as const };
const agentRef = { id: 'a1', slug: 'ops-reporter', name: 'Ops Reporter', avatar: '📊', color: 'blue', kind: 'agent' as const };

function member(ref: typeof human | typeof agentRef, runtime: HqMember['runtime']): HqMember {
  return {
    ...ref, userId: null, title: '', description: '', instructions: '', model: null, tools: [], autonomy: 'autonomous',
    runtime, status: 'active', department: 'leadership', maxTurns: 25, lastActiveAt: null, createdAt: '', updatedAt: '',
    stats: { openTasks: 0, runsToday: 0, costTodayCents: 0, currentTask: null, lastRun: null },
  };
}

function detail(id: string, number: number, title: string, extra: Partial<HqTaskDetail> = {}): HqTaskDetail {
  return {
    id, number, title, body: `${title} body`, status: 'todo', priority: 2, assignee: human, createdBy: human,
    parentId: null, depth: 0, scheduleId: null, result: null, position: 0, attempts: 0, dueAt: null, completedAt: null,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', messageCount: 0,
    messages: [], runs: [], children: [], parent: null, ...extra,
  };
}

beforeEach(() => {
  h.taskId = 'task-a';
  h.taskError = null;
  h.updateMutate.mockReset();
  h.members = [member(human, 'none'), member(agentRef, 'hq')];
  const b = detail('task-b', 2, 'Task B');
  h.tasks = { 'task-a': detail('task-a', 1, 'Task A', { children: [b] }), 'task-b': b };
});
afterEach(cleanup);

it('does not carry an edit draft over when following a link to another task', () => {
  const { rerender } = render(<TaskSheetHost />);
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  fireEvent.change(screen.getByDisplayValue('Task A'), { target: { value: 'Draft for A' } });
  fireEvent.change(screen.getByDisplayValue('Task A body'), { target: { value: 'A draft body' } });

  // Follow the child link to task B (cached), then re-render with the new URL.
  act(() => { fireEvent.click(screen.getByRole('button', { name: /Follow-up/ })); });
  rerender(<TaskSheetHost />);

  expect(screen.queryByDisplayValue('Draft for A')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Task B' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  expect(screen.getByDisplayValue('Task B')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(h.updateMutate).toHaveBeenCalledTimes(1);
  expect(h.updateMutate.mock.calls[0][0]).toEqual({ id: 'task-b', data: { title: 'Task B', body: 'Task B body' } });
});

it('locks the assignee and offers cancel while an HQ agent works on the task', () => {
  h.tasks['task-a'] = detail('task-a', 1, 'Task A', { status: 'in_progress', assignee: agentRef });
  render(<TaskSheetHost />);
  expect(screen.getByText('The agent is working on this')).toBeTruthy();
  const comboboxes = screen.getAllByRole('combobox');
  // Status, Assignee, Priority (+ composer recipient)
  expect((comboboxes[1] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /cancel task/i }));
  expect(h.updateMutate.mock.calls[0][0]).toEqual({ id: 'task-a', data: { status: 'cancelled' } });
});

it('keeps the editor and the unsaved draft when a background refetch fails', () => {
  const { rerender } = render(<TaskSheetHost />);
  fireEvent.click(screen.getByRole('button', { name: /edit/i }));
  fireEvent.change(screen.getByDisplayValue('Task A'), { target: { value: 'Unsaved draft' } });

  h.taskError = new Error('Network down'); // refetch failed, cached data still there
  rerender(<TaskSheetHost />);

  expect(screen.getByDisplayValue('Unsaved draft')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toMatch(/Couldn.t refresh/);
  expect(screen.queryByText('Task not found')).toBeNull();
});

it('shows the not-found state only when there is no data at all', () => {
  h.taskId = 'missing';
  h.taskError = new Error('404');
  render(<TaskSheetHost />);
  expect(screen.getByText('Task not found')).toBeTruthy();
});

it('run details: shows an error with Retry instead of loading forever', () => {
  const refetch = vi.fn();
  h.run = { data: undefined, isLoading: false, error: new Error('Run lookup failed'), refetch };
  render(<RunDetailDialog runId="run-1" onClose={() => {}} />);
  expect(screen.queryByText(/Loading/)).toBeNull();
  expect(screen.getByRole('alert').textContent).toMatch(/Run lookup failed/);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it('run details: still shows loading while the first fetch is in flight', () => {
  h.run = { data: undefined, isLoading: true, error: null, refetch: vi.fn() };
  render(<RunDetailDialog runId="run-1" onClose={() => {}} />);
  expect(screen.getByText(/Loading/)).toBeTruthy();
});

describe('composer', () => {
  const composer = () => screen.getByPlaceholderText(/Write a comment/) as HTMLTextAreaElement;

  beforeEach(() => h.postMutate.mockReset());

  it('clears on send right away and ignores a second ⌘↵ while sending', () => {
    render(<TaskSheetHost />);
    fireEvent.change(composer(), { target: { value: 'Ship it' } });
    fireEvent.keyDown(composer(), { key: 'Enter', metaKey: true });
    fireEvent.keyDown(composer(), { key: 'Enter', metaKey: true });
    expect(h.postMutate).toHaveBeenCalledTimes(1);
    expect(h.postMutate.mock.calls[0][0]).toEqual({ taskId: 'task-a', data: { body: 'Ship it', recipientId: null } });
    expect(composer().value).toBe('');
  });

  it('restores the draft if the send fails and the composer is still empty', () => {
    render(<TaskSheetHost />);
    fireEvent.change(composer(), { target: { value: 'Ship it' } });
    fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true });
    const { onError, onSettled } = h.postMutate.mock.calls[0][1];
    act(() => {
      onError(new Error('offline'));
      onSettled();
    });
    expect(composer().value).toBe('Ship it');
    // and a retry is possible after it settled
    fireEvent.keyDown(composer(), { key: 'Enter', ctrlKey: true });
    expect(h.postMutate).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite something new typed before the failure came back', () => {
    render(<TaskSheetHost />);
    fireEvent.change(composer(), { target: { value: 'First' } });
    fireEvent.keyDown(composer(), { key: 'Enter', metaKey: true });
    fireEvent.change(composer(), { target: { value: 'Second thought' } });
    act(() => h.postMutate.mock.calls[0][1].onError(new Error('offline')));
    expect(composer().value).toBe('Second thought');
  });
});
