import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { HqTask } from '@/types';

vi.mock('next/navigation', () => ({ usePathname: () => '/hq', useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
const { TaskRow } = await import('../hq-ui');

afterEach(cleanup);

const task: HqTask = {
  id: 't1', number: 5, title: 'Write briefing', body: '', status: 'needs_approval', priority: 2, assignee: null, createdBy: null,
  parentId: null, depth: 0, scheduleId: null, result: null, position: 0, attempts: 0, dueAt: null, completedAt: null,
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', messageCount: 0,
};

it('opens on Enter/Space pressed on the row itself', () => {
  const onOpen = vi.fn();
  render(<TaskRow task={task} onOpen={onOpen} />);
  const row = screen.getByRole('button', { name: /Write briefing/ });
  fireEvent.keyDown(row, { key: 'Enter' });
  fireEvent.keyDown(row, { key: ' ' });
  expect(onOpen).toHaveBeenCalledTimes(2);
});

it('ignores Space/Enter typed in a portaled dialog rendered from the row', () => {
  const onOpen = vi.fn();
  render(
    <TaskRow
      task={task}
      onOpen={onOpen}
      right={createPortal(<textarea aria-label="Send back note" />, document.body)}
    />
  );
  const textarea = screen.getByLabelText('Send back note');
  fireEvent.keyDown(textarea, { key: ' ' });
  fireEvent.keyDown(textarea, { key: 'Enter' });
  expect(onOpen).not.toHaveBeenCalled();
});
