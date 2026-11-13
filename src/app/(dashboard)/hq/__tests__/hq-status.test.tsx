import Link from 'next/link';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HqSettings } from '@/types';

// Invented-universe fixtures only (this repo is public).

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks', () => ({ useUpdateHqSettings: () => ({ mutate: vi.fn(), isPending: false }) }));

const { HqStatus } = await import('../hq-status');

const settings = { paused: false, pausedReason: null, dailyRunLimit: 150, maxConcurrentRuns: 2 } as unknown as HqSettings;
const today = { runs: 4, costCents: 0, tasksCreated: 0, tasksDone: 2, failedRuns: 0 };

afterEach(() => cleanup());

it('in summary mode folds automation into one "Agent runs on" toggle that opens usage and Pause', () => {
  render(<HqStatus settings={settings} today={today} summary={<Link href="/hq/team">No agents working · 3 available · 1 paused</Link>} />);
  expect(screen.getByRole('link', { name: 'No agents working · 3 available · 1 paused' }).getAttribute('href')).toBe('/hq/team');
  const toggle = screen.getByRole('button', { name: 'Automation on' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Pause all' })).toBeNull();
  const meters = screen.getByText('Runs today').closest('div.flex-wrap')!;
  expect(meters.className).toMatch(/(^|\s)hidden(\s|$)/);
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(meters.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  // Pause is one tap away inside, rendered once.
  expect(screen.getAllByRole('button', { name: 'Pause all' })).toHaveLength(1);
});

it('puts the trailing actions on the same row as the automation toggle', () => {
  render(<HqStatus settings={settings} today={today} summary="nobody working" trailing={<button type="button">New task</button>} />);
  // One row: the automation control (with Resume when paused) and the actions wrap as two units.
  expect(screen.getByRole('button', { name: 'New task' }).parentElement).toBe(screen.getByRole('button', { name: 'Automation on' }).parentElement!.parentElement);
});

it('when paused, summary mode says so in red before the counts, and offers a single Resume', () => {
  render(<HqStatus settings={{ ...settings, paused: true, pausedReason: 'budget check' } as HqSettings} today={today} summary={<Link href="/hq/team">No agents working · 3 available · 1 paused</Link>} />);
  const paused = screen.getByText(/^Automation paused \(budget check\) ·$/);
  expect(paused.className).toContain('text-red-700');
  // In front of the summary.
  expect(paused.compareDocumentPosition(screen.getByRole('link', { name: /No agents working/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Automation on' })).toBeNull(); // it is not on
  expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Pause all' })).toBeNull();
});

it('compact mode keeps the calm line while the agent counts are still loading', () => {
  render(<HqStatus settings={settings} today={today} compact />);
  expect(screen.getByText('Agents')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Automation on' })).toBeTruthy();
  expect(screen.queryByText('Agents on')).toBeNull(); // not the full status
});

it('without a summary it is the full status, with Pause as its own button', () => {
  render(<HqStatus settings={settings} today={today} />);
  expect(screen.getByText('Agents on')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Usage' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Pause all' })).toHaveLength(1);
});

it('in the calm line there is no dot in front of the agent counts; the green dot sits in the automation toggle', () => {
  const { container } = render(<HqStatus settings={settings} today={today} summary={<Link href="/hq/team">No agents working · 3 available · 1 paused</Link>} />);
  const link = screen.getByRole('link', { name: /No agents working/ });
  expect(link.closest('div.flex.items-center.gap-2')!.querySelector('span.rounded-full')).toBeNull();
  expect(screen.getByRole('button', { name: 'Automation on' }).querySelector('span.rounded-full.bg-emerald-500')).not.toBeNull();
  expect(container.querySelectorAll('span.rounded-full.bg-emerald-500')).toHaveLength(1);
});

it('the full status (no summary, not compact) still leads with its dot', () => {
  const { container } = render(<HqStatus settings={settings} today={today} />);
  expect(container.querySelector('span.rounded-full.bg-emerald-500')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Automation on' })).toBeNull();
});

it('says in the automation panel what stops runs instead of "New runs can start" when the plan blocks them', () => {
  render(<HqStatus settings={{ ...settings, plan: { state: 'limit', mode: 'normal', until: null, windows: [] } } as unknown as HqSettings} today={today} summary="nobody working" />);
  fireEvent.click(screen.getByRole('button', { name: 'Automation on' }));
  expect(screen.queryByText(/New runs can start/)).toBeNull();
  expect(screen.getAllByText(/Claude plan limit reached/).length).toBeGreaterThan(0);
});

it('says "New runs can start" in the automation panel when nothing blocks them', () => {
  render(<HqStatus settings={settings} today={today} summary="nobody working" />);
  fireEvent.click(screen.getByRole('button', { name: 'Automation on' }));
  expect(screen.getByText('New runs can start, up to 2 at a time')).toBeTruthy();
});

it('keeps the automation control while paused, so usage can be checked before Resume', () => {
  render(<HqStatus settings={{ ...settings, paused: true, pausedReason: null } as HqSettings} today={today} summary="nobody working" />);
  const toggle = screen.getByRole('button', { name: 'Automation paused' });
  expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(1);
  fireEvent.click(toggle);
  expect(screen.getByText('Runs today')).toBeTruthy();
  expect(screen.queryByText(/New runs can start/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Pause all' })).toBeNull();
});

it('with hideSummary the counts are not repeated: no summary text, and the notice area is out of the layout (not out of the accessibility tree) while all is well', () => {
  const { container } = render(<HqStatus settings={settings} today={today} compact hideSummary summary={<Link href="/hq/team">No agents working · 3 available · 1 paused</Link>} />);
  expect(screen.queryByRole('link', { name: /No agents working/ })).toBeNull();
  expect(screen.queryByText('Agents')).toBeNull(); // not even the compact fallback label
  const notice = container.firstElementChild!.firstElementChild!; // the left notice area
  // sr-only, not display:none, so the live regions inside it stay announceable.
  expect(notice.className).toMatch(/(^|\s)sr-only(\s|$)/);
  expect(notice.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  expect(within(notice as HTMLElement).getAllByRole('status')).toHaveLength(2);
  // The automation control stays.
  expect(screen.getByRole('button', { name: 'Automation on' })).toBeTruthy();
});

it('with hideSummary the notice area still says when automation is paused', () => {
  const { container } = render(<HqStatus settings={{ ...settings, paused: true, pausedReason: 'budget check' } as HqSettings} today={today} compact hideSummary summary={<Link href="/hq/team">No agents working · 3 available · 1 paused</Link>} />);
  const notice = container.firstElementChild!.firstElementChild!;
  expect(notice.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  expect(screen.getByText(/^Automation paused \(budget check\) ·$/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: /No agents working/ })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(1);
});

it('with hideSummary the notice area still says when the plan blocks runs', () => {
  const { container } = render(<HqStatus settings={{ ...settings, plan: { state: 'limit', mode: 'normal', until: null, windows: [] } } as unknown as HqSettings} today={today} compact hideSummary summary="nobody working" />);
  const notice = container.firstElementChild!.firstElementChild!;
  expect(notice.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  expect(notice.textContent).toContain('Claude plan limit reached, agents wait');
  expect(screen.queryByText('nobody working')).toBeNull();
});

it('announces a change in the paused state or the plan block through polite live regions that were already on the page', () => {
  const summary = <Link href="/hq/team">No agents working · 3 available · 1 paused</Link>;
  const { rerender } = render(<HqStatus settings={settings} today={today} compact summary={summary} />);
  const regions = screen.getAllByRole('status');
  expect(regions).toHaveLength(2);
  for (const region of regions) expect(region.getAttribute('aria-live')).toBe('polite');
  expect(regions.map((r) => r.textContent)).toEqual(['', '']);

  rerender(<HqStatus settings={{ ...settings, paused: true, pausedReason: 'budget check' } as HqSettings} today={today} compact summary={summary} />);
  // The same elements, now carrying the notice; the summary link is outside both.
  expect(screen.getAllByRole('status')).toEqual(regions);
  expect(regions[0].textContent).toMatch(/^Automation paused \(budget check\) ·/);
  const link = screen.getByRole('link', { name: /No agents working/ });
  for (const region of regions) expect(region.contains(link)).toBe(false);

  rerender(<HqStatus settings={{ ...settings, plan: { state: 'limit', mode: 'normal', until: null, windows: [] } } as unknown as HqSettings} today={today} compact summary={summary} />);
  expect(screen.getAllByRole('status')).toEqual(regions);
  expect(regions[0].textContent).toBe('');
  expect(regions[1].textContent).toContain('Claude plan limit reached, agents wait');
});
