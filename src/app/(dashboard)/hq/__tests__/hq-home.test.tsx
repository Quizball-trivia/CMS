import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HqBuild, HqBuildStage, HqGoal, HqMember, HqMessage, HqTask, HqTaskDirector } from '@/types';

// Invented-universe fixtures only (this repo is public).

const h = vi.hoisted(() => ({
  director: undefined as unknown,
  builds: [] as unknown[],
  overview: undefined as unknown,
  done: [] as unknown[],
  inbox: [] as unknown[],
  standup: undefined as unknown,
  members: [] as unknown[],
  pulse: undefined as unknown,
  analytics: undefined as unknown,
  // Per hook: extra fields (isLoading / isError) merged over the defaults.
  flags: {} as Record<string, object>,
  refetch: vi.fn(),
  openTask: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/hq',
  useRouter: () => ({ replace: (url: string) => h.openTask(new URL(url, 'http://x').searchParams.get('task')) }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// Like the real HqStatus: with `hideSummary` (HQ's stat tiles carry the counts) the summary is not rendered.
vi.mock('../hq-status', () => ({
  HqStatus: ({ summary, trailing, hideSummary }: { summary?: ReactNode; trailing?: ReactNode; hideSummary?: boolean }) => {
    const shown = hideSummary ? null : summary;
    return shown || trailing ? <p>{shown}{trailing}</p> : null;
  },
}));
vi.mock('../new-task-dialog', () => ({ NewTaskDialog: () => null }));
vi.mock('../goal-ui', () => ({ GoalDialog: () => null }));
const q = (name: string, data: unknown) => ({ data, isLoading: false, isError: false, refetch: h.refetch, ...h.flags[name] });
vi.mock('@/hooks', () => ({
  useHqClock: () => new Date('2026-11-12T10:00:00Z'),
  useHqDirector: () => q('director', h.director),
  useHqMembers: () => q('members', h.members),
  useHqBuilds: () => q('builds', h.builds),
  useHqOverview: () => q('overview', h.overview),
  useHqInbox: () => q('inbox', h.inbox),
  useHqStandup: () => q('standup', h.standup),
  useHqPulse: () => q('pulse', h.pulse),
  useHqAnalytics: () => q('analytics', h.analytics),
  useHqTasks: () => q('done', h.done),
  useRunHqStandup: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { default: HqPage } = await import('../page');

const pageSmith = { id: 'a1', slug: 'page-smith', name: 'Page Smith', avatar: '📄', color: 'teal', kind: 'agent' as const };
const scout = { id: 'a2', slug: 'scout', name: 'Scout', avatar: '🔭', color: 'sky', kind: 'agent' as const };
const noDecision: HqTaskDirector = { decision: null, note: null, decidedAt: null, escalatedAt: null, review: null, reviewNote: null, reviewedAt: null, reopenCount: 0 };

function task(id: string, number: number, title: string, extra: Partial<HqTask> = {}): HqTask {
  return {
    id, number, title, body: '', status: 'todo', priority: 2, assignee: pageSmith, createdBy: pageSmith, parentId: null, depth: 0, scheduleId: null,
    result: null, position: 0, attempts: 0, dueAt: null, completedAt: null, createdAt: '2026-11-10T05:00:00Z', updatedAt: '2026-11-12T09:00:00Z',
    messageCount: 0, kind: 'task', goalId: null, proposal: null, founderApprovedAt: null, director: noDecision, ...extra,
  };
}

const overview = {
  settings: {}, today: { runs: 4, costCents: 0, tasksCreated: 0, tasksDone: 2, failedRuns: 0 }, countsByStatus: {}, needsApproval: [], blocked: [],
  inProgress: [], recentResults: [], runningRuns: [], team: [], latestBriefing: null, inboxUnread: 0, departments: [],
};

beforeEach(() => {
  h.analytics = undefined;
  h.builds = [];
  h.inbox = [];
  h.members = [];
  h.pulse = undefined;
  h.flags = {};
  h.refetch.mockClear();
  h.openTask.mockClear();
  h.overview = overview;
  h.standup = { goals: { northStar: null, week: [], day: [] }, entries: [], waitingOn: [], proposals: [] };
  h.director = {
    director: { id: 'd1', name: 'Mara Quill' },
    brief: { taskId: 'brief-1', taskNumber: 9, result: '# Calm day: two pages shipped\n\nDetails…', completedAt: null },
    needsYou: [task('n1', 21, 'Approve the Moonfield FC page', { status: 'needs_approval', director: { ...noDecision, note: 'Ready; one claim needs your eye.', escalatedAt: '2026-11-12T08:00:00Z' } })],
    plan: [],
    runningNow: [task('r1', 22, 'Draft the Riverbend quiz page', { status: 'in_progress', assignee: scout })],
    doneToday: [],
    decisions: [],
    chat: { queued: false, running: false },
  };
  h.done = [
    task('d1', 30, 'Published quiz page: Moonfield FC', { status: 'done', completedAt: '2026-11-11T12:00:00Z', result: '# New page in 8 languages' }),
    task('d2', 31, 'Published quiz page: Riverbend United', { status: 'done', completedAt: '2026-11-11T13:00:00Z' }),
    task('d3', 32, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-12T02:00:00Z' }),
    task('old', 33, 'Something from last month', { status: 'done', completedAt: '2026-10-01T02:00:00Z' }),
  ];
});
afterEach(() => cleanup());

/** The stat tiles under the headline: "Done today" links to the Completed list, "Working" / "Idle" / "Paused" to the team; each tile's first span is its number. */
const tile = (label: 'Done today' | 'Working' | 'Idle' | 'Paused') => screen.getByText(label).closest('a')!;
const tileNumber = (label: Parameters<typeof tile>[0]) => tile(label).querySelector('span')!.textContent;
const doneLink = () => tile('Done today');
const doneCount = () => tileNumber('Done today');
/** The three team tiles read as the old line did: "2 working · 5 idle · 8 paused". */
const teamCounts = () => `${tileNumber('Working')} working · ${tileNumber('Idle')} idle · ${tileNumber('Paused')} paused`;
/** The spans in a block's title row that carry text (the icon square has none). */
const titleSpans = (heading: HTMLElement) => Array.from(heading.parentElement!.querySelectorAll('span')).filter((s) => !s.querySelector('svg'));

/** An invented agent, so a feed can have several groups (the feed groups finished work by who did it). */
const agentNamed = (name: string) => ({ id: `ag-${name}`, slug: name.toLowerCase(), name, avatar: '🤖', color: 'slate', kind: 'agent' as const });
/** The heading reads "Completed today" while only today is shown. */
const completedSection = () => screen.getByRole('heading', { name: /^Completed( today)?$/ }).closest('section')!;
const ownText = (el: Element) => Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
/** The Completed feed's lines, top to bottom (their own text: a build's "On staging ·" prefix is separate). */
const feedTitles = () => Array.from(completedSection().querySelectorAll('li span.line-clamp-2.font-medium')).map(ownText);

/** A team member as the stat tiles count them. */
const memberAgent = (id: string, status: HqMember['status'], currentTask = false, extra: Partial<HqMember> = {}) =>
  ({ id, name: id, slug: id, kind: 'agent', status, stats: { currentTask: currentTask ? { id: 't', number: 1, title: 'x' } : null }, ...extra }) as unknown as HqMember;
/** The agent as a task's assignee (what the Director's running list carries). */
const assigneeOf = (id: string) => ({ id, slug: id, name: id, avatar: '🤖', color: 'slate', kind: 'agent' as const });
const AGENTS = ['Harbor Scribe', 'Lantern Clerk', 'Quill Runner', 'Meadow Scout', 'Tide Keeper', 'Cobble Analyst'];

it('leads with one sentence, the brief and the single queue, with no separate sub-line', () => {
  h.members = [memberAgent('a2', 'active')]; // Scout, working through the Director's list
  render(<HqPage />);
  const h1 = screen.getByRole('heading', { level: 1 });
  expect(h1.textContent).toBe('1 thing needs you');
  // Nothing sits between the headline and the brief: the day's count leads the status line instead.
  expect(h1.nextElementSibling!.textContent).toMatch(/^Romero’s brief/);
  expect(doneCount()).toBe('1'); // counted from the Completed feed: "Nightly site check" finished today
  expect(teamCounts()).toBe('1 working · 0 idle · 0 paused');
  expect(screen.getByText(/Calm day: two pages shipped/)).toBeTruthy();
  expect(screen.getByText('Approve the Moonfield FC page')).toBeTruthy();
  expect(screen.getByText((_, el) => el?.tagName === 'P' && /^Romero: Ready; one claim needs your eye/.test(el.textContent ?? ''))).toBeTruthy();
});

it('shows who is working on what, and opens the task', () => {
  render(<HqPage />);
  const row = screen.getByText('Draft the Riverbend quiz page').closest('button')!;
  expect(within(row).getByText('Scout')).toBeTruthy();
  fireEvent.click(row);
  expect(h.openTask).toHaveBeenCalledWith('r1');
});

it('lists the last 7 days of finished work as one feed, outcome first, agent and age under it', () => {
  render(<HqPage />);
  // Page Smith's two pages share "Published quiz page: ", so they are one line that reads "Published quiz page ×2"; the line under it is who and when.
  const smith = screen.getByText('Published quiz page ×2').closest('button')!;
  expect(within(smith).getByText(/^Page Smith · /)).toBeTruthy();
  expect(smith.textContent).not.toMatch(/\bitems?\b|\(2\)/);
  // A group opens in place: a chevron says so (Details, then Hide), and each piece is listed.
  expect(within(smith).getByLabelText('Details')).toBeTruthy();
  expect(screen.queryByText(/Something from last month/)).toBeNull();
  fireEvent.click(smith);
  expect(within(smith).getByLabelText('Hide')).toBeTruthy();
  expect(screen.getByText(/New page in 8 languages/)).toBeTruthy();
});

it('keeps every piece of work as its own line, newest first, whoever did it', () => {
  h.done = [
    task('m1', 70, 'Weekly Harbor Cup summary', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: '# Harbor Cup summary is ready for review' }),
    task('m2', 71, 'Published quiz page: Moonfield FC', { status: 'done', assignee: scout, completedAt: '2026-11-11T10:00:00Z' }),
    task('s1', 73, 'Reply to the Lantern League club', { status: 'done', completedAt: '2026-11-11T09:00:00Z', result: '# Sent' }),
    task('m3', 72, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-11T08:00:00Z' }),
  ];
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Weekly Harbor Cup summary', 'Published quiz page: Moonfield FC', 'Reply to the Lantern League club', 'Nightly site check']);
});

it('opens a single plain task straight away: the button says "Open", with nothing to expand', () => {
  h.done = [task('m1', 70, 'Weekly Harbor Cup summary', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z' })];
  render(<HqPage />);
  const line = screen.getByText('Weekly Harbor Cup summary').closest('button')!;
  expect(within(line).getByText('Open')).toBeTruthy();
  expect(within(line).queryByText('Details')).toBeNull();
  expect(line.hasAttribute('aria-expanded')).toBe(false);
  fireEvent.click(line);
  expect(h.openTask).toHaveBeenCalledWith('m1');
  expect(within(completedSection()).queryByText('Hide')).toBeNull();
});

it('adds a quiet result line to a single task only when it says something the title does not', () => {
  const finished = (id: string, title: string, result: string, hour: number) =>
    task(id, 300 + hour, title, { status: 'done', assignee: scout, completedAt: `2026-11-11T${String(hour).padStart(2, '0')}:00:00Z`, result: `# ${result}` });
  h.done = [
    finished('o1', 'Weekly Harbor Cup summary', 'Harbor Cup summary is ready for review', 12), // longer than 25, not the title
    finished('o2', 'Reply to the Lantern League club', 'Sent', 11), // too short
    finished('o3', 'Refresh the Riverbend quiz page', 'Refresh the Riverbend quiz page: done and checked', 10), // starts with the title
    finished('o4', 'Check the Moonfield FC crest', 'All twenty clubs checked.', 9), // exactly 25: still too short
    finished('o5', 'Check the Quill Town crest', 'All twenty clubs rechecked.', 8), // 27: shown
  ];
  render(<HqPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' })); // five lines; four show at first
  const feed = within(completedSection());
  expect(feed.getByText('Harbor Cup summary is ready for review')).toBeTruthy();
  expect(feed.getByText('All twenty clubs rechecked.')).toBeTruthy();
  expect(feed.queryByText('Sent')).toBeNull();
  expect(feed.queryByText(/done and checked/)).toBeNull();
  expect(feed.queryByText('All twenty clubs checked.')).toBeNull();
});

it('does not group by agent: an agent with more work does not outrank a newer line from another', () => {
  h.done = [
    task('o1', 80, 'Weekly Harbor Cup summary', { status: 'done', assignee: pageSmith, completedAt: '2026-11-06T09:00:00Z' }),
    task('o2', 81, 'Nightly site check', { status: 'done', assignee: pageSmith, completedAt: '2026-11-06T08:00:00Z' }),
    task('o3', 82, 'Reply to the Lantern League club', { status: 'done', assignee: pageSmith, completedAt: '2026-11-06T07:00:00Z' }),
    task('o4', 83, 'Check the Moonfield FC crest', { status: 'done', assignee: scout, completedAt: '2026-11-11T09:00:00Z' }),
  ];
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Check the Moonfield FC crest', 'Weekly Harbor Cup summary', 'Nightly site check', 'Reply to the Lantern League club']);
  const metas = within(completedSection()).getAllByText(/^(Page Smith|Scout) · /).map((el) => el.textContent!.split(' · ')[0]);
  expect(metas).toEqual(['Scout', 'Page Smith', 'Page Smith', 'Page Smith']);
});

it('collapses one agent’s items that share a "Label: " into "Label ×N", and lists the names under Details', () => {
  const page = (i: number, name: string, who = pageSmith) => task(`l${i}`, 200 + i, `Published quiz page: ${name}`, { status: 'done', assignee: who, completedAt: `2026-11-11T1${i}:00:00Z` });
  h.done = [page(1, 'Moonfield FC'), page(2, 'Riverbend United'), page(3, 'Harbor Rovers'), page(4, 'Lantern Athletic'), page(5, 'Quill Town', scout)];
  render(<HqPage />);
  // Newest first. The count leads and the names are only in the expansion. The other agent's page with the same label is its own line.
  expect(feedTitles()).toEqual(['Published quiz page: Quill Town', 'Published quiz page ×4']);
  expect(screen.queryByText(/Lantern Athletic, Harbor Rovers/)).toBeNull();
  fireEvent.click(screen.getByText('Published quiz page ×4').closest('button')!);
  for (const name of ['Moonfield FC', 'Riverbend United', 'Harbor Rovers', 'Lantern Athletic']) {
    expect(screen.getByRole('button', { name: `Published quiz page: ${name}` })).toBeTruthy();
  }
});

it('collapses identical titles from one agent into "Title ×N", and keeps another agent’s apart', () => {
  h.done = [
    task('r1', 210, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z' }),
    task('r2', 211, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-11T11:00:00Z' }),
    task('r3', 212, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-11T10:00:00Z' }),
    task('r4', 213, 'Nightly site check', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T09:00:00Z' }),
  ];
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Nightly site check ×3', 'Nightly site check']);
  const metas = within(completedSection()).getAllByText(/^(Page Smith|Scout) · /).map((el) => el.textContent!.split(' · ')[0]);
  expect(metas).toEqual(['Scout', 'Page Smith']);
});

it('collapses identical titles to "Title ×N" even when they contain a "Label: "', () => {
  h.done = [
    task('i1', 400, 'Published quiz page: Moonfield FC', { status: 'done', completedAt: '2026-11-11T12:00:00Z' }),
    task('i2', 401, 'Published quiz page: Moonfield FC', { status: 'done', completedAt: '2026-11-11T11:00:00Z' }),
    task('i3', 402, 'Published quiz page: Moonfield FC', { status: 'done', completedAt: '2026-11-11T10:00:00Z' }),
    task('i4', 403, 'Published quiz page: Moonfield FC', { status: 'done', assignee: scout, completedAt: '2026-11-11T09:00:00Z' }), // another agent: its own line
  ];
  render(<HqPage />);
  // Not "Moonfield FC, Moonfield FC +1 more": the same page three times is one line ×3.
  expect(feedTitles()).toEqual(['Published quiz page: Moonfield FC ×3', 'Published quiz page: Moonfield FC']);
});

it('groups everything said about one build, from any agent, into one line that leads with where it ended and shows only its age', () => {
  const gpt = agentNamed('GPT Advisor');
  h.done = [
    task('b1', 500, 'Decision on build request #4', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T12:00:00Z', result: '# Approved: ship it to staging' }),
    task('b2', 501, 'Code review for build #4', { status: 'done', assignee: gpt, completedAt: '2026-11-11T11:00:00Z' }),
    task('b3', 502, 'Code review for build #4', { status: 'done', assignee: gpt, completedAt: '2026-11-11T10:00:00Z' }), // the same title again
    task('b4', 503, 'Code review for build #5', { status: 'done', assignee: gpt, completedAt: '2026-11-11T09:00:00Z' }), // another build: a line of its own
    task('b5', 504, 'Nightly site check', { status: 'done', assignee: scout, completedAt: '2026-11-11T08:00:00Z' }),
  ];
  render(<HqPage />);
  // The newest piece's result (or its title) says where the build ended up.
  expect(feedTitles()).toEqual(['Build #4: Approved: ship it to staging', 'Code review for build #5', 'Nightly site check']);
  const line = screen.getByText(/^Build #4: /).closest('button')!;
  // The meta is only the age: no agent name.
  expect(within(line).queryByText(/^(Page Smith|GPT Advisor) · /)).toBeNull();
  expect(within(line).getByText(/^(just now|\d+[mhd] ago)$/)).toBeTruthy();
  // The pieces are under Details.
  fireEvent.click(line);
  expect(screen.getByRole('button', { name: 'Decision on build request #4' })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Code review for build #4' })).toHaveLength(2);
});

it('leads a build’s line with its newest piece’s title when that piece has no real result', () => {
  h.done = [
    task('c1', 510, 'Code review for build #6', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: '# Sent' }), // too short to count
    task('c2', 511, 'Decision on build request #6', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
  ];
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Build #6: Code review for build #6']);
});

it('gives a merged build a line with "On staging ·" in front, and opens its card with the PR link under Details', () => {
  const build: HqBuild = {
    id: 'b1', number: 4, title: 'Penalty mode for friends', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '2026-11-10T05:00:00Z', decidedAt: null,
    job: { id: 'j1', number: 4, stage: 'done', note: null, runsUsed: 3, runLimit: 10, startedAt: '2026-11-10T06:00:00Z', finishedAt: '2026-11-11T06:00:00Z', taskId: 'bt1', prs: [{ repo: 'web', url: 'https://github.com/example/web/pull/7' }] },
  };
  h.builds = [build];
  render(<HqPage />);
  const line = screen.getByText('Penalty mode for friends').closest('button')!;
  expect(within(line).getByText('On staging ·')).toBeTruthy();
  expect(within(line).getByText(/^Builder · /)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /web PR/ })).toBeNull(); // folded: no card yet
  fireEvent.click(line);
  expect(screen.getByRole('link', { name: /web PR/ }).getAttribute('href')).toBe('https://github.com/example/web/pull/7');
});

it('puts merged builds in the same newest-first feed as everything else', () => {
  const merged = (n: number, at: string): HqBuild => ({
    id: `mb${n}`, number: n, title: `Comet feature ${n}`, kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '', decidedAt: null,
    job: { id: `mj${n}`, number: n, stage: 'done', note: null, runsUsed: 1, runLimit: 10, startedAt: null, finishedAt: at, taskId: `mt${n}` },
  });
  h.builds = [merged(1, '2026-11-11T12:30:00Z')];
  render(<HqPage />);
  // Between the task finished on the 12th and the two pages finished on the 11th (the later of them at 13:00).
  expect(feedTitles()).toEqual(['Nightly site check', 'Published quiz page ×2', 'Comet feature 1']);
});

it('without a Director, the queue falls back to approvals, blocked work and ideas', () => {
  h.director = { director: null, brief: null, needsYou: [], decisions: [], chat: { queued: false, running: false } };
  h.overview = { ...overview, needsApproval: [task('a', 40, 'Approve the Harbor Cup recap', { status: 'needs_approval' })], blocked: [task('b', 41, 'Fix the Lantern League table', { status: 'blocked' })] };
  render(<HqPage />);
  expect(screen.getByText('Approve the Harbor Cup recap')).toBeTruthy();
  expect(screen.getByText('Fix the Lantern League table')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/2 things need you/);
});

// ── Loading, failure and what counts as shipped ──

it('does not claim nothing is waiting while the queue is still loading', () => {
  h.director = undefined;
  h.overview = undefined;
  h.standup = undefined;
  h.flags = { director: { isLoading: true }, builds: { isLoading: true }, inbox: { isLoading: true } };
  render(<HqPage />);
  expect(screen.queryByText('Nothing is waiting on you.')).toBeNull();
  expect(screen.queryByText('No agent is working right now.')).toBeNull();
  expect(screen.getAllByRole('status', { name: 'Loading' }).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Checking what needs you/);
});

it('a failed load says so and offers Retry instead of an empty list', () => {
  h.director = undefined;
  h.flags = { director: { isError: true } };
  render(<HqPage />);
  expect(screen.queryByText('Nothing is waiting on you.')).toBeNull();
  const retry = screen.getAllByRole('button', { name: 'Retry' });
  expect(retry.length).toBeGreaterThan(0);
  fireEvent.click(retry[0]);
  expect(h.refetch).toHaveBeenCalled();
});

function buildAt(stage: HqBuildStage, taskId: string | null, finishedAt: string | null = '2026-11-11T06:00:00Z'): HqBuild {
  return {
    id: `b-${stage}`, number: 7, title: 'Penalty mode for friends', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '2026-11-10T05:00:00Z', decidedAt: null,
    job: { id: 'j7', number: 7, stage, note: null, runsUsed: 3, runLimit: 10, startedAt: '2026-11-10T06:00:00Z', finishedAt, taskId, prs: [{ repo: 'web', url: 'https://github.com/example/web/pull/9' }] },
  };
}

it('never lists a build with only a draft PR as shipped; it waits under Needs you', () => {
  const waiting = task('n2', 23, 'Build #7: Penalty mode for friends', { status: 'needs_approval' });
  h.director = { ...(h.director as object), needsYou: [waiting] };
  h.builds = [buildAt('published', 'n2'), buildAt('ready_to_publish', 'n3')];
  render(<HqPage />);
  expect(screen.queryByText('On staging')).toBeNull();
  // Not as a Shipped card (that would be the bare build title), only as the Needs-you row, with its PR action.
  expect(screen.queryByText('Penalty mode for friends')).toBeNull();
  expect(screen.getByText('Build #7: Penalty mode for friends')).toBeTruthy();
  expect(screen.getByText('PR to merge')).toBeTruthy();
  expect(screen.getByText('Review PR')).toBeTruthy();
});

it('calls a build that is ready but has no PR yet "Your review", not "PR to merge"', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('n2', 23, 'Build #7: Penalty mode for friends', { status: 'needs_approval' }),
      task('n3', 24, 'Build #8: Comet timer', { status: 'needs_approval' }),
    ],
  };
  h.builds = [buildAt('ready_to_publish', 'n2'), { ...buildAt('published', 'n3'), id: 'b-pub', number: 8, title: 'Comet timer' }];
  render(<HqPage />);
  const label = (title: string) => (screen.getByText(title).closest('[role="button"]') as HTMLElement).querySelector('span.uppercase')!.textContent;
  expect(label('Build #7: Penalty mode for friends')).toBe('Your review');
  expect(label('Build #8: Comet timer')).toBe('PR to merge');
  expect(screen.queryByText('Build to review')).toBeNull();
});

it('moves the agent reviews of a build still waiting on the founder out of Completed and onto its Needs-you row', () => {
  h.director = { ...(h.director as object), needsYou: [task('n2', 23, 'Build #7: Penalty mode for friends', { status: 'needs_approval' })] };
  h.builds = [buildAt('ready_to_publish', 'n2')];
  h.done = [
    task('r7', 907, 'Code review for build #7', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: 'VERDICT: SHIP' }),
    task('d7', 957, 'Decision on build request #7', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
    task('w1', 958, 'Weekly Harbor Cup summary', { status: 'done', assignee: scout, completedAt: '2026-11-11T10:00:00Z' }),
  ];
  render(<HqPage />);
  const row = screen.getByText('Build #7: Penalty mode for friends').closest('[role="button"]') as HTMLElement;
  expect(row.querySelector('span.uppercase')!.textContent).toBe('Your review'); // the badge stays the plain label
  expect(within(row).getByText('Agent check: review passed')).toBeTruthy(); // the verdict is its own line, without "agent "
  expect(feedTitles().some((t) => /build #7/i.test(t))).toBe(false);
  expect(feedTitles()).toContain('Weekly Harbor Cup summary');
  expect(screen.getByText('· 1 item in the last 7 days')).toBeTruthy();
});

it('shows a single task’s result only when it is short and plain; a long agent explanation stays in the task', () => {
  h.done = [
    task('o1', 801, 'Recheck the Moonball table', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: 'Verdict: (c) can’t tell without a browser. My fetch tool strips scripts, so I could not find the table’s API path.' }),
    task('o2', 802, 'Refresh the Comet Cup page', { status: 'done', assignee: scout, completedAt: '2026-11-11T11:00:00Z', result: 'Updated the standings and two player cards.' }),
  ];
  render(<HqPage />);
  expect(screen.queryByText(/fetch tool strips scripts/)).toBeNull();
  expect(screen.getByText('Updated the standings and two player cards.')).toBeTruthy();
});

it('compares game plays by calendar date and shows no earlier week when its days are not all recorded', () => {
  // Ten days only, ending yesterday: the last seven are this week; three days of the week before is not a week.
  const yesterday = Date.now() - 86_400_000;
  h.analytics = {
    modeLabels: { moonball: 'Moonball' },
    modesByDay: Array.from({ length: 10 }, (_, d) => ({ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi' }).format(new Date(yesterday - (9 - d) * 86_400_000)), moonball: 2 })),
    modes: [],
  };
  render(<HqPage />);
  const row = screen.getByText('Moonball').closest('tr')!;
  expect(row.children[1].textContent).toBe('14');
  expect(row.lastElementChild!.textContent).toBe('—');
});

it('says when the last 7 days of game plays are only partly recorded', () => {
  h.analytics = {
    modeLabels: { moonball: 'Moonball' },
    // Three days ending a week ago: the "last 7 days" window is mostly missing.
    modesByDay: [3, 4, 5].map((d) => ({ date: `2026-11-0${d}`, moonball: 2 })),
    modes: [],
  };
  render(<HqPage />);
  expect(screen.getByText(/of the last 7 days are recorded: the totals are partial/)).toBeTruthy();
});

it('keeps the way back to the whole week when the today filter is on and the week is empty', () => {
  h.members = [memberAgent('a', 'active')];
  h.done = [];
  render(<HqPage />);
  fireEvent.click(doneLink());
  expect(screen.getByText('Nothing finished yet today.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show the whole week' }));
  expect(screen.getByText('Nothing finished in the last 7 days.')).toBeTruthy();
});

it('puts "ask now" for missing reports in the open reports, not inside the toggle', () => {
  h.standup = { goals: { northStar: null, week: [], day: [] }, entries: [], waitingOn: [scout, pageSmith] as never, proposals: [] };
  render(<HqPage />);
  const summary = screen.getByText(/Today’s reports/).closest('summary')!;
  expect(within(summary).queryByRole('button')).toBeNull();
  expect(within(summary).getByText('2 not reported')).toBeTruthy();
  const ask = screen.getByRole('button', { name: 'Ask the 2 to report now' });
  expect(ask.closest('details')).toBe(summary.closest('details'));
});

it('matches a review to its build by the job number and a decision by the request number, reading the last verdict', () => {
  // Request #17 runs as Builder job #7; another request is #7.
  h.director = { ...(h.director as object), needsYou: [task('n2', 23, 'Build #17: Comet timer', { status: 'needs_approval' })] };
  const b = buildAt('ready_to_publish', 'n2');
  h.builds = [{ ...b, id: 'b17', number: 17, title: 'Comet timer' }];
  h.done = [
    task('r7', 907, 'Code review for build #7', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: '# Review\nAn early draft said VERDICT: FIX.\nAfter the second pass:\nVERDICT: SHIP' }),
    task('d17', 957, 'Decision on build request #17', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
  ];
  render(<HqPage />);
  const row = screen.getByText('Build #17: Comet timer').closest('[role="button"]') as HTMLElement;
  expect(row.querySelector('span.uppercase')!.textContent).toBe('Your review');
  expect(within(row).getByText('Agent check: review passed')).toBeTruthy();
  expect(feedTitles().some((t) => /build/i.test(t))).toBe(false);
});

it('does not call an unanswered (offline, paused) load "nothing needs you"', () => {
  h.director = undefined;
  h.flags = { director: { isLoading: false, isPending: true } };
  render(<HqPage />);
  expect(screen.queryByText('Nothing needs you')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Checking what needs you…');
});

it('keeps request #7 and the review of job #7 (which belongs to request #17) on separate lines', () => {
  const b = buildAt('done', null);
  h.builds = [{ ...b, id: 'b17', number: 17, title: 'Comet timer', job: { ...b.job!, number: 7 } }];
  h.done = [
    task('r7', 907, 'Code review for build #7', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: 'VERDICT: SHIP' }),
    task('d7', 957, 'Decision on build request #7', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
  ];
  render(<HqPage />);
  // Two different builds: not folded into one "Build #7" line.
  expect(feedTitles()).toEqual(expect.arrayContaining(['Code review for build #7', 'Decision on build request #7']));
  expect(feedTitles().some((t) => t.startsWith('Build #7:'))).toBe(false);
});

it('shows "60+" done today when every loaded completion is from today and the fetch hit its limit', () => {
  const now = new Date().toISOString();
  h.done = Array.from({ length: 60 }, (_, i) => task(`t${i}`, 300 + i, `Nightly check ${i}`, { status: 'done', assignee: scout, completedAt: now }));
  render(<HqPage />);
  expect(doneCount()).toBe('60+');
});

/** `n` finished tasks spread over the six invented agents, newest first by index, all inside the 7-day window. */
function finishedBy(n: number, agents = AGENTS.length): HqTask[] {
  return Array.from({ length: n }, (_, i) =>
    task(`x${i}`, 100 + i, `Weekly summary ${i}`, { status: 'done', assignee: agentNamed(AGENTS[i % agents]), completedAt: `2026-11-11T${String(23 - (i % 20)).padStart(2, '0')}:30:00Z` })
  );
}

it('shows the first four lines of the feed, then "Show more"', () => {
  h.done = finishedBy(6); // six distinct pieces of work; the first four finished last
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Weekly summary 0', 'Weekly summary 1', 'Weekly summary 2', 'Weekly summary 3']);
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(feedTitles()).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(feedTitles()).toHaveLength(4);
});

it('has no fold button when the feed is four lines or fewer', () => {
  render(<HqPage />);
  expect(screen.queryByRole('button', { name: /Show more|Show less/ })).toBeNull();
});

it('counts merged builds among the lines that fold', () => {
  const merged = (n: number): HqBuild => ({
    id: `mb${n}`, number: n, title: `Comet feature ${n}`, kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '', decidedAt: null,
    job: { id: `mj${n}`, number: n, stage: 'done', note: null, runsUsed: 1, runLimit: 10, startedAt: null, finishedAt: `2026-11-11T0${n}:00:00Z`, taskId: `mt${n}` },
  });
  h.builds = [merged(1), merged(2), merged(3)];
  h.done = finishedBy(3); // three lines of tasks, newest first, then the three builds
  render(<HqPage />);
  expect(feedTitles()).toHaveLength(4);
  expect(screen.getByText('Comet feature 3')).toBeTruthy(); // the newest build still fits
  expect(screen.queryByText('Comet feature 2')).toBeNull(); // the others are folded
  expect(screen.queryByText('Comet feature 1')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByText('Comet feature 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.queryByText('Comet feature 1')).toBeNull();
});

it('shows every loaded item after "Show more", with no cap and no "Showing X of Y" line while the fetch is under its limit', () => {
  h.done = finishedBy(25);
  render(<HqPage />);
  expect(feedTitles()).toHaveLength(4); // folded: the feed stays short
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(feedTitles()).toHaveLength(25); // all of them, not the first 20
  expect(screen.queryByText(/Showing the latest/)).toBeNull();
  expect(screen.queryByRole('link', { name: 'View all in Work' })).toBeNull();
});

it('says the list may be longer, with a way to see them all, once the feed is expanded and the done fetch hit its limit', () => {
  h.done = finishedBy(60); // as many as the page asks for: there may be more
  render(<HqPage />);
  expect(screen.queryByText(/Showing the latest/)).toBeNull(); // folded: the feed stays short
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(feedTitles()).toHaveLength(60);
  expect(screen.getByText(/Showing the latest 60/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View all in Work' }).getAttribute('href')).toBe('/hq/board');
});

it('says how much finished, in the title row, without a count pill', () => {
  render(<HqPage />);
  // Three of the four tasks are inside the 7 days.
  const title = screen.getByRole('heading', { name: 'Completed' });
  expect(within(title.parentElement!).getByText('· 3 items in the last 7 days')).toBeTruthy();
  expect(titleSpans(title)).toHaveLength(1);
});

// ── The Needs-you rows and the headline ──

const unreadFrom = (n: number): HqMessage[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, taskId: null, author: scout, recipient: null, kind: 'comment' as const, body: `Weekly numbers are in (${i + 1}).`, readAt: null, createdAt: '2026-11-12T08:00:00Z' }));

it('says "N items and M messages need you" when both are waiting, and counts the messages line in the list too', () => {
  h.inbox = unreadFrom(1);
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('1 item and 1 message need you');
  expect(screen.getByText(/1 message from the team/)).toBeTruthy();
});

it('says "N messages for you" when only messages are waiting', () => {
  h.director = { ...(h.director as object), needsYou: [] };
  h.inbox = unreadFrom(2);
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('2 messages for you');
});

it('says "N things need you" for tasks only, and the Needs your attention title carries the count', () => {
  h.director = {
    ...(h.director as object),
    needsYou: Array.from({ length: 2 }, (_, i) => task(`t${i}`, 40 + i, `Approve recap ${i + 1}`, { status: 'needs_approval' })),
  };
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('2 things need you');
  const bar = screen.getByRole('heading', { name: 'Needs your attention' }).parentElement!;
  expect(titleSpans(screen.getByRole('heading', { name: 'Needs your attention' }))).toHaveLength(1);
  expect(within(bar).getByText('2')).toBeTruthy();
});

it('counts the unread messages in the Needs your attention pill too, one for each message', () => {
  h.inbox = unreadFrom(2);
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('1 item and 2 messages need you');
  expect(within(screen.getByRole('heading', { name: 'Needs your attention' }).parentElement!).getByText('3')).toBeTruthy(); // 1 item + 2 messages
});

it('shows no count pill on Needs your attention when nothing is waiting, and the card is not amber', () => {
  h.director = { ...(h.director as object), needsYou: [] };
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nothing needs you');
  const title = screen.getByRole('heading', { name: 'Needs your attention' });
  expect(titleSpans(title)).toHaveLength(0);
  expect(title.closest('section')!.className).not.toContain('amber');
  expect(screen.getByText('Nothing is waiting on you.')).toBeTruthy();
});

it('shows who and how long, the ask in full when it is short, and opens the task from anywhere on the row', () => {
  const ask = 'Ready for review: the Moonfield page is in 8 languages and one claim needs your eye before it goes live.';
  h.director = {
    ...(h.director as object),
    needsYou: [task('n1', 21, 'Approve the Moonfield FC page', { status: 'needs_approval', director: { ...noDecision, note: ask, escalatedAt: '2026-10-01T08:00:00Z' } })],
  };
  render(<HqPage />);
  const row = screen.getByText('Approve the Moonfield FC page').closest('[role="button"]') as HTMLElement;
  const reason = within(row).getByText('Needs input'); // a guess at the kind of need is not shown as a fact
  expect(reason.className).toContain('rounded'); // a badge, not running text
  expect(reason.className).toContain('uppercase');
  // The badge leads the row, with who-and-how-long beside it; the title comes after.
  expect(within(row).getByText(/^Page Smith · \d+d ago$/)).toBeTruthy(); // owner and age; no #number, no "waiting"
  expect(row.textContent).not.toMatch(/#21|waiting/);
  expect(reason.compareDocumentPosition(screen.getByText('Approve the Moonfield FC page')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(reason.compareDocumentPosition(within(row).getByText(/^Page Smith · /)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(row).getByText('Open')).toBeTruthy(); // a plain decision just opens the task; releases, blocks and plans say more
  // On a phone the action sits under the text; from sm up it goes to the right.
  expect(row.className).toContain('flex-col');
  expect(row.className).toContain('sm:flex-row');
  // A short ask is shown whole, not clamped; there is no expander to open instead.
  const line = within(row).getByText((_, el) => el?.tagName === 'P' && el.textContent === `Romero: ${ask}`);
  expect(line.className).not.toMatch(/line-clamp/);
  expect(row.querySelectorAll('button')).toHaveLength(0);
  fireEvent.click(line);
  expect(h.openTask).toHaveBeenCalledWith('n1');
});

it('asks with the task’s own first line, without a leading "Goal:" or "Why:"', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('g1', 81, 'Refresh the Riverbend quiz page', { status: 'needs_approval', body: '## Spec\n\nGoal: bring the squad list up to date.' }),
      task('w1', 82, 'Add the Harbor Cup recap', { status: 'needs_approval', body: 'Why: the final was played yesterday.' }),
    ],
  };
  render(<HqPage />);
  const para = (text: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === text);
  expect(para('Asks: bring the squad list up to date.')).toBeTruthy();
  expect(para('Asks: the final was played yesterday.')).toBeTruthy();
});

it('shows the first three things that need you, then "Show all N"', () => {
  h.director = {
    ...(h.director as object),
    needsYou: Array.from({ length: 5 }, (_, i) => task(`n${i}`, 60 + i, `Approve recap ${i + 1}`, { status: 'needs_approval' })),
  };
  render(<HqPage />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('5 things need you');
  expect(screen.getAllByText(/^Approve recap \d$/)).toHaveLength(3);
  expect(screen.queryByText('Approve recap 4')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show all 5' }));
  expect(screen.getAllByText(/^Approve recap \d$/)).toHaveLength(5);
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(screen.getAllByText(/^Approve recap \d$/)).toHaveLength(3);
});

it('has no "Show all" for three things or fewer', () => {
  h.director = {
    ...(h.director as object),
    needsYou: Array.from({ length: 3 }, (_, i) => task(`n${i}`, 60 + i, `Approve recap ${i + 1}`, { status: 'needs_approval' })),
  };
  render(<HqPage />);
  expect(screen.getAllByText(/^Approve recap \d$/)).toHaveLength(3);
  expect(screen.queryByRole('button', { name: /^Show all \d+$/ })).toBeNull();
});

it('says "Unblock" only when the blocked row shows what is in the way, else just "Open"', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('b1', 50, 'Fix the Lantern League table', { status: 'blocked', result: 'Could not do this: the league table source is offline.' }), // a short blocker is shown
      task('b2', 51, 'Fix the Riverbend table', { status: 'blocked', result: 'Could not do this: ' + 'the source keeps returning an empty page. '.repeat(6) }), // too long to show: left to the task
      task('b3', 52, 'Fix the Harbor Cup table', { status: 'blocked' }), // nothing to show at all
      task('b4', 53, 'Fix the Quill Town table', { status: 'blocked', result: 'Need from you: send the new source URL.' }), // a stated request
    ],
  };
  render(<HqPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Show all \d+$/ }));
  // The action is always a visible button-like span at the end of the row, never an icon alone or screen-reader-only text.
  const actionEl = (title: string) => (screen.getByText(title).closest('[role="button"]') as HTMLElement).querySelector('span.inline-flex')!;
  const action = (title: string) => actionEl(title).textContent!.trim();
  expect(actionEl('Fix the Lantern League table').className).not.toContain('sr-only');
  expect(actionEl('Fix the Lantern League table').className).toContain('border');
  expect(action('Fix the Lantern League table')).toBe('Unblock');
  expect(action('Fix the Riverbend table')).toBe('Open');
  expect(action('Fix the Harbor Cup table')).toBe('Open');
  expect(action('Fix the Quill Town table')).toBe('Unblock'); // the request is the row's own sentence; the title is under it
});

it('says under a blocked row whether the reason is in the task ("The reason is in the task.") or missing ("No reason recorded.")', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('b1', 50, 'Fix the Lantern League table', { status: 'blocked', result: 'Could not do this: the league table source is offline.' }), // a short blocker is shown
      task('b2', 51, 'Fix the Riverbend table', { status: 'blocked', result: 'Could not do this: ' + 'the source keeps returning an empty page. '.repeat(6) }), // too long to show
      task('b3', 52, 'Fix the Harbor Cup table', { status: 'blocked' }), // nothing to show at all
    ],
  };
  render(<HqPage />);
  const row = (title: string) => screen.getByText(title).closest('[role="button"]') as HTMLElement;
  const note = /reason is in the task|No reason recorded/;
  // A reason short enough to show is shown, so the row says nothing more about it.
  expect(within(row('Fix the Lantern League table')).queryByText(note)).toBeNull();
  expect(within(row('Fix the Lantern League table')).getByText('Blocked by:')).toBeTruthy();
  for (const t of ['Fix the Lantern League table', 'Fix the Riverbend table', 'Fix the Harbor Cup table']) {
    expect(within(row(t)).getByText(/^Page Smith · [^·]+$/)).toBeTruthy(); // owner · age stay alone, beside the badge
    expect(row(t).querySelector('span.uppercase')!.textContent).toBe('Blocked'); // the badge never carries the note
  }
  // A reason too long for the row is in the task; only a row with none says so.
  expect(within(row('Fix the Riverbend table')).getByText('The reason is in the task.')).toBeTruthy();
  expect(within(row('Fix the Riverbend table')).queryByText('No reason recorded.')).toBeNull();
  expect(within(row('Fix the Harbor Cup table')).getByText('No reason recorded.')).toBeTruthy();
  expect(within(row('Fix the Harbor Cup table')).queryByText('The reason is in the task.')).toBeNull();
});

it('says nothing about a reason on a row that is not blocked', () => {
  render(<HqPage />);
  expect(screen.queryByText(/reason is in the task|No reason recorded/)).toBeNull();
});

it('names the other actions by reason: a PR to review, a plan to review', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [task('c3', 63, 'Build #7: Penalty mode for friends', { status: 'needs_approval' })],
    plan: [task('k5', 55, 'Plan the week’s quiz pages', { status: 'proposed', proposal: { plan_day: '2026-11-12' } as unknown as HqTask['proposal'] })],
  };
  h.builds = [buildAt('published', 'c3')];
  render(<HqPage />);
  expect(screen.getByText('Review PR')).toBeTruthy();
  expect(screen.getByText('Review plan')).toBeTruthy();
});

it('shows no spec under a release row: a build to review is the decision, its spec is background', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('c3', 63, 'Build #7: Penalty mode for friends', {
        status: 'needs_approval',
        body: 'Goal: let friends play a penalty shoot-out.',
        director: { ...noDecision, note: 'Ready for review.' },
      }),
      task('c4', 64, 'Approve the Moonfield FC page', { status: 'needs_approval', body: 'Goal: add the page in eight languages.' }),
    ],
  };
  h.builds = [buildAt('published', 'c3')];
  render(<HqPage />);
  const release = screen.getByText('Build #7: Penalty mode for friends').closest('[role="button"]') as HTMLElement;
  expect(within(release).queryByText(/Asks|Romero|let friends play/)).toBeNull(); // nothing under the title
  expect(within(release).getByText('PR to merge')).toBeTruthy();
  // An ordinary decision keeps its description.
  const plain = screen.getByText('Approve the Moonfield FC page').closest('[role="button"]') as HTMLElement;
  expect(within(plain).getByText(/add the page in eight languages/)).toBeTruthy();
});

// ── Brief, agents and yesterday ──

it('shows the brief as one underlined line with its time and first prose line when the heading is only a label', () => {
  h.director = {
    ...(h.director as object),
    brief: { taskId: 'brief-1', taskNumber: 9, result: '# Done today\n\nTwo quiz pages went out and one is waiting.', completedAt: '2026-11-12T05:30:00Z' },
  };
  render(<HqPage />);
  const brief = screen.getByText(/^Romero’s brief, .*09:30: Two quiz pages went out and one is waiting\.$/).closest('button')!; // Tbilisi time (UTC+4)
  expect(brief.textContent).not.toMatch(/Nov|2026/); // the weekday and the time, no date
  expect(brief.textContent).not.toMatch(/\bRead\b/); // no separate "Read": the whole line is the link
  expect(brief.className).toContain('underline');
  // Straight under the headline, first in the row it shares with today's reports.
  expect(screen.getByRole('heading', { level: 1 }).nextElementSibling!.firstElementChild).toBe(brief);
  fireEvent.click(brief);
  expect(h.openTask).toHaveBeenCalledWith('brief-1');
});

it('shows a brief with a real headline as "Romero’s brief, <time>: <headline>"', () => {
  h.director = {
    ...(h.director as object),
    brief: { taskId: 'brief-1', taskNumber: 9, result: '# Calm day: two pages shipped\n\nDetails…', completedAt: '2026-11-12T05:30:00Z' },
  };
  render(<HqPage />);
  const brief = screen.getByText(/^Romero’s brief/).closest('button')!;
  expect(brief.tagName).toBe('BUTTON');
  expect(brief.textContent).toMatch(/^Romero’s brief, .*09:30: Calm day: two pages shipped$/);
});

it('links a brief that is only a short label without an excerpt', () => {
  h.director = {
    ...(h.director as object),
    brief: { taskId: 'brief-1', taskNumber: 9, result: '# Done today', completedAt: '2026-11-12T05:30:00Z' },
  };
  render(<HqPage />);
  const brief = screen.getByText(/^Romero’s brief/).closest('button')!;
  expect(brief.tagName).toBe('BUTTON');
  expect(brief.textContent).toMatch(/^Romero’s brief, .*09:30$/); // the time, and nothing after it
  expect(brief.textContent).not.toContain('Done today');
  fireEvent.click(brief);
  expect(h.openTask).toHaveBeenCalledWith('brief-1');
});

it('says just "Romero’s brief" when the brief has no time', () => {
  h.director = { ...(h.director as object), brief: { taskId: 'brief-1', taskNumber: 9, result: '# Done today', completedAt: null } };
  render(<HqPage />);
  // The row also holds today's reports, so the brief is read from its own button.
  expect(screen.getByText(/^Romero’s brief/).closest('button')!.textContent).toBe('Romero’s brief');
});

it('puts the day’s count first in the stat tiles as a link to Completed, then the agent counts as links to the team', () => {
  h.members = [memberAgent('a', 'active'), memberAgent('a2', 'active'), memberAgent('b', 'active'), memberAgent('d', 'paused'), memberAgent('e', 'archived')];
  // The count is taken from the Completed feed: three items finished today (Tbilisi).
  h.done = [
    task('t1', 1, 'Nightly site check', { status: 'done', completedAt: '2026-11-12T02:00:00Z' }),
    task('t2', 2, 'Reply to the Lantern League club', { status: 'done', completedAt: '2026-11-12T03:00:00Z' }),
    task('t3', 3, 'Weekly Harbor Cup summary', { status: 'done', completedAt: '2026-11-12T04:00:00Z' }),
    task('t4', 4, 'Check the Moonfield FC crest', { status: 'done', completedAt: '2026-11-11T12:00:00Z' }), // yesterday: not counted
  ];
  h.director = {
    ...(h.director as object),
    // 'a2' is Scout, 'a' a second agent: both are on running tasks.
    runningNow: [task('r1', 22, 'Draft the Riverbend quiz page', { status: 'in_progress', assignee: scout }), task('r2', 23, 'Draft the Harbor Cup recap', { status: 'in_progress', assignee: assigneeOf('a') })],
  };
  render(<HqPage />);
  expect(doneLink().getAttribute('href')).toBe('#completed');
  expect(doneCount()).toBe('3');
  for (const label of ['Working', 'Idle', 'Paused'] as const) expect(tile(label).getAttribute('href')).toBe('/hq/team');
  expect(teamCounts()).toBe('2 working · 1 idle · 1 paused'); // "idle", not "available"
  expect(screen.queryByText(/available/)).toBeNull();
  // The same row: the count first, then the agents.
  const order = ['Done today', 'Working', 'Idle', 'Paused'] as const;
  for (let i = 1; i < order.length; i++) expect(tile(order[i - 1]).compareDocumentPosition(tile(order[i])) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.getElementById('completed')).not.toBeNull(); // the anchor has something to land on
});

it('counts one working agent, and none, as plain numbers on the Working tile ("1", "0")', () => {
  h.members = [memberAgent('a', 'active'), memberAgent('b', 'active')];
  h.director = { ...(h.director as object), runningNow: [task('r1', 22, 'Draft the Riverbend quiz page', { status: 'in_progress', assignee: assigneeOf('a') })] };
  const { unmount } = render(<HqPage />);
  expect(teamCounts()).toBe('1 working · 1 idle · 0 paused');
  unmount();
  h.members = [memberAgent('a', 'active'), memberAgent('b', 'paused')];
  h.director = { ...(h.director as object), runningNow: [] };
  render(<HqPage />);
  expect(teamCounts()).toBe('0 working · 1 idle · 1 paused');
  expect(tile('Working').getAttribute('href')).toBe('/hq/team');
});

it('counts working from the running tasks only: a member’s own current-task stat no longer makes it "working"', () => {
  h.members = [memberAgent('a', 'active', true), memberAgent('b', 'active')]; // 'a' has a current task on its card...
  h.director = { ...(h.director as object), runningNow: [] }; // ...but nothing is running
  render(<HqPage />);
  expect(teamCounts()).toBe('0 working · 2 idle · 0 paused');
});

it('counts a person’s running task as work, but not as a working agent', () => {
  const person = { id: 'h1', slug: 'nika', name: 'Nika', avatar: '🙂', color: 'rose', kind: 'human' as const };
  h.members = [memberAgent('a', 'active')];
  h.director = { ...(h.director as object), runningNow: [task('r3', 24, 'Check the Lantern League table', { status: 'in_progress', assignee: person })] };
  render(<HqPage />);
  expect(teamCounts()).toBe('0 working · 1 idle · 0 paused');
});

it('counts the Builder once, from its member, while any build runs', () => {
  const builder = memberAgent('bld', 'active', false, { slug: 'builder' } as Partial<HqMember>);
  const other = memberAgent('a', 'active');
  const running = (n: number) => ({ ...buildAt('building', `bt${n}`, null), id: `rb${n}`, number: n, title: `Moonball feature ${n}` });
  h.members = [builder, other];
  h.director = { ...(h.director as object), runningNow: [] };
  h.builds = [running(1), running(2)]; // two builds running: still one Builder
  const { unmount } = render(<HqPage />);
  expect(teamCounts()).toBe('1 working · 1 idle · 0 paused');
  expect(within(screen.getByRole('heading', { name: 'Working now' }).parentElement!).getByText('1')).toBeTruthy(); // the same count beside Working now
  unmount();
  // No build running: the Builder is just idle.
  h.builds = [];
  render(<HqPage />);
  expect(teamCounts()).toBe('0 working · 2 idle · 0 paused');
});

it('recognises the Builder by its runtime too, and counts it once when its own task is running as well', () => {
  const builder = memberAgent('bld', 'active', false, { runtime: 'hq_code' } as unknown as Partial<HqMember>);
  h.members = [builder, memberAgent('a', 'active')];
  h.builds = [{ ...buildAt('building', 'bt1', null), title: 'Moonball feature 1' }];
  // The Builder's own task is in the running list too (the page shows it once, as the build).
  h.director = { ...(h.director as object), runningNow: [task('bt1', 70, 'Build #7: Moonball feature 1', { status: 'in_progress', assignee: assigneeOf('bld') })] };
  render(<HqPage />);
  expect(teamCounts()).toBe('1 working · 1 idle · 0 paused');
});

it('shows yesterday with the change as a signed number, and no players in the header', () => {
  h.pulse = {
    yesterday: { activePlayers: 12, newUsers: 3, matches: 9 },
    series: [
      { activePlayers: 0, newUsers: 0, matches: 0 },
      { activePlayers: 9, newUsers: 1, matches: 4 },
      { activePlayers: 12, newUsers: 3, matches: 9 },
      { activePlayers: 0, newUsers: 0, matches: 0 },
    ].map((p, i) => ({ date: `2026-11-0${i + 8}`, ...p })),
    feedback: { avgRating7d: 4.2 },
  };
  // series.at(-3) is the day before yesterday: 9 players.
  render(<HqPage />);
  // One header row for the block, inside the numbers panel: what the numbers are, and what the change is against.
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByText('vs prior day')).toBeTruthy();
  expect(screen.getByText('Active players')).toBeTruthy();
  expect(screen.getByText('+3')).toBeTruthy();
  expect(screen.getByText('+2')).toBeTruthy();
  expect(screen.getByText('+5')).toBeTruthy();
  expect(screen.getAllByText(/vs prior day/)).toHaveLength(1); // only the header says what the change is against, not each row
  expect(screen.queryByText(/Rating/)).toBeNull(); // three rows only
  // The players are in the numbers panel, not in the header.
  expect(screen.getByRole('heading', { level: 1 }).closest('header')!.textContent).not.toMatch(/players yesterday/);
});

it('shows a fall as a minus and no change as "same"', () => {
  h.pulse = {
    yesterday: { activePlayers: 12, newUsers: 3, matches: 9 },
    series: [
      { activePlayers: 0, newUsers: 0, matches: 0 },
      { activePlayers: 15, newUsers: 3, matches: 4 },
      { activePlayers: 12, newUsers: 3, matches: 9 },
      { activePlayers: 0, newUsers: 0, matches: 0 },
    ].map((p, i) => ({ date: `2026-11-0${i + 8}`, ...p })),
    feedback: { avgRating7d: null },
  };
  render(<HqPage />);
  expect(screen.getByText(/^[-−]3$/)).toBeTruthy(); // 12 against 15
  expect(screen.getByText('same')).toBeTruthy(); // 3 new players, as the day before
  expect(screen.getByText('+5')).toBeTruthy();
});

it('keeps Working now when nothing is running or queued: it says so with the idle and paused counts, and the stat tiles agree', () => {
  h.director = { ...(h.director as object), runningNow: [] };
  h.members = [memberAgent('a', 'active'), memberAgent('b', 'paused')];
  render(<HqPage />);
  const card = screen.getByRole('heading', { name: 'Working now' }).closest('section')!;
  expect(within(card).getByText('No agent is working right now. 1 idle, 1 paused.')).toBeTruthy();
  expect(screen.queryByText(/nobody right now/)).toBeNull();
  expect(teamCounts()).toBe('0 working · 1 idle · 1 paused');
  expect(doneLink().getAttribute('href')).toBe('#completed');
});

it('says only the idle line in Working now when idle without a team loaded, with no counts', () => {
  h.director = { ...(h.director as object), runningNow: [] };
  render(<HqPage />);
  expect(screen.getByRole('heading', { name: 'Working now' })).toBeTruthy();
  expect(screen.getByText('No agent is working right now.')).toBeTruthy(); // no members loaded: no idle/paused counts to give
});

it('links Working now to the team page from its title row', () => {
  render(<HqPage />);
  const bar = screen.getByRole('heading', { name: 'Working now' }).parentElement!;
  expect(within(bar).getByRole('link', { name: /^Team/ }).getAttribute('href')).toBe('/hq/team');
});

it('when idle, shows the idle line in Working now and keeps the reports folded', () => {
  h.director = { ...(h.director as object), runningNow: [] };
  h.standup = {
    goals: { northStar: null, week: [], day: [] }, waitingOn: [], proposals: [],
    entries: [{ member: scout, working: null, standup: { headline: 'Drafting Riverbend', yesterday: '', today: '', blockers: '', createdAt: '2026-11-12T06:00:00Z' } }],
  };
  render(<HqPage />);
  expect(screen.getByRole('heading', { name: 'Working now' })).toBeTruthy();
  expect(screen.getByText('No agent is working right now.')).toBeTruthy();
  const details = screen.getByText(/Today’s reports \(1\)/).closest('details')!;
  expect(details.open).toBe(false);
});

it('still shows Working now for a queued build, even when no agent is running', () => {
  h.director = { ...(h.director as object), runningNow: [] };
  h.builds = [buildAt('queued', 'bt8', null)];
  render(<HqPage />);
  expect(screen.getByRole('heading', { name: 'Working now' })).toBeTruthy();
  expect(screen.queryByText(/No agent is working right now/)).toBeNull(); // queued work is not "nothing"
  // Queued builds are one folded line ("1 build queued"); the build is listed inside it.
  expect(screen.getByText('1 build queued').closest('details')!.open).toBe(false);
  expect(screen.getByText('build #7 Penalty mode for friends')).toBeTruthy();
});

it('counts only agents as working, each once, and the Builder once for any number of builds', () => {
  const person = { id: 'h1', slug: 'nika', name: 'Nika', avatar: '🙂', color: 'rose', kind: 'human' as const };
  h.director = {
    ...(h.director as object),
    runningNow: [
      task('r1', 22, 'Draft the Riverbend quiz page', { status: 'in_progress', assignee: scout }),
      task('r2', 23, 'Draft the Harbor Cup recap', { status: 'in_progress', assignee: scout }), // the same agent again
      task('r3', 24, 'Check the Lantern League table', { status: 'in_progress', assignee: person }), // a person's task is work, not an agent
      task('r4', 25, 'Triage the inbox', { status: 'in_progress', assignee: null }),
    ],
  };
  render(<HqPage />);
  // The count beside "Working now" is agents, not tasks: Scout once, and neither the person nor the unassigned task.
  expect(within(screen.getByRole('heading', { name: 'Working now' }).parentElement!).getByText('1')).toBeTruthy();
  // The four tasks are all listed, though only one agent is behind them.
  expect(screen.getByText('Check the Lantern League table')).toBeTruthy();
});

it('counts the Builder as one agent however many builds it runs', () => {
  const run = (n: number, taskId: string) => ({ ...buildAt('building', taskId, null), id: `b${n}`, number: n, title: `Moonball feature ${n}` });
  h.director = { ...(h.director as object), runningNow: [] };
  h.builds = [run(1, 'bt1'), run(2, 'bt2')];
  render(<HqPage />);
  expect(within(screen.getByRole('heading', { name: 'Working now' }).parentElement!).getByText('1')).toBeTruthy();
});

it('a merged build shows its game baseline (named on the request) and its before/after screenshots', () => {
  h.analytics = {
    modeLabels: { moonball: 'Moonball', 'daily:moonball': 'Moonball (daily)', other: 'Other' },
    // Two days before it reached staging (4 and 6 plays of exactly this game), then the day itself (not counted).
    modesByDay: [
      { date: '2026-11-09', moonball: 4, 'daily:moonball': 2, other: 9 },
      { date: '2026-11-10', moonball: 6, 'daily:moonball': 0, other: 9 },
      { date: '2026-11-11', moonball: 50, other: 9 },
    ],
    modes: [],
  };
  const build: HqBuild = {
    id: 'b1', number: 4, title: 'Two-minute turn timer', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '2026-11-10T05:00:00Z', decidedAt: null, game: 'moonball',
    job: {
      id: 'j1', number: 4, stage: 'done', note: null, runsUsed: 3, runLimit: 10, startedAt: '2026-11-10T06:00:00Z', finishedAt: '2026-11-11T06:00:00Z', taskId: 'bt1',
      screenshots: { at: null, before: [{ size: 'phone', url: 'https://example.test/b.png' }], after: [{ size: 'phone', url: 'https://example.test/a.png' }] },
    },
  };
  h.builds = [build];
  render(<HqPage />);
  expect(screen.queryByText('Moonball · plays per day')).toBeNull(); // the card opens from the build's line
  fireEvent.click(screen.getByText('Two-minute turn timer').closest('button')!);
  expect(screen.getByText('Moonball · plays per day')).toBeTruthy();
  expect(screen.getByText('5.0')).toBeTruthy(); // (4 + 6) / 2 days; daily:moonball is another game id
  expect(screen.getByText(/after: once it is live/)).toBeTruthy();
  expect(screen.getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['https://example.test/b.png', 'https://example.test/a.png']);
});

it('shows why blocked work is blocked, from the agent’s own result', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [task('b1', 50, 'Fix the Lantern League table', { status: 'blocked', result: 'Could not do this: the league table source is offline.\n\nMore detail.' })],
  };
  render(<HqPage />);
  expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Blocked by: the league table source is offline.')).toBeTruthy();
});

it('counts a running build once, even though its Builder task is also running, and lists queued builds apart', () => {
  const job = (n: number, stage: HqBuildStage, taskId: string) => ({ id: `j${n}`, number: n, stage, note: null, runsUsed: 1, runLimit: 10, startedAt: '2026-11-12T09:00:00Z', finishedAt: null, taskId });
  h.builds = [
    { id: 'b1', number: 7, title: 'Moonball timer', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null, directorNote: null, createdAt: '', decidedAt: null, job: job(7, 'building', 'bt7') },
    { id: 'b2', number: 8, title: 'Harbor Cup recap', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null, directorNote: null, createdAt: '', decidedAt: null, job: job(8, 'queued', 'bt8') },
  ];
  h.director = { ...(h.director as object), runningNow: [task('bt7', 70, 'Build #7: Moonball timer', { status: 'in_progress' })] };
  render(<HqPage />);
  expect(within(screen.getByRole('heading', { name: 'Working now' }).parentElement!).getByText('1')).toBeTruthy();
  expect(screen.queryByText('Build #7: Moonball timer')).toBeNull();
  expect(screen.getByText('1 build queued')).toBeTruthy();
  expect(screen.getByText('build #8 Harbor Cup recap')).toBeTruthy();
});

it('shows no baseline for a game the daily series folds into Other (rather than a false 0)', () => {
  h.analytics = { modeLabels: { moonball: 'Moonball', comet_cup: 'Comet Cup', other: 'Other' }, modesByDay: [{ date: '2026-11-10', moonball: 9, other: 4 }], modes: [] };
  h.builds = [{
    id: 'b1', number: 4, title: 'Comet Cup bracket', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
    directorNote: null, createdAt: '', decidedAt: null, game: 'comet_cup',
    job: { id: 'j1', number: 4, stage: 'done', note: null, runsUsed: 1, runLimit: 10, startedAt: null, finishedAt: '2026-11-11T06:00:00Z', taskId: 'bt1' },
  }];
  render(<HqPage />);
  fireEvent.click(screen.getByText('Comet Cup bracket').closest('button')!);
  expect(screen.getByText('Comet Cup bracket', { selector: 'button' })).toBeTruthy(); // its card is open
  expect(screen.queryByText(/plays per day/)).toBeNull();
});

it('on an older backend (no job.taskId) still shows a build and its Builder task once', () => {
  h.builds = [{
    id: 'b1', number: 7, title: 'Moonball timer', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null, directorNote: null,
    createdAt: '', decidedAt: null, job: { id: 'j7', number: 7, stage: 'building', note: null, runsUsed: 1, runLimit: 10, startedAt: '2026-11-12T09:00:00Z', finishedAt: null },
  }];
  h.director = { ...(h.director as object), runningNow: [task('t7', 77, 'Build #7: Moonball timer', { status: 'in_progress' })] };
  render(<HqPage />);
  expect(within(screen.getByRole('heading', { name: 'Working now' }).parentElement!).getByText('1')).toBeTruthy();
  expect(screen.queryByText('Build #7: Moonball timer')).toBeNull();
});

it('keeps every agent report, busy or not, with its full text on demand', () => {
  h.standup = {
    goals: { northStar: null, week: [], day: [] }, waitingOn: [], proposals: [],
    entries: [{ member: scout, working: null, standup: { headline: 'Drafting Riverbend', yesterday: 'Checked the Harbor Cup table.', today: 'Draft the Riverbend page.', blockers: 'Waiting for the club crest.', createdAt: '2026-11-12T06:00:00Z' } }],
  };
  render(<HqPage />);
  expect(screen.getByText(/blocked: Waiting for the club crest/)).toBeTruthy();
  fireEvent.click(screen.getByText(/Drafting Riverbend/).closest('button')!);
  expect(screen.getByText('Checked the Harbor Cup table.')).toBeTruthy();
  expect(screen.getByText('Draft the Riverbend page.')).toBeTruthy();
});


it('keeps the reports inside a folded <details>, with a count and a blocker flag', () => {
  h.standup = {
    goals: { northStar: null, week: [], day: [] }, waitingOn: [], proposals: [],
    entries: [{ member: scout, working: null, standup: { headline: 'Drafting Riverbend', yesterday: '', today: '', blockers: 'Waiting for the club crest.', createdAt: '2026-11-12T06:00:00Z' } }],
  };
  render(<HqPage />);
  const summary = screen.getByText(/Today’s reports \(1\)/).closest('summary')!;
  const details = summary.closest('details')!;
  expect(details.open).toBe(false);
  expect(within(summary).getByText(/a blocker/)).toBeTruthy();
  // The report itself is inside, not on the page proper.
  expect(within(details).getByText(/Drafting Riverbend/)).toBeTruthy();
  fireEvent.click(summary);
  expect(details.open).toBe(true);
});

it('keeps today’s reports in the header, reachable even when nothing is reported', () => {
  render(<HqPage />);
  const details = screen.getByText('Today’s reports').closest('details')!;
  expect(details.closest('header')).toBeTruthy();
  expect(within(details).getByText('No reports yet today.')).toBeTruthy();
  // Romero's brief and the reports are siblings in one row.
  const brief = screen.getByText(/^Romero’s brief/).closest('button')!;
  expect(details.parentElement).toBe(brief.parentElement);
  expect(brief.parentElement!.className).toContain('flex');
  expect(brief.textContent).not.toContain('Today’s reports');
  expect(brief.parentElement!.textContent).toContain('Today’s reports');
});

it('lists the top four games by plays, with a link to the rest', () => {
  const modes = ['moonball', 'comet_cup', 'harbor_run', 'lantern_league', 'river_race', 'tide_table'];
  h.analytics = {
    modeLabels: Object.fromEntries(modes.map((m, i) => [m, ['Moonball', 'Comet Cup', 'Harbor Run', 'Lantern League', 'River Race', 'Tide Table'][i]])),
    // Fourteen days: the last seven are "this week". Moonball has the most plays, Tide Table the fewest.
    modesByDay: Array.from({ length: 14 }, (_, d) => ({ date: new Date(Date.UTC(2026, 9, 30 + d)).toISOString().slice(0, 10), ...Object.fromEntries(modes.map((m, i) => [m, 12 - i * 2])) })),
    modes: [],
  };
  render(<HqPage />);
  const title = screen.getByRole('heading', { name: 'Game plays' });
  // Column headings say what the two numbers are.
  expect(screen.getByRole('columnheader', { name: 'Last 7 days' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Previous 7 days' })).toBeTruthy();
  expect(title).toBeTruthy();
  const rows = screen.getAllByRole('row').slice(1); // after the heading row
  expect(rows).toHaveLength(4);
  expect(rows[0].textContent).toContain('Moonball');
  expect(screen.queryByText('Tide Table')).toBeNull();
  expect(screen.getByRole('link', { name: /^View game analytics/ }).getAttribute('href')).toBe('/hq/analytics');
});

it('always links to the game analytics, even when every game is already listed', () => {
  h.analytics = {
    modeLabels: { moonball: 'Moonball', comet_cup: 'Comet Cup' },
    modesByDay: Array.from({ length: 14 }, (_, d) => ({ date: new Date(Date.UTC(2026, 9, 30 + d)).toISOString().slice(0, 10), moonball: 4, comet_cup: 2 })),
    modes: [],
  };
  render(<HqPage />);
  expect(screen.getAllByRole('row')).toHaveLength(3); // heading row + two games
  expect(screen.getByRole('link', { name: /^View game analytics/ }).getAttribute('href')).toBe('/hq/analytics');
  expect(screen.queryByRole('link', { name: /All \d+ games|^Analytics/ })).toBeNull();
});

it('says the done list may be longer even when one busy agent did all of it (nothing else folded)', () => {
  const clubs = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      task(`c${i}`, 300 + i, `Published quiz page: Club ${i}`, { status: 'done', completedAt: `2026-11-11T${String(10 + (i % 10)).padStart(2, '0')}:00:00Z` }),
    );
  h.done = clubs(60);
  const { unmount } = render(<HqPage />);
  expect(feedTitles()).toEqual(['Published quiz page ×60']); // one line, so there is nothing to expand
  expect(screen.getByText(/Showing the latest 60/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View all in Work' })).toBeTruthy();
  unmount();
  h.done = clubs(25); // under the fetch limit: everything is loaded, so no such line
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Published quiz page ×25']);
  expect(screen.queryByText(/Showing the latest/)).toBeNull();
});


// ── What the founder is asked, and in what order ──

it('leads the row with the request when there is a "Need from you" line, and the task title becomes the line under it', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('a1', 91, 'Approve the Moonfield FC page', { status: 'needs_approval', director: { ...noDecision, note: 'Looks fine overall.\n\n**Need from you:** pick the club crest to use.' } }),
      task('b1', 92, 'Fix the Lantern League table', { status: 'blocked', result: 'Need from you: send the league’s new table URL.\n\nCould not do this: the old source is offline.' }),
      task('c1', 93, 'Add the Harbor Cup recap', { status: 'needs_approval', body: 'Need from you: confirm the final’s date.' }),
    ],
  };
  render(<HqPage />);
  const cases: Array<[request: string, title: string]> = [
    ['pick the club crest to use.', 'Approve the Moonfield FC page'],
    ['send the league’s new table URL.', 'Fix the Lantern League table'],
    ['confirm the final’s date.', 'Add the Harbor Cup recap'],
  ];
  for (const [request, title] of cases) {
    const main = screen.getByText(request); // the sentence to read, with no "Needs:" in front of it
    expect(main.className).toContain('font-semibold');
    expect(main.nextElementSibling!.textContent).toBe(title); // the task title is the quiet line under it
    expect(main.nextElementSibling!.className).toContain('line-clamp-1');
  }
  expect(screen.queryByText(/Needs:/)).toBeNull();
  expect(screen.queryByText(/Blocked by/)).toBeNull();
  expect(screen.queryByText(/Looks fine overall/)).toBeNull();
});

it('keeps the task title first when nobody wrote a request, with the ask under it', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [task('n1', 21, 'Approve the Moonfield FC page', { status: 'needs_approval', director: { ...noDecision, note: 'Ready; one claim needs your eye.' } })],
  };
  render(<HqPage />);
  const title = screen.getByText('Approve the Moonfield FC page');
  expect(title.nextElementSibling!.textContent).toBe('Romero: Ready; one claim needs your eye.');
});

it('labels only the facts: release, blocked and plan keep theirs; any other kind of need reads "Needs input"', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('k1', 51, 'Approve the Harbor Cup sponsor budget', { status: 'needs_approval' }), // looks like money
      task('k2', 52, 'Send the Lantern League win-back email', { status: 'needs_approval' }), // looks like players
      task('k3', 53, 'Approve the Moonfield FC page', { status: 'needs_approval' }), // a plain decision
      task('k4', 54, 'Fix the Riverbend table', { status: 'blocked' }),
    ],
    plan: [task('k5', 55, 'Plan the week’s quiz pages', { status: 'proposed', proposal: { plan_day: '2026-11-12' } as unknown as HqTask['proposal'] })],
  };
  render(<HqPage />);
  fireEvent.click(screen.getByRole('button', { name: /^Show all \d+$/ })); // five items: show all
  const label = (title: string) => (screen.getByText(title).closest('[role="button"]') as HTMLElement).querySelector('span.uppercase')!.textContent;
  expect(label('Approve the Harbor Cup sponsor budget')).toBe('Needs input'); // not "Costs money"
  expect(label('Send the Lantern League win-back email')).toBe('Needs input'); // not "Players"
  expect(label('Approve the Moonfield FC page')).toBe('Needs input'); // not "Decision"
  expect(label('Fix the Riverbend table')).toBe('Blocked');
  expect(label('Plan the week’s quiz pages')).toBe('Plan');
  expect(screen.queryByText(/Costs money|Players$|^Decision$/)).toBeNull();
});

it('orders what needs you by priority, then due date, then kind of need, then who has waited longest', () => {
  const t = (id: string, n: number, title: string, extra: Partial<HqTask>) => task(id, n, title, { status: 'needs_approval', ...extra });
  const esc = (at: string) => ({ ...noDecision, escalatedAt: at });
  h.director = {
    ...(h.director as object),
    // Scrambled on purpose. All but the blocked one are "Decision"; the blocked one would otherwise come before them.
    needsYou: [
      t('p1', 1, 'Normal, newer', { priority: 2, director: esc('2026-11-10T08:00:00Z') }),
      t('p2', 2, 'Normal, blocked', { priority: 2, status: 'blocked' }),
      t('p3', 3, 'Urgent idea', { priority: 0 }),
      t('p4', 4, 'Normal, older', { priority: 2, director: esc('2026-11-01T08:00:00Z') }),
      t('p5', 5, 'Normal, due soon', { priority: 2, dueAt: '2026-11-13T00:00:00Z' }),
      t('p6', 6, 'High ask', { priority: 1 }),
    ],
  };
  render(<HqPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Show all 6' }));
  const order = screen.getAllByText(/^(Urgent idea|High ask|Normal, due soon|Normal, blocked|Normal, older|Normal, newer)$/).map((el) => el.textContent);
  expect(order).toEqual(['Urgent idea', 'High ask', 'Normal, due soon', 'Normal, blocked', 'Normal, older', 'Normal, newer']);
});

// ── North Star ──

function goal(extra: Partial<HqGoal> = {}): HqGoal {
  return {
    id: 'g-ns', horizon: 'north_star', title: 'Grow the Moonfield player base', description: '', metric: 'daily_active_players', target: 5000, manualProgress: null,
    periodStart: '2026-11-01', periodEnd: '2026-12-31', status: 'active', department: null, position: 0, progress: { current: 1200, pct: 24 },
    createdAt: '', updatedAt: '', ...extra,
  };
}
const withNorthStar = (northStar: HqGoal | null, week: HqGoal[] = [], day: HqGoal[] = []) => {
  h.standup = { goals: { northStar, week, day }, entries: [], waitingOn: [], proposals: [] };
};

const northStarButton = () => screen.getByRole('button', { name: /^Edit the North Star: / });

/** Yesterday's pulse: 12 active players against 9 the day before, 3 new against 1, 9 matches against 4. */
const pulseFixture = () => ({
  yesterday: { activePlayers: 12, newUsers: 3, matches: 9 },
  series: [
    { activePlayers: 0, newUsers: 0, matches: 0 },
    { activePlayers: 9, newUsers: 1, matches: 4 },
    { activePlayers: 12, newUsers: 3, matches: 9 },
    { activePlayers: 0, newUsers: 0, matches: 0 },
  ].map((p, i) => ({ date: `2026-11-0${i + 8}`, ...p })),
  feedback: { avgRating7d: null },
});


it('prefixes the goal rows with "This week:" and "Today:"', () => {
  withNorthStar(goal(), [goal({ id: 'g-w', horizon: 'week', title: 'Publish ten quiz pages', progress: { current: 4, pct: 40 } })], [goal({ id: 'g-d', horizon: 'day', title: 'Reply to every club', progress: { current: 1, pct: 10 } })]);
  render(<HqPage />);
  const week = screen.getByText('Publish ten quiz pages').closest('button')!;
  expect(week.textContent).toMatch(/^This week: Publish ten quiz pages/);
  const today = screen.getByText('Reply to every club').closest('button')!;
  expect(today.textContent).toMatch(/^Today: Reply to every club/);
});

it('ends the goals panel with one link: all goals, or set this week’s and today’s', () => {
  withNorthStar(goal());
  const { unmount } = render(<HqPage />);
  expect(screen.getByRole('link', { name: /Set this week’s and today’s goals/ }).getAttribute('href')).toBe('/hq/goals');
  expect(screen.queryByRole('link', { name: /^All goals/ })).toBeNull();
  unmount();
  withNorthStar(goal(), [goal({ id: 'g-w', horizon: 'week', title: 'Publish ten quiz pages', progress: { current: 4, pct: 40 } })]);
  render(<HqPage />);
  expect(screen.getByRole('link', { name: /^All goals/ }).getAttribute('href')).toBe('/hq/goals');
  expect(screen.queryByRole('link', { name: /Set this week’s/ })).toBeNull();
});

// ── Phones: the order of the page ──

it('reads decisions, then work, then the numbers, then what is done, then game plays', () => {
  h.pulse = pulseFixture();
  withNorthStar(goal());
  h.analytics = { modeLabels: { moonball: 'Moonball' }, modesByDay: Array.from({ length: 14 }, (_, d) => ({ date: `2026-10-${String(20 + d)}`, moonball: 3 })), modes: [] };
  render(<HqPage />);
  const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  // Phones read the blocks in CSS `order` (the column wrappers dissolve); desks read two columns.
  const order = (el: Element): number => {
    for (let n: Element | null = el; n; n = n.parentElement) {
      const m = /(?:^|\s)order-(\d)(?:\s|$)/.exec(n.getAttribute('class') ?? '');
      if (m) return Number(m[1]);
    }
    return -1;
  };
  const needs = screen.getByRole('heading', { name: 'Needs your attention' });
  const working = screen.getByRole('heading', { name: 'Working now' });
  const numbers = northStarButton(); // the North Star panel, with yesterday's numbers, with yesterday's numbers
  const completed = screen.getByRole('heading', { name: 'Completed' });
  const games = screen.getByRole('heading', { name: 'Game plays' });
  expect(before(needs, working)).toBe(true);
  expect(order(working)).toBe(order(needs));
  expect([order(needs), order(numbers), order(completed), order(games)]).toEqual([1, 2, 3, 4]);
});

// ── Game plays ──

it('calls the daily mode "All daily games"', () => {
  h.analytics = {
    modeLabels: { daily: 'Daily', moonball: 'Moonball' },
    modesByDay: Array.from({ length: 14 }, (_, d) => ({ date: new Date(Date.UTC(2026, 9, 30 + d)).toISOString().slice(0, 10), daily: 8, moonball: 4 })),
    modes: [],
  };
  render(<HqPage />);
  expect(screen.getByText('All daily games')).toBeTruthy();
  expect(screen.queryByText('Daily')).toBeNull();
  expect(screen.getByText('Moonball')).toBeTruthy();
});

// ── Needs rows: label colour and repeated descriptions ──

it('colours the labels: "Needs input" is quiet slate, blocked is red, a release is amber', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('c1', 61, 'Approve the Moonfield FC page', { status: 'needs_approval' }),
      task('c2', 62, 'Fix the Lantern League table', { status: 'blocked' }),
      task('c3', 63, 'Build #7: Penalty mode for friends', { status: 'needs_approval' }),
    ],
    plan: [task('c4', 64, 'Plan the week’s quiz pages', { status: 'proposed', proposal: { plan_day: '2026-11-12' } as unknown as HqTask['proposal'] })],
  };
  h.builds = [buildAt('published', 'c3')];
  render(<HqPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Show all 4' })); // four items: show all
  const label = (title: string) => (screen.getByText(title).closest('[role="button"]') as HTMLElement).querySelector('span.uppercase')!;
  expect(label('Approve the Moonfield FC page').textContent).toBe('Needs input');
  expect(label('Approve the Moonfield FC page').className).toContain('bg-slate-100');
  expect(label('Approve the Moonfield FC page').className).toContain('text-slate-700');
  expect(label('Fix the Lantern League table').className).toContain('bg-red-50');
  expect(label('Fix the Lantern League table').className).toContain('text-red-700');
  expect(label('Build #7: Penalty mode for friends').textContent).toBe('PR to merge');
  expect(label('Build #7: Penalty mode for friends').className).toContain('bg-amber-50');
  expect(label('Build #7: Penalty mode for friends').className).toContain('text-amber-800');
  expect(label('Plan the week’s quiz pages').textContent).toBe('Plan');
  expect(label('Plan the week’s quiz pages').className).toContain('bg-blue-50');
  expect(label('Plan the week’s quiz pages').className).toContain('text-blue-700');
});

it('drops an "Asks:" line that only repeats the title', () => {
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('d1', 71, 'Refresh the Riverbend quiz page', { status: 'needs_approval', body: 'Refresh the Riverbend quiz page.' }),
      task('d2', 72, 'Add the Harbor Cup recap', { status: 'needs_approval', body: 'Goal: the final was played yesterday, so add its recap.' }),
    ],
  };
  render(<HqPage />);
  const repeated = screen.getByText('Refresh the Riverbend quiz page').closest('[role="button"]') as HTMLElement;
  expect(within(repeated).queryByText(/Asks/)).toBeNull();
  const useful = screen.getByText('Add the Harbor Cup recap').closest('[role="button"]') as HTMLElement;
  expect(within(useful).getByText(/Asks:/)).toBeTruthy();
});

