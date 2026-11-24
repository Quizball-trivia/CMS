/**
 * The AI questions tab, as the API's WriterService has it (apps/api/src/
 * writer): members ask for jobs (one press, one job; at most three waiting or
 * running) and set a daily schedule per mode. A stand-in for the agent moves
 * jobs along with the clock and writes invented questions as drafts, by the
 * writer's service member, so the page and the Questions tab can be tried
 * without the server. A job with auto-publish approves what its checks passed
 * itself (one in ten kept for review, up to the mode's daily cap) and starts
 * one release once it ends, as the API does.
 */
import {
  TD_WRITER_REJECT_STAGES,
  type TdWriterDifficulty,
  type TdWriterJob,
  type TdWriterJobDetail,
  type TdWriterJobReject,
  type TdWriterOverview,
  type TdWriterRejectRequest,
  type TdWriterRejectResponse,
  type TdWriterRejectStage,
  type TdWriterReviewItem,
  type TdWriterReviewList,
  type TdWriterReviewReason,
  type TdWriterSchedule,
} from '../admin-api';
import type { WriterQuestion } from '../contract';
import { approve, archive, createRow, markReady, nowIso, type MockContext } from './content';
import type { MockDb, MockRow } from './db';
import * as releases from './releases';
import { MockError, paginate, uuid } from './util';

type WriterJob = TdWriterJob;
type WriterSchedule = TdWriterSchedule;

export const WRITER_MAX_ACTIVE = 3;
const JOBS_SHOWN = 50;
/** The stand-in agent: starts a job after this long, then writes a question this often. */
const START_MS = 3_000;
const PER_QUESTION_MS = 1_500;
export const MOCK_WRITER = { id: '00000000-0000-4000-8000-00000000a1a1', name: 'AI მწერალი', role: 'ops' as const };

export interface MockWriterJob extends Omit<WriterJob, 'toReview' | 'difficulty' | 'stopReason' | 'rejectedBy' | 'releaseState'> {
  requestId: string | null;
  /** pending, started (its publication), unchanged or failed, as the API keeps it. */
  releaseState: 'pending' | 'started' | 'unchanged' | 'held' | 'failed' | null;
  publicationId: string | null;
  /** The content rows it created, in order. */
  rowIds: string[];
  difficulty: TdWriterDifficulty;
  stopReason: string | null;
  /** Candidates turned away, newest last. */
  rejects: TdWriterJobReject[];
}

/** The agent's checks of a row, at the content it created (an edit of its content makes them stale). */
interface MockVerdict {
  contentVersion: number;
  difficulty: number | null;
  factReason: string | null;
  factSource: string | null;
  judgeReason: string | null;
  /** When the job approved the row itself. */
  autoPublishedAt: string | null;
}

interface MockReview {
  reason: TdWriterReviewReason;
  note: string | null;
  staffId: string;
  at: string;
}

/** A schedule as stored: today's auto count is worked out when it is shown. */
type MockSchedule = Omit<WriterSchedule, 'autoPublishedToday'>;

export interface MockWriterState {
  jobs: MockWriterJob[];
  schedules: MockSchedule[];
  verdicts: Record<string, MockVerdict>;
  reviews: Record<string, MockReview>;
}

export function seedWriter(now: number): MockWriterState {
  const at = new Date(now - 86_400_000).toISOString();
  const schedule = (mode: WriterSchedule['mode']): MockSchedule => ({
    mode,
    enabled: false,
    hour: 9,
    requested: 20,
    topic: null,
    difficulty: 'house',
    autoPublish: false,
    autoDailyCap: 100,
    revision: 1,
    updatedBy: null,
    updatedAt: at,
    lastFiredOn: null,
  });
  return {
    jobs: [],
    schedules: [schedule('cards'), schedule('whoami-subjects'), schedule('box-questions'), schedule('penalty-questions'), schedule('practice-questions')],
    verdicts: {},
    reviews: {},
  };
}

