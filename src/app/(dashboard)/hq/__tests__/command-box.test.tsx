import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqMember } from '@/types';

const h = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks', () => ({ useCreateHqTask: () => ({ mutate: h.mutate, isPending: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { CommandBox } = await import('../command-box');
const { AssigneeSelect, agentOptionLabel } = await import('../task-sheet');

function agent(id: string, name: string, department: HqMember['department'], runtime: HqMember['runtime'] = 'hq'): HqMember {
  return {
    id, slug: id, name, avatar: '🤖', color: 'slate', kind: 'agent', userId: null, title: '', description: '', instructions: '',
    model: null, tools: [], autonomy: 'autonomous', runtime, status: 'active', department, maxTurns: 25,
    lastActiveAt: null, createdAt: '', updatedAt: '',
    stats: { openTasks: 0, runsToday: 0, costTodayCents: 0, currentTask: null, lastRun: null },
  };
}

beforeEach(() => h.mutate.mockReset());
afterEach(cleanup);

it('sends the command as a todo task (title from the first line, full text as body)', () => {
  const onOpenTask = vi.fn();
  render(<CommandBox members={[agent('a1', 'Growth Writer', 'growth')]} onOpenTask={onOpenTask} />);
  fireEvent.change(screen.getByLabelText('Tell your team'), {
    target: { value: 'Draft 3 push notifications\nFor the derby on Saturday.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));

  expect(h.mutate).toHaveBeenCalledTimes(1);
  expect(h.mutate.mock.calls[0][0]).toEqual({
    title: 'Draft 3 push notifications',
    body: 'Draft 3 push notifications\nFor the derby on Saturday.',
    assigneeId: null,
    priority: 2,
    status: 'todo',
  });

  // Cleared right away, before the server answers.
  expect((screen.getByLabelText('Tell your team') as HTMLTextAreaElement).value).toBe('');
  const { onSuccess } = h.mutate.mock.calls[0][1];
  act(() => onSuccess({ id: 't9', number: 9 }));
  expect((screen.getByLabelText('Tell your team') as HTMLTextAreaElement).value).toBe('');
});

const box = () => screen.getByLabelText('Tell your team') as HTMLTextAreaElement;

it('ignores a second submit while the first is pending, and allows one after it settles', () => {
  render(<CommandBox members={[]} onOpenTask={vi.fn()} />);
  fireEvent.change(box(), { target: { value: 'First' } });
  fireEvent.keyDown(box(), { key: 'Enter', metaKey: true });
  fireEvent.change(box(), { target: { value: 'Second' } });
  fireEvent.keyDown(box(), { key: 'Enter', metaKey: true });
  expect(h.mutate).toHaveBeenCalledTimes(1);
  act(() => h.mutate.mock.calls[0][1].onSettled());
  fireEvent.keyDown(box(), { key: 'Enter', metaKey: true });
  expect(h.mutate).toHaveBeenCalledTimes(2);
  expect(h.mutate.mock.calls[1][0].title).toBe('Second');
});

it('restores the command on error only if the box is still empty', () => {
  render(<CommandBox members={[]} onOpenTask={vi.fn()} />);
  fireEvent.change(box(), { target: { value: 'Lost?' } });
  fireEvent.keyDown(box(), { key: 'Enter', metaKey: true });
  act(() => h.mutate.mock.calls[0][1].onError(new Error('offline')));
  expect(box().value).toBe('Lost?');

  cleanup();
  h.mutate.mockReset();
  render(<CommandBox members={[]} onOpenTask={vi.fn()} />);
  fireEvent.change(box(), { target: { value: 'Old' } });
  fireEvent.keyDown(box(), { key: 'Enter', metaKey: true });
  fireEvent.change(box(), { target: { value: 'Typed meanwhile' } });
  act(() => h.mutate.mock.calls[0][1].onError(new Error('offline')));
  expect(box().value).toBe('Typed meanwhile');
});

it('labels own-pipeline agents and warns when one is picked', () => {
  const bugFixer = agent('bf', 'Bug Fixer', 'engineering', 'bug_triage');
  expect(agentOptionLabel(bugFixer)).toContain("(own pipeline — won't run from HQ)");
  expect(agentOptionLabel(agent('qa', 'QA Tester', 'engineering'))).not.toContain('own pipeline');
  render(<AssigneeSelect members={[bugFixer]} value="bf" onChange={vi.fn()} />);
  expect(screen.getByText(/won’t start automatically/)).toBeTruthy();
});

it('sends with ⌘↵ and ignores an empty command', () => {
  render(<CommandBox members={[]} onOpenTask={vi.fn()} />);
  const box = screen.getByLabelText('Tell your team');
  fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
  expect(h.mutate).not.toHaveBeenCalled();
  fireEvent.change(box, { target: { value: 'Check the site' } });
  fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
  expect(h.mutate.mock.calls[0][0]).toMatchObject({ title: 'Check the site', body: '', status: 'todo' });
});
