import { describe, expect, it } from 'vitest';
import type { HqGoal, HqStandupEntry } from '@/types';
import {
  countryFlag,
  countryName,
  countryShares,
  goalProgressLabel,
  goalProgressPct,
  latestD7,
  modeKeys,
  modeLabel,
  buildProposalChange,
  orderStandupEntries,
  periodFor,
  proposalBody,
  proposalEditMode,
  proposalEditText,
  retentionCellClass,
  retentionPct,
  standupStatusSentence,
  topModesWithOther,
} from './hq-standup';

const ref = (id: string, name: string) => ({ id, slug: id, name, avatar: '🤖', color: 'slate', kind: 'agent' as const });
function entry(id: string, name: string, report: { blockers?: string; createdAt?: string } | null): HqStandupEntry {
  return {
    member: { ...ref(id, name), title: '', department: 'growth' },
    standup: report ? { headline: 'h', yesterday: 'y', today: 't', blockers: report.blockers ?? '', createdAt: report.createdAt ?? '2026-11-03T05:00:00Z' } : null,
    proposals: [],
    working: null,
    finishedYesterday: [],
  };
}

describe('standupStatusSentence', () => {
  it('counts reports and waiting ideas', () => {
    const s = standupStatusSentence({
      entries: [entry('a', 'A', {}), entry('b', 'B', {}), entry('c', 'C', null)],
      waitingOn: [ref('c', 'C')],
      proposals: [{}, {}, {}, {}] as never,
    });
    expect(s).toBe('2 of 3 agents reported · 4 ideas waiting for you');
  });
  it('reads naturally for all-reported, one idea, and nothing', () => {
    expect(standupStatusSentence({ entries: [entry('a', 'A', {})], waitingOn: [], proposals: [{}] as never })).toBe('All 1 agent reported · 1 idea waiting for you');
    expect(standupStatusSentence({ entries: [], waitingOn: [], proposals: [] })).toBe('No agents on the team yet · no ideas waiting');
  });
});

describe('orderStandupEntries', () => {
  it('puts blocked agents first, then newest reports, then those who have not reported', () => {
    const ordered = orderStandupEntries([
      entry('w', 'Waiting', null),
      entry('old', 'Old', { createdAt: '2026-11-03T05:00:00Z' }),
      entry('blk', 'Blocked', { blockers: 'No access to the store console' }),
      entry('new', 'New', { createdAt: '2026-11-03T06:00:00Z' }),
    ]);
    expect(ordered.map((e) => e.member.id)).toEqual(['blk', 'new', 'old', 'w']);
  });
});

describe('goal progress', () => {
  const goal = (over: Partial<HqGoal>): HqGoal =>
    ({ id: 'g', horizon: 'week', title: 'G', description: '', metric: null, target: null, manualProgress: null, periodStart: '2026-11-02', periodEnd: '2026-11-08', status: 'active', department: null, position: 0, progress: { current: null, pct: null }, createdAt: '', updatedAt: '', ...over }) as HqGoal;

  it('uses computed progress, falls back to manual, and clamps', () => {
    expect(goalProgressPct(goal({ progress: { current: 6240, pct: 62.4 } }))).toBe(62);
    expect(goalProgressPct(goal({ manualProgress: 40 }))).toBe(40);
    expect(goalProgressPct(goal({ progress: { current: 12000, pct: 120 } }))).toBe(100);
    expect(goalProgressPct(goal({}))).toBeNull();
  });

  it('labels metric and manual goals', () => {
    expect(goalProgressLabel(goal({ metric: 'active_players', target: 10000, progress: { current: 6240, pct: 62.4 } }))).toBe('6,240 of 10,000');
    // d7_retention goal values are percentages 0–100 (an 0.8% retention must not read as 80%).
    expect(goalProgressLabel(goal({ metric: 'd7_retention', target: 25, progress: { current: 18, pct: 72 } }))).toBe('18% of 25%');
    expect(goalProgressLabel(goal({ metric: 'd7_retention', target: 25, progress: { current: 0.8, pct: 3 } }))).toBe('0.8% of 25%');
    expect(goalProgressLabel(goal({ manualProgress: 60 }))).toBe('60% done');
    expect(goalProgressLabel(goal({}))).toBe('Not started');
  });
});

