import { describe, expect, it } from 'vitest';
import { ACTIVITY_ALLOWED_EMAIL } from '@/lib/constants';
import { canSeeTool, HQ_DEPARTMENTS, toolsForUser, withoutHiddenRealData } from './hq-departments';

const dept = (key: string) => HQ_DEPARTMENTS.find((d) => d.key === key)!;

describe('departments', () => {
  it('lists the departments in order, each tool in exactly one, with an HQ page for the ones agents already run', () => {
    expect(HQ_DEPARTMENTS.map((d) => d.key)).toEqual(['content', 'games', 'competitions', 'growth', 'partners']);
    const hrefs = HQ_DEPARTMENTS.flatMap((d) => d.tools.map((t) => t.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(dept('content').home).toBe('/hq/content');
    expect(dept('games').home).toBe('/hq/games');
    expect(dept('growth').home).toBeUndefined();
    // Nothing links to a page of the old HQ.
    for (const href of [...hrefs, ...HQ_DEPARTMENTS.map((d) => d.home ?? '')]) expect(href).not.toMatch(/^\/hq\/(board|builds|team|people|director|goals|inbox|schedules|activity|departments)/);
  });

  it('hides real-data tools unless real data is switched on', () => {
    const growth = dept('growth');
    for (const href of ['/analytics', '/persons', '/audience']) expect(withoutHiddenRealData(growth.tools, false).map((t) => t.href)).not.toContain(href);
    expect(withoutHiddenRealData(growth.tools, true).map((t) => t.href)).toEqual(expect.arrayContaining(['/stats', '/analytics', '/persons']));
  });

  it('lists Player activity only for the allowed account and leaves ordinary tools visible to everyone', () => {
    const growth = dept('growth');
    expect(toolsForUser(growth, ACTIVITY_ALLOWED_EMAIL).map((t) => t.href)).toContain('/activity');
    for (const email of ['someone@quizball.com', null, undefined]) expect(toolsForUser(growth, email).map((t) => t.href)).not.toContain('/activity');
    expect(canSeeTool({}, null)).toBe(true);
    expect(withoutHiddenRealData(toolsForUser(growth, null), false).map((t) => t.href)).toEqual(['/stats', '/retention', '/users', '/announcements']);
  });
});
