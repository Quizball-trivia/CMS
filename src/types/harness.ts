// The new HQ agent harness (`/admin/harness`): the Content tab. Hand-written
// like the HQ types; the backend shapes live in
// quizball-backend/src/modules/harness/harness.service.ts.

export type HarnessReleaseStatus = 'draft' | 'published';

export interface HarnessSettings {
  paused: boolean;
  pausedReason: string | null;
  maxConcurrentRuns: number;
  dailyRunLimit: number;
  updatedAt: string | null;
}

export interface HarnessCategoryHealth {
  categoryId: string;
  slug: string;
  views30d: number;
  pool: number;
  inPipeline: number;
  needed: number;
  shortage: number;
}

export interface HarnessAccount {
  id: string;
  provider: 'claude' | 'codex';
  label: string;
  secretRef: string;
  status: 'active' | 'disabled';
  reservedForPeople: boolean;
  softPct: number;
  state: 'ok' | 'limit' | 'auth';
  blockedUntil: string | null;
  windows: Record<string, { status: string; utilization: number | null; resets_at: string | null }>;
  lastError: string | null;
}

export interface HarnessAgent {
  slug: string;
  name: string;
  team: string;
  description: string;
  provider: 'claude' | 'codex';
  model: string;
  effort: string | null;
  primaryAccount: string;
  fallbackAccounts: string[];
  status: 'active' | 'paused';
  runsToday: number;
  costCentsToday: number;
  lastRunAt: string | null;
}

export interface HarnessRun {
  id: string;
  agent: string;
  account: string | null;
  model: string;
  status: 'running' | 'succeeded' | 'failed' | 'timeout' | 'cancelled';
  tokensIn: number;
  tokensOut: number;
  costCents: number;
  error: string | null;
  startedAt: string | null;
  endedAt: string | null;
}

export interface HarnessEvent {
  id: string;
  type: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  itemId: string | null;
  createdAt: string | null;
}

export interface HarnessPolicy {
  key: string;
  value: unknown;
  note: string;
  editable: boolean;
  updatedAt: string | null;
}

export interface HarnessOverview {
  settings: HarnessSettings;
  today: { runs: number; costCents: number; failed: number };
  classic: { viewCap: number; shortCategories: number; totalShortage: number; categories: HarnessCategoryHealth[] };
  stages: Array<{ mode: string; stage: string; count: number }>;
  jobs: Array<{ kind: string; status: string; count: number }>;
  accounts: HarnessAccount[];
  agents: HarnessAgent[];
  runs: HarnessRun[];
  events: HarnessEvent[];
  policies: HarnessPolicy[];
}

export interface HarnessUpdateSettingsRequest {
  paused?: boolean;
  pausedReason?: string | null;
  maxConcurrentRuns?: number;
  dailyRunLimit?: number;
}
