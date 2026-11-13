'use client';

import { Fragment, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Check, ChevronRight, ExternalLink, Loader2, Plus, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCancelBuild, useHqAnalytics, useHqBuilds, useSubmitBuild } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi } from '@/lib/hq-board';
import { PIPELINE_STEPS, buildPipeline, type PipelineStepKey, type PipelineStepState } from '@/lib/hq-director';
import {
  BUILD_KINDS,
  BUILD_KIND_LABELS,
  BUILD_REPOS,
  BUILD_REPO_LABELS,
  BUILD_STAGE_LABELS,
  BUILD_STATUS_LABELS,
  buildProgress,
  canCancelBuild,
} from '@/lib/hq-builds';
import type { HqBuild, HqBuildJob, HqBuildKind, HqBuildRepo, HqBuildStage, HqBuildStatus } from '@/types';
import { EmptyState, HQ_LABEL, HQ_PAGE, LoadErrorState, Markdown, PageHeader, Panel, RefreshErrorBanner, Section, errorMessage } from '../hq-ui';
import { BuildShots } from '../build-shots';

const MAX_TITLE_LENGTH = 200;
const MIN_SPEC_LENGTH = 20;
const MAX_SPEC_LENGTH = 30000;
const MAX_NOTE_LENGTH = 2000;

