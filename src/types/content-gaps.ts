// Content gaps (CMS HQ → Content gaps): answers players typed that a game could not judge well, and the fixes the
// Content Fixer / Content Verifier agents record for them. Hand-written: these admin endpoints are not in the OpenAPI spec.

export type ContentGapVerdict = 'unknown' | 'uncovered' | 'ambiguous' | 'miss' | 'reported';
export type ContentGapStatus = 'open' | 'checking' | 'proposed' | 'verified' | 'held' | 'fixed' | 'junk' | 'correct' | 'wontfix';
export type ContentGapHumanTarget = 'open' | 'held' | 'junk' | 'correct' | 'wontfix';
export type ContentFixStatus = 'proposed' | 'verified' | 'held' | 'rejected' | 'published' | 'failed' | 'rolled_back';
export type ContentFixHumanTarget = 'rejected' | 'held' | 'proposed';

export interface ContentGapSample { locale: string; typed: string }

export interface ContentGap {
  id: number;
  game: string;
  mode: string;
  boardKey: string;
  context: string;
  verdict: ContentGapVerdict;
  norm: string;
  resolvedId: string | null;
  candidateIds: string[] | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
  status: ContentGapStatus;
  revision: number;
  fixId: number | null;
  samples: ContentGapSample[];
  audit?: Array<{ at: string; actor: string | null; from: string; to: string; reason: string }>;
}

export interface ContentGapSummaryRow { game: string; verdict: ContentGapVerdict; status: ContentGapStatus; gaps: number; typed: number; lastSeen: string }

export interface ContentFixSource { url: string; quote: string; fetchedAt?: string; publisher?: string }

export interface ContentFix {
  id: number;
  kind: string;
  game: string;
  boardKey: string;
  gapIds: number[];
  payload: Record<string, unknown>;
  evidence: ContentFixSource[];
  context: Record<string, unknown>;
  status: ContentFixStatus;
  proposer: string;
  verifier: string | null;
  verification: { verdict: string; extracted: Record<string, unknown>; sources: ContentFixSource[]; checks: { publishers: number; matches: boolean }; at: string } | null;
  revision: number;
  audit: Array<{ at: string; actor: string | null; from: string; to: string; reason: string }>;
  createdAt: string;
  verifiedAt: string | null;
  gaps: Array<{ id: number; verdict: ContentGapVerdict; norm: string; count: number; status: ContentGapStatus }>;
}

export interface ContentGapsListParams {
  status?: ContentGapStatus;
  game?: string;
  verdict?: ContentGapVerdict;
  locale?: string;
  minCount?: number;
  limit?: number;
  offset?: number;
}

export interface ContentFixesListParams { status?: ContentFixStatus; game?: string; kind?: string; limit?: number; offset?: number }
