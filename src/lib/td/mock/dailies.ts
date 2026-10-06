/** POST /admin/dailies/:game/publish, as the API does it (apps/api/src/content/dailyPublish.ts): whole days approved,
 *  today pinned to the day the current release plays, each never-dated day on the next free date, the cycle every
 *  dated day then those it repeated already, from the day after the last. A refused request leaves nothing behind (the router keeps no copy of it). */

import { addDays, georgiaToday, scheduledSet } from '../georgia';
import { TD_DAILY_DAY_SIZES, type TdDailyGameKey } from '../dailies';
import { approve, createRow, editRow, markReady, rowsOf, type MockContext } from './content';
import { DAILY_TYPE } from './model';
import { MockError } from './util';
import type { MockRow } from './db';

const live = (row: MockRow) => row.status !== 'archived';

export function publishDays(ctx: MockContext, game: TdDailyGameKey, puzzles: string[]) {
  const { db } = ctx;
  const type = DAILY_TYPE[game];
  const size = TD_DAILY_DAY_SIZES[game];
  const today = georgiaToday(ctx.now);
  const days = [...new Set(puzzles)];

  const incomplete = days.flatMap((puzzle) => {
    const n = rowsOf(db, type).filter((row) => live(row) && row.data.puzzle === puzzle).length;
    return n === size ? [] : [{ path: puzzle, message: `${n} of ${size} questions` }];
  });
  if (incomplete.length) throw new MockError(422, 'validation', `A day has ${size} questions`, { issues: incomplete });
  for (const puzzle of days)
    for (const row of rowsOf(db, type).filter((r) => live(r) && r.data.puzzle === puzzle)) {
      if (row.status === 'draft') markReady(ctx, type, row.id, row.version);
      if (row.status === 'ready') approve(ctx, type, row.id, row.version);
    }

  const hasApproved = (puzzle: string) => rowsOf(db, type).some((row) => live(row) && row.approvedVersion !== null && row.approved?.puzzle === puzzle);
  const schedule = () =>
    rowsOf(db, 'daily-schedule')
      .filter((row) => live(row) && row.data.game === game)
      .sort((a, b) => String(a.data.date).localeCompare(String(b.data.date)));
  const addDay = (date: string, puzzle: string) => {
    const made = createRow(ctx, 'daily-schedule', { data: { game, date, puzzle } });
    markReady(ctx, 'daily-schedule', made.id, made.version);
    approve(ctx, 'daily-schedule', made.id, made.version);
  };

  // Today keeps the day the current release plays (the API looks at today's assignment first; the mock has none: no
  // player starts a daily here).
  const current = db.releases.find((r) => r.id === db.pointer.releaseId)?.dailies?.[game];
  const playing = current ? scheduledSet(current.dates[today], current.cycle, today) : null;
  if (playing && !schedule().some((row) => row.data.date === today) && hasApproved(playing)) addDay(today, playing);

  const everDated = new Set(schedule().map((row) => String(row.data.puzzle)));
  let last = schedule().reduce((max, row) => (String(row.data.date) > max ? String(row.data.date) : max), today);
  for (const puzzle of days) {
    if (everDated.has(puzzle)) continue;
    last = addDays(last, 1);
    addDay(last, puzzle);
    everDated.add(puzzle);
  }

  // Every dated day by its first date, then those the cycle repeated already (none drops out).
  const dated = schedule();
  const repeated = (rowsOf(db, 'daily-settings').find((row) => row.data.game === game)?.approved?.cycle as { sets?: string[] } | null | undefined)?.sets ?? [];
  const order: string[] = [];
  for (const puzzle of [...dated.map((row) => String(row.data.puzzle)), ...repeated]) if (!order.includes(puzzle) && hasApproved(puzzle)) order.push(puzzle);
  const anchor = dated.length ? addDays(String(dated[dated.length - 1]!.data.date), 1) : null;
  const cycle = anchor && order.length ? { anchor, sets: order } : null;
  if (cycle) {
    let settings = rowsOf(db, 'daily-settings').find((row) => row.data.game === game);
    if (!settings) settings = createRow(ctx, 'daily-settings', { data: { game, seconds: game === 'careerPath' ? null : 30, cycle } });
    else if (JSON.stringify(settings.data.cycle) !== JSON.stringify(cycle))
      settings = editRow(ctx, 'daily-settings', settings.id, { version: settings.version, data: { ...settings.data, cycle }, position: settings.position, note: settings.note });
    if (settings.status === 'draft') settings = markReady(ctx, 'daily-settings', settings.id, settings.version);
    if (settings.status === 'ready') approve(ctx, 'daily-settings', settings.id, settings.version);
  }

  const first = new Map<string, string>();
  for (const row of dated) if (!first.has(String(row.data.puzzle))) first.set(String(row.data.puzzle), String(row.data.date));
  return { game, today, days: days.flatMap((puzzle) => (first.has(puzzle) ? [{ puzzle, date: first.get(puzzle)! }] : [])), cycle };
}
