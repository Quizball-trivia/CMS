import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HqTask } from '@/types';

const api = vi.hoisted(() => ({ acceptProposal: vi.fn(), declineProposal: vi.fn() }));
vi.mock('@/lib/hq-api', () => ({ hqApi: api }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { hqKeys, useAcceptHqProposal, useDeclineHqProposal } = await import('@/hooks/use-hq');
const { ProposalCard } = await import('../proposal-card');
const { proposalBody } = await import('@/lib/hq-standup');

const agent = { id: 'a1', slug: 'growth-writer', name: 'Growth Writer', avatar: '📣', color: 'pink', kind: 'agent' as const };
const idea: HqTask = {
  id: 't1', number: 41, title: 'Run a derby-weekend push', body: '', status: 'proposed', priority: 2, assignee: agent, createdBy: agent,
  parentId: null, depth: 0, scheduleId: null, result: null, position: 0, attempts: 0, dueAt: null, completedAt: null,
  createdAt: '2026-11-03T05:00:00Z', updatedAt: '2026-11-03T05:00:00Z', messageCount: 0, kind: 'proposal', goalId: 'g1',
  proposal: { why: 'Derby weekends double our matches.', plan: 'Send 2 pushes.', expectedImpact: '+15% matches Sat', effort: 's' },
};
// As the worker writes it: the body is generated from the proposal.
idea.body = proposalBody(idea.proposal!);

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.acceptProposal.mockReset().mockResolvedValue({ ...idea, status: 'todo' });
  api.declineProposal.mockReset().mockResolvedValue({ ...idea, status: 'cancelled' });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe('proposal mutations', () => {
  it('accepting refreshes the standup, work lists, overview and departments', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useAcceptHqProposal, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', data: { title: 'Edited' } });
    });
    expect(api.acceptProposal).toHaveBeenCalledWith('t1', { title: 'Edited' });
    const keys = invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey));
    for (const key of [hqKeys.standup(), hqKeys.tasks(), hqKeys.overview(), hqKeys.departments()]) expect(keys).toContain(JSON.stringify(key));
  });

  it('declining passes the note and refreshes the standup', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(useDeclineHqProposal, { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 't1', note: 'After the derby' });
    });
    expect(api.declineProposal).toHaveBeenCalledWith('t1', 'After the derby');
    expect(invalidate.mock.calls.map(([f]) => JSON.stringify(f?.queryKey))).toContain(JSON.stringify(hqKeys.standup()));
  });
});

describe('ProposalCard', () => {
  const goal = { id: 'g1', title: '10,000 weekly players' } as never;

  it('shows the idea, its impact/effort/goal, and "Do it" accepts it as-is', async () => {
    render(<ProposalCard task={idea} goal={goal} />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Run a derby-weekend push' })).toBeTruthy();
    expect(screen.getByText('Impact: +15% matches Sat')).toBeTruthy();
    expect(screen.getByText(/Quick win/)).toBeTruthy();
    expect(screen.getByText('10,000 weekly players')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /do it/i }));
    });
    expect(api.acceptProposal).toHaveBeenCalledTimes(1);
    expect(api.acceptProposal.mock.calls[0][0]).toBe('t1');
    expect(api.acceptProposal.mock.calls[0][1]).toBeUndefined(); // as-is: no edits sent
  });

  it('"Not now" asks for an optional note and declines with it', async () => {
    render(<ProposalCard task={idea} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    fireEvent.change(screen.getByPlaceholderText(/after the derby weekend/i), { target: { value: 'Next month' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^not now$/i }).at(-1)!);
    });
    expect(api.declineProposal).toHaveBeenCalledWith('t1', 'Next month');
  });

  it('"Change" sends the edited title and plan with the acceptance', async () => {
    render(<ProposalCard task={idea} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.change(screen.getByLabelText('Idea title'), { target: { value: 'One push only' } });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'Send 1 push on Saturday.' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /do it/i }).at(-1)!);
    });
    expect(api.acceptProposal).toHaveBeenCalledWith('t1', {
      title: 'One push only',
      // The revised executable instructions, in the worker's format, with the new plan.
      body: '**Why:** Derby weekends double our matches.\n\n**Plan:** Send 1 push on Saturday.\n\n**Expected impact:** +15% matches Sat · **Effort:** S',
      proposal: { plan: 'Send 1 push on Saturday.' },
    });
  });
});

describe('ProposalCard › Change when the body was edited by hand', () => {
  it('edits the instructions directly and sends them as the body', async () => {
    const edited = { ...idea, body: 'Send ONE push, Saturday 18:00.' };
    render(<ProposalCard task={edited} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    const box = screen.getByLabelText('Instructions') as HTMLTextAreaElement;
    expect(box.value).toBe('Send ONE push, Saturday 18:00.');
    fireEvent.change(box, { target: { value: 'Send ONE push, Saturday 19:00.' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /do it/i }).at(-1)!);
    });
    expect(api.acceptProposal).toHaveBeenCalledWith('t1', { body: 'Send ONE push, Saturday 19:00.' });
  });

  it('sends only the title when just the title changes', async () => {
    render(<ProposalCard task={idea} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.change(screen.getByLabelText('Idea title'), { target: { value: 'Derby push' } });
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /do it/i }).at(-1)!);
    });
    expect(api.acceptProposal).toHaveBeenCalledWith('t1', { title: 'Derby push' });
  });
});

describe('ProposalCard › Change while the idea updates in the background', () => {
  it('keeps the mode/baseline from when the dialog opened and asks before overwriting', async () => {
    const { rerender } = render(<ProposalCard task={idea} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    expect(screen.getByLabelText('Plan')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Idea title'), { target: { value: 'My title' } });

    // Polling brings a hand-edited body: the dialog must stay in plan mode.
    const changed = { ...idea, body: 'Someone rewrote this.' };
    rerender(<ProposalCard task={changed} />);
    expect(screen.getByLabelText('Plan')).toBeTruthy();
    expect(screen.queryByLabelText('Instructions')).toBeNull();

    // Saving warns instead of silently overwriting.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /do it/i }).at(-1)!);
    });
    expect(api.acceptProposal).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/changed while you were editing/);

    // Save anyway sends only the diff vs the snapshot — never the plan as body.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save anyway/i }));
    });
    expect(api.acceptProposal).toHaveBeenCalledWith('t1', { title: 'My title' });
  });

  it('Reload restarts the form from the latest version', async () => {
    const { rerender } = render(<ProposalCard task={idea} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    rerender(<ProposalCard task={{ ...idea, title: 'Renamed by the agent', body: 'Rewritten instructions' }} />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /do it/i }).at(-1)!);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect((screen.getByLabelText('Idea title') as HTMLInputElement).value).toBe('Renamed by the agent');
    expect((screen.getByLabelText('Instructions') as HTMLTextAreaElement).value).toBe('Rewritten instructions');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
