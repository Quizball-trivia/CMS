'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Bot, CalendarClock, ClipboardCheck, Hourglass, ListChecks, Loader2, PenLine, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TdSheetContent } from '@/components/td/td-dialog';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import { TD_WRITER_REJECT_STAGES, type TdWriterDifficulty, type TdWriterJob, type TdWriterOverview, type TdWriterRejectStage, type TdWriterSchedule } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import type { WriterQuestion } from '@/lib/td/contract';
import { tdErrorText } from '@/lib/td/errors';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { t } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';
import { TdWriterReview, type TdWriterReviewFilter } from '@/components/td/writer/td-writer-review';
import {
  WRITER_DIFFICULTIES,
  WRITER_DIFFICULTY_LABEL,
  WRITER_IDLE_POLL_MS,
  WRITER_MODE_LABEL as MODE_LABEL,
  WRITER_MODES as MODES,
  WRITER_POLL_MS as POLL_MS,
  WRITER_STAGE_LABEL as STAGE_LABEL,
  WRITER_TO_REVIEW,
  writerPublishErrorText,
  WRITER_RELEASE_LABEL,
  writerStopReasonText,
} from '@/components/td/writer/writer-modes';

type WriterJob = TdWriterJob;
type Mode = WriterJob['mode'];

const MAX = 50;
const ANY_CATEGORY = '__any__';

/** What a job of the mode makes, for "how many". */
const MODE_NOUN: Record<Mode, string> = {
  cards: t('How many cards (up to 50)'),
  'whoami-subjects': t('How many players (up to 50)'),
  'box-questions': t('How many questions (up to 50)'),
  'penalty-questions': t('How many questions (up to 50)'),
  'practice-questions': t('How many questions (up to 50)'),
};

/** The modes whose questions belong to a category, and that category's rows and name. */
const CATEGORY_OF: Partial<Record<Mode, { type: 'card-categories' | 'box-categories'; name: 'prompt' | 'title' }>> = {
  cards: { type: 'card-categories', name: 'prompt' },
  'box-questions': { type: 'box-categories', name: 'title' },
};

const STATUS: Record<WriterJob['status'], { label: string; className: string }> = {
  queued: { label: t('Waiting'), className: 'bg-slate-100 text-slate-700' },
  running: { label: t('Writing…'), className: 'bg-amber-100 text-amber-800' },
  done: { label: t('Done'), className: 'bg-(--td-new)/15 text-(--td-new)' },
  failed: { label: t('Failed'), className: 'bg-(--td-danger)/15 text-(--td-danger)' },
  cancelled: { label: t('Cancelled'), className: 'bg-slate-100 text-slate-500' },
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** A count typed in a field, kept between 1 and 50. */
const clampCount = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(MAX, Math.max(1, n)) : fallback;
};

/** A schedule's daily cap of rows published on their own, kept between 0 and 1000. */
const CAP_MAX = 1000;
const clampCap = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(CAP_MAX, Math.max(0, n)) : fallback;
};

const active = (job: WriterJob) => job.status === 'queued' || job.status === 'running';