const REVIEW = new Set(['draft', 'ready']);
const autoPublished = (db: MockDb, row: MockRow) => Boolean(db.writer.verdicts[row.id]?.autoPublishedAt);
/** Waiting for a member, as the review list has it: a draft, or approved but not in the current release; never one a job published itself. */
const waits = (db: MockDb, row: MockRow | null): row is MockRow =>
  row !== null && !autoPublished(db, row) && (REVIEW.has(row.status) || (row.status === 'approved' && !live(db, row)));
/** Published by a job itself and not archived: the review page's second list. */
const autoLive = (db: MockDb, row: MockRow | null): row is MockRow =>
  row !== null && autoPublished(db, row) && (row.status !== 'archived' || inCurrent(db, row));
/** The current release holds the row (any version): an archived one still reaches players until the next publish. */
const inCurrent = (db: MockDb, row: MockRow) =>
  db.releases.find((release) => release.id === db.pointer.releaseId)?.members.some((m) => m.id === row.id) ?? false;

function rowsOfJob(db: MockDb, job: MockWriterJob) {
  return job.rowIds.map((id) => ({ id, row: db.rows.find((r) => r.id === id) ?? null }));
}

const view = (db: MockDb, job: MockWriterJob): WriterJob => {
  const rest: Partial<MockWriterJob> = { ...job };
  delete rest.requestId;
  delete rest.rowIds;
  delete rest.rejects;
  delete rest.publicationId;
  const toReview = rowsOfJob(db, job).filter(({ row }) => waits(db, row)).length;
  const rejectedBy = Object.fromEntries(TD_WRITER_REJECT_STAGES.map((stage) => [stage, 0])) as Record<TdWriterRejectStage, number>;
  for (const reject of job.rejects) rejectedBy[reject.stage]++;
  // A started release says how it ended once its publication has.
  const publication = job.releaseState === 'started' ? db.publications.find((p) => p.id === job.publicationId) : undefined;
  const releaseState: WriterJob['releaseState'] =
    publication?.status === 'published' ? 'published' : publication?.status === 'failed' ? 'failed' : job.releaseState;
  const publishError = job.publishError ?? (publication?.status === 'failed' ? 'The release failed (mock)' : null);
  return { ...(rest as Omit<WriterJob, 'toReview' | 'releaseState'>), toReview, rejectedBy, releaseState, publishError };
};

const scheduleView = (db: MockDb, schedule: MockSchedule, now: number): WriterSchedule => ({ ...schedule, autoPublishedToday: autoToday(db, schedule.mode, now) });

/** Rows of the mode jobs published themselves since the start of today (Georgia). */
function autoToday(db: MockDb, mode: WriterJob['mode'], now: number): number {
  const today = georgiaDay(now);
  return db.writer.jobs
    .filter((job) => job.mode === mode)
    .flatMap((job) => job.rowIds)
    .filter((id) => {
      const at = db.writer.verdicts[id]?.autoPublishedAt;
      return at ? georgiaDay(Date.parse(at)) === today : false;
    }).length;
}

const CATEGORY_TYPE: Partial<Record<WriterJob['mode'], { type: 'box-categories' | 'card-categories'; name: 'title' | 'prompt' }>> = {
  'box-questions': { type: 'box-categories', name: 'title' },
  cards: { type: 'card-categories', name: 'prompt' },
};

function liveCategory(db: MockDb, mode: WriterJob['mode'], key: string) {
  const spec = CATEGORY_TYPE[mode];
  if (!spec) return null;
  const row = db.rows.find((r) => r.type === spec.type && r.status !== 'archived' && r.data.key === key);
  return row ? { key, title: String(row.data[spec.name]) } : null;
}

