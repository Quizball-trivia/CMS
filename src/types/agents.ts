// Types for the Agents admin section.
//
// These mirror the new backend `/admin/agents` module, which is NOT yet part of
// the generated OpenAPI spec — so they are hand-written here rather than derived
// from `api.generated.ts`.

import type { I18nField } from '@/types';

export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'partial'
  | 'cancelled';

export type AgentDifficulty = 'easy' | 'medium' | 'hard';

export type AgentJobType = 'mcq_generate';

export interface AgentJobCounts {
  target?: number;
  generated?: number;
  approved?: number;
  published?: number;
  rejected?: number;
  failed?: number;
  [key: string]: number | undefined;
}

export interface AgentJob {
  id: string;
  type: AgentJobType | string;
  status: AgentJobStatus;
  params: Record<string, unknown>;
  counts: AgentJobCounts;
  requestedBy: string | null;
  budgetCents: number | null;
  spentCents: number | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentQuestionOption {
  text: I18nField;
  is_correct: boolean;
}

export interface AgentQuestionDraft {
  prompt: I18nField;
  options: AgentQuestionOption[];
  difficulty: AgentDifficulty | string;
}

export interface AgentTaskVerdicts {
  dedupe?: unknown;
  factcheck?: unknown;
  criteria?: unknown;
  [key: string]: unknown;
}

export type AgentTaskDecision = 'approved' | 'rejected' | string;

export interface AgentTask {
  id: string;
  jobId: string;
  seq: number;
  status: string;
  stage: string | null;
  questionDraft: AgentQuestionDraft | null;
  verdicts: AgentTaskVerdicts | null;
  warnings: string[] | null;
  decision: AgentTaskDecision | null;
  rejectReason: string | null;
  publishedQuestionId: string | null;
  attempt: number;
  error: string | null;
}

export type AgentEventLevel = 'info' | 'warn' | 'error' | string;

export interface AgentEvent {
  id: string;
  taskId: string | null;
  ts: string;
  level: AgentEventLevel;
  type: string;
  message: string;
}

export interface AgentMonitorRole {
  role: string;
  count: number;
}

export interface AgentMonitor {
  running: AgentMonitorRole[];
  total: number;
}

export interface AgentBudget {
  limitCents: number;
  spentTodayCents: number;
  paused: boolean;
}

export interface ListAgentJobsParams {
  limit?: number;
  offset?: number;
}

export interface SpawnAgentJobRequest {
  type: AgentJobType;
  categoryId: string;
  topic: string;
  difficulty: AgentDifficulty;
  count: number;
  budgetCents?: number;
}

export interface UpdateAgentBudgetRequest {
  limitCents?: number;
  paused?: boolean;
}
