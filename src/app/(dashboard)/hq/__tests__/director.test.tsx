import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HqDirectorSummary, HqMember, HqMessage, HqTask, HqTaskDirector } from '@/types';

const h = vi.hoisted(() => ({
  settings: undefined as unknown,
  summary: undefined as unknown,
  summaryError: null as unknown,
  chat: {} as Record<string, unknown>,
  openTask: vi.fn(),
  sendMutate: vi.fn(),
  sending: false,
  updateMutate: vi.fn(),
  resolveMutate: vi.fn(),
  acceptMutate: vi.fn(),
  declineMutate: vi.fn(),
  loadEarlier: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/hq/director',
  useRouter: () => ({ replace: (url: string) => h.openTask(new URL(url, 'http://x').searchParams.get('task')) }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({
  useHqDirector: () => ({ data: h.summary, isLoading: false, error: h.summaryError, refetch: vi.fn() }),
  useHqDirectorChat: () => h.chat,
  useSendDirectorChat: () => ({ mutate: h.sendMutate, isPending: h.sending }),
  useUpdateHqMember: () => ({ mutate: h.updateMutate, isPending: false }),
  useResolveEscalation: () => ({ mutate: h.resolveMutate, isPending: false }),
  useAcceptHqProposal: () => ({ mutate: h.acceptMutate, isPending: false }),
  useDeclineHqProposal: () => ({ mutate: h.declineMutate, isPending: false }),
  useHqSettings: () => ({ data: h.settings }),
}));

const { default: DirectorPage } = await import('../director/page');
const { ProposalCard } = await import('../proposal-card');

const directorRef = { id: 'd1', slug: 'director', name: 'Mara Quill', avatar: '🧭', color: 'violet', kind: 'agent' as const };
const founderRef = { id: 'f1', slug: 'u-1', name: 'Founder', avatar: '🧑', color: 'slate', kind: 'human' as const };
const writerRef = { id: 'a1', slug: 'copy-desk', name: 'Copy Desk', avatar: '✍️', color: 'pink', kind: 'agent' as const };

function member(extra: Partial<HqMember> = {}): HqMember {
  return {
    ...directorRef, userId: null, title: 'Executive Director', description: '', instructions: '', model: 'claude-fable-5-2', tools: [],
    autonomy: 'autonomous', runtime: 'hq', status: 'active', department: 'leadership', maxTurns: 25, lastActiveAt: null, createdAt: '', updatedAt: '',
    stats: { openTasks: 0, runsToday: 0, costTodayCents: 0, currentTask: null, lastRun: null },
    tier: 'act', role: 'director', effort: 'medium', dailyRunLimit: null, ...extra,
  };
}

const noDecision: HqTaskDirector = {
  decision: null, note: null, decidedAt: null, escalatedAt: null, review: null, reviewNote: null, reviewedAt: null, reopenCount: 0,
};

function task(id: string, number: number, title: string, extra: Partial<HqTask> = {}): HqTask {
  return {
    id, number, title, body: '', status: 'proposed', priority: 2, assignee: writerRef, createdBy: writerRef, parentId: null, depth: 0,
    scheduleId: null, result: null, position: 0, attempts: 0, dueAt: null, completedAt: null, createdAt: '2026-11-09T05:00:00Z',
    updatedAt: '2026-11-09T05:00:00Z', messageCount: 0, kind: 'proposal', goalId: null,
    proposal: { why: 'The invented club cup is trending.', plan: 'Post two reels.', expectedImpact: '+5% reach', effort: 's' },
    founderApprovedAt: null, director: noDecision, ...extra,
  };
}

function message(id: number, body: string, from: 'founder' | 'director' | 'system', createdAt = '2026-11-09T06:00:00Z'): HqMessage {
  return {
    id, taskId: 'chat-task', body, createdAt, readAt: null, kind: from === 'system' ? 'system' : 'comment',
    author: from === 'founder' ? founderRef : from === 'director' ? directorRef : null, recipient: null,
  };
}

function summary(extra: Partial<HqDirectorSummary> = {}): HqDirectorSummary {
  return {
    director: member(),
    brief: { taskId: 'b1', taskNumber: 77, result: '## Morning\n\nQuiet night on the **invented league** feed.', completedAt: '2026-11-09T04:30:00Z' },
    needsYou: [
      task('t1', 41, 'Sponsor the invented club cup', {
        director: { ...noDecision, decision: 'escalated', note: 'Spends real money — your call.', escalatedAt: '2026-11-09T05:30:00Z' },
      }),
    ],
    decisions: [
      {
        id: 9, ts: '2026-11-09T05:00:00Z', type: 'director_approved', level: 'info', member: directorRef, taskId: 't2', taskNumber: 42, runId: null,
        message: 'Approved “Weekly recap thread”', data: {},
      },
    ],
    chat: { queued: false, running: false },
    ...extra,
  };
}

beforeEach(() => {
  h.summary = summary();
  h.summaryError = null;
  h.sending = false;
  h.chat = {
    data: { items: [], chat: { queued: false, running: false } },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    messages: [message(1, 'What is on fire today?', 'founder'), message(2, 'Nothing **serious** — one idea needs you.', 'director'), message(3, 'Director switched model', 'system')],
    chat: { queued: false, running: false },
    hasEarlier: false,
    loadEarlier: h.loadEarlier,
    loadingEarlier: false,
    earlierError: null,
  };
  for (const fn of [h.openTask, h.sendMutate, h.updateMutate, h.resolveMutate, h.acceptMutate, h.declineMutate, h.loadEarlier]) fn.mockReset();
  h.sendMutate.mockImplementation((_body: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
});
afterEach(cleanup);

describe('Director page', () => {
  it('renders the header, the chat, needs-you, the brief and the decisions', () => {
    render(<DirectorPage />);
    expect(screen.getByRole('heading', { name: 'Mara Quill' })).toBeTruthy();
    expect(screen.getByText('Fable 5.2 · medium')).toBeTruthy();

    expect(screen.getByText('What is on fire today?')).toBeTruthy();
    // Director replies are rendered as Markdown.
    expect(screen.getByText('serious').tagName).toBe('STRONG');
    expect(screen.getByText('Director switched model')).toBeTruthy();

    expect(screen.getByText('Sponsor the invented club cup')).toBeTruthy();
    expect(screen.getByText('Spends real money — your call.')).toBeTruthy();
    expect(screen.getByText('invented league').tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: /#77/ })).toBeTruthy();
    expect(screen.getByText('Approved “Weekly recap thread”')).toBeTruthy();
  });

  it('shows the Tbilisi time on messages', () => {
    render(<DirectorPage />);
    // 06:00 UTC is 10:00 in Tbilisi.
    expect(screen.getAllByText('9 Nov, 10:00').length).toBeGreaterThan(0);
  });

  it('shows the thinking bubble while the Director is running, and the queue note while waiting', () => {
    h.chat = { ...h.chat, chat: { queued: true, running: true } };
    const { unmount } = render(<DirectorPage />);
    expect(screen.getByText(/Mara Quill is thinking/)).toBeTruthy();
    expect(screen.queryByText(/Waiting for a free slot/)).toBeNull();
    unmount();

    h.chat = { ...h.chat, chat: { queued: true, running: false } };
    render(<DirectorPage />);
    expect(screen.getByText('Waiting for a free slot…')).toBeTruthy();
    expect(screen.queryByText(/is thinking/)).toBeNull();
  });

  it('sends on Enter, keeps Shift+Enter as a newline, and clears the box after sending', () => {
    render(<DirectorPage />);
    const box = screen.getByLabelText('Message Mara Quill') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  Prioritise the derby push  ' } });

    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(h.sendMutate).not.toHaveBeenCalled();

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(h.sendMutate).toHaveBeenCalledTimes(1);
    expect(h.sendMutate.mock.calls[0][0]).toBe('Prioritise the derby push');
    expect(box.value).toBe('');
  });

  it('does not send an empty message, and locks the composer while sending', () => {
    h.sending = true;
    render(<DirectorPage />);
    const box = screen.getByLabelText('Message Mara Quill') as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(h.sendMutate).not.toHaveBeenCalled();
  });

  it('"Load earlier" appears only when there is more history', () => {
    const { unmount } = render(<DirectorPage />);
    expect(screen.queryByRole('button', { name: /load earlier/i })).toBeNull();
    unmount();

    h.chat = { ...h.chat, hasEarlier: true };
    render(<DirectorPage />);
    fireEvent.click(screen.getByRole('button', { name: /load earlier/i }));
    expect(h.loadEarlier).toHaveBeenCalledTimes(1);
  });

  it('marks an escalation as handled', () => {
    h.summary = summary({
      needsYou: [task('t1', 41, 'Check the invented league feed', {
        status: 'done', director: { ...noDecision, decision: 'escalated', note: 'Looks off.', escalatedAt: '2026-11-09T05:30:00Z' },
      })],
    });
    render(<DirectorPage />);
    fireEvent.click(screen.getByRole('button', { name: /handled/i }));
    expect(h.resolveMutate.mock.calls[0][0]).toBe('t1');
  });

  it('lets the founder "Do it" or "Not now" an open idea', () => {
    h.summary = summary({ needsYou: [task('t3', 43, 'Run a quiz night', { director: { ...noDecision, decision: 'escalated', escalatedAt: null } })] });
    render(<DirectorPage />);
    fireEvent.click(screen.getByRole('button', { name: /do it/i }));
    expect(h.acceptMutate.mock.calls[0][0]).toEqual({ id: 't3' });
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(h.declineMutate.mock.calls[0][0]).toEqual({ id: 't3' });
  });

  it('lets the founder overrule: "Do it" on a declined idea, "Not now" on an approved one', () => {
    h.summary = summary({
      needsYou: [
        task('t4', 44, 'Declined idea', { status: 'cancelled', director: { ...noDecision, decision: 'declined', note: 'Off-brand' } }),
        task('t5', 45, 'Approved idea', { status: 'in_progress', director: { ...noDecision, decision: 'approved' } }),
      ],
    });
    render(<DirectorPage />);
    expect(screen.getAllByRole('button', { name: /do it/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /not now/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /handled/i })).toBeNull();
  });

  it('opens the task sheet from a needs-you title', () => {
    render(<DirectorPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sponsor the invented club cup/ }));
    expect(h.openTask).toHaveBeenCalledWith('t1');
  });

  it('offers to switch a paused Director back on', () => {
    h.summary = summary({ director: member({ status: 'paused' }) });
    render(<DirectorPage />);
    expect(screen.getByRole('alert').textContent).toMatch(/The Director is switched off/);
    fireEvent.click(screen.getByRole('button', { name: /switch on/i }));
    expect(h.updateMutate.mock.calls[0][0]).toEqual({ id: 'd1', data: { status: 'active' } });
  });

  it('says so when there is no director yet', () => {
    h.summary = summary({ director: null });
    render(<DirectorPage />);
    expect(screen.getByText('No director yet')).toBeTruthy();
  });
});

describe('ProposalCard › Director note', () => {
  it('shows an amber "sent to you" line with the note for an escalation', () => {
    const idea = task('t6', 46, 'Big sponsorship', { director: { ...noDecision, decision: 'escalated', note: 'Needs a budget call.' } });
    render(<ProposalCard task={idea} />);
    const line = screen.getByText('Sent to you by the Director').parentElement!;
    expect(line.className).toContain('amber');
    expect(line.textContent).toContain('Needs a budget call.');
  });

  it('shows a muted line for his own approval or decline', () => {
    const idea = task('t7', 47, 'Meme week', { director: { ...noDecision, decision: 'declined', note: 'Off-brand.' } });
    render(<ProposalCard task={idea} />);
    expect(screen.getByText('Director declined: Off-brand.').className).toContain('slate-400');
  });

  it('shows nothing when the Director has not decided', () => {
    render(<ProposalCard task={task('t8', 48, 'Plain idea')} />);
    expect(screen.queryByText(/Director/)).toBeNull();
  });
});

describe('why a queued message waits', () => {
  it('says when all agents are paused or the plan must reset', async () => {
    const { render, screen } = await import('@testing-library/react');
    h.summary = { director: member(), brief: null, needsYou: [], decisions: [], chat: { queued: true, running: false } };
    h.chat = { ...h.chat, messages: [], chat: { queued: true, running: false }, data: { items: [], chat: { queued: true, running: false } } };
    h.settings = { paused: true };
    const { unmount } = render(<DirectorPage />);
    expect(screen.getByText(/All agents are paused/)).toBeTruthy();
    unmount();
    h.settings = { paused: false, plan: { state: 'limit', until: '2026-11-10T12:00:00Z', windows: [] } };
    render(<DirectorPage />);
    expect(screen.getByText(/Claude plan to reset/)).toBeTruthy();
    h.settings = undefined;
  });
});

describe("today's plan and right now", () => {
  it('shows plan items to approve (not twice under Needs you) and what agents are doing', async () => {
    const { render, screen, fireEvent } = await import('@testing-library/react');
    const item = task('p1', 60, 'Refresh the invented derby page', { director: { ...noDecision, decision: 'escalated', escalatedAt: '2026-11-10T05:30:00Z' } });
    const running = task('r1', 61, 'Audit invented club crests', { status: 'in_progress' });
    h.summary = summary({ plan: [item], needsYou: [item], runningNow: [running] });
    render(<DirectorPage />);
    expect(screen.getByText('Today’s plan')).toBeTruthy();
    expect(screen.getAllByText('Refresh the invented derby page')).toHaveLength(1);
    expect(screen.getByText('Audit invented club crests')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /do it/i }));
    expect(h.acceptMutate.mock.calls.at(-1)![0]).toEqual({ id: 'p1' });
  });
});

describe('plan items that need the founder again', () => {
  it('stay under Needs you once approved and blocked', async () => {
    const { render, screen } = await import('@testing-library/react');
    const item = task('p2', 70, 'Rework the invented cup page', {
      status: 'blocked', director: { ...noDecision, decision: 'escalated', note: 'Needs a call on scope.', escalatedAt: '2026-11-10T09:00:00Z' },
    });
    h.summary = summary({ plan: [item], needsYou: [item], runningNow: [] });
    render(<DirectorPage />);
    expect(screen.getAllByText('Rework the invented cup page').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Needs a call on scope/)).toBeTruthy();
  });
});
