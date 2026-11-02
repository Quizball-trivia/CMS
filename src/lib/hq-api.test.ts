import { afterEach, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/services', () => ({ apiClient: { get } }));
const { hqApi } = await import('./hq-api');

afterEach(() => get.mockReset());

it('sends #123 to the API as 123, with statuses comma-joined', async () => {
  get.mockResolvedValue({ items: [] });
  await hqApi.listTasks({ q: ' #123 ', status: ['todo', 'blocked'], assigneeId: 'a1', limit: 50 });
  expect(get).toHaveBeenCalledWith('/admin/hq/tasks', { q: '123', status: 'todo,blocked', assigneeId: 'a1', limit: 50 });
});

it('passes HQ-123 and plain text through, and omits empty search', async () => {
  get.mockResolvedValue({ items: [] });
  await hqApi.listTasks({ q: 'HQ-123' });
  expect(get.mock.calls[0][1]).toMatchObject({ q: 'HQ-123' });
  await hqApi.listTasks({ q: '   ' });
  expect(get.mock.calls[1][1].q).toBeUndefined();
});

it('sends task kinds comma-joined and the goal filter', async () => {
  get.mockResolvedValue({ items: [] });
  await hqApi.listTasks({ kind: ['task', 'proposal'], goalId: 'g1' });
  expect(get.mock.calls[0][1]).toMatchObject({ kind: 'task,proposal', goalId: 'g1' });
});

it('lists goals with comma-joined statuses and an optional horizon', async () => {
  get.mockResolvedValue({ items: [] });
  await hqApi.listGoals({ status: ['active', 'achieved'], horizon: 'week' });
  expect(get).toHaveBeenCalledWith('/admin/hq/goals', { status: 'active,achieved', horizon: 'week' });
  await hqApi.listGoals();
  expect(get.mock.calls[1][1]).toEqual({ status: undefined, horizon: undefined });
});