it('shows the plays of the 7 days before as a count, not a percentage: a game with no plays before is 0, not "+∞%"', () => {
  h.analytics = {
    modeLabels: { moonball: 'Moonball', comet_cup: 'Comet Cup' },
    // Moonball was played both weeks; Comet Cup only in the last seven days.
    modesByDay: Array.from({ length: 14 }, (_, d) => ({ date: new Date(Date.UTC(2026, 9, 30 + d)).toISOString().slice(0, 10), moonball: 4, comet_cup: d >= 7 ? 3 : 0 })),
    modes: [],
  };
  render(<HqPage />);
  const row = (label: string) => screen.getByText(label).closest('tr')!;
  const change = (label: string) => row(label).lastElementChild!.textContent!.trim();
  expect(change('Comet Cup')).toBe('0'); // the plays in the 7 days before
  expect(change('Comet Cup')).not.toMatch(/%|from 0|new/);
  expect(row('Comet Cup').lastElementChild!.className).not.toMatch(/emerald|red-/); // the earlier week is reference: neutral
  expect(row('Comet Cup').getAttribute('title')).toBe('21 plays in the last 7 days, 0 in the 7 before');
  expect(change('Moonball')).toBe('28'); // 28 plays both weeks: not "+0%"
  expect(row('Moonball').lastElementChild!.className).toContain('text-slate-500'); // no change: neutral, not green
  expect(row('Moonball').lastElementChild!.className).not.toMatch(/emerald|red-/);
});

