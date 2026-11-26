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
  /** The category's name for people (falls back to the slug). */
  name: string;
  priority: HarnessPriority;
  /** The team's direction note for this category ('' = none). */
  direction: string;
  /** Questions this category got from the agents in the last 7 days: the fill rate. */
  liveLast7d: number;
}

export type HarnessPriority = 'boost' | 'normal' | 'hold';

/** A question as the Content tab shows it: every language, the right answer marked. */
export interface HarnessQuestion {
  prompt: Record<string, string>;
  options: Array<{ text: Record<string, string>; correct: boolean }>;
  explanation: Record<string, string>;
}

export interface HarnessNeedsYouItem {
  id: string;
  version: number;
  category: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  question: HarnessQuestion;
  issues: string[];
  updatedAt: string | null;
}

export interface HarnessLiveItem {
  id: string;
  version: number;
  category: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  question: HarnessQuestion;
  questionId: string | null;
  releasedAt: string | null;
}

export interface HarnessRequest {
  id: string;
  category: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  topic: string;
  deadline: string | null;
  requestedBy: string | null;
  status: 'open' | 'done' | 'cancelled';
  live: number;
  working: number;
  dropped: number;
  createdAt: string | null;
}

export interface HarnessContentEvent {
  id: string;
  title: string;
  happensOn: string;
  notes: string;
  categories: string[];
  perCategory: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  status: 'open' | 'cancelled';
  createdBy: string | null;
  live: number;
  working: number;
  dropped: number;
}

export interface HarnessProposal {
  id: string;
  name: string;
  why: string;
  target: number;
  status: 'filling' | 'live' | 'cancelled';
  proposedBy: string | null;
  /** The category is visible in the game. */
  inGame: boolean;
  /** Published questions in the category. */
  live: number;
  working: number;
  /** Ranked needs at least one of each besides the multiple choice ones. */
  putInOrder: number;
  clueChain: number;
  /** False in MCQ-only seasons, when ranked doesn't need the special types. */
  specialsRequired: boolean;
  createdAt: string | null;
}

export interface HarnessAskAction {
  valid: boolean;
  /** One line in plain words, e.g. "Boost: Real Madrid". */
  summary: string;
  action: unknown;
}

export interface HarnessAsk {
  id: string;
  message: string;
  askedBy: string | null;
  status: 'thinking' | 'answered' | 'failed' | 'applied' | 'dismissed';
  reply: string | null;
  actions: HarnessAskAction[];
  applied: Array<{ index: number; ok: boolean; error?: string }>;
  error: string | null;
  appliedBy: string | null;
  createdAt: string | null;
}

export interface HarnessCreateEvent {
  title: string;
  happensOn: string;
  notes?: string;
  categoryIds: string[];
  perCategory: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
}

export type HarnessItemAction = 'flag' | 'approve' | 'reject' | 'send_back';

export interface HarnessCreateRequest {
  categoryId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  topic: string;
  deadline?: string | null;
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
  /** The item's category and English question, when the event is about one. */
  category?: string | null;
  prompt?: string | null;
  createdAt: string | null;
}

export interface HarnessPolicy {
  key: string;
  value: unknown;
  note: string;
  editable: boolean;
  updatedAt: string | null;
}

export interface HarnessRunwayRow {
  key: string;
  label: string;
  storedThrough: string | null;
  /** Last day the game's code allows; null = open-ended. */
  calendarEnds: string | null;
  endsOn: string | null;
  daysLeft: number;
  limitedBy: 'content' | 'calendar' | 'both';
}

export type HarnessShowText = { ka: string; en?: string };
export type HarnessShowCheck = 'unchecked' | 'ok' | 'flagged' | 'skipped';

export interface HarnessShowQuestion {
  /** Position in the whole pack (what Swap takes). */
  index: number;
  kind: 'true_false' | 'mcq' | 'put_in_order' | 'career_path' | 'who_am_i';
  check: HarnessShowCheck;
  /** Why the checker flagged it, or why it could not be checked. */
  note: string;
  prompt: HarnessShowText | null;
  image: string | null;
  options: Array<{ text: HarnessShowText; correct: boolean }>;
  /** What the hosts announce; null for put in order (the lines are the answer). */
  answer: HarnessShowText | null;
  /** Put in order: the items in the right order. Career path: the clubs. Who am I: the clues. */
  lines: HarnessShowText[];
  /** Put in order: the extra line players see under the question, when there is one. */
  instruction?: HarnessShowText;
}

export interface HarnessShowPack {
  id: string;
  /** checking: agents are verifying · flagged: flagged questions are being swapped · ready: waiting for a person · approved: loaded */
  status: 'checking' | 'flagged' | 'ready' | 'approved';
  approvedBy: string | null;
  updatedAt: string;
  counts: { total: number; ok: number; flagged: number; notChecked: number; checking: number };
  rounds: Array<{ kind: string; title: string; cut: { keep_percent?: number; keep_count?: number } | null; questions: HarnessShowQuestion[] }>;
}

/** The next ორშაბათობა show night and the pack prepared for it. */
export interface HarnessShow {
  eventDate: string;
  episode: number;
  showAt: string;
  /** A pack is stored for the show (approved here, or loaded by hand). */
  loaded: boolean;
  loadedIsThisPack: boolean;
  pack: HarnessShowPack | null;
}

export interface HarnessOverview {
  settings: HarnessSettings;
  today: { runs: number; costCents: number; failed: number; live: number };
  /** Days of content left per daily game, shortest first. */
  runway: HarnessRunwayRow[];
  show: HarnessShow;
  /** The team's direction note for every category ('' = none). */
  direction: string;
  /** Every active category, for ordering questions (also ones with no ranked play yet). */
  allCategories: Array<{ id: string; name: string }>;
  contentEvents: HarnessContentEvent[];
  proposals: HarnessProposal[];
  asks: HarnessAsk[];
  /** The newest 30 stuck questions; the full count is the escalated stage count. */
  needsYou: HarnessNeedsYouItem[];
  recentLive: HarnessLiveItem[];
  requests: HarnessRequest[];
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
