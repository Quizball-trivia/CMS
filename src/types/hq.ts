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
  | 'cancelled'
  /** An agent's idea waiting for the CEO; never runs until accepted. */
  | 'proposed';

export type HqTaskKind = 'task' | 'standup' | 'proposal' | 'chat' | 'brief';

export type HqEffort = 's' | 'm' | 'l';

export interface HqProposal {
  why: string;
  plan: string;
  expectedImpact: string;
  effort: HqEffort;
}

/** 0 urgent · 1 high · 2 normal · 3 low */
export type HqPriority = 0 | 1 | 2 | 3;

export type HqDepartmentKey = 'leadership' | 'growth' | 'content' | 'competitions' | 'engineering' | 'partners';

export type HqMemberKind = 'human' | 'agent';
export type HqRuntime = 'hq' | 'question_agents' | 'bug_triage' | 'quiz_pages' | 'none';
export type HqMemberStatus = 'active' | 'paused' | 'archived';
export type HqAutonomy = 'autonomous' | 'approval';
export type HqMemberTier = 'read' | 'act';
export type HqMemberRole = 'agent' | 'director';
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
  department: HqDepartmentKey;
  maxTurns: number;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: HqMemberStats;
  /** Optional: an older backend (and older fixtures) omit these. */
  tier?: HqMemberTier;
  role?: HqMemberRole;
  effort?: string | null;
  dailyRunLimit?: number | null;
}

export type HqDirectorDecision = 'approved' | 'declined' | 'escalated';
/** 'superseded': a newer version of the same quiz page replaced this report before anyone reviewed it. */
export type HqDirectorReview = 'accepted' | 'reopened' | 'superseded';

/** What the Director did with a task: his call on an idea, and his review of finished work. */
export interface HqTaskDirector {
  decision: HqDirectorDecision | null;
  note: string | null;
  decidedAt: string | null;
  /** Set while the Director's escalation is waiting for the founder. */
  escalatedAt: string | null;
  review: HqDirectorReview | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reopenCount: number;
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
  kind: HqTaskKind;
  goalId: string | null;
  proposal: HqProposal | null;
  /** Optional: an older backend (and older fixtures) omit these. */
  founderApprovedAt?: string | null;
  director?: HqTaskDirector;
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

/** Whether a founder message is waiting for, or being answered by, the Director. */
export interface HqDirectorChatState {
  queued: boolean;
  running: boolean;
}

export interface HqDirectorBrief {
  taskId: string;
  taskNumber: number;
  result: string;
  completedAt: string | null;
}

export interface HqDirectorSummary {
  director: HqMember | null;
  brief: HqDirectorBrief | null;
  needsYou: HqTask[];
  /** Today's plan items (his morning proposals) with their status. Missing on an older backend. */
  plan?: HqTask[];
  /** What every agent is working on right now. */
  runningNow?: HqTask[];
  decisions: HqEvent[];
  chat: HqDirectorChatState;
}

export interface HqDirectorChatPage {
  /** Oldest first. */
  items: HqMessage[];
  chat: HqDirectorChatState;
}

export interface HqDirectorChatParams {
  /** Message id: only messages older than it. */
  before?: number;
  limit?: number;
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
  /** 'standup' schedules create the agent's daily standup task. */
  taskKind: 'task' | 'standup';
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
  /** Share of the Claude plan HQ may use: urgent-only from planSoftPct, stop at planHardPct. Missing on an older backend. */
  planSoftPct?: number;
  planHardPct?: number;
  updatedAt: string;
  today: { runs: number; costCents: number };
  /** Missing on a backend without plan tracking. */
  plan?: HqPlanStatus;
}

export interface HqPlanWindow {
  key: string;
  label: string;
  usedPct: number | null;
  resetsAt: string | null;
  status: string;
}

export interface HqPlanStatus {
  state: 'ok' | 'auth' | 'limit';
  until: string | null;
  /** The worker's current gate: everything, only urgent work (incl. the Director's chat), or nothing. */
  mode?: 'normal' | 'urgent_only' | 'blocked';
  windows: HqPlanWindow[];
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
  departments: HqDepartment[];
}

export interface HqDepartment {
  key: HqDepartmentKey;
  name: string;
  emoji: string;
  /** Non-archived, agents first. */
  members: HqMemberRef[];
  counts: { open: number; todo: number; inProgress: number; needsApproval: number; blocked: number; doneToday: number };
  lastResult: HqTask | null;
  working: Array<{ member: HqMemberRef; task: { id: string; number: number; title: string } }>;
}

export interface HqPulsePoint {
  newUsers: number;
  matches: number;
  activePlayers: number;
}

export interface HqPulse {
  generatedAt: string;
  timezone: string;
  days: number;
  totals: { registeredUsers: number };
  /** One entry per day including zero days, oldest → newest. */
  series: Array<HqPulsePoint & { date: string }>;
  today: HqPulsePoint;
  yesterday: HqPulsePoint;
  avg7d: HqPulsePoint;
  feedback: {
    count7d: number;
    avgRating7d: number | null;
    lowRatings7d: number;
    countPrev7d: number;
    avgRatingPrev7d: number | null;
  };
}

export type HqExternalStats =
  | { kind: 'question_agents'; jobs7d: number; accepted7d: number; rejected7d: number; failed7d: number }
  | { kind: 'bug_triage'; reports7d: number; prsOpened7d: number; needsInfo7d: number }
  | { kind: 'quiz_pages'; published7d: number; refreshed7d: number; queued: number; held: number };

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
  department?: HqDepartmentKey;
}