// ── The side panel stands on its own data ──

it('still shows yesterday’s numbers when the standup fails to load, and says the goals could not load instead of offering to set them', () => {
  const standupRefetch = vi.fn();
  const pulseRefetch = vi.fn();
  h.pulse = pulseFixture();
  h.standup = undefined;
  h.flags = { standup: { isError: true, refetch: standupRefetch }, pulse: { refetch: pulseRefetch } };
  render(<HqPage />);
  expect(screen.getByText('vs prior day')).toBeTruthy();
  expect(screen.getByText('+3')).toBeTruthy();
  expect(screen.getByText('Active players')).toBeTruthy();
  // No false "nothing set": the goals say they could not load, and Retry reloads the standup (not the pulse).
  expect(screen.queryByText('Set the North Star')).toBeNull();
  expect(screen.queryByRole('link', { name: /Set this week’s and today’s goals/ })).toBeNull();
  expect(screen.queryByRole('link', { name: /^All goals/ })).toBeNull();
  const panel = screen.getByText('vs prior day').closest('section')!;
  const alert = within(panel).getByRole('alert');
  expect(alert.textContent).toContain('Couldn’t load');
  fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
  expect(standupRefetch).toHaveBeenCalledTimes(1);
  expect(pulseRefetch).not.toHaveBeenCalled();
});

