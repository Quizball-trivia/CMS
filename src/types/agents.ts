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
  spentWeekCents: number;
  spentMonthCents: number;
  monthlyCreditCents: number;
  paused: boolean;
}

export interface AgentRosterEntry {
  role: string;
  label: string;
  description: string;
  model: string;
  promptVersion: number | null;
  promptPreview: string | null;
  runsToday: number;
  succeededToday: number;
  failedToday: number;
  runningNow: number;
  avgCostCents: number;
  lastRunAt: string | null;
}

export type AgentQuestionTypeId =
  | 'mcq_single'
  | 'true_false'
  | 'clue_chain'
  | 'put_in_order'
  | 'countdown_list'
  | 'career_path';

export interface AgentQuestionType {
  type: AgentQuestionTypeId | string;
  label: string;
  description: string;
  enabled: boolean;
  sortOrder: number;
}

export interface UpdateAgentQuestionTypeRequest {
  enabled?: boolean;
  description?: string;
}

export type AgentPromptRole = 'generator' | 'factcheck' | 'criteria' | 'dedupe';

// Prompts are stored per (role, type). A type of '*' is the role-level default
// applied to every question type unless a type-specific override exists.
export const DEFAULT_PROMPT_TYPE = '*';

export interface AgentPrompt {
  role: AgentPromptRole | string;
  type: string;
  content: string;
  version: number;
  note: string | null;
  updatedAt: string;
}

export interface AgentPromptVersion {
  id: string;
  version: number;
  content: string;
  note: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SaveAgentPromptRequest {
  content: string;
  note?: string;
  type?: string;
}

export interface ListAgentJobsParams {
  limit?: number;
  offset?: number;
}

export interface SpawnAgentJobRequest {
  type: AgentJobType;
  questionType: string;
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

// ── Live activity feed ──
export interface AgentLiveSession {
  id: string;
  role: AgentPromptRole | string;
  model: string | null;
  jobId: string | null;
  taskSeq: number | null;
  topic: string | null;
  question: string | null;
  startedAt: string;
  durationSeconds: number;
}

export interface AgentActivity {
  running: AgentLiveSession[];
  recent: {
    generated: number;
    approved: number;
    rejected: number;
    failed: number;
    windowHours: number;
  };
}

// ── Stats rollups ──
export interface AgentStatsDay {
  day: string;
  approved: number;
  rejected: number;
  costCents: number;
}

export interface AgentStats {
  days: number;
  daily: AgentStatsDay[];
  rejections: { stage: string; count: number }[];
  timings: { role: string; avgSeconds: number; runs: number }[];
  totals: { approved: number; rejected: number; costCents: number; approvalRate: number };
}

// ── Schedules (daily-challenge cron) ──
export interface AgentSchedule {
  id: string;
  label: string;
  jobType: string;
  enabled: boolean;
  hourTbilisi: number;
  params: {
    count?: number;
    difficulty?: AgentDifficulty;
    questionType?: string;
    categoryId?: string;
    topic?: string;
    [k: string]: unknown;
  };
  lastRunAt: string | null;
  lastJobId: string | null;
  lastStatus: string | null;
}

export interface UpdateAgentScheduleRequest {
  enabled?: boolean;
  hourTbilisi?: number;
  params?: Record<string, unknown>;
}
