/**
 * Types for the PR10 bot live-tuning surface (backend
 * /api/v1/internal/bots/tuning). Hand-written rather than generated: the
 * internal routes are not in the CMS's openapi snapshot.
 */

export interface BotGovernorTuning {
  governorStep: number;
  topProtectionStep: number;
  topProtectionMarginRp: number;
  topProtectionCriticalRp: number;
  topBandTargetWinrate: number;
  midLadderTargetWinrate: number;
}

/** What is actually in force: code constants overlaid with overrides. */
export interface BotTuningEffective {
  version: number;
  governor: BotGovernorTuning;
  ceilingMargin: number;
  activityScale: number;
  maxDailyCap: number;
  /** Derived server-side: S1 top-cohort accuracy minus the margin. */
  ceilingAccuracy: number;
}

/** The raw override row. `null` means "not overridden, using the code constant". */
export interface BotTuningOverrides {
  version: number;
  ceilingMargin: number | null;
  topBandTargetWinrate: number | null;
  midLadderTargetWinrate: number | null;
  governorStep: number | null;
  topProtectionStep: number | null;
  topProtectionMarginRp: number | null;
  topProtectionCriticalRp: number | null;
  activityScale: number | null;
  maxDailyCap: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/**
 * Bounds echoed by the server so the UI renders the real limits instead of
 * duplicating the numbers (which would drift from the schema).
 */
export interface BotTuningRails {
  ceilingMargin: { min: number; max: number; note: string };
  targetWinrate: { max: number; note: string };
  governorStep: { max: number; note: string };
  topProtectionStep: { min: number; max: number; note: string };
  topProtectionRings: { minMarginRp: number; minCriticalRp: number; note: string };
  dailyCap: { max: number };
  /** Bounds for the per-bot edit modal (PATCH roster/:botUserId). */
  perBotEdit?: {
    baseSkill: { min: number; max: number; note: string };
    rp: { marginBelowHumanTop10: number; note: string };
    dailyCap: { min: number; max: number };
    noteRequired: boolean;
  };
  immutable: {
    hardProbCap: number;
    hardSkillCap: number;
    hardMinAnswerTimeMs: number;
    note: string;
  };
}

export interface BotTuningResponse {
  effective: BotTuningEffective;
  overrides: BotTuningOverrides;
  rails: BotTuningRails;
}

/** The knobs a PUT may carry (excludes the `updatedBy` audit field). */
export type BotTuningField =
  | 'ceilingMargin'
  | 'topBandTargetWinrate'
  | 'midLadderTargetWinrate'
  | 'governorStep'
  | 'topProtectionStep'
  | 'topProtectionMarginRp'
  | 'topProtectionCriticalRp'
  | 'activityScale'
  | 'maxDailyCap';

/**
 * Omitted key = leave untouched; explicit `null` = reset to the code constant.
 * That distinction is load-bearing, so the request type keeps both.
 */
export type UpdateBotTuningRequest = Partial<Record<BotTuningField, number | null>> & {
  updatedBy?: string;
};

export interface BotRosterRow {
  botUserId: string;
  nickname: string | null;
  tier: string | null;
  rp: number | null;
  status: string;
  selectionFrozen: boolean;
  winrateEma: number | null;
  winrateSamples: number;
  governorAdjustment: number;
  matchesToday: number;
  dailyCap: number;
  /** Hidden ability offset (roster band 0.05–0.90); editable via PATCH. */
  baseSkill: number;
  lastSelectedAt: string | null;
}

export interface BotRosterPage {
  rows: BotRosterRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type BotRosterSort = 'rp' | 'winrate' | 'matches_today' | 'nickname';
export type BotRosterDirection = 'asc' | 'desc';

export interface BotRosterQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  frozen?: boolean;
  sort?: BotRosterSort;
  direction?: BotRosterDirection;
}

export interface ZeroOffsetsResponse {
  cleared: number;
}

/**
 * Per-bot edit payload. Every field is optional EXCEPT `note`, which the server
 * requires so the audit row records why the change was made.
 *
 * `rpSet` and `rpAdjust` are mutually exclusive; the server rejects both.
 */
export interface PatchBotRequest {
  nickname?: string;
  rpSet?: number;
  rpAdjust?: number;
  baseSkill?: number;
  dailyCap?: number;
  note: string;
}

export interface PatchBotResponse {
  botUserId: string;
  changed: boolean;
  requestId?: string;
  applied: {
    nickname?: string;
    rp?: number;
    tier?: string;
    baseSkill?: number;
    dailyCap?: number;
  };
  before?: {
    nickname: string | null;
    rp: number | null;
    baseSkill: number;
    dailyCap: number;
  };
  /** Server-side notes (e.g. that RP also moves difficulty). Surface these. */
  warnings: string[];
  note: string;
}

export interface BotAdminEdit {
  field: string;
  oldValue: string | null;
  newValue: string;
  note: string;
  actor: string;
  createdAt: string;
}

export interface BotAdminEditsResponse {
  botUserId: string;
  edits: BotAdminEdit[];
}
