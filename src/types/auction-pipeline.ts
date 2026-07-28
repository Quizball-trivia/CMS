export interface AuctionPipelineStageCount {
  stage: string;
  count: number;
}

export interface AuctionPipelineVariantCount {
  variant_key: string;
  count: number;
  published: number;
}

export interface AuctionPipelineErrorClass {
  error_class: string;
  count: number;
}

export interface AuctionPipelineFailureSample {
  id: string;
  task_id: string;
  task_stage: string;
  status: string;
  error_class: string | null;
  error_message: string | null;
  external_call: string | null;
  created_at: string;
}

export interface AuctionPipelineSnapshot {
  id: string;
  source: string;
  status: string;
  player_row_count: number;
  valuation_row_count: number;
  created_at: string;
  promoted_at: string | null;
}

export interface AuctionPipelineWindowRate {
  hours: number;
  published: number;
  terminal: number;
  pass_rate: number | null;
}

export interface AuctionPipelineTotals {
  total_tasks: number;
  terminal_families: number;
  published_families: number;
  rejected_families: number;
  failed_families: number;
  pass_rate: number | null;
  recent_pass_rates: AuctionPipelineWindowRate[];
  eligible_players: number;
  players_done: number;
  players_remaining: number;
  completion_rate: number | null;
}

export interface AuctionPipelineAttempts24h {
  total: number;
  success: number;
  rejected: number;
  failed: number;
  by_error_class: AuctionPipelineErrorClass[];
}

export const AUCTION_PIPELINE_PROMPT_KEYS = [
  'generator_rules',
  'verifier_rules',
  'judge_rules',
  'variant_medium',
  'variant_hard',
] as const;

export type AuctionPipelinePromptKey = (typeof AUCTION_PIPELINE_PROMPT_KEYS)[number];

export interface AuctionPipelineWorker {
  worker_id: string;
  hostname: string;
  task_id: string | null;
  player_name: string | null;
  variant_key: string | null;
  stage: string | null;
  started_at: string;
  updated_at: string;
  seconds_since_heartbeat: number;
  is_stale: boolean;
}

export interface AuctionPipelineWorkers {
  workers: AuctionPipelineWorker[];
  live: number;
  stale: number;
}

export interface AuctionPipelinePrompt {
  key: string;
  text: string;
  updated_at: string;
  updated_by: string | null;
}

export interface AuctionPipelinePromptsResponse {
  items: AuctionPipelinePrompt[];
  effective: Record<string, AuctionPipelinePrompt>;
}

export interface AuctionPipelineRequeueRequest {
  taskIds?: string[];
  filter?: 'failed' | 'rejected';
}

export interface AuctionPipelineStats {
  generated_at: string;
  totals: AuctionPipelineTotals;
  stages: AuctionPipelineStageCount[];
  variants: AuctionPipelineVariantCount[];
  cards: {
    published: number;
    needs_review: number;
    superseded: number;
    rejected: number;
    published_families: number;
  };
  attempts_24h: AuctionPipelineAttempts24h;
  recent_failures: AuctionPipelineFailureSample[];
  latest_snapshot: AuctionPipelineSnapshot | null;
}
