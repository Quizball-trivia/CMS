import { describe, expect, it } from 'vitest';
import { ACTIVITY_ALLOWED_EMAIL } from '@/lib/constants';
import { agentsOf, readyToStart, SUGGESTED_AGENTS } from './hq-agents';
import { canSeeTool, DEPARTMENT_LOOK, HQ_ANALYTICS_TOOLS, HQ_DEPARTMENTS } from './hq-departments';

const dept = (key: string) => HQ_DEPARTMENTS.find((d) => d.key === key)!;

describe('departments', () => {
  it('lists the departments in order, each with its own HQ page and look, and each tool in exactly one', () => {
    expect(HQ_DEPARTMENTS.map((d) => d.key)).toEqual(['content', 'games', 'competitions', 'marketing', 'partners', 'investors']);
    const hrefs = HQ_DEPARTMENTS.flatMap((d) => d.tools.map((t) => t.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const d of HQ_DEPARTMENTS) {
      expect(d.home).toBe(`/hq/${d.key}`);
      expect(DEPARTMENT_LOOK[d.key].hex).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Nothing links to a page that was removed.
    for (const href of [...hrefs, ...HQ_ANALYTICS_TOOLS.map((t) => t.href)]) expect(href).not.toMatch(/^\/(analytics|settings)$|^\/hq\/(board|builds|team|people|director|goals|inbox|schedules|activity|departments)/);
  });

  it('keeps the pages about players under Analytics, Player activity only for the allowed account', () => {
    const seen = (email: string | null) => HQ_ANALYTICS_TOOLS.filter((t) => canSeeTool(t, email)).map((t) => t.href);
    expect(seen(ACTIVITY_ALLOWED_EMAIL)).toEqual(['/audience', '/persons', '/activity']);
    expect(seen('someone@quizball.com')).toEqual(['/audience', '/persons']);
    expect(seen(null)).toEqual(['/audience', '/persons']);
    expect(canSeeTool({}, null)).toBe(true);
    expect(dept('marketing').tools.map((t) => t.href)).toEqual(['/retention', '/announcements', '/users', '/stats']);
  });
});

describe('agents by department', () => {
  const agent = (slug: string) => ({ slug }) as never;

  it('suggests agents for every department, each with what it gives and what stays a person\'s call', () => {
    for (const d of HQ_DEPARTMENTS) expect(agentsOf(d.key, []).suggested.length).toBeGreaterThanOrEqual(3);
    const slugs = SUGGESTED_AGENTS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of SUGGESTED_AGENTS) {
      expect(s.does.length).toBeGreaterThan(20);
      expect(s.gives.length).toBeGreaterThan(20);
      expect(s.person.length).toBeGreaterThan(5);
    }
    // Money and outside contact stay with a person.
    expect(SUGGESTED_AGENTS.find((s) => s.slug === 'prize-clerk')!.person).toMatch(/never sends money/);
    expect(SUGGESTED_AGENTS.find((s) => s.slug === 'pipeline-keeper')!.person).toMatch(/never writes to an investor/);
  });

  it('puts a running agent in its department and stops suggesting it', () => {
    const running = [agent('question-maker'), agent('fact-checker'), agent('game-planner'), agent('growth-analyst')];
    expect(agentsOf('content', running).running.map((a) => a.slug)).toEqual(['question-maker', 'fact-checker']);
    expect(agentsOf('games', running).running.map((a) => a.slug)).toEqual(['game-planner']);
    expect(agentsOf('marketing', running).running.map((a) => a.slug)).toEqual(['growth-analyst']);
    expect(agentsOf('marketing', running).suggested.map((s) => s.slug)).not.toContain('growth-analyst');
    expect(agentsOf('marketing', undefined).suggested.map((s) => s.slug)).toContain('growth-analyst');
  });

  it('knows which suggested agents need nothing first', () => {
    expect(readyToStart(agentsOf('marketing', []).suggested).map((s) => s.slug)).toEqual(['growth-analyst']);
    expect(readyToStart(agentsOf('investors', []).suggested).map((s) => s.slug)).toEqual(['investor-scout', 'investor-update-writer', 'pitch-coach']);
  });
});
