'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Check, ChevronRight, Hammer, Loader2, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCancelBuild, useHqBuilds, useSubmitBuild } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative, formatTbilisi } from '@/lib/hq-board';
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
import { EmptyState, LoadErrorState, Markdown, PageHeader, RefreshErrorBanner, SectionTitle, errorMessage } from '../hq-ui';

const MAX_TITLE_LENGTH = 200;
const MIN_SPEC_LENGTH = 20;
const MAX_SPEC_LENGTH = 30000;
const MAX_NOTE_LENGTH = 2000;

const STATUS_STYLES: Record<HqBuildStatus, string> = {
  submitted: 'border-violet-200 bg-violet-50 text-violet-700',
  changes_requested: 'border-amber-200 bg-amber-50 text-amber-700',
  declined: 'border-red-200 bg-red-50 text-red-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

const STAGE_STYLES: Record<HqBuildStage, string> = {
  queued: 'border-slate-200 bg-slate-100 text-slate-700',
  building: 'border-blue-200 bg-blue-50 text-blue-700',
  reviewing: 'border-violet-200 bg-violet-50 text-violet-700',
  testing: 'border-sky-200 bg-sky-50 text-sky-700',
  rating: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  ready_to_publish: 'border-amber-200 bg-amber-50 text-amber-700',
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

export default function HqBuildsPage() {
  const { data, isLoading, error, refetch } = useHqBuilds();

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <PageHeader
        icon={<Hammer className="h-6 w-6 text-slate-700" />}
        title="Builds"
        description="Ask for a game mode, a feature or a fix. The Director reviews every request before the Builder starts."
      />

      <NewBuildForm />

      <Panel>
        <SectionTitle count={data?.length}>Requests</SectionTitle>
        {!data ? (
          isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <LoadErrorState error={error} fallback="Could not load the build requests." onRetry={() => void refetch()} />
          )
        ) : (
          <div className="space-y-3">
            {!!error && <RefreshErrorBanner />}
            {data.length === 0 ? (
              <EmptyState>No build requests yet.</EmptyState>
            ) : (
              <ul className="space-y-2">
                {data.map((build) => (
                  <BuildRow key={build.id} build={build} />
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4">{children}</section>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

// ── New request ──

function NewBuildForm() {
  const submit = useSubmitBuild();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<HqBuildKind>('feature');
  const [repos, setRepos] = useState<HqBuildRepo[]>([]);
  const [spec, setSpec] = useState('');

  const specLength = spec.trim().length;
  const valid = title.trim().length > 0 && specLength >= MIN_SPEC_LENGTH && repos.length > 0;

  const toggleRepo = (repo: HqBuildRepo, on: boolean) => setRepos((prev) => (on ? [...prev.filter((r) => r !== repo), repo] : prev.filter((r) => r !== repo)));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || submit.isPending) return;
    submit.mutate(
      { title: title.trim(), spec: spec.trim(), kind, repos: BUILD_REPOS.map((r) => r.value).filter((r) => repos.includes(r)) },
      {
        onSuccess: (build) => {
          toast.success(`Request #${build.number} sent — the Director reviews it next`);
          setTitle('');
          setKind('feature');
          setRepos([]);
          setSpec('');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send the build request')),
      }
    );
  };

  return (
    <Panel>
      <SectionTitle>New build request</SectionTitle>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-1">
            <label htmlFor="build-title" className="text-xs font-semibold text-slate-500">
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
            <span id="build-kind-label" className="text-xs font-semibold text-slate-500">
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

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-slate-500">Repos it touches</legend>
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
          <label htmlFor="build-spec" className="text-xs font-semibold text-slate-500">
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
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <p id="build-spec-hint" className="text-slate-400">
              What to build, why, how it should work, edge cases — the Director reviews it before the Builder starts
            </p>
            <span className={cn('tabular-nums', specLength > 0 && specLength < MIN_SPEC_LENGTH ? 'text-amber-700' : 'text-slate-400')}>
              {specLength > 0 && specLength < MIN_SPEC_LENGTH ? `At least ${MIN_SPEC_LENGTH} characters · ` : ''}
              {specLength.toLocaleString()} / {MAX_SPEC_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={!valid || submit.isPending}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to the Director
          </Button>
        </div>
      </form>
    </Panel>
  );
}

// ── Requests ──

function BuildRow({ build }: { build: HqBuild }) {
  const [open, setOpen] = useState(false);
  const { job } = build;

  return (
    <li className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50"
      >
        <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition', open && 'rotate-90')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">#{build.number}</span>
            <span className="text-sm font-semibold text-slate-900">{build.title}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
              {BUILD_KIND_LABELS[build.kind] ?? build.kind}
            </Badge>
            {build.repos.map((repo) => (
              <Badge key={repo} variant="outline" className="border-slate-200 bg-slate-50 text-slate-500">
                {BUILD_REPO_LABELS[repo] ?? repo}
              </Badge>
            ))}
            <Badge variant="outline" className={STATUS_STYLES[build.status]}>
              {BUILD_STATUS_LABELS[build.status] ?? build.status}
            </Badge>
            {job && (
              <Badge variant="outline" className={STAGE_STYLES[job.stage]} title="Build stage">
                {BUILD_STAGE_LABELS[job.stage] ?? job.stage}
              </Badge>
            )}
            <span>{build.requestedBy ?? '—'}</span>
            <span aria-hidden>·</span>
            <time dateTime={build.createdAt} title={formatTbilisi(build.createdAt)}>
              {formatRelative(build.createdAt)}
            </time>
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-slate-100 px-4 py-3">
          <section className="space-y-1.5">
            <FieldLabel>Request</FieldLabel>
            <Markdown>{build.spec}</Markdown>
          </section>

          {(build.directorNote || build.directorSpec) && (
            <section className="space-y-2">
              {build.directorNote && (
                <div className="space-y-1">
                  <FieldLabel>Director’s note</FieldLabel>
                  <p className="whitespace-pre-wrap break-words rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900">{build.directorNote}</p>
                </div>
              )}
              {build.directorSpec && (
                <div className="space-y-1.5">
                  <FieldLabel>Director’s version</FieldLabel>
                  <div className="rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2">
                    <Markdown>{build.directorSpec}</Markdown>
                  </div>
                </div>
              )}
              {build.decidedAt && (
                <p className="text-xs text-slate-400">
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
      <FieldLabel>Build #{job.number}</FieldLabel>
      <ProgressLine stage={job.stage} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
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

/** queued → building → reviewing → testing → rating → ready; a failed or cancelled job ends the line with its outcome. */
function ProgressLine({ stage }: { stage: HqBuildStage }) {
  const outcome = stage === 'failed' || stage === 'cancelled' ? stage : null;
  return (
    <ol aria-label="Build progress" className="flex flex-wrap items-center gap-y-1 text-xs">
      {buildProgress(stage).map((step, i) => (
        <li key={step.stage} aria-current={step.state === 'current' ? 'step' : undefined} className="flex items-center">
          {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-slate-300" aria-hidden />}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
              step.state === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              step.state === 'current' && 'border-blue-200 bg-blue-50 text-blue-700',
              step.state === 'todo' && 'border-slate-200 bg-white text-slate-400'
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
          <Badge variant="outline" className={STAGE_STYLES[outcome]}>
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
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
      <Button type="submit" size="sm" disabled={!note.trim() || cancel.isPending}>
        {cancel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="text-slate-500" onClick={() => setOpen(false)} disabled={cancel.isPending}>
        Keep it
      </Button>
    </form>
  );
}