export function overview(ctx: MockContext): TdWriterOverview {
  const jobs = [...ctx.db.writer.jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, JOBS_SHOWN);
  const all = ctx.db.writer.jobs;
  const count = (mode: WriterJob['mode'], test: (db: MockDb, row: MockRow | null) => boolean) =>
    all.filter((job) => job.mode === mode).flatMap((job) => rowsOfJob(ctx.db, job)).filter(({ row }) => test(ctx.db, row)).length;
  const waiting = (mode: WriterJob['mode']) => count(mode, waits);
  const published = (mode: WriterJob['mode']) => count(mode, autoLive);
  return {
    jobs: jobs.map((job) => view(ctx.db, job)),
    schedules: ctx.db.writer.schedules.map((schedule) => scheduleView(ctx.db, schedule, ctx.now)),
    enabled: true,
    // The stand-in agent runs inside the mock: always there.
    agent: { online: true, lastSeenAt: nowIso(ctx) },
    queued: all.filter((job) => job.status === 'queued').length,
    running: all.filter((job) => job.status === 'running').length,
    toReview: {
      cards: waiting('cards'),
      whoamiSubjects: waiting('whoami-subjects'),
      boxQuestions: waiting('box-questions'),
      penaltyQuestions: waiting('penalty-questions'),
      practiceQuestions: waiting('practice-questions'),
    },
    autoPublished: {
      cards: published('cards'),
      whoamiSubjects: published('whoami-subjects'),
      boxQuestions: published('box-questions'),
      penaltyQuestions: published('penalty-questions'),
      practiceQuestions: published('practice-questions'),
    },
  };
}

export function jobDetail(ctx: MockContext, id: string): TdWriterJobDetail {
  const job = ctx.db.writer.jobs.find((j) => j.id === id);
  if (!job) throw new MockError(404, 'not_found', 'No such job');
  const questions: WriterQuestion[] = rowsOfJob(ctx.db, job).map(({ row }) => {
    if (!row) return { id: null, q: '', display: '', aliases: [], category: null, status: 'removed' };
    const d = row.data;
    const spec = CATEGORY_TYPE[job.mode];
    const category = spec ? ctx.db.rows.find((c) => c.type === spec.type && c.data.key === d.categoryKey) : null;
    const options = (d.options as string[] | undefined) ?? [];
    const shown =
      job.mode === 'cards'
        ? { q: (d.lines as string[]).join(' · '), display: String(d.display), aliases: d.aliases as string[] }
        : job.mode === 'whoami-subjects'
          ? { q: (d.clues as string[]).join(' · '), display: String(d.display), aliases: d.aliases as string[] }
          : job.mode === 'practice-questions'
            ? { q: String(d.prompt), display: options[Number(d.answer)] ?? '', aliases: [] }
            : { q: String(d.q), display: String(d.display), aliases: (d.aliases as string[]) ?? [] };
    return {
      id: row.id,
      ...shown,
      category: category && spec ? String(category.data[spec.name]) : job.mode === 'practice-questions' ? String(d.category) : null,
      status: row.status as WriterQuestion['status'],
    };
  });
  return { job: view(ctx.db, job), questions, rejects: job.rejects.slice(-100).reverse() };
}

export function createJob(
  ctx: MockContext,
  body: { requestId: string; mode: WriterJob['mode']; requested: number; topic?: string; categoryKey?: string; difficulty?: TdWriterDifficulty; autoPublish?: boolean },
): { status: 200 | 201; job: WriterJob } {
  const { writer } = ctx.db;
  const known = writer.jobs.find((job) => job.requestId === body.requestId);
  if (known) return { status: 200, job: view(ctx.db, known) };
  if (!CATEGORY_TYPE[body.mode] && body.categoryKey) throw new MockError(409, 'conflict', 'This mode has no category');
  const category = body.categoryKey ? liveCategory(ctx.db, body.mode, body.categoryKey) : null;
  if (body.categoryKey && !category) throw new MockError(404, 'not_found', 'No such category in this round');
  if (body.mode === 'cards' && !body.categoryKey && body.requested < 12)
    throw new MockError(409, 'conflict', 'A new category of this round needs at least 12: ask for 12 or more, or choose a category');
  if (writer.jobs.filter((job) => job.status === 'queued' || job.status === 'running').length >= WRITER_MAX_ACTIVE)
    throw new MockError(409, 'busy', 'Three writer jobs are waiting or running; try again when one ends');
  const job: MockWriterJob = {
    id: uuid(),
    requestId: body.requestId,
    rowIds: [],
    rejects: [],
    difficulty: body.difficulty ?? 'house',
    stopReason: null,
    ...AUTO_START,
    autoPublish: body.autoPublish ?? false,
    mode: body.mode,
    requested: body.requested,
    topic: body.topic ?? null,
    categoryKey: body.categoryKey ?? null,
    categoryTitle: category?.title ?? null,
    requestedBy: { id: ctx.staff.id, name: ctx.staff.name },
    scheduled: false,
    status: 'queued',
    made: 0,
    rejected: 0,
    error: null,
    createdAt: nowIso(ctx),
    startedAt: null,
    finishedAt: null,
  };
  writer.jobs.push(job);
  return { status: 201, job: view(ctx.db, job) };
}