export type HqUpdateMemberRequest = Partial<
  Pick<
    HqMember,
    'name' | 'title' | 'avatar' | 'color' | 'description' | 'instructions' | 'model' | 'tools' | 'autonomy' | 'maxTurns' | 'status' | 'department'
  >
>;

export interface HqListTasksParams {
  status?: HqTaskStatus[];
  assigneeId?: string;
  department?: HqDepartmentKey;
  /** Sent comma-joined; the backend defaults to task,proposal (standups hidden). */
  kind?: HqTaskKind[];
  goalId?: string;
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
  planSoftPct?: number;
  planHardPct?: number;
}

// ── v3: goals, standup, analytics ──

export type HqGoalHorizon = 'north_star' | 'week' | 'day';
export type HqGoalMetric = 'new_users' | 'active_players' | 'matches' | 'd7_retention' | 'avg_rating';
export type HqGoalStatus = 'active' | 'achieved' | 'dropped';

export interface HqGoal {
  id: string;
  horizon: HqGoalHorizon;
  title: string;
  description: string;
  metric: HqGoalMetric | null;
  /** For d7_retention: a percentage 0–100. */
  target: number | null;
  manualProgress: number | null;
  /** YYYY-MM-DD, Tbilisi. */
  periodStart: string;
  periodEnd: string;
  status: HqGoalStatus;
  department: HqDepartmentKey | null;
  position: number;
  /** Computed by the backend for metric goals (d7_retention `current` is a percentage 0–100); `pct` mirrors manualProgress otherwise. */
  progress: { current: number | null; pct: number | null };
  createdAt: string;
  updatedAt: string;
}

export interface HqGoalPage {
  items: HqGoal[];
  /** Cursor for the next (older) page; null when there's no more (always null for active-only lists). */
  nextCursor: string | null;
}

export interface HqGoalWriteRequest {
  horizon: HqGoalHorizon;
  title: string;
  description?: string;
  metric?: HqGoalMetric | null;
  target?: number | null;
  manualProgress?: number | null;
  /** Optional: defaults by horizon (day = today, week = Mon–Sun, north_star = today → +90 days). */
  periodStart?: string;
  periodEnd?: string;
  status?: HqGoalStatus;
  department?: HqDepartmentKey | null;
  position?: number;
}

export type HqGoalUpdateRequest = Partial<HqGoalWriteRequest>;

export interface HqStandupReport {
  headline: string;
  yesterday: string;
  today: string;
  blockers: string;
  createdAt: string;
}

export interface HqStandupEntry {
  member: HqMemberRef & { title: string; department: HqDepartmentKey };
  standup: HqStandupReport | null;
  proposals: HqTask[];
  working: { id: string; number: number; title: string } | null;
  finishedYesterday: HqTask[];
}

/** Today vs yesterday for one KPI; null when the date is outside the data window (render "—"). */
export interface HqStandupKpi {
  today: number | null;
  yesterday: number | null;
}

export interface HqStandup {
  date: string;
  goals: { northStar: HqGoal | null; week: HqGoal[]; day: HqGoal[] };
  entries: HqStandupEntry[];
  /** Active HQ agents that haven't reported today. */
  waitingOn: HqMemberRef[];
  /** All open proposals, newest first. */
  proposals: HqTask[];
  kpis: {
    newUsers: HqStandupKpi;
    activePlayers: HqStandupKpi;
    matches: HqStandupKpi;
    rating: { current: number | null; previous: number | null; lowRatings7d: number | null };
  };
}

export interface HqAcceptProposalRequest {
  title?: string;
  body?: string;
  proposal?: Partial<HqProposal>;
}

export interface HqAnalytics {
  generatedAt: string;
  days: number;
  series: Array<{ date: string; newUsers: number; activePlayers: number; matches: number }>;
  actives: { dau: number; wau: number; mau: number };
  totals: { registeredUsers: number };
  modes: Array<{ mode: string; matches: number; share: number }>;
  /** Top modes + 'other' per day: `{ date, [mode]: count }`. */
  modesByDay: Array<{ date: string } & Record<string, number | string>>;
  modeLabels: Record<string, string>;
  /** Top 30 by players. */
  countries: Array<{ country: string; players: number; registered: number }>;
  /** Players / registered users across ALL countries (before the top-30 cut), for true shares. */
  countriesTotalPlayers: number;
  countriesTotalRegistered: number;
  /** Shares 0–1; null while the window hasn't elapsed. */
  retention: Array<{ cohortStart: string; size: number; d1: number | null; d7: number | null; d30: number | null }>;
}

export type HqPosthog =
  | { connected: false }
  | {
      connected: true;
      visitorsByDay: Array<{ date: string; visitors: number; pageviews: number }>;
      topCountries: Array<{ country: string; visitors: number }>;
      topReferrers: Array<{ source: string; visitors: number }>;
      topPages: Array<{ path: string; views: number }>;
      funnel: { visitors: number; signups: number; firstMatch: number };
      error?: undefined;
    }
  /** Configured, but PostHog failed this time. */
  | { connected: true; error: string };