export function TdWriterTab() {
  const overview = useQuery({
    queryKey: tdKeys.writer,
    queryFn: ({ signal }) => tdAdmin.writer.overview({ signal }),
    // Fast while a job waits or runs; slower when idle, so the agent's presence and a schedule firing still show.
    refetchInterval: (query) => (query.state.data?.jobs.some(active) ? POLL_MS : WRITER_IDLE_POLL_MS),
  });
  const [review, setReview] = useState<TdWriterReviewFilter>({ mode: 'penalty-questions', job: null, kind: 'waiting' });
  // Opened from a count or a job: the review list comes into view on that mode.
  const showReview = (filter: TdWriterReviewFilter) => {
    setReview(filter);
    document.getElementById('writer-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (overview.error) return <TdErrorPanel error={overview.error} />;
  if (!overview.data)
    return (
      <div className="grid place-items-center py-16 text-(--td-text-3)">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  const { jobs, schedules, enabled } = overview.data;

  return (
    <div className="space-y-6">
      {!enabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('The AI writer is not connected yet: jobs wait until it is.')}
        </p>
      )}
      <StatusStrip overview={overview.data} onReview={(mode) => showReview({ mode, job: null, kind: 'waiting' })} />
      <TdWriterReview overview={overview.data} filter={review} onFilter={setReview} />
      <GenerateNow busy={jobs.filter(active).length} />
      <Schedules schedules={schedules} />
      <Jobs jobs={jobs} onReview={showReview} />
    </div>
  );
}

/** Each mode's count in the status strip. */
const REVIEW_SHORT: Record<Mode, string> = {
  cards: t('Round I: {n}'),
  'whoami-subjects': t('Round II: {n}'),
  'box-questions': t('Papa Carlo: {n}'),
  'penalty-questions': t('Penalties: {n}'),
  'practice-questions': t('Practice: {n}'),
};

function Tile({ icon: Icon, label, value, children, tone }: { icon: typeof Bot; label: string; value: string; children?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-(--td-text-3)">
        <Icon className="size-4" />
        {label}
      </div>
      <p className={cn('mt-2 text-2xl font-bold text-slate-900', tone)}>{value}</p>
      {children && <div className="mt-1 text-xs text-(--td-text-3)">{children}</div>}
    </div>
  );
}

/** At a glance: is the agent there, what it is doing, and what waits for a member. */
function StatusStrip({ overview, onReview }: { overview: TdWriterOverview; onReview: (mode: Mode) => void }) {
  const { agent, running, queued, toReview } = overview;
  const review = MODES.reduce((sum, m) => sum + toReview[WRITER_TO_REVIEW[m]], 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile icon={Bot} label={t('The agent')} value={agent.online ? t('Online') : t('Offline')} tone={agent.online ? 'text-(--td-new)' : 'text-slate-400'}>
        {agent.lastSeenAt ? t('Last seen {time}', { time: formatGeorgiaTime(agent.lastSeenAt) }) : t('Not seen yet')}
      </Tile>
      <Tile icon={PenLine} label={t('Writing now')} value={String(running)}>
        {t('One job at a time')}
      </Tile>
      <Tile icon={Hourglass} label={t('Waiting')} value={String(queued)}>
        {t('Jobs in line')}
      </Tile>
      <Tile icon={ClipboardCheck} label={t('Needs review')} value={String(review)} tone={review ? 'text-amber-700' : undefined}>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {MODES.filter((m) => toReview[WRITER_TO_REVIEW[m]] > 0).map((m) => (
            <button key={m} type="button" className="underline-offset-2 hover:underline" onClick={() => onReview(m)}>
              {t(REVIEW_SHORT[m], { n: toReview[WRITER_TO_REVIEW[m]] })}
            </button>
          ))}
          {review === 0 && t('Nothing waits')}
        </span>
      </Tile>
    </div>
  );
}

function GenerateNow({ busy }: { busy: number }) {
  const write = useTdWrite();
  const [mode, setMode] = useState<Mode>('penalty-questions');
  const [count, setCount] = useState('20');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState(ANY_CATEGORY);
  const [difficulty, setDifficulty] = useState<TdWriterDifficulty>('house');
  const [autoPublish, setAutoPublish] = useState(false);
  const [sending, setSending] = useState(false);
  const grouping = CATEGORY_OF[mode];
  const cardCategories = useTdAllRows('card-categories', { status: 'draft,ready,approved' }, mode === 'cards');
  const boxCategories = useTdAllRows('box-categories', { status: 'draft,ready,approved' }, mode === 'box-questions');
  const categories = mode === 'cards' ? cardCategories : boxCategories;
  const full = busy >= 3;

  const generate = async () => {
    setSending(true);
    // One id per press: a retry of the same press answers the same job.
    const requestId = crypto.randomUUID();
    const trimmed = topic.trim();
    try {
      await write(
        () =>
          tdAdmin.writer.generate({
            requestId,
            mode,
            requested: clampCount(count, 20),
            difficulty,
            ...(autoPublish ? { autoPublish: true } : {}),
            ...(trimmed ? { topic: trimmed.slice(0, 200) } : {}),
            ...(grouping && category !== ANY_CATEGORY ? { categoryKey: category } : {}),
          }),
        [tdKeys.writer],
      );
      toast.success(
        autoPublish
          ? t('The AI started writing. What passes every check goes to players on its own; one in ten waits in Needs review.')
          : t('The AI started writing. Its questions wait in Needs review as they are written.'),
      );
      setTopic('');
    } catch (error) {
      toast.error(tdErrorText(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <TdSection title={t('Generate now')} description={t('Questions in the style of the house ones, at the difficulty you choose. Each is fact-checked on the web before it reaches you.')}>
      <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5">
          <Label htmlFor="writer-mode">{t('Game mode')}</Label>
          <Select
            value={mode}
            onValueChange={(value) => {
              setMode(value as Mode);
              setCategory(ANY_CATEGORY);
            }}
          >
            <SelectTrigger id="writer-mode" aria-label={t('Game mode')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="writer-count">{MODE_NOUN[mode]}</Label>
          <Input id="writer-count" type="number" min={1} max={MAX} value={count} onChange={(e) => setCount(e.target.value)} />
        </div>
        <DifficultySelect id="writer-difficulty" value={difficulty} onChange={setDifficulty} />
        <div className="space-y-1.5">
          <Label htmlFor="writer-topic">{t('Topic (optional)')}</Label>
          <Input id="writer-topic" value={topic} maxLength={200} placeholder={t('e.g. Champions League, Georgian players')} onChange={(e) => setTopic(e.target.value)} />
        </div>
        {grouping && (
          <div className="space-y-1.5">
            <Label htmlFor="writer-category">{t('Category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="writer-category" aria-label={t('Category')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CATEGORY}>{t('The AI groups them (new categories too)')}</SelectItem>
                {(categories.data?.rows ?? []).map((row) => (
                  <SelectItem key={row.id} value={String(row.data.key)}>
                    {String((row.data as Record<string, unknown>)[grouping.name])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-(--td-divider) px-5 py-4">
        <Button onClick={() => void generate()} disabled={sending || full}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t('Generate')}
        </Button>
        <AutoPublishSwitch id="writer-auto" checked={autoPublish} onChange={setAutoPublish} />
        {full && <span className="text-sm text-(--td-text-3)">{t('Three jobs are waiting or running; start another when one ends.')}</span>}
        {mode === 'cards' && (
          <span className="text-sm text-(--td-text-3)">
            {t('Round I cards come without photos. A new category needs 12 or more cards, and is chosen for matches once at least one of its cards has a photo (add it in the card editor).')}
          </span>
        )}
      </div>
    </TdSection>
  );
}

/** Publish without a member: what passes every check goes to players, one in ten waits for review. */
function AutoPublishSwitch({ id, checked, onChange }: { id: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground" title={t('What passes every check goes to players without you; one in ten waits in Needs review.')}>
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {t('Publish automatically')}
    </label>
  );
}

function DifficultySelect({ id, value, onChange }: { id: string; value: TdWriterDifficulty; onChange: (value: TdWriterDifficulty) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t('Difficulty')}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as TdWriterDifficulty)}>
        <SelectTrigger id={id} aria-label={t('Difficulty')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WRITER_DIFFICULTIES.map((d) => (
            <SelectItem key={d} value={d}>
              {WRITER_DIFFICULTY_LABEL[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Schedules({ schedules }: { schedules: TdWriterSchedule[] }) {
  return (
    <TdSection title={t('Every day')} description={t('Once a day, after the hour you choose (Georgia time), the AI writes this many questions as drafts.')}>
      <div className="divide-y divide-(--td-divider)">
        {schedules.map((schedule) => (
          <ScheduleRow key={`${schedule.mode}-${schedule.revision}`} schedule={schedule} />
        ))}
      </div>
    </TdSection>
  );
}

function ScheduleRow({ schedule }: { schedule: TdWriterSchedule }) {
  const write = useTdWrite();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [hour, setHour] = useState(schedule.hour);
  const [count, setCount] = useState(String(schedule.requested));
  const [topic, setTopic] = useState(schedule.topic ?? '');
  const saved = schedule.difficulty ?? 'house';
  const [difficulty, setDifficulty] = useState<TdWriterDifficulty>(saved);
  const [autoPublish, setAutoPublish] = useState(schedule.autoPublish);
  const [cap, setCap] = useState(String(schedule.autoDailyCap));
  const [saving, setSaving] = useState(false);
  const id = `writer-schedule-${schedule.mode}`;
  const changed =
    enabled !== schedule.enabled ||
    hour !== schedule.hour ||
    clampCount(count, schedule.requested) !== schedule.requested ||
    topic.trim() !== (schedule.topic ?? '') ||
    difficulty !== saved ||
    autoPublish !== schedule.autoPublish ||
    clampCap(cap, schedule.autoDailyCap) !== schedule.autoDailyCap;

  const save = async () => {
    setSaving(true);
    try {
      const trimmed = topic.trim();
      const next = {
        enabled,
        hour,
        requested: clampCount(count, schedule.requested),
        topic: trimmed ? trimmed.slice(0, 200) : null,
        difficulty,
        autoPublish,
        autoDailyCap: clampCap(cap, schedule.autoDailyCap),
      };
      const was = { ...schedule, difficulty: saved };
      // Only what this member changed, at the version they saw: a colleague's change meanwhile is refused, not undone.
      const changes = Object.fromEntries(Object.entries(next).filter(([field, value]) => value !== was[field as keyof typeof next]));
      await write(() => tdAdmin.writer.schedule(schedule.mode, { revision: schedule.revision, ...changes }), [tdKeys.writer]);
      toast.success(t('Saved'));
    } catch (error) {
      toast.error(error instanceof TdApiError && error.status === 409 && error.code === 'conflict' ? t('Someone changed this schedule meanwhile: it was reloaded, check it and save again.') : tdErrorText(error));
      if (error instanceof TdApiError && error.status === 409) void queryClient.invalidateQueries({ queryKey: tdKeys.writer });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid items-end gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1.4fr_auto]">
      <label className="flex items-center gap-3 self-center" htmlFor={`${id}-on`}>
        <Checkbox id={`${id}-on`} checked={enabled} onCheckedChange={(value) => setEnabled(value === true)} />
        <span>
          <span className="block text-sm font-semibold text-foreground">{MODE_LABEL[schedule.mode]}</span>
          <span className="block text-xs text-(--td-text-3)">
            {schedule.lastFiredOn ? t('Last run: {day}', { day: schedule.lastFiredOn }) : t('Not run yet')}
          </span>
        </span>
      </label>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-hour`}>{t('After (Georgia time)')}</Label>
        <Select value={String(hour)} onValueChange={(value) => setHour(Number(value))}>
          <SelectTrigger id={`${id}-hour`} aria-label={t('After (Georgia time)')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HOURS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {hourLabel(h)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-count`}>{t('Questions a day')}</Label>
        <Input id={`${id}-count`} type="number" min={1} max={MAX} value={count} onChange={(e) => setCount(e.target.value)} />
      </div>
      <DifficultySelect id={`${id}-difficulty`} value={difficulty} onChange={setDifficulty} />
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-topic`}>{t('Topic (optional)')}</Label>
        <Input id={`${id}-topic`} value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <Button variant="outline" onClick={() => void save()} disabled={saving || !changed}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
        {t('Save')}
      </Button>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-6">
        <AutoPublishSwitch id={`${id}-auto`} checked={autoPublish} onChange={setAutoPublish} />
        {autoPublish && (
          <>
            <Label htmlFor={`${id}-cap`} className="text-xs font-normal text-(--td-text-3)">
              {t('At most a day')}
            </Label>
            <Input id={`${id}-cap`} type="number" min={0} max={CAP_MAX} className="h-8 w-24" value={cap} onChange={(e) => setCap(e.target.value)} />
            <span className="text-xs text-(--td-text-3)">{t('Published on their own today: {n} of {cap}', { n: schedule.autoPublishedToday, cap: schedule.autoDailyCap })}</span>
          </>
        )}
      </div>
    </div>
  );
}

const QUESTION_STATUS: Record<WriterQuestion['status'], { label: string; className: string }> = {
  draft: { label: t('Needs review'), className: 'bg-amber-100 text-amber-800' },
  ready: { label: t('Needs review'), className: 'bg-amber-100 text-amber-800' },
  approved: { label: t('Approved'), className: 'bg-(--td-new)/15 text-(--td-new)' },
  archived: { label: t('Removed from the game'), className: 'bg-slate-100 text-slate-500' },
  removed: { label: t('Undone'), className: 'bg-slate-100 text-slate-400' },
};

/** The questions a job wrote, each with where it stands, and what it turned away. */
function JobQuestions({ job, onClose, onReview }: { job: WriterJob | null; onClose: () => void; onReview: (job: WriterJob) => void }) {
  const detail = useQuery({
    queryKey: [...tdKeys.writer, 'job', job?.id],
    queryFn: ({ signal }) => tdAdmin.writer.job(job!.id, { signal }),
    enabled: job !== null,
    refetchInterval: job && active(job) ? POLL_MS : false,
  });
  const shown = detail.data?.job ?? job;
  const rejectedBy: Partial<Record<TdWriterRejectStage, number>> = shown?.rejectedBy ?? {};
  const stages = TD_WRITER_REJECT_STAGES.filter((stage) => (rejectedBy[stage] ?? 0) > 0);
  const rejects = detail.data?.rejects ?? [];
  return (
    <Sheet open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <TdSheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('Questions of this job')}</SheetTitle>
          <SheetDescription>
            {job
              ? `${MODE_LABEL[job.mode]} · ${WRITER_DIFFICULTY_LABEL[job.difficulty ?? 'house']} · ${formatGeorgiaTime(job.createdAt)}${job.topic ? ` · ${job.topic}` : ''}`
              : ''}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          {detail.error && <TdErrorPanel error={detail.error} />}
          {shown?.stopReason && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t('Made {made} of {requested}: {reason}', { made: shown.made, requested: shown.requested, reason: writerStopReasonText(shown.stopReason) })}
            </p>
          )}
          {shown?.autoPublish && (
            <section aria-label={t('Published automatically')} className="space-y-1 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
              <p className="font-bold">{t('Published automatically: {n}', { n: shown.autoPublished })}</p>
              <p>{t('Kept for review (one in ten): {n}', { n: shown.autoSampled })}</p>
              {shown.autoHeld > 0 && <p>{t('Kept as drafts over the daily limit: {n}', { n: shown.autoHeld })}</p>}
              {shown.releaseState && <p>{WRITER_RELEASE_LABEL[shown.releaseState]}</p>}
              {shown.publishError && <p className="text-(--td-danger)">{writerPublishErrorText(shown.publishError)}</p>}
            </section>
          )}
          {shown && shown.rejected > 0 && (
            <section aria-label={t('Turned away by the AI')} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="text-xs font-bold text-slate-700">
                {t('Turned away by the AI')}: {shown.rejected}
              </p>
              {stages.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stages.map((stage) => (
                    <span key={stage} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      {STAGE_LABEL[stage]}: {rejectedBy[stage]}
                    </span>
                  ))}
                </div>
              )}
              {rejects.length > 0 && (
                <ul className="max-h-60 space-y-1.5 overflow-y-auto">
                  {rejects.map((reject, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <span className="mr-1.5 rounded bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{STAGE_LABEL[reject.stage] ?? reject.stage}</span>
                      {reject.summary && <span className="font-medium text-slate-800">{reject.summary}</span>}
                      {reject.reason && <span className="text-slate-500"> — {reject.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {!detail.data && !detail.error && <Loader2 className="mx-auto size-5 animate-spin text-(--td-text-3)" />}
          {detail.data?.questions.length === 0 && <TdEmptyState icon={ListChecks} title={t('No questions yet')} />}
          {detail.data?.questions.map((question, i) => {
            const status = QUESTION_STATUS[question.status];
            return (
              <div key={question.id ?? `removed-${i}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">{question.status === 'removed' ? t('An undone question') : question.q}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', status.className)}>{status.label}</span>
                </div>
                {question.status !== 'removed' && (
                  <p className="mt-1.5 text-xs text-(--td-text-3)">
                    {t('Answer: {answer}', { answer: question.display })}
                    {/* A practice question's other options are wrong answers, never spellings of this one. */}
                    {job?.mode !== 'practice-questions' && question.aliases.length > 1 && ` · ${question.aliases.slice(1).join(', ')}`}
                    {question.category && ` · ${question.category}`}
                  </p>
                )}
              </div>
            );
          })}
          {job && job.toReview > 0 && (
            <Button className="w-full" onClick={() => onReview(job)}>
              <ClipboardCheck className="size-4" />
              {t('Review this job’s drafts')}
            </Button>
          )}
        </div>
      </TdSheetContent>
    </Sheet>
  );
}

function Jobs({ jobs, onReview }: { jobs: WriterJob[]; onReview: (filter: TdWriterReviewFilter) => void }) {
  const write = useTdWrite();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // Keep "Writing…" fresh between polls.
  useEffect(() => {
    if (!jobs.some(active)) return;
    const timer = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => clearInterval(timer);
  }, [jobs]);

  const cancel = async (job: WriterJob) => {
    setCancelling(job.id);
    try {
      await write(() => tdAdmin.writer.cancel(job.id), [tdKeys.writer]);
    } catch (error) {
      toast.error(tdErrorText(error));
    } finally {
      setCancelling(null);
    }
  };

  return (
    <TdSection title={t('Jobs')} description={t('The latest 50. Drafts stay drafts until you publish them.')}>
      {jobs.length === 0 ? (
        <TdEmptyState icon={Sparkles} title={t('No jobs yet')}>
          {t('Press Generate, or turn on a daily schedule.')}
        </TdEmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Started')}</TableHead>
              <TableHead>{t('By')}</TableHead>
              <TableHead>{t('Game mode')}</TableHead>
              <TableHead>{t('Topic')}</TableHead>
              <TableHead className="text-right">{t('Drafts')}</TableHead>
              <TableHead className="text-right">{t('Needs review')}</TableHead>
              <TableHead className="text-right">{t('Turned away')}</TableHead>
              <TableHead>{t('Status')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const status = STATUS[job.status];
              return (
                <TableRow key={job.id}>
                  <TableCell className="whitespace-nowrap text-sm">{formatGeorgiaTime(job.createdAt)}</TableCell>
                  <TableCell className="text-sm">{job.requestedBy?.name ?? t('Daily schedule')}</TableCell>
                  <TableCell className="text-sm">{MODE_LABEL[job.mode]}</TableCell>
                  <TableCell className="max-w-56 text-sm">
                    <span className="line-clamp-2">{[job.categoryTitle, job.topic].filter(Boolean).join(' · ') || '—'}</span>
                    {job.difficulty && job.difficulty !== 'house' && <span className="block text-xs text-(--td-text-3)">{WRITER_DIFFICULTY_LABEL[job.difficulty]}</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {job.made} / {job.requested}
                  </TableCell>
                  <TableCell className={cn('text-right text-sm tabular-nums', job.toReview > 0 && 'font-semibold text-amber-700')}>{job.toReview}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{job.rejected}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-semibold', status.className)}>{status.label}</span>
                    {job.error && <span className="mt-1 block max-w-64 text-xs text-(--td-danger)">{job.error}</span>}
                    {!job.error && job.stopReason && <span className="mt-1 block max-w-64 text-xs text-amber-800">{writerStopReasonText(job.stopReason)}</span>}
                    {job.autoPublish && (
                      <span className="mt-1 flex w-fit items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">
                        <Sparkles className="size-3" />
                        {t('Automatic: {n}', { n: job.autoPublished })}
                      </span>
                    )}
                    {job.publishError && <span className="mt-1 block max-w-64 text-xs text-(--td-danger)">{writerPublishErrorText(job.publishError)}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {active(job) && (
                      <Button size="sm" variant="ghost" onClick={() => void cancel(job)} disabled={cancelling === job.id} aria-label={t('Stop')}>
                        <X className="size-4" />
                        {t('Stop')}
                      </Button>
                    )}
                    {(job.made > 0 || job.rejected > 0) && (
                      <Button size="sm" variant="ghost" onClick={() => setOpen(job.id)}>
                        <ListChecks className="size-4" />
                        {t('See the questions')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <JobQuestions
        job={jobs.find((j) => j.id === open) ?? null}
        onClose={() => setOpen(null)}
        onReview={(job) => {
          setOpen(null);
          onReview({ mode: job.mode, job: { id: job.id, label: formatGeorgiaTime(job.createdAt) }, kind: 'waiting' });
        }}
      />
    </TdSection>
  );
}