describe('periodFor (Tbilisi dates, weeks run Monday–Sunday)', () => {
  const wed = new Date('2026-11-04T10:00:00Z'); // Wednesday in Tbilisi
  it('computes today, this week and the next 90 days', () => {
    expect(periodFor('today', wed)).toEqual({ periodStart: '2026-11-04', periodEnd: '2026-11-04' });
    expect(periodFor('this_week', wed)).toEqual({ periodStart: '2026-11-02', periodEnd: '2026-11-08' });
    expect(periodFor('next_90_days', wed)).toEqual({ periodStart: '2026-11-04', periodEnd: '2027-02-02' });
  });
  it('treats Sunday as the end of the week and uses the Tbilisi date near midnight', () => {
    expect(periodFor('this_week', new Date('2026-11-08T12:00:00Z')).periodStart).toBe('2026-11-02');
    // 22:30 UTC Sunday = 02:30 Monday in Tbilisi → a new week.
    expect(periodFor('this_week', new Date('2026-11-08T22:30:00Z')).periodStart).toBe('2026-11-09');
  });
});

describe('countries', () => {
  it('turns ISO-2 codes into flags and names', () => {
    expect(countryFlag('ge')).toBe('🇬🇪');
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(countryFlag('Georgia')).toBe('🌐');
    expect(countryFlag(null)).toBe('🌐');
    expect(countryName('GE')).toBe('Georgia');
    expect(countryName('')).toBe('Unknown');
    expect(countryName('Sakartvelo')).toBe('Sakartvelo');
  });
  it('uses the all-countries total for shares when the backend sends it', () => {
    const rows = countryShares([{ country: 'GE', players: 40, registered: 50 }], 15, 200);
    expect(rows[0].share).toBe(0.2);
    expect(rows[0].basis).toBe('all');
  });

  it('falls back to the visible sum (basis "top") when the total is missing or inconsistent', () => {
    const list = [{ country: 'GE', players: 40, registered: 50 }, { country: 'TR', players: 10, registered: 20 }];
    expect(countryShares(list, 15).map((r) => [r.share, r.basis])).toEqual([[0.8, 'top'], [0.2, 'top']]);
    // A total smaller than what's listed can't be right — ignore it.
    expect(countryShares(list, 15, 30)[0].basis).toBe('top');
    expect(countryShares(list, 15, 0)[0].basis).toBe('top');
  });

  it('ranks countries with their share of players', () => {
    const rows = countryShares(
      [
        { country: 'TR', players: 25, registered: 40 },
        { country: 'GE', players: 75, registered: 90 },
      ],
      15
    );
    expect(rows.map((r) => [r.country, r.share])).toEqual([
      ['GE', 0.75],
      ['TR', 0.25],
    ]);
  });
});

describe('game modes', () => {
  it('merges a real "other" mode from the API into the single Other row', () => {
    const rows = topModesWithOther(
      [
        { mode: 'ranked', matches: 50, share: 0.5 },
        { mode: 'other', matches: 40, share: 0.4 },
        { mode: 'friendly', matches: 10, share: 0.1 },
        { mode: 'auction', matches: 5, share: 0.05 },
      ],
      undefined,
      2
    );
    expect(rows.map((r) => [r.mode, r.matches])).toEqual([
      ['ranked', 50],
      ['friendly', 10],
      ['other', 45],
    ]);
    expect(rows.filter((r) => r.mode === 'other')).toHaveLength(1);
  });

  it('keeps the top N modes and folds the rest into Other', () => {
    const rows = topModesWithOther(
      [
        { mode: 'ranked', matches: 50, share: 0.5 },
        { mode: 'friendly', matches: 30, share: 0.3 },
        { mode: 'football_grid', matches: 15, share: 0.15 },
        { mode: 'auction', matches: 5, share: 0.05 },
      ],
      { ranked: 'Ranked 1v1' },
      2
    );
    expect(rows.map((r) => [r.label, r.matches])).toEqual([
      ['Ranked 1v1', 50],
      ['Friendly', 30],
      ['Other', 20],
    ]);
  });
  it('humanises unknown mode keys and orders stacked keys by total (Other last)', () => {
    expect(modeLabel('football_grid')).toBe('Football Grid');
    expect(
      modeKeys([
        { date: '2026-11-01', other: 9, ranked: 1, friendly: 5 },
        { date: '2026-11-02', other: 9, ranked: 2, friendly: 5 },
      ])
    ).toEqual(['friendly', 'ranked', 'other']);
  });
});