/** A new job's auto-publish counts and release. */
const AUTO_START = { autoPublished: 0, autoSampled: 0, autoHeld: 0, releaseState: null, publicationId: null, publishError: null } as const;

export function cancel(ctx: MockContext, id: string): WriterJob {
  const job = ctx.db.writer.jobs.find((j) => j.id === id);
  if (!job) throw new MockError(404, 'not_found', 'No such job');
  if (job.status !== 'queued' && job.status !== 'running') throw new MockError(409, 'conflict', 'This job has ended');
  job.status = 'cancelled';
  job.finishedAt = nowIso(ctx);
  return view(ctx.db, job);
}

export function patchSchedule(
  ctx: MockContext,
  mode: string,
  patch: {
    revision: number;
    enabled?: boolean;
    hour?: number;
    requested?: number;
    topic?: string | null;
    difficulty?: TdWriterDifficulty;
    autoPublish?: boolean;
    autoDailyCap?: number;
  },
): WriterSchedule {
  const schedule = ctx.db.writer.schedules.find((s) => s.mode === mode);
  if (!schedule) throw new MockError(404, 'not_found', 'No such schedule');
  if (patch.revision !== schedule.revision) throw new MockError(409, 'conflict', 'This schedule was changed meanwhile; reload it');
  if (patch.enabled !== undefined) schedule.enabled = patch.enabled;
  if (patch.hour !== undefined) schedule.hour = patch.hour;
  if (patch.requested !== undefined) schedule.requested = patch.requested;
  if (patch.topic !== undefined) schedule.topic = patch.topic;
  if (patch.difficulty !== undefined) schedule.difficulty = patch.difficulty;
  if (patch.autoPublish !== undefined) schedule.autoPublish = patch.autoPublish;
  if (patch.autoDailyCap !== undefined) schedule.autoDailyCap = patch.autoDailyCap;
  schedule.updatedBy = { id: ctx.staff.id, name: ctx.staff.name };
  schedule.updatedAt = nowIso(ctx);
  schedule.revision++;
  return scheduleView(ctx.db, schedule, ctx.now);
}

const georgiaDay = (now: number) => new Date(now + 4 * 3_600_000).toISOString().slice(0, 10);
const georgiaHour = (now: number) => new Date(now + 4 * 3_600_000).getUTCHours();

/** An invented item of the job's mode (never real content: this repo is public). */
function inventedData(db: MockDb, job: MockWriterJob, n: number): Record<string, unknown> | null {
  const club = ['Riverton', 'Northgate', 'Eastbrook', 'Westholm', 'Lakeside'][n % 5]!;
  const key = `ai-${job.id.slice(0, 8)}-${n}`;
  const tag = `${n + 1} of job ${job.id.slice(0, 4)}`;
  const firstCategory = (type: 'box-categories' | 'card-categories') =>
    (job.categoryKey ?? db.rows.find((row) => row.type === type && row.status !== 'archived')?.data.key) as string | undefined;
  switch (job.mode) {
    case 'cards': {
      const categoryKey = firstCategory('card-categories');
      return categoryKey
        ? { categoryKey, key, value: (n % 3) + 1, lines: [`Invented ${club}`, `AI card ${tag}`], display: `${club} Keeper`, aliases: [`${club} Keeper`], photo: null, imageKey: null }
        : null;
    }
    case 'whoami-subjects':
      return {
        key,
        display: `${club} Captain`,
        aliases: [`${club} Captain`],
        clues: [`(AI, invented) I was born in ${club}`, 'I played in the invented league', 'I won the invented cup', 'I wore 10', `Clue 5, ${tag}`],
      };
    case 'box-questions': {
      const categoryKey = firstCategory('box-categories');
      return categoryKey ? { categoryKey, key, q: `(AI, invented) Which club of the invented league plays in ${club}, question ${tag}?`, display: `${club} FC`, aliases: [`${club} FC`, club] } : null;
    }
    case 'penalty-questions':
      return { key, q: `(AI, invented) Which club of the invented league plays in ${club}, question ${tag}?`, display: `${club} FC`, aliases: [`${club} FC`, club] };
    case 'practice-questions':
      return {
        key,
        difficulty: 'easy',
        category: 'Invented league',
        prompt: `(AI, invented) Where does ${club} FC play, question ${tag}?`,
        options: [club, 'Northport', 'Southbay', 'Midvale'],
        answer: 0,
        explanation: `${club} FC plays in ${club} (invented).`,
        imageKey: null,
      };
  }
}

