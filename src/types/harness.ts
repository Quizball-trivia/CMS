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
  /** The market it is made for; 'all' (or absent, from an older backend) = for everyone. */
  market?: HarnessMarket;
}

/** A market content can be made for. 'all' = for everyone. The game does not filter by country yet. */
export type HarnessMarket = 'all' | 'ge' | 'tr' | 'ar' | 'uk' | 'es';

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
  /** The market of the order's category. */
  market?: HarnessMarket;
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
  market?: HarnessMarket;
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
  market?: HarnessMarket;
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

export type HarnessIdeaKind = 'category' | 'event' | 'questions' | 'other';

/** One thing worth doing in the content: from the Market Scout, or written by a person and planned by the HQ Assistant. */
export interface HarnessIdea {
  id: string;
  number: number;
  source: 'person' | 'agent';
  agent: string | null;
  agentName: string | null;
  createdBy: string | null;
  market: HarnessMarket;
  kind: HarnessIdeaKind;
  title: string;
  /** A person's own words, or the agent's reason. */
  detail: string;
  /** A page behind a date or a fact in an agent's idea. */
  sourceUrl: string | null;
  /** planning: the HQ Assistant is working out a person's idea · open: waiting for a person */
  status: 'planning' | 'open' | 'accepted' | 'refused' | 'failed';
  /** How a person's idea would be done, in plain words. */
  plan: string | null;
  /** What accepting does. */
  actions: HarnessAskAction[];
  applied: Array<{ index: number; ok: boolean; error?: string }>;
  decidedBy: string | null;
  refuseReason: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessCreateEvent {
  market?: HarnessMarket;
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
  /** Runs this seat takes at once, how many it is running now, and how many it ran today. */
  maxParallel?: number;
  running?: number;
  runsToday?: number;
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
  /** A second AI the agent overflows to when its own seats are busy or used up. */
  altProvider?: 'claude' | 'codex' | null;
  altModel?: string | null;
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
  /** Questions taken out of this pack, newest first. */
  removed?: Array<{ kind: string | null; by: 'checker' | 'person'; note: string; text: HarnessShowText; at: string | null }>;
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
  allCategories: Array<{ id: string; name: string; market?: HarnessMarket }>;
  /** Absent only while the backend is a version behind this page. */
  markets?: Array<{ key: Exclude<HarnessMarket, 'all'>; name: string }>;
  ideas?: HarnessIdea[];
  /** Set while the Market Scout is looking for ideas. */
  scouting?: { market: HarnessMarket } | null;
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
  /** The queue right now: runs in flight, jobs ready to start, jobs waiting for a later time. */
  queue?: { running: number; ready: number; waiting: number; nextAt: string | null; dailyLimitReached: boolean };
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

// ── Games hub ──────────────────────────────────────────────────────────────

export type HarnessGameGroup = 'match' | 'daily' | 'party' | 'solo' | 'live' | 'partner';
export type HarnessGameState = 'on' | 'off' | 'paused' | 'beta' | 'retired';
/** Plays in the last 7 days and in the 7 before. */
export interface HarnessCounted {
  now: number;
  before: number;
}

export interface HarnessGame {
  key: string;
  name: string;
  group: HarnessGameGroup;
  what: string;
  state: HarnessGameState;
  /** The game's real page on the site. */
  route: string | null;
  /** Where it can be played alone on the staging site: the playground (every screen) or a demo (one scripted run). */
  preview: { kind: 'playground'; game: string } | { kind: 'demo'; slug: string } | null;
  stats: {
    /** Daily game: players who started a day, and how many finished it. */
    started: HarnessCounted | null;
    finished: HarnessCounted | null;
    /** Matches, games with friends or solo rounds. */
    played: HarnessCounted | null;
  };
}

export interface HarnessGames {
  generatedAt: string;
  /** The two weeks compared, as Georgian days [first, last]; the last 7 whole days end yesterday. */
  weeks?: { before: [string, string]; now: [string, string] };
  games: HarnessGame[];
}

// ── Changes to a game ──────────────────────────────────────────────────────

export type HarnessGameChangeStatus = 'suggested' | 'planning' | 'planned' | 'building' | 'ready' | 'merged' | 'declined' | 'cancelled' | 'failed';

/** What the Game Planner writes for a person to judge before anything is built. */
export interface HarnessGamePlan {
  summary: string;
  size: 'small' | 'medium' | 'large';
  changes: Array<{ area: 'website' | 'server' | 'both'; what: string }>;
  risks: string[];
  test: string[];
  /** What the planner needs answered to build the right thing. */
  questions: string[];
}

export interface HarnessGameChange {
  id: string;
  /** A short number people can say ("change 12"). */
  number: number;
  gameKey: string;
  gameName: string;
  title: string;
  request: string;
  source: 'person' | 'agent';
  requestedBy: string | null;
  status: HarnessGameChangeStatus;
  plan: HarnessGamePlan | null;
  error: string | null;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Reports by the desk agents ─────────────────────────────────────────────

export interface HarnessReportBody {
  summary: string;
  sections: Array<{ heading: string; points: string[] }>;
  /** People or companies to approach (the scouts). `source` is the page the agent opened. */
  leads: Array<{ name: string; kind: string; where: string; why: string; source: string; reach: string }>;
  /** What the agent needs from a person to do better next time. */
  questions: string[];
}

export interface HarnessReport {
  id: string;
  /** A short number people can say ("report 4"). */
  number: number;
  /** The agent's slug and its name. */
  agent: string;
  agentName: string;
  department: import('./hq').HqDepartmentKey;
  title: string;
  status: 'writing' | 'ready' | 'failed' | 'archived';
  body: HarnessReportBody | null;
  /** A person's name, or 'schedule' when it was due by itself. */
  requestedBy: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HarnessReports {
  items: HarnessReport[];
  /** The agents that write reports, and how often each is due by itself. */
  agents: Array<{ slug: string; department: import('./hq').HqDepartmentKey; every: 'week' | 'month' | null }>;
  /** What the agents are told about the company. */
  profile: string;
}