const STATUS_STYLES: Record<HqBuildStatus, string> = {
  submitted: 'border-slate-200 bg-slate-100 text-slate-700',
  changes_requested: 'border-amber-200 bg-amber-50 text-amber-700',
  declined: 'border-red-200 bg-red-50 text-red-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

const STAGE_STYLES: Record<HqBuildStage, string> = {
  queued: 'border-slate-200 bg-slate-100 text-slate-700',
  building: 'border-blue-200 bg-blue-50 text-blue-700',
  reviewing: 'border-blue-200 bg-blue-50 text-blue-700',
  testing: 'border-blue-200 bg-blue-50 text-blue-700',
  rating: 'border-blue-200 bg-blue-50 text-blue-700',
  ready_to_publish: 'border-amber-200 bg-amber-50 text-amber-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

/**
 * The one state badge on a row. Once the Director has approved a request its build stage is the better state, so the
 * stage replaces "Approved"; a declined or cancelled request keeps its own status.
 */
function buildState(build: HqBuild): { label: string; style: string } {
  const stage = build.job?.stage;
  if (build.status !== 'approved' || !stage) return { label: BUILD_STATUS_LABELS[build.status] ?? build.status, style: STATUS_STYLES[build.status] };
  // "Published" means a draft PR to staging is open and waiting for the founder (hq-director STAGE_AT).
  if (stage === 'published') return { label: 'PR open', style: 'border-amber-200 bg-amber-50 text-amber-700' };
  // "Ready to publish" overstates it: the build passed, and a draft PR to staging is what comes next.
  if (stage === 'ready_to_publish') return { label: 'Ready for draft PR', style: STAGE_STYLES[stage] };
  return { label: BUILD_STAGE_LABELS[stage] ?? stage, style: STAGE_STYLES[stage] };
}

/**
 * What happens next and who does it, from the real pipeline (hq-director PIPELINE_STEPS and the publish flow): the
 * Builder writes the change, GPT reviews the diff, testers play it, the Publisher opens a draft PR to staging, and the
 * founder reviews and merges it. A finished build has a note instead of a next step.
 */
function nextStep(build: HqBuild): { action: string; who: string; needsYou: boolean } | { note: string } | null {
  const step = (action: string, who: string, needsYou = false) => ({ action, who, needsYou });
  if (build.status === 'declined' || build.status === 'cancelled' || build.status === 'changes_requested') return null;
  if (build.status === 'submitted') return step('review the request', 'Director');
  switch (build.job?.stage) {
    case undefined: return step('start the build', 'Builder');
    case 'queued': return step('start building', 'Builder');
    case 'building': return step('write the change', 'Builder');
    case 'reviewing': return step('review the diff', 'GPT');
    case 'testing': return step('play-test on a phone and a desktop', 'Play-testers');
    case 'rating': return step('rate the play-test', 'Builder');
    case 'ready_to_publish': return step('open draft PR', 'Publisher');
    case 'published': return step('merge to staging', 'you', true);
    case 'done': return { note: 'The PR is merged.' };
    case 'failed':
    case 'cancelled': return null;
  }
}

/** The newest timestamp the API gives for a request: it has no "updated" field, so the latest event stands in. */
function lastUpdate(build: HqBuild): string {
  const stamps = [build.createdAt, build.decidedAt, build.job?.startedAt, build.job?.finishedAt].filter((t): t is string => !!t);
  return stamps.reduce((latest, t) => (new Date(t).getTime() > new Date(latest).getTime() ? t : latest));
}

/** Why a request or build stopped, when the data says: shown on the row so the founder need not open it. */
function stopReason(build: HqBuild): { text: string; tone: string } | null {
  if (build.status === 'declined' && build.directorNote) return { text: build.directorNote, tone: 'text-red-700' };
  if (build.status === 'changes_requested' && build.directorNote) return { text: build.directorNote, tone: 'text-amber-800' };
  if (build.status === 'approved' && build.job?.stage === 'failed' && build.job.note) return { text: build.job.note, tone: 'text-red-700' };
  return null;
}

/** The draft PRs the publisher opened, as links ("Draft PR #123"); only well-formed http(s) URLs. */
function prLinks(job: HqBuildJob | null): Array<{ key: string; href: string; label: string }> {
  const valid = (job?.prs ?? []).flatMap((pr) => {
    const url = safeWebUrl(pr.url);
    return url ? [{ pr, url }] : [];
  });
  return valid.map(({ pr, url }) => {
    const number = /\/pull\/(\d+)/.exec(url.pathname)?.[1];
    const base = `Draft PR${number ? ` #${number}` : ''}`;
    const repo = BUILD_REPO_LABELS[pr.repo as HqBuildRepo] ?? pr.repo;
    return { key: `${pr.repo}-${pr.url}`, href: url.href, label: valid.length > 1 ? `${repo}: ${base}` : base };
  });
}

/** The path of a build in seven steps. Each maps to a real pipeline step (hq-director PIPELINE_STEPS); the request itself is always done. */
const STEPPER: Array<{ label: string; key: PipelineStepKey | null }> = [
  { label: 'Request', key: null },
  { label: 'Director', key: 'verified' },
  { label: 'Building', key: 'building' },
  { label: 'Review', key: 'review' },
  { label: 'Play-test', key: 'playtest' },
  { label: 'Draft PR', key: 'pr' },
  { label: 'Merged', key: 'staging' },
];

/** Where an active build is on that path, from `buildPipeline`; the Director step follows the request's own status. */
function stepperSteps(build: HqBuild): Array<{ label: string; state: PipelineStepState; hint?: string }> {
  const byKey = new Map(buildPipeline(build).steps.map((step) => [step.key, step.state]));
  const approved = build.status === 'approved';
  return STEPPER.map(({ label, key }) => {
    const hint = PIPELINE_STEPS.find((step) => step.key === key)?.hint;
    if (!key) return { label, state: 'done', hint: 'The request was sent' };
    if (key === 'verified') return { label, state: approved ? 'done' : 'current', hint };
    // Approved but no build yet: the Builder is next.
    if (!build.job) return { label, state: key === 'building' && approved ? 'current' : 'todo', hint };
    return { label, state: byKey.get(key) ?? 'todo', hint };
  });
}

function Stepper({ build, needsYou }: { build: HqBuild; needsYou: boolean }) {
  return (
    <ol aria-label="Path to merge" className="flex flex-wrap items-center gap-y-1">
      {stepperSteps(build).map((step, i) => (
        <li key={step.label} className="flex items-center">
          {i > 0 && <ChevronRight className="mx-0.5 h-3 w-3 text-slate-300" aria-hidden />}
          <span
            title={step.hint}
            data-step-state={step.state}
            aria-current={step.state === 'current' ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px]',
              step.state === 'done' && 'text-slate-600',
              step.state === 'current' && (needsYou ? 'border border-amber-200 bg-amber-50 font-medium text-amber-800' : 'border border-blue-200 bg-blue-50 font-medium text-blue-700'),
              step.state === 'todo' && 'text-slate-500',
              step.state === 'skipped' && 'text-slate-500 line-through'
            )}
          >
            {step.state === 'done' && <Check className="h-3 w-3 text-emerald-600" aria-hidden />}
            {step.label}
            {step.state === 'skipped' && <span className="sr-only"> (skipped)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Still moving: not finished (the same test as Cancel), or a draft PR waiting for the founder's merge. */
function isActive(build: HqBuild): boolean {
  return canCancelBuild(build) || build.job?.stage === 'published';
}

/** The PR waiting for his merge leads, then a build about to open one. */
function activeRank(build: HqBuild): number {
  const stage = build.job?.stage;
  return stage === 'published' ? 0 : stage === 'ready_to_publish' ? 1 : 2;
}

export default function HqBuildsPage() {
  const { data, isLoading, error, refetch } = useHqBuilds();
  const [formOpen, setFormOpen] = useState(false);

  const active = (data ?? []).filter(isActive).sort((a, b) => activeRank(a) - activeRank(b));
  const finished = (data ?? []).filter((b) => !isActive(b));

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Builds"
        description="Ask for a game mode, a feature or a fix. The Director reviews every request before the Builder starts."
        actions={
          <Button variant={formOpen ? 'outline' : 'default'} className={formOpen ? 'shadow-none' : undefined} aria-expanded={formOpen} aria-controls="new-build-form" onClick={() => setFormOpen((o) => !o)}>
            <Plus className="h-4 w-4" /> New build
          </Button>
        }
      />

      <div id="new-build-form" hidden={!formOpen}>
        <NewBuildForm onSent={() => setFormOpen(false)} onClose={() => setFormOpen(false)} />
      </div>

      {!data ? (
        isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <LoadErrorState error={error} fallback="Could not load the build requests." onRetry={() => void refetch()} />
        )
      ) : (
        <>
          {!!error && <RefreshErrorBanner />}
          {data.length === 0 ? (
            <EmptyState>No build requests yet.</EmptyState>
          ) : (
            <>
              {active.length > 0 && (
                <Section title="Active" count={active.length} description="Waiting for the Director or the Builder, or a draft PR waiting for your merge.">
                  <BuildList builds={active} />
                </Section>
              )}
              {finished.length > 0 && (
                <Section title="Finished" count={finished.length} description="Merged, failed, declined or cancelled.">
                  <BuildList builds={finished} />
                </Section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function BuildList({ builds }: { builds: HqBuild[] }) {
  return (
    <Panel>
      <ul className="divide-y divide-slate-100">
        {builds.map((build) => (
          <BuildRow key={build.id} build={build} />
        ))}
      </ul>
    </Panel>
  );
}

// ── New request ──

const NO_GAME = '__none__';

function NewBuildForm({ onSent, onClose }: { onSent: () => void; onClose: () => void }) {
  const submit = useSubmitBuild();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<HqBuildKind>('feature');
  const [repos, setRepos] = useState<HqBuildRepo[]>([]);
  const [game, setGame] = useState<string>(NO_GAME);
  // The games as analytics counts them (its ids), so HQ can find the same game's plays later.
  const { data: analytics, isPending: gamesLoading, isError: gamesFailed, error: gamesError, refetch: refetchGames } = useHqAnalytics(30);
  const gameOptions = Object.entries(analytics?.modeLabels ?? {})
    .filter(([id]) => id !== 'other')
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const [spec, setSpec] = useState('');

  const specLength = spec.trim().length;
  const valid = title.trim().length > 0 && specLength >= MIN_SPEC_LENGTH && repos.length > 0;

  const toggleRepo = (repo: HqBuildRepo, on: boolean) => setRepos((prev) => (on ? [...prev.filter((r) => r !== repo), repo] : prev.filter((r) => r !== repo)));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submit.isPending) return;
    submit.mutate(
      { title: title.trim(), spec: spec.trim(), kind, repos: BUILD_REPOS.map((r) => r.value).filter((r) => repos.includes(r)), game: game === NO_GAME ? null : game },
      {
        onSuccess: (build) => {
          toast.success(`Request #${build.number} sent — the Director reviews it next`);
          setTitle('');
          setKind('feature');
          setRepos([]);
          setGame(NO_GAME);
          setSpec('');
          onSent();
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send the build request')),
      }
    );
  };

  return (
    <Section title="New build request">
      <Panel className="p-4">
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div className="space-y-1">
              <label htmlFor="build-title" className={HQ_LABEL}>
                Title
              </label>
              <Input
                id="build-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_TITLE_LENGTH}
                placeholder="e.g. Penalty shootout mode for friends"
              />
            </div>
            <div className="space-y-1">
              <span id="build-kind-label" className={cn(HQ_LABEL, 'block')}>
                Kind
              </span>
              <Select value={kind} onValueChange={(v) => setKind(v as HqBuildKind)}>
                <SelectTrigger className="w-full" aria-labelledby="build-kind-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILD_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 sm:max-w-xs">
            <span id="build-game-label" className={cn(HQ_LABEL, 'block')}>
              Game
            </span>
            <Select value={game} onValueChange={setGame} disabled={gamesLoading}>
              <SelectTrigger className="w-full" aria-labelledby="build-game-label">
                {gamesLoading ? <span className="text-slate-500">Loading games…</span> : <SelectValue />}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GAME}>No specific game</SelectItem>
                {gameOptions.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gamesFailed && !analytics ? (
              <LoadErrorState error={gamesError} fallback="Could not load the games list." onRetry={() => void refetchGames()} />
            ) : (
              <p className="text-[13px] text-slate-600">Games played in the last 30 days. HQ shows this game’s plays before the build ships.</p>
            )}
          </div>

          <fieldset className="space-y-1.5">
            <legend className={HQ_LABEL}>Repos it touches</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {BUILD_REPOS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox checked={repos.includes(r.value)} onCheckedChange={(checked) => toggleRepo(r.value, checked === true)} />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="build-spec" className={HQ_LABEL}>
              Spec
            </label>
            <Textarea
              id="build-spec"
              rows={8}
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              maxLength={MAX_SPEC_LENGTH}
              aria-describedby="build-spec-hint"
              placeholder="Describe the build…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <p id="build-spec-hint" className="text-slate-500">
                What to build, why, how it should work, edge cases — the Director reviews it before the Builder starts
              </p>
              <span className={cn('tabular-nums', specLength > 0 && specLength < MIN_SPEC_LENGTH ? 'text-amber-700' : 'text-slate-500')}>
                {specLength > 0 && specLength < MIN_SPEC_LENGTH ? `At least ${MIN_SPEC_LENGTH} characters · ` : ''}
                {specLength.toLocaleString()} / {MAX_SPEC_LENGTH.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" className="text-slate-600" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" disabled={!valid || submit.isPending}>
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to the Director
            </Button>
          </div>
        </form>
      </Panel>
    </Section>
  );
}

// ── Requests ──

function BuildRow({ build }: { build: HqBuild }) {
  const [open, setOpen] = useState(false);
  const { job } = build;
  const state = buildState(build);
  const next = nextStep(build);
  const needsYou = !!next && 'needsYou' in next && next.needsYou;
  // Opening the row shows the whole note, so the one-line reason steps aside.
  const reason = open ? null : stopReason(build);
  const links = prLinks(job);
  // A draft PR waiting for the founder is the row's main visual; any other PR link sits quietly below.
  const waitingOnYou = needsYou && links.length > 0;
  const updated = lastUpdate(build);
  const meta = [
    <span key="kind">{BUILD_KIND_LABELS[build.kind] ?? build.kind}</span>,
    ...build.repos.map((repo) => <span key={repo}>{BUILD_REPO_LABELS[repo] ?? repo}</span>),
    <span key="by" title={`Requested ${formatTbilisi(build.createdAt)}`}>{build.requestedBy ?? '—'}</span>,
  ];
  const prLinkClass = 'inline-flex min-h-9 items-center gap-1 text-sm font-medium hover:underline';

  return (
    <li>
      <div className="rounded-lg transition hover:bg-slate-50">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn('flex w-full items-start gap-2.5 rounded-lg px-4 pt-3 text-left', links.length ? 'pb-1' : 'pb-3')}
        >
          <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition', open && 'rotate-90')} aria-hidden />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[13px] tabular-nums text-slate-600">#{build.number}</span>
              <span className="text-sm font-semibold text-slate-950">{build.title}</span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="outline" className={cn('rounded', state.style)}>
                {state.label}
              </Badge>
              {next && 'action' in next && (
                <span className={cn('text-sm font-medium', needsYou ? 'text-amber-800' : 'text-slate-700')}>
                  Next: {next.action} — {next.who}
                </span>
              )}
              {next && 'note' in next && <span className="text-sm font-medium text-slate-700">{next.note}</span>}
              <time dateTime={updated} title={`Latest activity ${formatTbilisi(updated)}`} className="text-[13px] tabular-nums text-slate-600">
                Updated {formatRelative(updated)}
              </time>
            </span>
            {reason && (
              <span className={cn('line-clamp-2 block text-sm', reason.tone)}>
                <span className="font-medium">Reason:</span> {reason.text}
              </span>
            )}
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-slate-600">
              {meta.map((item, i) => (
                <Fragment key={item.key}>
                  {i > 0 && <span aria-hidden>·</span>}
                  {item}
                </Fragment>
              ))}
            </span>
          </span>
        </button>
        {links.length > 0 && (
          <div className={cn('mb-1 ml-[2.625rem] mr-4 flex flex-wrap items-center gap-x-4', waitingOnYou && 'mb-3 mt-1 rounded-md border border-amber-200 bg-amber-50 px-3')}>
            {waitingOnYou && <span className="py-1.5 text-sm font-semibold text-amber-900">Waiting for your merge</span>}
            {links.map((link) => (
              <a
                key={link.key}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${link.label} (opens in a new tab)`}
                className={cn(prLinkClass, waitingOnYou ? 'text-amber-900 underline' : 'text-sky-700')}
              >
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-3">
          {isActive(build) && (
            <section className="space-y-1.5">
              <div className={HQ_LABEL}>Path to merge</div>
              <Stepper build={build} needsYou={needsYou} />
            </section>
          )}

          {build.job?.screenshots && <BuildShots shots={build.job.screenshots} />}

          <section className="space-y-1.5">
            <div className={HQ_LABEL}>Request</div>
            <Markdown>{build.spec}</Markdown>
          </section>

          {(build.directorNote || build.directorSpec) && (
            <section className="space-y-2">
              {build.directorNote && (
                <div className="space-y-1">
                  <div className={HQ_LABEL}>Director’s note</div>
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5 text-sm',
                      build.status === 'changes_requested' ? 'bg-amber-50 text-amber-900' : 'bg-slate-50 text-slate-700'
                    )}
                  >
                    {build.directorNote}
                  </p>
                </div>
              )}
              {build.directorSpec && (
                <div className="space-y-1.5">
                  <div className={HQ_LABEL}>Director’s version</div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <Markdown>{build.directorSpec}</Markdown>
                  </div>
                </div>
              )}
              {build.decidedAt && (
                <p className="text-[13px] text-slate-600">
                  Decided <time dateTime={build.decidedAt}>{formatTbilisi(build.decidedAt)}</time>
                </p>
              )}
            </section>
          )}

          {job && <JobSection job={job} />}

          <CancelBuild build={build} />
        </div>
      )}
    </li>
  );
}

function JobSection({ job }: { job: HqBuildJob }) {
  return (
    <section aria-label="Build" className="space-y-2">
      <div className={HQ_LABEL}>Build #{job.number}</div>
      <ProgressLine stage={job.stage} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-600">
        <span>
          Runs {job.runsUsed}/{job.runLimit}
        </span>
        {job.startedAt && <span>Started {formatTbilisi(job.startedAt)}</span>}
        {job.finishedAt && <span>Finished {formatTbilisi(job.finishedAt)}</span>}
      </div>
      {job.note && <p className="whitespace-pre-wrap break-words rounded-md bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">{job.note}</p>}
    </section>
  );
}

/** Agent-recorded links: only well-formed http(s) URLs without embedded credentials become links (`https://github.com@host/` has the host `host`). */
function safeWebUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
    return isHttp && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** queued → building → reviewing → testing → rating → ready; a failed or cancelled job ends the line with its outcome. */
function ProgressLine({ stage }: { stage: HqBuildStage }) {
  const outcome = stage === 'failed' || stage === 'cancelled' ? stage : null;
  return (
    <ol aria-label="Build progress" className="flex flex-wrap items-center gap-y-1 text-[13px]">
      {buildProgress(stage).map((step, i) => (
        <li key={step.stage} aria-current={step.state === 'current' ? 'step' : undefined} className="flex items-center">
          {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-slate-300" aria-hidden />}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium',
              step.state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              step.state === 'current' && 'border-blue-200 bg-blue-50 text-blue-700',
              step.state === 'todo' && 'border-slate-200 bg-white text-slate-500'
            )}
          >
            {step.state === 'done' && <Check className="h-3 w-3" aria-hidden />}
            {step.label}
          </span>
        </li>
      ))}
      {outcome && (
        <li className="flex items-center">
          <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-slate-300" aria-hidden />
          <Badge variant="outline" className={cn('rounded', STAGE_STYLES[outcome])}>
            {BUILD_STAGE_LABELS[outcome]}
          </Badge>
        </li>
      )}
    </ol>
  );
}

// ── Cancel ──

function CancelBuild({ build }: { build: HqBuild }) {
  const cancel = useCancelBuild();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  if (!canCancelBuild(build)) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = note.trim();
    if (!trimmed || cancel.isPending) return;
    cancel.mutate(
      { id: build.id, note: trimmed },
      {
        onSuccess: ({ result }) => {
          toast.success(result === 'build_stopped' ? `Build #${build.number} stopped` : `Request #${build.number} cancelled`);
          setOpen(false);
          setNote('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not cancel this request')),
      }
    );
  };

  if (!open) {
    return (
      <Button size="sm" variant="outline" className="shadow-none max-sm:h-9" onClick={() => setOpen(true)}>
        <X className="h-4 w-4" /> Cancel
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        autoFocus
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={MAX_NOTE_LENGTH}
        aria-label="Cancel note"
        placeholder="Why are you cancelling?"
        className="h-9 min-w-[16rem] flex-1"
      />
      <Button type="submit" size="sm" className="max-sm:h-9" disabled={!note.trim() || cancel.isPending}>
        {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="text-slate-600 max-sm:h-9" onClick={() => setOpen(false)} disabled={cancel.isPending}>
        Keep it
      </Button>
    </form>
  );
}
