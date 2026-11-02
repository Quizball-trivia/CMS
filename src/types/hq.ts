// QuizBall HQ — people + AI agent "employees" working one task board.
//
// The `/admin/hq` backend endpoints are not part of the generated OpenAPI spec
// (same as `/admin/agents`), so these shapes are hand-written to match the
// backend's camelCase responses.

export type HqTaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'needs_approval'
  | 'blocked'
  | 'done'
  | 'cancelled';

/** 0 urgent · 1 high · 2 normal · 3 low */
export type HqPriority = 0 | 1 | 2 | 3;

export type HqMemberKind = 'human' | 'agent';
export type HqRuntime = 'hq' | 'question_agents' | 'bug_triage' | 'none';
export type HqMemberStatus = 'active' | 'paused' | 'archived';
export type HqAutonomy = 'autonomous' | 'approval';
export type HqToolGroup = 'web' | 'metrics' | 'feedback';
export type HqRunStatus = 'running' | 'succeeded' | 'failed' | 'timeout' | 'cancelled';
export type HqMessageKind = 'comment' | 'handoff' | 'system' | 'result';
export type HqEventLevel = 'info' | 'warn' | 'error';

export interface HqMemberRef {
  id: string;
  slug: string;
  name: string;
  avatar: string;
  color: string;
  kind: HqMemberKind;
}

export interface HqMemberStats {
  openTasks: number;
  runsToday: number;
  costTodayCents: number;
  currentTask: { id: string; number: number; title: string } | null;
  lastRun: { id: string; status: HqRunStatus; startedAt: string; endedAt: string | null } | null;
}

export interface HqMember extends HqMemberRef {
  userId: string | null;
  title: string;
  description: string;
  instructions: string;
  model: string | null;
  tools: string[];
  autonomy: HqAutonomy;
  runtime: HqRuntime;
  status: HqMemberStatus;
  maxTurns: number;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: HqMemberStats;
}

export interface HqTask {
  id: string;
  number: number;
  title: string;
  body: string;
  status: HqTaskStatus;
  priority: HqPriority;
  assignee: HqMemberRef | null;
  createdBy: HqMemberRef | null;
  parentId: string | null;
  depth: number;
  scheduleId: string | null;
  result: string | null;
  position: number;
  attempts: number;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface HqMessage {
  id: number;
  taskId: string | null;
  author: HqMemberRef | null;
  recipient: HqMemberRef | null;
  kind: HqMessageKind;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface HqRun {
  id: string;
  member: HqMemberRef;
  taskId: string | null;
  taskNumber: number | null;
  taskTitle: string | null;
  status: HqRunStatus;
  model: string | null;
  turns: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costCents: number;
  summary: string | null;
  error: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
}

export interface HqRunLogEntry {
  ts: string;
  tool: string;
  input: unknown;
  ok: boolean;
}

export interface HqRunDetail extends HqRun {
  log: HqRunLogEntry[];
  sdkSessionId: string | null;
}

export interface HqTaskDetail extends HqTask {
  messages: HqMessage[];
  runs: HqRun[];
  children: HqTask[];
  parent: HqTask | null;
}

export interface HqSchedule {
  id: string;
  member: HqMemberRef;
  name: string;
  cron: string;
  timezone: string;
  taskTitle: string;
  taskBody: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastTaskId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HqEvent {
  id: number;
  ts: string;
  type: string;
  level: HqEventLevel;
  member: HqMemberRef | null;
  taskId: string | null;
  taskNumber: number | null;
  runId: string | null;
  message: string;
  data: Record<string, unknown>;
}

export interface HqSettings {
  paused: boolean;
  pausedReason: string | null;
  dailyLimitCents: number;
  dailyRunLimit: number;
  maxConcurrentRuns: number;
  updatedAt: string;
  today: { runs: number; costCents: number };
}

export interface HqOverview {
  settings: HqSettings;
  today: { runs: number; costCents: number; tasksCreated: number; tasksDone: number; failedRuns: number };
  countsByStatus: Record<HqTaskStatus, number>;
  needsApproval: HqTask[];
  blocked: HqTask[];
  inProgress: HqTask[];
  recentResults: HqTask[];
  runningRuns: HqRun[];
  team: HqMember[];
  latestBriefing: HqTask | null;
  inboxUnread: number;
}

export type HqExternalStats =
  | { kind: 'question_agents'; jobs7d: number; accepted7d: number; rejected7d: number; failed7d: number }
  | { kind: 'bug_triage'; reports7d: number; prsOpened7d: number; needsInfo7d: number };

export interface HqMemberDetail extends HqMember {
  recentRuns: HqRun[];
  openTasks: HqTask[];
  recentTasks: HqTask[];
  schedules: HqSchedule[];
  external: HqExternalStats | null;
}

// ── Requests ──

export interface HqCreateMemberRequest {
  slug: string;
  name: string;
  title?: string;
  avatar?: string;
  color?: string;
  description?: string;
  instructions: string;
  model?: string | null;
  tools?: string[];
  autonomy?: HqAutonomy;
  maxTurns?: number;
  status?: HqMemberStatus;
}

export type HqUpdateMemberRequest = Partial<
  Pick<
    HqMember,
    'name' | 'title' | 'avatar' | 'color' | 'description' | 'instructions' | 'model' | 'tools' | 'autonomy' | 'maxTurns' | 'status'
  >
>;

export interface HqListTasksParams {
  status?: HqTaskStatus[];
  assigneeId?: string;
  q?: string;
  limit?: number;
}

export interface HqCreateTaskRequest {
  title: string;
  body?: string;
  assigneeId?: string | null;
  priority?: HqPriority;
  status?: 'backlog' | 'todo';
  parentId?: string | null;
  dueAt?: string | null;
}

export interface HqUpdateTaskRequest {
  title?: string;
  body?: string;
  status?: HqTaskStatus;
  priority?: HqPriority;
  assigneeId?: string | null;
  position?: number;
  dueAt?: string | null;
}

export interface HqPostMessageRequest {
  body: string;
  recipientId?: string | null;
}

export interface HqListRunsParams {
  memberId?: string;
  taskId?: string;
  limit?: number;
}

export interface HqListEventsParams {
  limit?: number;
  beforeId?: number;
  memberId?: string;
}

export interface HqCreateScheduleRequest {
  memberId: string;
  name: string;
  cron: string;
  timezone?: string;
  taskTitle: string;
  taskBody?: string;
  enabled?: boolean;
}

export type HqUpdateScheduleRequest = Partial<
  Pick<HqSchedule, 'name' | 'cron' | 'timezone' | 'taskTitle' | 'taskBody' | 'enabled'>
>;

export interface HqUpdateSettingsRequest {
  paused?: boolean;
  pausedReason?: string | null;
  dailyLimitCents?: number;
  dailyRunLimit?: number;
  maxConcurrentRuns?: number;
}
