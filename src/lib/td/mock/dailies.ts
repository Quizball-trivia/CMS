/** POST /admin/dailies/:game/publish, as the API does it (apps/api/src/content/dailyPublish.ts): whole days approved,
 *  today pinned to the day the current release plays, each never-dated day on the next free date, the cycle every
 *  dated day then those it repeated already, from the day after the last. The calendar is read from approved
 *  entries; an archived entry or settings row comes back before it is used. A refused request leaves nothing behind
 *  (the router keeps no copy of it). */

import { addDays, georgiaToday, scheduledSet } from '../georgia';
import { TD_DAILY_DAY_SIZES, type TdDailyGameKey } from '../dailies';
import { approve, createRow, editRow, markReady, restore, rowsOf, type MockContext } from './content';
import { DAILY_TYPE } from './model';
import { MockError } from './util';
import type { MockRow } from './db';

const live = (row: MockRow) => row.status !== 'archived';

/** The longest repeat order the contract carries (DailySettings cycle.sets). */
const CYCLE_MAX = 400;

export function publishDays(ctx: MockContext, game: TdDailyGameKey, puzzles: string[]) {
  const { db } = ctx;
  const type = DAILY_TYPE[game];
  const size = TD_DAILY_DAY_SIZES[game];
  const today = georgiaToday(ctx.now);
  const days = [...new Set(puzzles)];

  const moveAlong = (row: MockRow) => {
    if (row.status === 'draft') markReady(ctx, row.type, row.id, row.version);
    if (row.status === 'ready') approve(ctx, row.type, row.id, row.version);
  };
  /** An archived row back, or false when it cannot come back as it was (what it names is gone). */
  const bringBack = (row: MockRow) => {
    try {
      restore(ctx, row.type, row.id, row.version);
      return true;
    } catch (error) {
      if (error instanceof MockError && error.code === 'dependency_unapproved') return false;
      throw error;
    }
  };

  // 1. Whole days only: their live questions, ready and approved; then exactly that many approved.
  const dayRows = (puzzle: string) => rowsOf(db, type).filter((row) => live(row) && row.data.puzzle === puzzle);
  const incomplete = days.flatMap((puzzle) => {
    const n = dayRows(puzzle).length;
    return n === size ? [] : [{ path: puzzle, message: `${n} of ${size} questions` }];
  });
  if (incomplete.length) throw new MockError(422, 'validation', `A day has ${size} questions`, { issues: incomplete });
  const sources = new Set(
    days.flatMap((puzzle) =>
      dayRows(puzzle)
        .filter((row) => row.approvedVersion !== null && row.approved?.puzzle !== puzzle)
        .map((row) => String(row.approved?.puzzle)),
    ),
  );
  // Football Logic's uploaded pictures go with their questions: one never approved is marked ready and approved.
  if (game === 'footballLogic') {
    const keys = new Set(days.flatMap((puzzle) => dayRows(puzzle).flatMap((row) => [row.data.imageAKey, row.data.imageBKey])).filter((key): key is string => typeof key === 'string'));
    for (const picture of rowsOf(db, 'media').filter((row) => live(row) && row.approvedVersion === null && keys.has(String(row.data.key)))) moveAlong(picture);
  }
  for (const puzzle of days) for (const row of dayRows(puzzle)) moveAlong(row);
  const approvedCount = (puzzle: string) =>
    rowsOf(db, type).filter((row) => live(row) && row.approvedVersion !== null && row.approved?.puzzle === puzzle).length;
  for (const puzzle of days) {
    const n = approvedCount(puzzle);
    if (n !== size) incomplete.push({ path: puzzle, message: `${n} of ${size} approved questions` });
  }
  for (const source of sources) {
    if (days.includes(source)) continue;
    const n = approvedCount(source);
    if (n > 0 && n !== size) incomplete.push({ path: source, message: `${n} of ${size} approved questions once the moves are approved` });
  }
  if (incomplete.length) throw new MockError(422, 'validation', `A day has ${size} questions`, { issues: incomplete });

  /** The calendar as releases read it: approved entries, by date. */
  const calendar = () =>
    rowsOf(db, 'daily-schedule')
      .filter((row) => live(row) && row.approvedVersion !== null && row.data.game === game)
      .map((row) => ({ date: String(row.approved!.date), puzzle: String(row.approved!.puzzle) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const hasApproved = (puzzle: string) => approvedCount(puzzle) > 0;
  /** `puzzle` on `date`, approved; false when an archived entry there cannot be restored: that date is not free. */
  const putDay = (date: string, puzzle: string) => {
    let row = rowsOf(db, 'daily-schedule').find((r) => r.data.game === game && r.data.date === date);
    if (!row) {
      moveAlong(createRow(ctx, 'daily-schedule', { data: { game, date, puzzle } }));
      return true;
    }
    if (row.status === 'archived' && !bringBack(row)) return false;
    if (row.data.puzzle !== puzzle)
      row = editRow(ctx, 'daily-schedule', row.id, { version: row.version, data: { ...row.data, puzzle }, position: row.position, note: row.note });
    moveAlong(row);
    return true;
  };

  // 2. Today keeps the day the current release plays (the API looks at today's assignment first; the mock has none:
  //    no player starts a daily here).
  let dated = calendar();
  if (!dated.some((d) => d.date === today)) {
    const current = db.releases.find((r) => r.id === db.pointer.releaseId)?.dailies?.[game];
    const playing = current ? scheduledSet(current.dates[today], current.cycle, today) : null;
    if (playing) {
      if (!hasApproved(playing) || !putDay(today, playing))
        throw new MockError(409, 'dependency_unapproved', 'Approve what this refers to first', { refs: [{ type, puzzle: playing }] });
      dated = calendar();
    }
  }

  // 3. Each day that never had a date: the next free one, after the last.
  const everDated = new Set(dated.map((d) => d.puzzle));
  let last = dated.reduce((max, d) => (d.date > max ? d.date : max), today);
  for (const puzzle of days) {
    if (everDated.has(puzzle)) continue;
    do last = addDays(last, 1);
    while (!putDay(last, puzzle));
    everDated.add(puzzle);
  }
  dated = calendar();

  // 4. Every dated day by its first date, then those the cycle repeated already (with approved questions).
  const settings = rowsOf(db, 'daily-settings').find((row) => row.data.game === game);
  const repeated = settings?.approvedVersion != null ? (((settings.approved?.cycle as { sets?: string[] } | null)?.sets ?? []) as string[]) : [];
  const order: string[] = [];
  for (const puzzle of [...dated.map((d) => d.puzzle), ...repeated]) if (!order.includes(puzzle) && hasApproved(puzzle)) order.push(puzzle);
  const anchor = dated.length ? addDays(dated[dated.length - 1]!.date, 1) : null;
  const cycle = anchor && order.length ? { anchor, sets: order.slice(-CYCLE_MAX) } : null;
  if (cycle) {
    if (!settings) moveAlong(createRow(ctx, 'daily-settings', { data: { game, seconds: game === 'careerPath' ? null : 30, cycle } }));
    else {
      if (settings.status === 'archived' && !bringBack(settings))
        throw new MockError(409, 'in_use', 'The game’s settings are archived and cannot be restored as they were');
      const row =
        JSON.stringify(settings.data.cycle) === JSON.stringify(cycle)
          ? settings
          : editRow(ctx, 'daily-settings', settings.id, { version: settings.version, data: { ...settings.data, cycle }, position: settings.position, note: settings.note });
      moveAlong(row);
    }
  }

  const first = new Map<string, string>();
  for (const d of dated) if (!first.has(d.puzzle)) first.set(d.puzzle, d.date);
  return { game, today, days: days.flatMap((puzzle) => (first.has(puzzle) ? [{ puzzle, date: first.get(puzzle)! }] : [])), cycle };
}