/** The stand-in agent: due schedules make jobs; the oldest queued job runs and writes its questions as time passes. */
export function advance(db: MockDb, now: number): void {
  const { writer } = db;
  const today = georgiaDay(now);
  for (const schedule of writer.schedules) {
    if (!schedule.enabled || georgiaHour(now) < schedule.hour || schedule.lastFiredOn === today) continue;
    schedule.lastFiredOn = today;
    writer.jobs.push({
      id: uuid(),
      requestId: null,
      rowIds: [],
      rejects: [],
      difficulty: schedule.difficulty ?? 'house',
      stopReason: null,
      ...AUTO_START,
      autoPublish: schedule.autoPublish,
      mode: schedule.mode,
      requested: schedule.requested,
      topic: schedule.topic,
      categoryKey: null,
      categoryTitle: null,
      requestedBy: null,
      scheduled: true,
      status: 'queued',
      made: 0,
      rejected: 0,
      error: null,
      createdAt: new Date(now).toISOString(),
      startedAt: null,
      finishedAt: null,
    });
  }
  const running = writer.jobs.find((job) => job.status === 'running');
  const job = running ?? [...writer.jobs].filter((j) => j.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!job) return;
  if (job.status === 'queued') {
    if (now - Date.parse(job.createdAt) < START_MS) return;
    job.status = 'running';
    job.startedAt = new Date(now).toISOString();
  }
  const due = Math.min(job.requested, Math.floor((now - Date.parse(job.startedAt!)) / PER_QUESTION_MS));
  const ctx: MockContext = { db, staff: MOCK_WRITER, now };
  while (job.made < due) {
    const data = inventedData(db, job, job.made);
    if (!data) {
      job.status = 'failed';
      job.error = 'No category to write into';
      job.finishedAt = new Date(now).toISOString();
      return;
    }
    const row = createRow(ctx, job.mode, { data, note: `AI მწერალი · ${job.id.slice(0, 8)}` });
    job.rowIds.push(row.id);
    writer.verdicts[row.id] = inventedVerdict(job.made, row.contentVersion);
    job.made++;
    if (job.made % 4 === 0) {
      job.rejects.push(inventedReject(job.made));
      job.rejected++;
    }
  }
  if (job.made >= job.requested) {
    job.status = 'done';
    job.finishedAt = new Date(now).toISOString();
    // As the API: approved only now that the job finished, never while it ran.
    if (job.autoPublish) {
      for (const id of job.rowIds) {
        const created = db.rows.find((r) => r.id === id);
        if (created) autoApprove(ctx, job, created);
      }
      if (job.autoPublished > 0) job.releaseState = 'pending';
    }
  }
}

