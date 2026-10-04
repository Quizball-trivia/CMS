'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, CircleDashed, CircleX, History, Loader2, RefreshCw, Rocket, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TD_TYPE_CONFIG } from '@/components/td/content/content-types';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentType } from '@/lib/td/admin-api';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { Publication, ReleaseDetail, ReleaseList, ReleaseReport } from '@/lib/td/contract';
import { formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { t, tn, tr } from '@/lib/td/i18n';
import { beginOperation, operationIsCurrent, type TdOperation } from '@/lib/td/operation';
import { browserPendingPublications, type HeldRequest, type PendingPublications, type PendingRequest } from '@/lib/td/pending-publications';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { questionsHref } from '@/lib/td/question-modes';

/**
 * Whether the API refused this very request (so nothing started and a new attempt takes a new key).
 * A network error, a 5xx, an ended session (401), a lost role (403), a rate limit or a cancelled sign-in say nothing
 * about a request an earlier try may have started: its key is kept and asked again.
 */
export function refusedOutright(error: unknown): boolean {
  if (!(error instanceof TdApiError)) return false;
  if (error.code === 'conflict_retry') return false;
  // 403: the role may have gone after an earlier try went through, so it says nothing about that try either.
  return [400, 404, 409, 422].includes(error.status);
}

const running = (p: Publication | undefined) => p?.status === 'running' || p?.status === 'failing';
const settled = (p: Publication) => !running(p) && p.notify.state !== 'pending';

/** What a request that got no answer says about itself. */
function unansweredText(request: HeldRequest): string {
  if (request.kind === 'publish') {
    return request.adopted ? t('Your publish (sent from a tab since closed) got no answer, so it may have started.') : t('Your publish got no answer, so it may have started.');
  }
  const release = String(request.releaseId);
  return request.adopted
    ? t('Your roll back to {release} (sent from a tab since closed) got no answer, so it may have started.', { release })
    : t('Your roll back to {release} got no answer, so it may have started.', { release });
}

/** Where a row named by the release report is edited. */
function editHref(type: TdContentType, key: string): string | null {
  const questions = questionsHref(type, key);
  if (questions) return questions;
  const q = `?q=${encodeURIComponent(key)}`;
  if (type === 'card-categories' || type === 'box-categories') return `/td/categories${q}`;
  if (type === 'media' || type === 'clubs') return `/td/${type}${q}`;
  if (type === 'daily-schedule' || type === 'daily-settings') return `/td/dailies${q}`;
  return null;
}

export function TdReleasesTab() {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const publisher = user ? isTdPublisher(user.role) : false;
  const report = useQuery({
    queryKey: [...tdKeys.releases, 'report'],
    queryFn: () => tdAdmin.releases.validate(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const list = useQuery({ queryKey: [...tdKeys.releases, 'list', 'first'], queryFn: ({ signal }) => tdAdmin.releases.list({ limit: 1 }, { signal }) });
  const [watching, setWatching] = useState<string | null>(null);
  // Requests sent whose answer never came: each is asked again (same key), never replaced by a new one.
  const [unanswered, setUnanswered] = useState<HeldRequest[]>([]);
  const [confirm, setConfirm] = useState<{ kind: 'publish' } | { kind: 'rollback'; releaseId: string } | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const recoveredFor = useRef<string | null>(null);

  const without = (request: PendingRequest) => (list: HeldRequest[]) => list.filter((r) => r.idemKey !== request.idemKey);

  // The sign-in an action begins under, only while it is still this member's: none of their requests may go out as another.
  const begin = (staffId: string) => (tdTokens.read()?.staffId === staffId ? beginOperation(tdTokens) : null);

  const send = async (request: HeldRequest, staffId: string, operation: TdOperation) => {
    setSending(true);
    setRequestError(null);
    let kept: PendingPublications | null = null;
    try {
      kept = await browserPendingPublications(staffId);
      // Kept before it goes out: an answer lost to a reload is asked for again with the same key.
      await kept.keep(request);
      setUnanswered(without(request));
      const publication = await write(
        (op) => (request.kind === 'publish' ? tdAdmin.releases.publish(request.idemKey, op) : tdAdmin.releases.rollback(request.releaseId!, request.idemKey, op)),
        [tdKeys.releases],
        operation,
      );
      await kept.keep({ ...request, publicationId: publication.id });
      queryClient.setQueryData([...tdKeys.releases, 'publication', publication.id], publication);
      setWatching(publication.id);
    } catch (caught) {
      // Signed out or switched meanwhile: the request stays kept for its member, asked again when they are back.
      if (caught instanceof TdApiError && caught.code === SESSION_CHANGED) return;
      if (caught instanceof TdApiError && caught.code === 'publication_in_progress') {
        const busy = (caught.details as { publicationId?: string } | undefined)?.publicationId;
        if (busy) setWatching(busy);
      }
      if (kept && refusedOutright(caught)) await kept.refused(request.idemKey).catch(() => undefined);
      else setUnanswered((list) => [...without(request)(list), request]);
      setRequestError(caught);
    } finally {
      setSending(false);
    }
  };

  /** `sending` runs once the request is sure to go out, before its answer; never for one refused here. */
  const start = async (request: HeldRequest, sending?: () => void) => {
    const operation = user ? begin(user.id) : null;
    if (!user || !operation) {
      setRequestError(new TdApiError(0, SESSION_CHANGED, t('The session changed; the request was cancelled')));
      return;
    }
    sending?.();
    await send(request, user.id, operation);
  };

  // Requests whose answer never arrived (reload, or a tab since closed) are sent again, as the same requests.
  useEffect(() => {
    if (!user || recoveredFor.current === user.id) return;
    recoveredFor.current = user.id;
    const staffId = user.id;
    // Begun before waiting for the kept requests, which may take a while (another tab holds the lock).
    const operation = begin(staffId);
    if (!operation) return;
    void (async () => {
      const requests = await browserPendingPublications(staffId)
        .then((kept) => kept.claim())
        .catch(() => []);
      for (const request of requests) {
        if (!operationIsCurrent(tdTokens, operation)) return;
        await send(request, staffId, operation);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per member, per mount
  }, [user]);

  // Only a request this tab created: one taken over from a closed tab is settled by the API's answer alone.
  const forget = (request: HeldRequest) => {
    setUnanswered(without(request));
    if (user) void browserPendingPublications(user.id).then((kept) => kept.forget(request.idemKey)).catch(() => undefined);
  };

  const active = list.data?.active ?? null;
  const shownId = watching ?? active?.id ?? null;

  const onSettled = (publication: Publication) => {
    if (user) void browserPendingPublications(user.id).then((kept) => kept.resolved(publication.id)).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: tdKeys.releases });
  };

  return (
    <>
      <TdSection
        title={t('Next release')}
        description={t('What publishing the approved content now would give. Errors stop a publish; warnings do not.')}
        actions={
          <>
            <Button variant="secondary" className="rounded-lg" disabled={report.isFetching} onClick={() => void report.refetch()}>
              {report.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t('Check again')}
            </Button>
            {publisher && (
              <Button
                className="rounded-lg"
                disabled={!report.data?.ok || report.data.unchanged || running(active ?? undefined) || sending || unanswered.length > 0}
                title={report.data?.unchanged ? t('The approved content is the current release') : undefined}
                onClick={() => setConfirm({ kind: 'publish' })}
              >
                <Rocket />
                {t('Publish')}
              </Button>
            )}
          </>
        }
      >
        <div className="p-5">
          {unanswered.map((request) => (
            <div key={request.idemKey} className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <span className="min-w-0 flex-1">
                {unansweredText(request)} {t('Ask again: the same request is answered, never run twice.')}
              </span>
              <Button size="sm" className="rounded-lg" disabled={sending} onClick={() => void start(request)}>
                {sending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t('Ask again')}
              </Button>
              {!request.adopted && (
                <Button size="sm" variant="ghost" className="rounded-lg" title={t('Stop asking. It may have run: check the history below before publishing again.')} onClick={() => forget(request)}>
                  {t('Forget it')}
                </Button>
              )}
            </div>
          ))}
          <TdErrorPanel error={report.error ?? requestError} />
          {report.isLoading && <p className="text-sm text-(--td-text-3)">{t('Checking the approved content…')}</p>}
          {report.data && <ReleaseReportView report={report.data} />}
          {!publisher && <p className="mt-4 text-xs text-(--td-text-3)">{t('Publishing and rolling back are for publishers.')}</p>}
        </div>
      </TdSection>

      {shownId && <PublicationProgress id={shownId} onSettled={onSettled} />}

      <ReleaseHistory canRollback={publisher && !running(active ?? undefined) && !sending && unanswered.length === 0} onRollback={(releaseId) => setConfirm({ kind: 'rollback', releaseId })} />

      {confirm && (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <DialogContent className="bg-(--td-surface-2)">
            <DialogHeader>
              <DialogTitle>{confirm.kind === 'publish' ? t('Publish the approved content?') : t('Roll back to {release}?', { release: confirm.releaseId })}</DialogTitle>
              <DialogDescription>
                {confirm.kind === 'publish'
                  ? t('New matches, dailies and practice runs use it once it is current. Matches already under way keep the release they started with.')
                  : t('The current release pointer moves back to this release. New matches use it; matches under way keep theirs.')}
              </DialogDescription>
            </DialogHeader>
            {confirm.kind === 'publish' && report.data && <ChangeSummary report={report.data} />}
            <DialogFooter>
              <Button variant="secondary" className="rounded-lg" onClick={() => setConfirm(null)}>
                {t('Cancel')}
              </Button>
              <Button
                className="rounded-lg"
                onClick={() => {
                  const request: HeldRequest =
                    confirm.kind === 'publish'
                      ? { kind: 'publish', idemKey: `publish:${crypto.randomUUID()}`, releaseId: null, publicationId: null, adopted: false }
                      : { kind: 'rollback', idemKey: `rollback:${crypto.randomUUID()}`, releaseId: confirm.releaseId, publicationId: null, adopted: false };
                  setConfirm(null);
                  void start(request, () => toast.message(confirm.kind === 'publish' ? t('Publishing…') : t('Rolling back…')));
                }}
              >
                {confirm.kind === 'publish' ? <Rocket /> : <Undo2 />}
                {confirm.kind === 'publish' ? t('Publish') : t('Roll back')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function Meter({ label, ready, needed, detail }: { label: string; ready: number; needed: number; detail?: string }) {
  const ok = ready >= needed;
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-(--td-text-3)">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', ok ? 'text-foreground' : 'text-(--td-danger)')}>
        {ready}
        <span className="text-sm font-normal text-(--td-text-3)"> {t('/ {needed} needed', { needed })}</span>
      </p>
      {detail && <p className="text-xs text-(--td-text-3)">{detail}</p>}
    </div>
  );
}

const GAME_LABELS = { footballLogic: t('Football Logic'), putInOrder: t('Put in Order'), careerPath: t('Career Path') };
const DIFFICULTY_LABELS = { easy: t('easy'), medium: t('medium'), hard: t('hard') };

function IssueList({ issues, tone }: { issues: ReleaseReport['errors']; tone: 'error' | 'warning' }) {
  return (
    <ul className={cn('flex flex-col gap-1 rounded-lg px-3 py-2 text-sm', tone === 'error' ? 'bg-(--td-danger)/10 text-(--td-danger)' : 'bg-amber-50 text-amber-700')}>
      {issues.map((issue, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs opacity-80">{issue.code}</span>
          <span>{issue.message}</span>
          {issue.ref && editHref(issue.ref.type as TdContentType, issue.ref.key) && (
            <Link href={editHref(issue.ref.type as TdContentType, issue.ref.key)!} className="font-mono text-xs underline">
              {issue.ref.key}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReleaseReportView({ report }: { report: ReleaseReport }) {
  const { pools, dailies, media } = report;
  return (
    <div className="flex flex-col gap-4">
      <p className={cn('flex items-center gap-2 text-sm font-medium', report.ok ? 'text-(--td-new)' : 'text-(--td-danger)')}>
        {report.ok ? <CheckCircle2 className="size-4" /> : <CircleX className="size-4" />}
        {report.ok
          ? report.unchanged
            ? t('Valid, and already the current release: nothing to publish.')
            : t('Valid: it can be published.')
          : tn(report.errors.length, '{count} error stop a publish.', '{count} errors stop a publish.')}
        <span className="font-normal text-(--td-text-3)">{t('Checked {time}', { time: formatGeorgiaTime(report.checkedAt) })}</span>
      </p>
      {report.errors.length > 0 && <IssueList issues={report.errors} tone="error" />}
      {report.warnings.length > 0 && <IssueList issues={report.warnings} tone="warning" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Meter label={t('Card decks')} ready={pools.cardDecks.ready} needed={pools.cardDecks.needed} detail={t('categories with {n}+ cards', { n: pools.cardDecks.deckSize })} />
        <Meter label={t('Round II subjects')} ready={pools.whoAmI.ready} needed={pools.whoAmI.needed} detail={t('with {n}+ clues', { n: pools.whoAmI.clues })} />
        <Meter label={t('Box categories')} ready={pools.box.ready} needed={pools.box.needed} detail={t('with {n}+ questions', { n: pools.box.questions })} />
        <Meter label={t('Penalty questions')} ready={pools.penalties.ready} needed={pools.penalties.needed} />
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-(--td-text-3)">{t('Practice')}</p>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <p key={d} className={cn('text-sm tabular-nums', pools.practice[d] < pools.practice.needed[d] && 'text-(--td-danger)')}>
              <span className="capitalize">{DIFFICULTY_LABELS[d]}</span> {pools.practice[d]} <span className="text-(--td-text-3)">/ {pools.practice.needed[d]}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(GAME_LABELS) as Array<keyof typeof GAME_LABELS>).map((game) => (
          <div key={game} className="rounded-lg border border-border p-3">
            <p className="text-xs text-(--td-text-3)">{t('{game}: next {days} days from {date}', { game: GAME_LABELS[game], days: report.days, date: formatDay(report.from) })}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', dailies[game].missing.length && 'text-(--td-danger)')}>
              {dailies[game].covered}
              <span className="text-sm font-normal text-(--td-text-3)"> {t('/ {days} covered', { days: report.days })}</span>
            </p>
            {dailies[game].missing.length > 0 && <p className="text-xs text-(--td-danger)">{t('Missing: {days}', { days: `${dailies[game].missing.slice(0, 5).map(formatDay).join(', ')}${dailies[game].missing.length > 5 ? '…' : ''}` })}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-(--td-text-3)">
        {t('Images: {images} shown ({uploaded} uploaded, {external} by URL) · {missingRights} missing rights · {pending} to make public at publish', {
          images: media.images,
          uploaded: media.uploaded,
          external: media.external,
          missingRights: media.missingRights,
          pending: media.pending,
        })}
      </p>
      <ChangeSummary report={report} />
    </div>
  );
}

function ChangeSummary({ report }: { report: ReleaseReport }) {
  const { changes } = report;
  if (!changes.types.length) return <p className="text-sm text-(--td-text-3)">{t('No changes since the current release.')}</p>;
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-(--td-divider) px-3 py-2 text-xs font-medium text-(--td-text-3)">
        {report.currentReleaseId ? t('Changes since the current release ({release})', { release: report.currentReleaseId }) : t('Changes since the current release')}
        {!changes.complete && ` · ${t('the current release has no recorded rows, so this is incomplete')}`}
      </p>
      <ul className="divide-y divide-(--td-divider) text-sm">
        {changes.types.map((c) => (
          <li key={c.type} className="flex items-center justify-between px-3 py-1.5">
            <span className="capitalize">{TD_TYPE_CONFIG[c.type as TdContentType]?.plural ?? c.type}</span>
            <span className="text-xs tabular-nums">
              {c.added > 0 && <span className="text-(--td-new)">+{c.added} </span>}
              {c.changed > 0 && <span className="text-amber-800">~{c.changed} </span>}
              {c.removed > 0 && <span className="text-(--td-danger)">−{c.removed}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  snapshot: t('Snapshot of the approved content'),
  validate: t('Validation'),
  media: t('Images made public'),
  artifact: t('Release file written'),
  available: t('Release stored'),
  pointer: t('Made current'),
};

const PUBLICATION_ERRORS: Record<string, string> = {
  validation_failed: t('The approved content did not validate at the snapshot. Fix the errors and publish again.'),
  actor_revoked: t('The member who asked was disabled or lost the role before it finished.'),
  pointer_moved: t('The current release moved meanwhile (another tool). The release is stored; a roll back can make it current.'),
  release_unavailable: t('The release could not be read back.'),
  image_missing: t('An uploaded image’s file is missing.'),
  storage_failed: t('Storage kept failing.'),
  artifact_conflict: t('A different release file already had this name.'),
  gave_up: t('It kept failing and was given up; what it made was removed.'),
};

function PublicationProgress({ id, onSettled }: { id: string; onSettled: (publication: Publication) => void }) {
  const publication = useQuery({
    queryKey: [...tdKeys.releases, 'publication', id],
    queryFn: ({ signal }) => tdAdmin.releases.publication(id, { signal }),
    refetchInterval: (query) => (query.state.data && settled(query.state.data) ? false : 1000),
  });
  const data = publication.data;
  const notified = useRef<string | null>(null);
  useEffect(() => {
    if (data && settled(data) && notified.current !== data.id) {
      notified.current = data.id;
      onSettled(data);
    }
  }, [data, onSettled]);
  if (!data) return publication.error ? <TdErrorPanel error={publication.error} /> : null;
  const title = data.kind === 'publish' ? t('Publish') : t('Roll back to {release}', { release: String(data.releaseId) });
  return (
    <TdSection title={title} description={t('Asked by {name} at {time}.', { name: data.requestedBy.name, time: formatGeorgiaTime(data.requestedAt) })}>
      <div className="flex flex-col gap-4 p-5">
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {data.phases.map((phase) => (
            <li key={phase.name} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs', phase.state === 'failed' ? 'border-(--td-danger)/50 text-(--td-danger)' : 'border-border')}>
              {phase.state === 'done' ? (
                <CheckCircle2 className="size-4 shrink-0 text-(--td-new)" />
              ) : phase.state === 'failed' ? (
                <CircleX className="size-4 shrink-0" />
              ) : phase.state === 'skipped' ? (
                <CircleDashed className="size-4 shrink-0 text-(--td-text-3)" />
              ) : running(data) ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-(--td-text-3)" />
              )}
              <span className={cn(phase.state === 'skipped' && 'text-(--td-text-3)')}>{PHASE_LABELS[phase.name] ?? phase.name}</span>
            </li>
          ))}
        </ol>
        {data.status === 'published' && (
          <p className="flex items-center gap-2 text-sm text-(--td-new)">
            <CheckCircle2 className="size-4" />
            {data.changed === false ? t('{release} was current already.', { release: String(data.releaseId) }) : t('{release} is current now.', { release: String(data.releaseId) })}
            <span className="text-(--td-text-3)">
              {data.notify.state === 'sent' ? t('Game servers notified.') : data.notify.state === 'pending' ? t('Notifying game servers…') : data.notify.state === 'gave_up' ? t('Game servers pick it up within 30 seconds.') : ''}
            </span>
          </p>
        )}
        {(data.status === 'failed' || data.status === 'failing') && data.error && (
          <div className="rounded-lg bg-(--td-danger)/10 px-3 py-2 text-sm text-(--td-danger)">
            <p className="font-medium">{data.status === 'failing' ? t('Failing: removing what it made…') : t('Failed.')} {PUBLICATION_ERRORS[data.error.code] ?? data.error.message}</p>
            <p className="font-mono text-xs opacity-80">{data.error.code}</p>
          </div>
        )}
        {data.status === 'failed' && data.report && !data.report.ok && <IssueList issues={data.report.errors} tone="error" />}
      </div>
    </TdSection>
  );
}

function ReleaseHistory({ canRollback, onRollback }: { canRollback: boolean; onRollback: (releaseId: string) => void }) {
  const releases = useInfiniteQuery({
    queryKey: [...tdKeys.releases, 'history'],
    queryFn: ({ pageParam, signal }) => tdAdmin.releases.list({ cursor: pageParam, limit: 20 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ReleaseList) => last.nextCursor ?? undefined,
  });
  const [open, setOpen] = useState<string | null>(null);
  const first = releases.data?.pages[0];
  const items = releases.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <TdSection title={t('History')} description={t('Every stored release; any that was current before can be made current again.')}>
      <TdErrorPanel error={releases.error} className="m-5" />
      {first && (
        <p className="border-b border-(--td-divider) px-5 py-3 text-sm">
          {tr('Current: {release}', {
            release: (
              <span key="release" className="font-mono">
                {first.pointer.releaseId ?? t('none')}
              </span>
            ),
          })}
          {first.pointer.movedAt && (
            <span className="text-(--td-text-3)">
              {' '}
              {first.pointer.movedBy
                ? t('since {time} ({name})', { time: formatGeorgiaTime(first.pointer.movedAt), name: first.pointer.movedBy.name })
                : t('since {time}', { time: formatGeorgiaTime(first.pointer.movedAt) })}
            </span>
          )}
        </p>
      )}
      {releases.isSuccess && items.length === 0 && <TdEmptyState icon={History} title={t('No releases yet')} />}
      <ul className="divide-y divide-(--td-divider)">
        {items.map((release) => (
          <li key={release.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen(open === release.id ? null : release.id)} aria-expanded={open === release.id}>
                <ChevronDown className={cn('size-4 text-(--td-text-3) transition-transform', open === release.id && 'rotate-180')} />
                <span className="font-mono text-sm">{release.id}</span>
              </button>
              {release.current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">{t('Current')}</span>}
              {release.status === 'retired' && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{t('Retired')}</span>}
              <span className="text-xs text-(--td-text-3)">
                {t('{time} · {name} · {n} rows', { time: formatGeorgiaTime(release.createdAt), name: release.createdBy.name, n: release.members })}
              </span>
              <span className="flex-1" />
              {canRollback && release.wasCurrent && !release.current && release.status === 'available' && (
                <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => onRollback(release.id)}>
                  <Undo2 />
                  {t('Roll back to this')}
                </Button>
              )}
            </div>
            {open === release.id && <ReleaseDetailView id={release.id} />}
          </li>
        ))}
      </ul>
      {releases.hasNextPage && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={releases.isFetchingNextPage} onClick={() => void releases.fetchNextPage()}>
            {t('Load more')}
          </Button>
        </div>
      )}
      {first && first.history.length > 0 && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <p className="mb-2 text-xs font-medium text-(--td-text-3)">{t('Pointer moves')}</p>
          <ol className="flex flex-col gap-1 text-xs">
            {first.history.map((move) => (
              <li key={move.version} className="flex flex-wrap gap-x-3">
                <span className="tabular-nums text-(--td-text-3)">v{move.version}</span>
                <span className="font-mono">
                  {move.previousReleaseId ?? '—'} → {move.releaseId}
                </span>
                <span className="text-(--td-text-3)">
                  {formatGeorgiaTime(move.movedAt)} · {move.movedBy.name}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </TdSection>
  );
}

function ReleaseDetailView({ id }: { id: string }) {
  const detail = useQuery({ queryKey: [...tdKeys.releases, 'detail', id], queryFn: ({ signal }) => tdAdmin.releases.get(id, { signal }), staleTime: 5 * 60_000 });
  if (detail.isLoading) return <p className="mt-2 text-xs text-(--td-text-3)">{t('Loading…')}</p>;
  if (!detail.data) return <TdErrorPanel error={detail.error} className="mt-2" />;
  const { manifest, diff }: ReleaseDetail = detail.data;
  const counts: Array<[string, string]> = [
    [t('Card categories'), t('{categories} · {cards} cards', { categories: manifest.cards.categories, cards: manifest.cards.cards })],
    [t('Round II subjects'), String(manifest.whoAmI.subjects)],
    [t('Box categories'), t('{categories} · {questions} questions', { categories: manifest.box.categories, questions: manifest.box.questions })],
    [t('Penalty questions'), String(manifest.penalties.questions)],
    [t('Practice'), t('{easy} easy · {medium} medium · {hard} hard', { easy: manifest.practice.easy, medium: manifest.practice.medium, hard: manifest.practice.hard })],
    [t('Clubs · images'), `${manifest.clubs} · ${manifest.media}`],
    ...(Object.keys(GAME_LABELS) as Array<keyof typeof GAME_LABELS>).map((game): [string, string] => [
      GAME_LABELS[game],
      t('{sets} sets · {dated} dated · {covered}/30 days', { sets: manifest.dailies[game].sets, dated: manifest.dailies[game].scheduledDates, covered: manifest.dailies[game].coveredDays }),
    ]),
  ];
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border p-3 text-xs">
        {counts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-(--td-text-3)">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-lg border border-border p-3 text-xs">
        {diff ? (
          <>
            <p className="mb-2 text-(--td-text-3)">
              {tr('Against {release}', {
                release: (
                  <span key="release" className="font-mono">
                    {diff.against}
                  </span>
                ),
              })}
              {!diff.complete && (
                <span className="text-amber-800">
                  {' '}
                  <AlertTriangle className="inline size-3" /> {t('incomplete: one of them has no recorded rows')}
                </span>
              )}
            </p>
            {diff.types.length === 0 && <p className="text-(--td-text-3)">{t('No differences.')}</p>}
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {diff.types.map((group) => (
                <li key={group.type}>
                  <p className="font-medium capitalize">{TD_TYPE_CONFIG[group.type as TdContentType]?.plural ?? group.type}</p>
                  {group.added.map((m) => (
                    <p key={m.id} className="text-(--td-new)">+ {m.label}</p>
                  ))}
                  {group.changed.map((m) => (
                    <p key={m.id} className="text-amber-800">
                      ~ {m.label} (v{m.from} → v{m.to})
                    </p>
                  ))}
                  {group.removed.map((m) => (
                    <p key={m.id} className="text-(--td-danger)">− {m.label}</p>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-(--td-text-3)">{t('No earlier release to compare with.')}</p>
        )}
      </div>
    </div>
  );
}
