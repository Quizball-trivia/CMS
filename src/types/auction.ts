import type { PaginatedResponse } from './api';

export type AuctionPositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type AuctionFameBucket = 'superstar' | 'known' | 'niche' | 'obscure' | 'legend';
export type AuctionValueType = 'current' | 'peak' | 'synthetic';
export type AuctionCardType =
  | 'normal'
  | 'safe_star'
  | 'bargain'
  | 'trap'
  | 'obscure_gem'
  | 'lookalike_story'
  | 'legend';
export type AuctionDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type AuctionCardStatus = 'draft' | 'needs_review' | 'published' | 'archived' | 'rejected';
export type AuctionVerificationStatus = 'passed' | 'failed' | 'needs_review';
export type AuctionPlayerActiveStatus = 'active' | 'retired' | 'legend' | 'unknown';
export type AuctionPlayerDataQualityStatus = 'pending' | 'usable' | 'needs_review' | 'rejected';
export type PlayerFactStatus = 'candidate' | 'verified' | 'rejected' | 'needs_review';
export type PlayerFactDiscoveredBy =
  | 'transfermarkt_dataset'
  | 'wikidata'
  | 'wikipedia'
  | 'llm_research'
  | 'manual'
  | 'derived';
export type LlmGenerationStatus = 'success' | 'failed' | 'invalid_json' | 'rejected';
export type LlmModelRole = 'researcher' | 'generator' | 'verifier' | 'translator';

export interface AuctionPlayerSummary {
  id: string;
  name: string;
  display_name: Record<string, unknown>;
  nationality: string | null;
  nationality_code: string | null;
  position_group: AuctionPositionGroup | null;
  current_club: string | null;
  active_status: AuctionPlayerActiveStatus;
  image_url: string | null;
  fame_score: number | null;
  fame_bucket: AuctionFameBucket | null;
  data_quality_status: AuctionPlayerDataQualityStatus;
}

export interface AuctionPlayerDetail extends AuctionPlayerSummary {
  transfermarkt_id: string | null;
  wikidata_id: string | null;
  date_of_birth: string | null;
  current_value_eur: number | null;
  peak_value_eur: number | null;
  source_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AuctionCardSummary {
  id: string;
  player_id: string;
  position_group: AuctionPositionGroup;
  true_value_eur: number;
  starting_price_eur: number;
  value_type: AuctionValueType;
  card_type: AuctionCardType;
  difficulty: AuctionDifficulty;
  status: AuctionCardStatus;
  verification_status: AuctionVerificationStatus;
  generator_model?: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  player: AuctionPlayerSummary;
  clue_count: number;
}

export interface AuctionCardClue {
  id: string;
  auction_card_id: string;
  clue_order: number;
  clue_en: string;
  clue_ka: string;
  clue_kind: string;
  supported_fact_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface PlayerFact {
  id: string;
  player_id: string;
  fact_type: string;
  fact_text_en: string;
  fact_text_ka: string | null;
  source_name: string | null;
  source_url: string | null;
  evidence_quote: string | null;
  confidence: number | null;
  status: PlayerFactStatus;
  discovered_by: PlayerFactDiscoveredBy;
  verified_by_model: string | null;
  verifier_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LlmGenerationRunSummary {
  id: string;
  job_name: string;
  model_name: string;
  model_role: LlmModelRole;
  prompt_version: string;
  status: LlmGenerationStatus;
  error_message: string | null;
  latency_ms: number | null;
  token_usage: Record<string, unknown>;
  cost_estimate: number | null;
  editor_rating: number | null;
  editor_selected: boolean;
  created_at: string;
}

export interface AuctionCardDetail {
  id: string;
  player_id: string;
  position_group: AuctionPositionGroup;
  true_value_eur: number;
  starting_price_eur: number;
  value_type: AuctionValueType;
  card_type: AuctionCardType;
  difficulty: AuctionDifficulty;
  status: AuctionCardStatus;
  generator_model: string | null;
  verifier_model: string | null;
  prompt_version: string | null;
  generation_run_id: string | null;
  verification_status: AuctionVerificationStatus;
  verification_notes: string | null;
  editor_notes: string | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
  player: AuctionPlayerDetail;
  clues: AuctionCardClue[];
  supported_facts: PlayerFact[];
  generation_run: LlmGenerationRunSummary | null;
}

export interface ListAuctionCardsParams {
  status?: AuctionCardStatus;
  position_group?: AuctionPositionGroup;
  card_type?: AuctionCardType;
  difficulty?: AuctionDifficulty;
  fame_bucket?: AuctionFameBucket;
  verification_status?: AuctionVerificationStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export type PaginatedAuctionCardsResponse = PaginatedResponse<AuctionCardSummary>;

export interface UpdateAuctionCardClueRequest {
  clue_order: number;
  clue_en: string;
  clue_ka: string;
  clue_kind: string;
  supported_fact_ids?: string[];
}

export interface UpdateAuctionCardRequest {
  true_value_eur?: number;
  starting_price_eur?: number;
  value_type?: AuctionValueType;
  card_type?: AuctionCardType;
  difficulty?: AuctionDifficulty;
  verification_status?: AuctionVerificationStatus;
  verification_notes?: string | null;
  editor_notes?: string | null;
  clues?: UpdateAuctionCardClueRequest[];
}

export interface UpdateAuctionCardStatusRequest {
  status: AuctionCardStatus;
  force?: boolean;
}