it('still shows yesterday’s numbers while the standup is loading, with a skeleton where the goals will be', () => {
  h.pulse = pulseFixture();
  h.standup = undefined;
  h.flags = { standup: { isLoading: true } };
  render(<HqPage />);
  expect(screen.getByText('vs prior day')).toBeTruthy();
  expect(screen.getByText('Online matches')).toBeTruthy();
  const panel = screen.getByText('vs prior day').closest('section')!;
  expect(within(panel).getByRole('status', { name: 'Loading' })).toBeTruthy();
  expect(screen.queryByText('Set the North Star')).toBeNull();
  expect(screen.queryByRole('link', { name: /Set this week’s and today’s goals/ })).toBeNull();
});

it('offers to set the goals only once the standup has loaded and there are none', () => {
  h.pulse = pulseFixture();
  withNorthStar(null);
  render(<HqPage />);
  expect(screen.getByText('Set the North Star')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Set this week’s and today’s goals/ }).getAttribute('href')).toBe('/hq/goals');
});

it('shows the goals half of the panel from the standup even when yesterday’s numbers fail', () => {
  withNorthStar(goal({ metric: 'new_users' }));
  h.pulse = undefined;
  h.flags = { pulse: { isError: true } };
  render(<HqPage />);
  expect(within(northStarButton()).getByText('Grow the Moonfield player base')).toBeTruthy();
  expect(within(screen.getByText('vs prior day').closest('section')!).getByRole('button', { name: 'Retry' })).toBeTruthy();
});

