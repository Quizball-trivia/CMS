import { addDays, dayNumber } from '@/lib/td/georgia';
import type { CalendarChange, CalendarOverride, CalendarResponse, PartnerGameConfig, PartnerGameId } from '@/types/freecroco';
import { isValidLimit, maxLimitFor, PARTNER_GAME_IDS } from './games';

export const MAX_CHANGES_PER_SAVE = 100;
export const CALENDAR_HORIZON_DAYS = 90;

const key = (date: string, gameId: PartnerGameId) => `${date}|${gameId}`;

/** Pending edits keyed by date and game: a number sets the override, null removes it. */
export type CalendarEdits = ReadonlyMap<string, number | null>;

export function editKey(date: string, gameId: PartnerGameId): string {
  return key(date, gameId);
}

/** Dates from today (Tbilisi) to +90 days are editable; everything else is read-only. */
export function isEditableDate(date: string, today: string): boolean {
  return date >= today && date <= addDays(today, CALENDAR_HORIZON_DAYS);
}

export function weekStart(date: string): string {
  const n = dayNumber(date);
  if (n === null) throw new Error(`Not a date: ${date}`);
  // 1970-01-01 was a Thursday, so this is the Monday-first weekday.
  return addDays(date, -((((n + 3) % 7) + 7) % 7));
}

/** The first and last date shown in the month grid, which covers the neighbouring days too. */
export function monthRange(month: string): { from: string; to: string } {
  const first = `${month}-01`;
  const nextMonthFirst = (() => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })();
  return { from: weekStart(first), to: addDays(weekStart(addDays(nextMonthFirst, -1)), 6) };
}

/** Monday-first weeks of dates covering the month, padded with the neighbouring months' days. */
export function monthWeeks(month: string): string[][] {
  const { from, to } = monthRange(month);
  const total = (dayNumber(to)! - dayNumber(from)! + 1) / 7;
  return Array.from({ length: total }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(from, w * 7 + d)));
}

export function overrideMap(overrides: readonly CalendarOverride[]): Map<string, number> {
  return new Map(overrides.map((o) => [key(o.date, o.gameId), o.limit]));
}

/** The override for a cell with pending edits applied; undefined means "use the default". */
export function overrideFor(
  server: ReadonlyMap<string, number>,
  edits: CalendarEdits,
  date: string,
  gameId: PartnerGameId,
): number | undefined {
  const k = key(date, gameId);
  if (edits.has(k)) return edits.get(k) ?? undefined;
  return server.get(k);
}

export function effectiveLimit(
  games: readonly PartnerGameConfig[],
  server: ReadonlyMap<string, number>,
  edits: CalendarEdits,
  date: string,
  gameId: PartnerGameId,
): number {
  return overrideFor(server, edits, date, gameId) ?? games.find((g) => g.gameId === gameId)?.defaultLimit ?? 0;
}

/** Records an edit, or drops it when it puts the cell back to what the server has. */
export function setCellEdit(
  server: ReadonlyMap<string, number>,
  edits: CalendarEdits,
  date: string,
  gameId: PartnerGameId,
  value: number | null,
): Map<string, number | null> {
  const next = new Map(edits);
  const k = key(date, gameId);
  if ((server.get(k) ?? null) === value) next.delete(k);
  else next.set(k, value);
  return next;
}

/** One week of overrides (Monday first), as the effective values at copy time. */
export type WeekSnapshot = Array<Partial<Record<PartnerGameId, number>>>;

export function snapshotWeek(server: ReadonlyMap<string, number>, edits: CalendarEdits, monday: string): WeekSnapshot {
  return Array.from({ length: 7 }, (_, offset) => {
    const day: Partial<Record<PartnerGameId, number>> = {};
    for (const gameId of PARTNER_GAME_IDS) {
      const value = overrideFor(server, edits, addDays(monday, offset), gameId);
      if (value !== undefined) day[gameId] = value;
    }
    return day;
  });
}

export interface WeekPasteResult {
  edits: Map<string, number | null>;
  /** Target days left alone because they are read-only. */
  skippedDays: number;
}

/** Makes the target week's overrides match the snapshot, day by day; days without an override lose theirs. */
export function pasteWeek(
  server: ReadonlyMap<string, number>,
  edits: CalendarEdits,
  snapshot: WeekSnapshot,
  targetMonday: string,
  today: string,
): WeekPasteResult {
  let next = new Map(edits);
  let skippedDays = 0;
  snapshot.forEach((day, offset) => {
    const target = addDays(targetMonday, offset);
    if (!isEditableDate(target, today)) {
      skippedDays++;
      return;
    }
    for (const gameId of PARTNER_GAME_IDS) {
      next = setCellEdit(server, next, target, gameId, day[gameId] ?? null);
    }
  });
  return { edits: next, skippedDays };
}

/**
 * The PUT changes: only real differences, only editable dates, in a stable order. Edits on dates outside
 * `loaded` (another month, fetched earlier) are kept as they are because the server copy here cannot judge them.
 */
export function buildChangeSet(
  server: ReadonlyMap<string, number>,
  edits: CalendarEdits,
  today: string,
  loaded: { from: string; to: string },
): CalendarChange[] {
  const changes: CalendarChange[] = [];
  for (const [k, limit] of edits) {
    const [date, gameId] = k.split('|') as [string, PartnerGameId];
    if (!isEditableDate(date, today)) continue;
    const inLoaded = date >= loaded.from && date <= loaded.to;
    if (inLoaded && (server.get(k) ?? null) === limit) continue;
    changes.push({ date, gameId, limit });
  }
  return changes.sort(
    (a, b) => a.date.localeCompare(b.date) || PARTNER_GAME_IDS.indexOf(a.gameId) - PARTNER_GAME_IDS.indexOf(b.gameId),
  );
}

export function validateChangeSet(changes: readonly CalendarChange[]): string | null {
  if (changes.length > MAX_CHANGES_PER_SAVE) {
    return `A save takes at most ${MAX_CHANGES_PER_SAVE} changes; ${changes.length} are pending. Save in smaller batches.`;
  }
  const bad = changes.find((c) => c.limit !== null && !isValidLimit(c.gameId, c.limit));
  if (bad) return `${bad.date}: plays per day must be a whole number from 0 to ${maxLimitFor(bad.gameId)}`;
  return null;
}

/**
 * A cached calendar range as it stands once `changes` have been saved on top of it: the saved changes are
 * applied to the range's own overrides and the version moves to the saved one. Only valid for a range
 * loaded at the version the save was based on (the compare-and-set guarantees nothing else changed since).
 */
export function applySavedChanges(
  cached: CalendarResponse,
  range: { from: string; to: string },
  changes: readonly CalendarChange[],
  savedVersion: number,
): CalendarResponse {
  const map = overrideMap(cached.overrides);
  for (const change of changes) {
    if (change.date < range.from || change.date > range.to) continue;
    const k = key(change.date, change.gameId);
    if (change.limit === null) map.delete(k);
    else map.set(k, change.limit);
  }
  const overrides = [...map].map(([k, limit]) => {
    const [date, gameId] = k.split('|') as [string, PartnerGameId];
    return { date, gameId, limit };
  });
  overrides.sort(
    (a, b) => a.date.localeCompare(b.date) || PARTNER_GAME_IDS.indexOf(a.gameId) - PARTNER_GAME_IDS.indexOf(b.gameId),
  );
  return { version: savedVersion, overrides };
}