describe('retention', () => {
  it('turns 0–1 cohort shares into percentages', () => {
    expect(retentionPct(0.25)).toBe(25);
    expect(retentionPct(1)).toBe(100);
    expect(retentionPct(0)).toBe(0);
    expect(retentionPct(null)).toBeNull();
  });
  it('picks the newest cohort with a finished day-7 window', () => {
    expect(
      latestD7([
        { cohortStart: '2026-10-26', size: 10, d1: 0.5, d7: null, d30: null },
        { cohortStart: '2026-10-19', size: 12, d1: 0.4, d7: 0.2, d30: null },
        { cohortStart: '2026-10-12', size: 9, d1: 0.3, d7: 0.1, d30: null },
      ])
    ).toEqual({ pct: 20, cohortStart: '2026-10-19' });
    expect(latestD7([])).toBeNull();
  });
  it('colours heatmap cells by bucket', () => {
    expect(retentionCellClass(null)).toContain('slate-50');
    expect(retentionCellClass(45)).toContain('emerald-600');
    expect(retentionCellClass(3)).toContain('slate-100');
  });
});

describe('proposalBody', () => {
  it('matches the worker’s hq_propose body format exactly', () => {
    expect(proposalBody({ why: 'W', plan: 'P1\nP2', expectedImpact: '+10%', effort: 'm' })).toBe(
      '**Why:** W\n\n**Plan:** P1\nP2\n\n**Expected impact:** +10% · **Effort:** M'
    );
  });
});

describe('Change form: body is the single source of truth', () => {
  const proposal = { why: 'W', plan: 'Old plan', expectedImpact: '+5%', effort: 's' as const };
  const generated = { title: 'Idea', body: proposalBody(proposal), proposal };
  const handEdited = { title: 'Idea', body: 'Do X, then Y. (edited in the task sheet)', proposal };

  it('edits the plan while the body is still the generated one', () => {
    expect(proposalEditMode(generated)).toBe('plan');
    expect(proposalEditText(generated)).toBe('Old plan');
  });

  it('edits the hand-written instructions when the body was changed', () => {
    expect(proposalEditMode(handEdited)).toBe('instructions');
    expect(proposalEditText(handEdited)).toBe(handEdited.body);
    expect(proposalEditMode({ body: 'free text', proposal: null })).toBe('instructions');
  });

  it('sends only the title when only the title changed (body untouched)', () => {
    expect(buildProposalChange(generated, 'New idea', 'Old plan')).toEqual({ title: 'New idea' });
    expect(buildProposalChange(handEdited, 'New idea', handEdited.body)).toEqual({ title: 'New idea' });
  });

  it('regenerates the body from a new plan', () => {
    expect(buildProposalChange(generated, 'Idea', 'New plan')).toEqual({
      proposal: { plan: 'New plan' },
      body: proposalBody({ ...proposal, plan: 'New plan' }),
    });
  });

  it('sends edited instructions as the body, without touching the proposal', () => {
    expect(buildProposalChange(handEdited, 'Idea', 'Do Z instead.')).toEqual({ body: 'Do Z instead.' });
  });

  it('sends nothing when nothing changed', () => {
    expect(buildProposalChange(generated, 'Idea', 'Old plan')).toEqual({});
  });
});
