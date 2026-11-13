import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HqMember } from '@/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/hq/team',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const mutation = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/hooks', () => ({
  useHqMembers: () => ({ data: members, isLoading: false, error: null, refetch: vi.fn() }),
  useSyncHqHumans: mutation,
  useCreateHqMember: mutation,
  useUpdateHqMember: mutation,
}));

function member(id: string, name: string, kind: HqMember['kind']): HqMember {
  return {
    id, slug: id, name, avatar: '🤖', color: 'slate', kind, userId: null, title: '', description: '', instructions: '',
    model: null, tools: [], autonomy: 'autonomous', runtime: kind === 'agent' ? 'hq' : 'none', status: 'active',
    department: 'growth', maxTurns: 25, lastActiveAt: null, createdAt: '', updatedAt: '',
    stats: { openTasks: 0, runsToday: 0, costTodayCents: 0, currentTask: null, lastRun: null },
  };
}

const members = [member('a1', 'Growth Writer', 'agent'), member('h1', 'Nika', 'human'), member('h2', 'Tazi', 'human')];

const { default: AgentsPage } = await import('../team/page');
const { default: PeoplePage } = await import('../people/page');

// One in-memory storage for every runtime (Node's own localStorage stub has no methods), fresh per test.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true });
});
afterEach(cleanup);

it('lists only agents on the Agents page', () => {
  render(<AgentsPage />);
  expect(screen.getByText('Growth Writer')).toBeTruthy();
  expect(screen.queryByText('Nika')).toBeNull();
  expect(screen.queryByText('Tazi')).toBeNull();
  expect(screen.getByText('1 AI agent, organised by department.')).toBeTruthy();
});

it('lists only people on the People page', () => {
  render(<PeoplePage />);
  expect(screen.getByText('Nika')).toBeTruthy();
  expect(screen.getByText('Tazi')).toBeTruthy();
  expect(screen.queryByText('Growth Writer')).toBeNull();
  expect(screen.getByText('2 people on the team.')).toBeTruthy();
});

it('shows the compact roster by default, with the same Pause action as the profile', () => {
  render(<AgentsPage />);
  expect(screen.getByRole('radio', { name: 'Roster' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByText('Working on')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Pause Growth Writer' })).toBeTruthy();
});

it('switches to the cards view and back', () => {
  render(<AgentsPage />);
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  expect(screen.queryByText('Working on')).toBeNull();
  expect(screen.getByText('Growth Writer')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Roster' }));
  expect(screen.getByText('Working on')).toBeTruthy();
});

it('filters the roster by state and marks agents that run outside HQ', () => {
  const paused = { ...member('a2', 'Paused Bot', 'agent'), status: 'paused' as const };
  const external = { ...member('a3', 'Pipeline Bot', 'agent'), runtime: 'question_agents' as const };
  members.push(paused, external);
  try {
    render(<AgentsPage />);
    expect(screen.getByRole('radio', { name: 'All 3' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'On 2' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Paused 1' })).toBeTruthy();
    expect(screen.getByText('Runs outside HQ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resume Paused Bot' })).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Paused 1' }));
    expect(screen.getByText('Paused Bot')).toBeTruthy();
    expect(screen.queryByText('Growth Writer')).toBeNull();
  } finally {
    members.splice(members.indexOf(paused), 1);
    members.splice(members.indexOf(external), 1);
  }
});

// Another tab writes the shared storage first, then this tab hears about it (as a browser does).
const fromOtherTab = (key: string | null, newValue: string | null) =>
  act(() => {
    if (key === null) window.localStorage.clear();
    else if (newValue === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });

it('follows a view chosen in another tab, even after this tab chose one itself', () => {
  render(<AgentsPage />);
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  expect(screen.getByRole('radio', { name: 'Cards' }).getAttribute('aria-checked')).toBe('true');
  fromOtherTab('hq.agents.view', 'roster');
  expect(screen.getByRole('radio', { name: 'Roster' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByText('Working on')).toBeTruthy();
  // Unrelated keys are ignored; a cleared storage (key null) drops the remembered choice.
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  fromOtherTab('another.key', 'roster');
  expect(screen.getByRole('radio', { name: 'Cards' }).getAttribute('aria-checked')).toBe('true');
  fromOtherTab(null, null);
  expect(screen.getByRole('radio', { name: 'Roster' }).getAttribute('aria-checked')).toBe('true');
});

it('keeps the choice in memory when storage is blocked', () => {
  const blocked = () => {
    throw new Error('blocked');
  };
  const storage = window.localStorage;
  vi.spyOn(storage, 'setItem').mockImplementation(blocked);
  vi.spyOn(storage, 'getItem').mockImplementation(blocked);
  render(<AgentsPage />);
  fireEvent.click(screen.getByRole('radio', { name: 'Cards' }));
  expect(screen.getByRole('radio', { name: 'Cards' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: 'Roster' }));
  expect(screen.getByRole('radio', { name: 'Roster' }).getAttribute('aria-checked')).toBe('true');
});