/** The mock's sample, as the API's: one row in ten, by its id. */
export const mockSampled = (rowId: string) => [...rowId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 10 === 0;
const BAND: Record<TdWriterDifficulty, [number, number]> = { easy: [1, 3], house: [2, 3], hard: [4, 5] };

/** As the API's auto-publish at a job's finish: fully checked, unchanged, not the sample, under the mode's cap →
 *  approved by the writer, marked. */
function autoApprove(ctx: MockContext, job: MockWriterJob, row: MockRow) {
  const verdict = ctx.db.writer.verdicts[row.id]!;
  const [low, high] = BAND[job.difficulty];
  if (!verdict.factSource || !verdict.factReason || !verdict.judgeReason || verdict.difficulty === null) return;
  if (verdict.difficulty < low || verdict.difficulty > high || row.status !== 'draft' || row.contentVersion !== verdict.contentVersion) return;
  if (mockSampled(row.id)) {
    job.autoSampled++;
    return;
  }
  const schedule = ctx.db.writer.schedules.find((s) => s.mode === job.mode);
  if (autoToday(ctx.db, job.mode, ctx.now) >= (schedule?.autoDailyCap ?? 0)) {
    job.autoHeld++;
    return;
  }
  try {
    const ready = markReady(ctx, row.type, row.id, row.version);
    approve(ctx, row.type, row.id, ready.version);
  } catch {
    // A category players do not have yet: the row waits for a member, as a draft.
    return;
  }
  row.note = `AI მწერალი · ავტომატური · ${job.id.slice(0, 8)}`;
  verdict.autoPublishedAt = nowIso(ctx);
  job.autoPublished++;
}

/** Whether publishing now would change more than the job's own approved rows (null: nothing to compare with). */
function otherChanges(db: MockDb, own: Set<string>): boolean | null {
  const current = db.releases.find((release) => release.id === db.pointer.releaseId);
  if (!current || current.members.length === 0) return null;
  const was = new Map(current.members.map((m) => [m.id, m.contentVersion]));
  const now = releases.releaseRows(db);
  const kept = new Set(now.map((row) => row.id));
  if (current.members.some((m) => !kept.has(m.id))) return true;
  return now.some((row) => {
    const version = was.get(row.id);
    return version === undefined ? !own.has(row.id) : version !== row.approvedVersion;
  });
}

export const RELEASE_HELD = 'release_held: other pending changes';

/** The release after an auto-publishing job, as the API starts it: only when it carries nothing but the job's rows,
 *  then the check, a wait while another runs. */
export async function releasePending(db: MockDb, now: number): Promise<void> {
  const job = db.writer.jobs.find((j) => j.releaseState === 'pending');
  if (!job) return;
  const ctx: MockContext = { db, staff: MOCK_WRITER, now };
  const own = new Set(job.rowIds.filter((id) => db.writer.verdicts[id]?.autoPublishedAt));
  const other = otherChanges(db, own);
  if (other !== false) {
    job.releaseState = 'held';
    job.publishError = other === null ? `${RELEASE_HELD} (the current release cannot be compared)` : RELEASE_HELD;
    return;
  }
  const report = await releases.validate(ctx);
  if (!report.ok) {
    job.releaseState = 'failed';
    job.publishError = `the release check refused it: ${report.errors.map((e) => e.message).join('; ')}`.slice(0, 300);
    return;
  }
  if (report.unchanged) {
    job.releaseState = 'unchanged';
    return;
  }
  try {
    // As the API: the publication may carry the job's own rows alone.
    const allowed = [...own].map((id) => ({ id, version: db.rows.find((r) => r.id === id)?.approvedVersion ?? null }));
    const out = await releases.publish(ctx, `writer-release:${job.id}`, allowed);
    job.releaseState = 'started';
    job.publicationId = out.body.id;
  } catch (error) {
    if (error instanceof MockError && error.code === 'publication_in_progress') return;
    job.releaseState = 'failed';
    job.publishError = String((error as Error)?.message ?? error).slice(0, 300);
  }
}

function inventedVerdict(n: number, contentVersion: number): MockVerdict {
  return {
    contentVersion,
    difficulty: 2 + (n % 2),
    factReason: `The invented league's archive agrees (mock check ${n + 1}).`,
    factSource: 'https://example.org/invented-league',
    judgeReason: n % 2 ? 'One answer only; the question does not give it away.' : 'Fine, one step easier than ours.',
    autoPublishedAt: null,
  };
}

const MOCK_STAGES: TdWriterRejectStage[] = ['duplicate', 'too_easy', 'fact', 'same_fact', 'giveaway'];

function inventedReject(n: number): TdWriterJobReject {
  const stage = MOCK_STAGES[(n / 4 - 1) % MOCK_STAGES.length]!;
  return { stage, reason: `Invented reason for ${stage.replace('_', ' ')} (mock)`, summary: `Invented candidate ${n} → Invented Answer ${n}` };
}

const isAi = (db: MockDb, id: string) => db.writer.jobs.some((job) => job.rowIds.includes(id));

/** Whether players have this row's approved version now: the current release holds it. */
function live(db: MockDb, row: MockRow): boolean {
  if (row.approvedVersion === null) return false;
  const current = db.releases.find((release) => release.id === db.pointer.releaseId);
  return current?.members.some((m) => m.id === row.id && m.contentVersion === row.approvedVersion) ?? false;
}

function categoryTitle(db: MockDb, mode: WriterJob['mode'], data: MockRow['data']): string | null {
  const spec = CATEGORY_TYPE[mode];
  if (!spec) return mode === 'practice-questions' ? String(data.category ?? '') || null : null;
  const category = db.rows.find((c) => c.type === spec.type && c.data.key === data.categoryKey);
  return category ? String(category.data[spec.name]) : null;
}

/** The AI rows of a mode a member still has to see: drafts, and approved ones players do not have yet. */
export function review(ctx: MockContext, query: { mode?: string; filter?: string; jobId?: string; cursor?: string; limit?: string }): TdWriterReviewList {
  const { db } = ctx;
  if (!query.mode || !MODES_OF.has(query.mode)) throw new MockError(400, 'invalid_request', 'Choose a mode');
  const jobs = db.writer.jobs.filter((job) => job.mode === query.mode && (!query.jobId || job.id === query.jobId));
  const items = jobs
    .flatMap((job) =>
      rowsOfJob(db, job).flatMap(({ row }) => {
        if (!row || !(query.filter === 'auto' ? autoLive(db, row) : waits(db, row))) return [];
        const verdict = db.writer.verdicts[row.id];
        const item: TdWriterReviewItem = {
          id: row.id,
          table: row.type.replace(/-/g, '_'),
          type: job.mode,
          jobId: job.id,
          rowRevision: row.version,
          contentVersion: row.contentVersion,
          approvedVersion: row.approvedVersion,
          status: row.status as TdWriterReviewItem['status'],
          published: live(db, row),
          removalPending: row.status === 'archived' && inCurrent(db, row),
          data: row.data,
          category: categoryTitle(db, job.mode, row.data),
          verdict: verdict
            ? { difficulty: verdict.difficulty, factReason: verdict.factReason, factSource: verdict.factSource, judgeReason: verdict.judgeReason, stale: verdict.contentVersion !== row.contentVersion }
            : null,
          autoPublishedAt: verdict?.autoPublishedAt ?? null,
        };
        return [{ item, at: row.createdAt }];
      }),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.item.id.localeCompare(a.item.id))
    .map(({ item }) => item);
  return paginate(items, query, `writer-review:${query.mode}:${query.filter ?? ''}:${query.jobId ?? ''}`);
}

const MODES_OF = new Set(['cards', 'whoami-subjects', 'box-questions', 'penalty-questions', 'practice-questions']);

/** Each item on its own: only a never-published AI row at the revision shown is archived, with the reason kept. */
export function reject(ctx: MockContext, body: TdWriterRejectRequest): TdWriterRejectResponse {
  const { db } = ctx;
  const items = body.items.map(({ id, rowRevision }): TdWriterRejectResponse['items'][number] => {
    const row = db.rows.find((r) => r.id === id);
    if (!row) return { id, ok: false, code: 'not_found' };
    if (!isAi(db, id)) return { id, ok: false, code: 'not_ai' };
    if (row.approvedVersion !== null) return { id, ok: false, code: 'published' };
    if (row.version !== rowRevision || row.status === 'archived') return { id, ok: false, code: 'stale' };
    archive(ctx, row.type, row.id, row.version);
    db.writer.reviews[id] = { reason: body.reason, note: body.note ?? null, staffId: ctx.staff.id, at: nowIso(ctx) };
    return { id, ok: true };
  });
  return { items };
}
