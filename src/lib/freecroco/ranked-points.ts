import type { RankedPointsPair, RankedPointsTable } from '@/types/freecroco';

// Same bounds as the backend (internal API section 2, ranked points).
export const MAX_RANKED_POINTS = 5000;

export const MARGIN_LABELS = [
  'Win by 1 goal',
  'Win by 2 goals',
  'Win by 3 goals',
  'Win by 4 goals',
  'Win by 5 goals',
  'Win by 6 or more goals',
] as const;

export const PENALTY_WIN_LABEL = 'Draw, won on penalties';
export const DRAW_AFTER_PENALTIES_LABEL = 'Draw after penalties';
export const LEFT_NOT_AHEAD_LABEL = 'Opponent left, stayer not ahead';

export type PairSide = keyof RankedPointsPair;

/** Error keys: `margins.<i>.<side>` / `penaltyWin.<side>` for a value, `.row` for winner below loser. */
export type RankedPointsErrors = Partial<Record<string, string>>;

export interface RankedPointsValidation {
  valid: boolean;
  errors: RankedPointsErrors;
}

export function isValidPoints(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RANKED_POINTS;
}

const VALUE_ERROR = `Whole number from 0 to ${MAX_RANKED_POINTS}`;
const ROW_ERROR = 'Winner points must be at least the loser points';

export function validateRankedPoints(table: RankedPointsTable): RankedPointsValidation {
  const errors: RankedPointsErrors = {};
  const pair = (key: string, p: RankedPointsPair) => {
    if (!isValidPoints(p.winner)) errors[`${key}.winner`] = VALUE_ERROR;
    if (!isValidPoints(p.loser)) errors[`${key}.loser`] = VALUE_ERROR;
    if (isValidPoints(p.winner) && isValidPoints(p.loser) && p.winner < p.loser) errors[`${key}.row`] = ROW_ERROR;
  };
  table.margins.forEach((p, i) => pair(`margins.${i}`, p));
  pair('penaltyWin', table.penaltyWin);
  if (!isValidPoints(table.drawAfterPenalties)) errors.drawAfterPenalties = VALUE_ERROR;
  if (!isValidPoints(table.leftNotAhead)) errors.leftNotAhead = VALUE_ERROR;
  return { valid: Object.keys(errors).length === 0, errors };
}

/** The most one play can score: what players are shown as "up to". */
export function rankedMaxScore(table: RankedPointsTable): number {
  return Math.max(
    ...table.margins.map((p) => p.winner),
    table.penaltyWin.winner,
    table.drawAfterPenalties,
    table.leftNotAhead,
  );
}

export function updateMargin(table: RankedPointsTable, index: number, side: PairSide, value: number): RankedPointsTable {
  return { ...table, margins: table.margins.map((p, i) => (i === index ? { ...p, [side]: value } : p)) };
}

export function updatePenaltyWin(table: RankedPointsTable, side: PairSide, value: number): RankedPointsTable {
  return { ...table, penaltyWin: { ...table.penaltyWin, [side]: value } };
}

const samePair = (a: RankedPointsPair, b: RankedPointsPair) => a.winner === b.winner && a.loser === b.loser;

export function isRankedPointsDirty(saved: RankedPointsTable, draft: RankedPointsTable): boolean {
  return (
    saved.margins.length !== draft.margins.length ||
    saved.margins.some((p, i) => !samePair(p, draft.margins[i])) ||
    !samePair(saved.penaltyWin, draft.penaltyWin) ||
    saved.drawAfterPenalties !== draft.drawAfterPenalties ||
    saved.leftNotAhead !== draft.leftNotAhead
  );
}
