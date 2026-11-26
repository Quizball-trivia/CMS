// Plain-language helpers for the Content tab: the tab is read by the content
// team, not engineers, so stages, events and rates are put in their words.

import type { HarnessCategoryHealth, HarnessEvent, HarnessOverview } from '@/types';

export const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ka', label: 'Georgian' },
  { code: 'es', label: 'Spanish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'el', label: 'Greek' },
];

/** The five steps every question goes through, with how many are in each right now. */
export function flow(o: HarnessOverview): Array<{ key: string; label: string; hint: string; count: number }> {
  const n = (...stages: string[]) => o.stages.filter((s) => s.mode === 'classic' && stages.includes(s.stage)).reduce((t, s) => t + s.count, 0);
  const briefs = o.jobs.filter((j) => (j.kind === 'plan' || j.kind === 'make') && (j.status === 'queued' || j.status === 'running')).reduce((t, j) => t + j.count, 0);
  return [
    { key: 'writing', label: 'Writing', hint: briefs ? `${briefs} batches planned or being written` : 'the Planner and the Question Maker', count: n('draft') },
    { key: 'checking', label: 'Checking', hint: 'facts and quality, by a different AI', count: n('validated') },
    { key: 'translating', label: 'Translating', hint: 'into 9 languages, then checked', count: n('verified', 'localized') },
    { key: 'releasing', label: 'Releasing', hint: 'passed everything, going into the game', count: n('approved') },
    { key: 'live', label: 'Live today', hint: 'added to the game today', count: o.today.live },
  ];
}

/** Roughly how long until a category is full, at the pace of the last 7 days. */
export function fillEstimate(c: HarnessCategoryHealth): string {
  if (c.shortage <= 0) return 'Full';
  if (c.priority === 'hold') return 'On hold';
  if (c.liveLast7d <= 0) return c.inPipeline > 0 ? 'First ones on the way' : 'Not started';
  const days = Math.ceil(c.shortage / (c.liveLast7d / 7));
  return days <= 1 ? 'About a day' : days > 60 ? 'Over 2 months' : `About ${days} days`;
}

const STEP: Record<string, string> = {
  'draft -> validated': 'written, passed the format checks',
  'draft -> rejected': 'dropped: a repeat or broken',
  'validated -> draft': 'sent back to the writer by a checker',
  'validated -> verified': 'passed the fact and quality checks',
  'validated -> rejected': 'rejected by a checker',
  'verified -> localized': 'translated into 9 languages',
  'localized -> verified': 'translation sent back for fixes',
  'localized -> approved': 'languages checked',
  'approved -> live': 'went live in ranked',
  'approved -> approved': 'release retried',
  'live -> retired': 'taken out of ranked',
  'escalated -> approved': 'approved by the team',
  'escalated -> rejected': 'rejected by the team',
  'escalated -> draft': 'sent back to the writer by the team',
};

/** One activity line in plain words, or null for engine noise the team doesn't need. */
export function plainEvent(e: HarnessEvent): { text: string; tone: 'neutral' | 'good' | 'attention' } | null {
  if (e.type === 'worker' || e.type === 'decision') return null;
  const about = [e.category, e.prompt ? `“${e.prompt}”` : null].filter(Boolean).join(': ');
  if (e.type === 'item_stage') {
    const to = e.message.split(' -> ')[1] ?? '';
    const what = to === 'escalated' ? 'got stuck and needs you' : (STEP[e.message] ?? e.message);
    return { text: about ? `${about} — ${what}` : `A question ${what}`, tone: to === 'live' ? 'good' : to === 'escalated' || to === 'rejected' ? 'attention' : 'neutral' };
  }
  if (e.type === 'trigger') return { text: e.message.replace('Classic health:', 'Ranked check:').replace('new briefs', 'new batches ordered'), tone: 'neutral' };
  if (e.type === 'editor' || e.type === 'request') return { text: about ? `${e.message} — ${about}` : e.message, tone: 'neutral' };
  return { text: about ? `${e.message} — ${about}` : e.message, tone: e.level === 'info' ? 'neutral' : 'attention' };
}