// ── Goal numbers: only a daily-players star shows the raw number ──

// ── Feed lines: duplicate names inside a label, and who did what in the details ──

it('counts every item in a label group, duplicate names included, and still lists each one under Details', () => {
  const page = (id: string, name: string, hour: number) => task(id, 600 + hour, `Published quiz page: ${name}`, { status: 'done', completedAt: `2026-11-11T${String(hour).padStart(2, '0')}:00:00Z` });
  h.done = [page('p1', 'Moonfield FC', 12), page('p2', 'Moonfield FC', 11), page('p3', 'Riverbend United', 10)];
  const { unmount } = render(<HqPage />);
  expect(feedTitles()).toEqual(['Published quiz page ×3']); // no names on the line, however many repeat
  fireEvent.click(screen.getByText('Published quiz page ×3').closest('button')!);
  expect(screen.getAllByRole('button', { name: 'Published quiz page: Moonfield FC' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Published quiz page: Riverbend United' })).toHaveLength(1);
  unmount();
  h.done = [page('p1', 'Moonfield FC', 12), page('p2', 'Moonfield FC', 11), page('p3', 'Riverbend United', 10), page('p4', 'Harbor Rovers', 9)];
  render(<HqPage />);
  expect(feedTitles()).toEqual(['Published quiz page ×4']);
});

it('reads each piece in a group’s details as "title · agent · age"', () => {
  h.done = [
    task('d1', 700, 'Published quiz page: Moonfield FC', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T12:00:00Z' }),
    task('d2', 701, 'Published quiz page: Riverbend United', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
  ];
  render(<HqPage />);
  fireEvent.click(screen.getByText('Published quiz page ×2').closest('button')!);
  const pieces = within(completedSection()).getAllByRole('button', { name: /^Published quiz page: / }).filter((b) => b.closest('ul ul'));
  expect(pieces).toHaveLength(2);
  expect(pieces[0].closest('li')!.textContent).toMatch(/^Published quiz page: Moonfield FC · Page Smith · /);
  expect(pieces[1].closest('li')!.textContent).toMatch(/^Published quiz page: Riverbend United · Page Smith · /);
});

it('names who reviewed what in a build group’s details, though the line shows only the age', () => {
  const gpt = agentNamed('GPT Advisor');
  h.done = [
    task('b1', 800, 'Decision on build request #8', { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T12:00:00Z' }),
    task('b2', 801, 'Code review for build #8', { status: 'done', assignee: gpt, completedAt: '2026-11-11T11:00:00Z' }),
  ];
  render(<HqPage />);
  fireEvent.click(screen.getByText(/^Build #8: /).closest('button')!);
  expect(screen.getByRole('button', { name: 'Decision on build request #8' }).closest('li')!.textContent).toMatch(/· Page Smith · /);
  expect(screen.getByRole('button', { name: 'Code review for build #8' }).closest('li')!.textContent).toMatch(/· GPT Advisor · /);
});

// ── The stat tiles without a team ──

it('shows the Done today count and dashes on the team tiles when the team has not loaded', () => {
  h.members = [];
  h.done = [
    task('t1', 1, 'Nightly site check', { status: 'done', completedAt: '2026-11-12T02:00:00Z' }),
    task('t2', 2, 'Reply to the Lantern League club', { status: 'done', completedAt: '2026-11-12T03:00:00Z' }),
    task('t3', 3, 'Weekly Harbor Cup summary', { status: 'done', completedAt: '2026-11-12T04:00:00Z' }),
  ];
  render(<HqPage />);
  expect(doneCount()).toBe('3'); // counted from the Completed feed
  expect(doneLink().getAttribute('href')).toBe('#completed'); // the Completed list needs no team
  expect(teamCounts()).toBe('– working · – idle · – paused'); // no agent counts to give yet
  expect(tile('Working').querySelector('span.animate-pulse')).toBeNull();
});

it('counts Done today from the Completed feed, not from the Director’s or the overview’s own tally', () => {
  h.members = [memberAgent('a', 'active')];
  h.overview = { ...overview, today: { ...overview.today, tasksDone: 7 } };
  h.director = { ...(h.director as object), doneToday: [task('x1', 1, 'a'), task('x2', 2, 'b'), task('x3', 3, 'c'), task('x4', 4, 'd')] };
  render(<HqPage />);
  expect(doneCount()).toBe('1'); // only "Nightly site check" finished today
});

it('falls back to the Director’s count, then the overview’s, while the Completed feed is loading or has failed', () => {
  h.members = [memberAgent('a', 'active')];
  h.director = { ...(h.director as object), doneToday: [task('x1', 1, 'a'), task('x2', 2, 'b'), task('x3', 3, 'c')] };
  (h as { done: unknown }).done = undefined;
  h.flags = { done: { isLoading: true } };
  const { unmount } = render(<HqPage />);
  expect(doneCount()).toBe('3');
  unmount();
  h.flags = { done: { isError: true } };
  h.director = { ...(h.director as object), doneToday: undefined };
  render(<HqPage />);
  expect(doneCount()).toBe('2'); // overview.today.tasksDone
});

it('shows the Done today tile once, as its own link, when the team has loaded', () => {
  h.members = [memberAgent('a', 'active')];
  render(<HqPage />);
  expect(doneCount()).toBe('1');
  expect(doneLink().getAttribute('href')).toBe('#completed');
  expect(teamCounts()).toBe('0 working · 1 idle · 0 paused');
  expect(screen.getAllByText(/done today/i)).toHaveLength(1);
});

it('leaves the counts to the stat tiles: the status line no longer repeats them as text', () => {
  h.members = [memberAgent('a2', 'active')];
  render(<HqPage />);
  expect(screen.queryByText(/agents? working/)).toBeNull();
  expect(screen.queryByText(/\d+ done today/)).toBeNull();
  expect(screen.queryByText(/· \d+ idle/)).toBeNull();
  expect(doneCount()).toBe('1');
  expect(teamCounts()).toBe('1 working · 0 idle · 0 paused');
});

it('lays the four stat tiles out in a 4-column row in the header, before the status line', () => {
  h.members = [memberAgent('a2', 'active')];
  render(<HqPage />);
  const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
  const grid = doneLink().parentElement!;
  expect(header.contains(grid)).toBe(true);
  expect(grid.className).toContain('grid-cols-4');
  expect(grid.children).toHaveLength(4);
  expect(Array.from(grid.children).map((t) => t.lastElementChild!.textContent)).toEqual(['Done today', 'Working', 'Idle', 'Paused']);
  const phoneOnly = within(header).getAllByRole('button', { name: 'New task' }).find((b) => b.parentElement!.className.includes('sm:hidden'))!;
  expect(grid.compareDocumentPosition(phoneOnly) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // the status line (and its phone row) comes after
});

it('shows a dash on the Done today tile while the count is unknown, and still links to Completed', () => {
  h.overview = undefined;
  (h as { done: unknown }).done = undefined;
  h.flags = { overview: { isLoading: true }, done: { isLoading: true } };
  h.director = { ...(h.director as object), doneToday: undefined };
  render(<HqPage />);
  expect(doneCount()).toBe('–');
  expect(doneLink().getAttribute('href')).toBe('#completed');
  expect(teamCounts()).toBe('– working · – idle · – paused');
});

it('pulses an emerald dot on the Working tile only while an agent is working', () => {
  h.members = [memberAgent('a2', 'active')]; // Scout, on the Director’s running task
  const { unmount } = render(<HqPage />);
  const dot = tile('Working').querySelector('span.animate-pulse')!;
  expect(dot.className).toContain('bg-emerald-500');
  expect(dot.getAttribute('aria-hidden')).toBe('true');
  expect(tileNumber('Working')).toBe('1'); // the dot adds no text
  expect(tile('Idle').querySelector('span.animate-pulse')).toBeNull();
  unmount();
  h.director = { ...(h.director as object), runningNow: [] };
  render(<HqPage />);
  expect(tileNumber('Working')).toBe('0');
  expect(tile('Working').querySelector('span.animate-pulse')).toBeNull();
});

// ── The North Star: the target, not a number ──

it('shows the North Star as its title and end date, with no progress figure of its own', () => {
  h.pulse = pulseFixture();
  withNorthStar(goal()); // a daily-active-players star with 1,200 of 5,000
  render(<HqPage />);
  const star = northStarButton();
  expect(star.getAttribute('aria-label')).toBe('Edit the North Star: Grow the Moonfield player base');
  expect(within(star).getByText('Grow the Moonfield player base')).toBeTruthy();
  expect(within(star).getByText('by 31 Dec 2026')).toBeTruthy();
  // The numbers live in one list below, so the star carries none.
  expect(star.textContent).not.toMatch(/1,200|5,000|of the way|yesterday|vs the day before/);
});

it('lists yesterday’s three numbers in one list, whatever the North Star measures', () => {
  h.pulse = pulseFixture();
  const { unmount } = render(<HqPage />);
  unmount();
  for (const metric of ['daily_active_players', 'new_users'] as const) {
    withNorthStar(goal({ metric }));
    const view = render(<HqPage />);
    expect(screen.getByText('Active players')).toBeTruthy();
    expect(screen.getByText('New players')).toBeTruthy();
    expect(screen.getByText('Online matches')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy(); // 12 active players against 9
    view.unmount();
  }
});

describe('active players trend', () => {
  const trendFixture = (counts: number[]) => ({
    yesterday: { activePlayers: 12, newUsers: 3, matches: 9 },
    series: counts.map((activePlayers, i) => ({ date: new Date(Date.UTC(2026, 10, 12 - (counts.length - i))).toISOString().slice(0, 10), activePlayers, newUsers: 1, matches: 1 })),
    feedback: { avgRating7d: null },
  });

  it('draws the last 14 days before today as a labelled sparkline with the peak of those days', () => {
    // 16 finished days (the first two, 500 and 400, fall outside the 14-day window), then today’s partial 999, which is left out.
    h.pulse = trendFixture([500, 400, 12, 15, 9, 22, 30, 18, 25, 37, 20, 16, 28, 31, 24, 33, 999]);
    render(<HqPage />);
    const chart = screen.getByRole('img', { name: 'Active players, last 14 days' });
    expect(chart.tagName.toLowerCase()).toBe('svg');
    expect(chart.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(14);
    const caption = chart.closest('figure')!.querySelector('figcaption')!;
    expect(within(caption as HTMLElement).getByText('Active players, 14 days')).toBeTruthy();
    expect(within(caption as HTMLElement).getByText('peak 37')).toBeTruthy();
    expect(screen.queryByText(/peak (999|500)/)).toBeNull();
  });

  it('draws what there is when fewer than 14 days are loaded, once there are two points', () => {
    h.pulse = trendFixture([9, 12, 7, 999]); // three finished days
    render(<HqPage />);
    expect(screen.getByRole('img', { name: 'Active players, last 3 days' })).toBeTruthy();
    expect(screen.getByText('peak 12')).toBeTruthy();
  });

  it('draws nothing with fewer than two finished days', () => {
    h.pulse = trendFixture([9, 999]); // one finished day plus today
    render(<HqPage />);
    expect(screen.queryByRole('img', { name: /Active players/ })).toBeNull();
    expect(screen.queryByText(/^peak /)).toBeNull();
    expect(screen.getByText('Yesterday')).toBeTruthy(); // the numbers below it still show
  });
});

it('shows the pencil always on a phone, and only on hover or focus from sm up', () => {
  withNorthStar(goal());
  render(<HqPage />);
  const pencil = northStarButton().querySelector('svg.lucide-pencil')!;
  const cls = pencil.getAttribute('class')!;
  expect(pencil.getAttribute('aria-hidden')).toBe('true');
  expect(cls).toContain('sm:opacity-0');
  expect(cls).toContain('sm:group-hover:opacity-100');
  expect(cls).toContain('sm:group-focus-visible:opacity-100');
  expect(cls).not.toMatch(/(^|\s)opacity-0(\s|$)/); // not hidden below sm
});

it('does not crash when a goal has no progress at all (an older backend)', () => {
  const bare = (extra: Partial<HqGoal>) => ({ ...goal(extra), progress: undefined }) as unknown as HqGoal;
  withNorthStar(bare({}), [bare({ id: 'g-w', horizon: 'week', title: 'Publish ten quiz pages', metric: null, target: null, manualProgress: null })]);
  render(<HqPage />);
  expect(within(northStarButton()).getByText('Grow the Moonfield player base')).toBeTruthy();
  expect(screen.getByText('Publish ten quiz pages').closest('button')!.textContent).toContain('Not started');
});

// ── Build lines: a review's verdict in plain words ──

describe('plainResult', () => {
  /** A build with two pieces: the newest carries `result`, the older one has none. Returns the feed's one line. */
  const buildLine = (n: number, result: string | null): string => {
    cleanup();
    h.done = [
      task(`pr${n}a`, 900 + n, `Code review for build #${n}`, { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result }),
      task(`pr${n}b`, 950 + n, `Decision on build request #${n}`, { status: 'done', assignee: pageSmith, completedAt: '2026-11-11T11:00:00Z' }),
    ];
    render(<HqPage />);
    return feedTitles()[0];
  };

  it.each([
    ['VERDICT: SHIP', 'agent review passed'],
    ['# VERDICT: SHIP — nothing blocking', 'agent review passed'],
    ['# No P0/P1/P2 findings', 'agent review passed'],
    ['# VERDICT: FIX — two issues in the timer', 'agent review asked for fixes'],
    ['# A P0 issue found in the timer code', 'agent review asked for fixes'],
    ['# I approved this build for staging.', 'approved by Romero'],
  ])('maps %j to "%s"', (result, plain) => {
    expect(buildLine(10, result)).toBe(`Build #10: ${plain}`);
  });

  it('does not call a review passed on a softer wording ("no P0" alone could still hide a P1; "LGTM" is not a verdict)', () => {
    expect(buildLine(15, '# No P0 or P1 findings')).toBe('Build #15: No P0 or P1 findings');
    expect(buildLine(16, '# LGTM, ship it to staging')).toBe('Build #16: LGTM, ship it to staging');
  });

  it('keeps a result it does not recognise as it is (when it says enough), else falls back to the title', () => {
    expect(buildLine(11, '# The timer needs a retry on slow phones.')).toBe('Build #11: The timer needs a retry on slow phones.');
    expect(buildLine(12, '# Sent')).toBe('Build #12: Code review for build #12'); // too short to say anything
    expect(buildLine(13, null)).toBe('Build #13: Code review for build #13');
  });

  it('reads the verdict in plain words in Details too; the exact wording stays in the task', () => {
    buildLine(14, '# VERDICT: SHIP');
    fireEvent.click(screen.getByText('Build #14: agent review passed').closest('button')!);
    expect(screen.getByText(/— agent review passed/)).toBeTruthy();
    expect(screen.queryByText(/VERDICT: SHIP/)).toBeNull();
  });

  it('does not rewrite a single task’s result: only build lines say "agent review passed"', () => {
    cleanup();
    h.done = [task('solo', 990, 'Weekly Harbor Cup summary', { status: 'done', assignee: scout, completedAt: '2026-11-11T12:00:00Z', result: '# LGTM, the summary is ready for review' })];
    render(<HqPage />);
    expect(screen.queryByText(/review passed/)).toBeNull();
    expect(screen.getByText('LGTM, the summary is ready for review')).toBeTruthy();
  });
});

// ── The Needs your attention card ──

it('shows "Needs your attention" as a visible card with an amber tone while something needs the founder', () => {
  render(<HqPage />);
  const title = screen.getByRole('heading', { level: 2, name: 'Needs your attention' });
  const card = title.closest('section')!;
  expect(card.id).toBe('needs');
  expect(card.className).toContain('rounded'); // a card, like its neighbours
  expect(card.className).toContain('border-amber'); // amber border while something is waiting
  expect(title.parentElement!.className).toContain('bg-amber-50'); // and an amber title bar
  expect(title.parentElement!.className).not.toContain('sr-only'); // no longer hidden
  expect(screen.queryByRole('heading', { name: 'Needs you' })).toBeNull();
  // Its neighbours are cards with plain titles.
  const completed = screen.getByRole('heading', { name: 'Completed' });
  expect(completed.closest('section')!.className).not.toContain('border-amber');
  expect(completed.parentElement!.className).not.toContain('bg-amber-50');
  expect(screen.getByRole('heading', { name: 'Working now' }).closest('section')!.className).not.toContain('border-amber');
});

it('shows an older item’s explanation only when it is short; a long one stays in the task', () => {
  const longNote = 'Ready for review: ' + 'one claim needs your eye before this goes live. '.repeat(5); // well over 140 characters
  h.director = {
    ...(h.director as object),
    needsYou: [
      task('n1', 21, 'Approve the Moonfield FC page', { status: 'needs_approval', director: { ...noDecision, note: 'Ready; one claim needs your eye.' } }),
      task('n2', 22, 'Approve the Riverbend page', { status: 'needs_approval', director: { ...noDecision, note: longNote } }),
    ],
  };
  render(<HqPage />);
  expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Romero: Ready; one claim needs your eye.')).toBeTruthy();
  const long = screen.getByText('Approve the Riverbend page').closest('[role="button"]') as HTMLElement;
  expect(within(long).queryByText(/Romero:/)).toBeNull(); // not cut off mid-sentence: left to the task
  fireEvent.click(long);
  expect(h.openTask).toHaveBeenCalledWith('n2');
});

it('does not limit a stated request: the "Need from you" line is shown whole, however long', () => {
  const request = 'send the league’s new table URL, the club crest in two sizes, and the date of the final so the recap can be written';
  h.director = {
    ...(h.director as object),
    needsYou: [task('b1', 92, 'Fix the Lantern League table', { status: 'blocked', result: `Need from you: ${request}.` })],
  };
  render(<HqPage />);
  expect(screen.getByText(`${request}.`)).toBeTruthy();
});

it('counts a running build as an agent at work even when no Builder member is loaded', () => {
  h.members = [
    { id: 'a2', slug: 'scout', kind: 'agent', status: 'active', name: 'Scout', runtime: 'hq', stats: { currentTask: null } },
  ];
  h.builds = [{
    id: 'b9', number: 9, title: 'Comet timer', kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null, directorNote: null,
    createdAt: '', decidedAt: null, job: { id: 'j9', number: 9, stage: 'building', note: null, runsUsed: 1, runLimit: 10, startedAt: '2026-11-12T09:00:00Z', finishedAt: null },
  }];
  render(<HqPage />);
  expect(tileNumber('Working')).toBe('2'); // Scout (default running task) + the Builder
});

// ── Done today: the Completed feed for today only ──

describe('only today', () => {
  // Tbilisi is UTC+4 and the mocked clock is 2026-11-12T10:00Z (14:00 there): today began at 2026-11-11T20:00Z.
  const finishedAt = (id: string, title: string, at: string, who = pageSmith) => task(id, 100 + Number(id.replace(/\D/g, '')), title, { status: 'done', assignee: who, completedAt: at });
  const feed = () => [
    finishedAt('t1', 'Nightly site check', '2026-11-12T02:00:00Z'), // 06:00 today, Tbilisi
    finishedAt('t2', 'Reply to the Lantern League club', '2026-11-12T08:00:00Z'), // 12:00 today
    finishedAt('y1', 'Weekly Harbor Cup summary', '2026-11-11T19:59:00Z'), // 23:59 yesterday, Tbilisi: not today
    finishedAt('y2', 'Check the Moonfield FC crest', '2026-11-09T12:00:00Z'),
  ];

  it('filters the Completed feed to today when the Done today tile is pressed, and says so', () => {
    h.members = [memberAgent('a', 'active')];
    h.done = feed();
    render(<HqPage />);
    expect(feedTitles()).toHaveLength(4); // the whole week, to begin with
    expect(screen.getByRole('heading', { name: 'Completed' })).toBeTruthy();
    expect(screen.queryByText(/^Today only\./)).toBeNull();
    expect(doneCount()).toBe('2'); // counted from the feed: the same two the link opens
    fireEvent.click(doneLink());
    expect(feedTitles()).toEqual(['Reply to the Lantern League club', 'Nightly site check']); // newest first, today's two
    expect(screen.getByText(/^Today only\./)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Completed today' })).toBeTruthy();
  });

  it('counts a day in Tbilisi time: 23:59 the night before is yesterday, 00:00 is today', () => {
    h.members = [memberAgent('a', 'active')];
    h.done = [
      finishedAt('e1', 'Midnight check', '2026-11-11T20:00:00Z'), // 00:00 Tbilisi: today
      finishedAt('e2', 'Late check', '2026-11-11T19:59:59Z'), // 23:59:59 the night before: not today
    ];
    render(<HqPage />);
    expect(doneCount()).toBe('1');
    fireEvent.click(doneLink());
    expect(feedTitles()).toEqual(['Midnight check']);
    expect(within(screen.getByRole('heading', { name: 'Completed today' }).parentElement!).getByText('· 1 item')).toBeTruthy(); // singular
  });

  it('puts the whole week back with "Show the whole week", and the link can filter again', () => {
    h.members = [memberAgent('a', 'active')];
    h.done = feed();
    render(<HqPage />);
    fireEvent.click(doneLink());
    expect(feedTitles()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole week' }));
    expect(feedTitles()).toHaveLength(4);
    expect(screen.queryByText(/^Today only\./)).toBeNull();
    fireEvent.click(doneLink());
    expect(feedTitles()).toHaveLength(2);
  });

  it('titles the feed "Completed today", with the count of items shown rather than the week’s, while only today is shown', () => {
    h.members = [memberAgent('a', 'active')];
    h.done = feed();
    render(<HqPage />);
    expect(within(screen.getByRole('heading', { name: 'Completed' }).parentElement!).getByText('· 4 items in the last 7 days')).toBeTruthy();
    fireEvent.click(doneLink());
    const title = screen.getByRole('heading', { name: 'Completed today' });
    expect(within(title.parentElement!).getByText('· 2 items')).toBeTruthy();
    expect(within(title.parentElement!).queryByText(/last 7 days/)).toBeNull();
    // Back to the week: the plain title and the weekly note return.
    fireEvent.click(screen.getByRole('button', { name: 'Show the whole week' }));
    expect(within(screen.getByRole('heading', { name: 'Completed' }).parentElement!).getByText('· 4 items in the last 7 days')).toBeTruthy();
  });

  it('shows a merged build in the today-only feed only if it reached staging today', () => {
    h.members = [memberAgent('a', 'active')];
    const merged = (n: number, at: string): HqBuild => ({
      id: `mb${n}`, number: n, title: `Comet feature ${n}`, kind: 'feature', repos: ['web'], status: 'approved', requestedBy: null, spec: '', directorSpec: null,
      directorNote: null, createdAt: '', decidedAt: null,
      job: { id: `mj${n}`, number: n, stage: 'done', note: null, runsUsed: 1, runLimit: 10, startedAt: null, finishedAt: at, taskId: `mt${n}` },
    });
    h.builds = [merged(1, '2026-11-12T06:00:00Z'), merged(2, '2026-11-10T06:00:00Z')];
    h.done = [];
    render(<HqPage />);
    expect(feedTitles()).toHaveLength(2);
    fireEvent.click(doneLink());
    expect(feedTitles()).toEqual(['Comet feature 1']);
  });
});

// ── The header: the actions are in the date row from sm up, and in a row of their own on a phone ──

it('renders New task and Ask Romero twice: in the date row from sm up, and in a phone-only row at the end of the status line', () => {
  render(<HqPage />);
  const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
  const newTask = within(header).getAllByRole('button', { name: 'New task' });
  const ask = within(header).getAllByRole('link', { name: /Ask Romero/ });
  expect(newTask).toHaveLength(2);
  expect(ask).toHaveLength(2);
  const hiddenOnPhone = newTask.find((b) => b.parentElement!.className.includes('hidden') && b.parentElement!.className.includes('sm:flex'))!;
  const phoneOnly = newTask.find((b) => b.parentElement!.className.includes('sm:hidden'))!;
  expect(hiddenOnPhone).toBeTruthy();
  expect(phoneOnly).toBeTruthy();
  // With the status line loaded, the phone row rides at its end (HqStatus `trailing`), the last block of the header;
  // the other sits beside the date, above the headline.
  expect(header.lastElementChild!.contains(phoneOnly)).toBe(true);
  expect(hiddenOnPhone.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for (const link of ask) expect(link.getAttribute('href')).toBe('/hq/director');
});

it('keeps the phone-only New task and Ask Romero row as the last thing in the header while the status line has not loaded', () => {
  h.overview = undefined;
  h.flags = { overview: { isLoading: true } };
  render(<HqPage />);
  const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
  const newTask = within(header).getAllByRole('button', { name: 'New task' });
  expect(newTask).toHaveLength(2);
  const phoneOnly = newTask.find((b) => b.parentElement!.className.includes('sm:hidden'))!;
  expect(phoneOnly.parentElement).toBe(header.lastElementChild);
});

// ── Working now: the count is for agents, and hidden at zero ──

it('hides the Working now count when no agent is working but a build is queued', () => {
  h.members = [memberAgent('a', 'active')];
  h.director = { ...(h.director as object), runningNow: [] };
  h.builds = [buildAt('queued', 'bt8', null)];
  render(<HqPage />);
  const title = screen.getByRole('heading', { name: 'Working now' });
  expect(within(title.parentElement!).queryByText('0')).toBeNull(); // no "0" pill
  expect(title.parentElement!.querySelectorAll('span.rounded')).toHaveLength(0);
  expect(screen.getByText('1 build queued')).toBeTruthy();
});

it('says so when nothing finished today, instead of an empty list', () => {
  h.done = [task('old', 90, 'Weekly growth summary', { status: 'done', completedAt: '2026-11-10T09:00:00Z' })];
  h.members = [memberAgent('a2', 'active')];
  render(<HqPage />);
  expect(screen.queryByText('Nothing finished yet today.')).toBeNull();
  expect(doneCount()).toBe('0');
  fireEvent.click(doneLink());
  expect(screen.getByText('Nothing finished yet today.')).toBeTruthy();
  expect(within(screen.getByRole('heading', { name: 'Completed today' }).parentElement!).getByText('· 0 items')).toBeTruthy();
  expect(screen.queryByText('Weekly growth summary')).toBeNull();
});

