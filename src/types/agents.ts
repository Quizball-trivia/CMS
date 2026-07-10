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
  prompt?: I18nField;
  questionType?: string;
  difficulty?: AgentDifficulty | string;
  // mcq_single / true_false
  options?: AgentQuestionOption[];
  // clue_chain / career_path (type-specific fields sit at the top level of the draft)
  clues?: { type?: string; content: I18nField }[];
  clubs?: I18nField[];
  display_answer?: I18nField;
  accepted_answers?: string[];
  // put_in_order
  items?: { label: I18nField; sort_value: number }[];
  // countdown_list
  answer_groups?: { display: I18nField; accepted_answers?: string[] }[];
  [k: string]: unknown;
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
  // why the system paused itself (e.g. subscription weekly limit) — set while paused
  pauseReason?: string | null;
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

export type AgentPromptRole = 'generator' | 'factcheck' | 'criteria' | 'dedupe' | 'judge';

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
  difficulty?: AgentDifficulty;
  count?: number;
  // "25 hard / 20 medium / 5 easy" — the backend fans out one job per non-zero difficulty
  difficultyMix?: { easy: number; medium: number; hard: number };
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
    judged: number;
    windowHours: number;
  };
}

// ── Stats rollups ──
export interface AgentStatsDay {
  day: string;
  generated: number;
  approved: number;
  rejected: number;
  failed: number;
  pending: number;
  acceptPct: number;
  costCents: number;
}

export interface AgentStats {
  days: number;
  daily: AgentStatsDay[];
  rejections: { stage: string; count: number }[];
  timings: { role: string; avgSeconds: number; runs: number }[];
  totals: { generated: number; approved: number; rejected: number; failed: number; costCents: number; approvalRate: number };
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

// ── Review queue ──
// Type-specific payload shapes (as produced by the generators / stored in
// question_payloads). All text fields are bilingual {en, ka}.
export interface AgentQuestionPayload {
  type?: string;
  // image MCQs: the photo the question hinges on
  image?: { url: string; width?: number; height?: number; author?: string | null; license?: string | null };
  // mcq_single / true_false
  options?: AgentQuestionOption[];
  // clue_chain / career_path
  clues?: { type?: string; content: I18nField }[];
  clubs?: I18nField[];
  display_answer?: I18nField;
  accepted_answers?: string[];
  // put_in_order
  direction?: string;
  items?: { label: I18nField; sort_value: number }[];
  // countdown_list
  answer_groups?: { display: I18nField; accepted_answers?: string[] }[];
  // high_low
  stat_label?: I18nField;
  matchups?: { left_name: I18nField; left_value: number; right_name: I18nField; right_value: number }[];
  [k: string]: unknown;
}

export interface AgentReviewItem {
  id: string;
  type: string;
  difficulty: AgentDifficulty | string;
  categoryId: string;
  prompt: I18nField;
  // payload is type-specific (mcq options, clue chain, …); loosely typed
  // type-specific payload — shape depends on the question type:
  //  mcq_single/true_false: options[]; clue_chain/career_path: clues|clubs + display_answer;
  //  put_in_order: items[]; countdown_list: answer_groups[]
  payload: AgentQuestionPayload | null;
  verdicts: AgentTaskVerdicts | null;
  warnings: string[] | null;
  source: 'daily' | 'ranked' | string;
  jobType: string;
  topic: string | null;
  // active daily challenges this question can feed (empty = none right now)
  feedsChallenges: string[];
  createdAt: string;
}

export interface AgentReviewGroup {
  source: 'daily' | 'ranked' | string;
  topic: string | null;
  count: number;
  items: AgentReviewItem[];
}

export interface UpdateReviewQuestionRequest {
  prompt?: { en: string; ka: string };
  payload?: Record<string, unknown>;
}

export interface AgentReviewQueue {
  count: number;
  groups: AgentReviewGroup[];
}
