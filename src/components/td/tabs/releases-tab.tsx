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
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import type { Publication, ReleaseDetail, ReleaseList, ReleaseReport } from '@/lib/td/contract';
import { formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

/* ── the unresolved publish or roll back, kept across reloads ───────── */

interface PendingRequest {
  kind: 'publish' | 'rollback';
  idemKey: string;
  releaseId: string | null;
  publicationId: string | null;
}

const pendingKey = (staffId: string) => `td_pending_publication:${staffId}`;

function readPending(staffId: string): PendingRequest | null {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(staffId)) ?? 'null') as PendingRequest | null;
  } catch {
    return null;
  }
}

function writePending(staffId: string, value: PendingRequest | null) {
  try {
    if (value) localStorage.setItem(pendingKey(staffId), JSON.stringify(value));
    else localStorage.removeItem(pendingKey(staffId));
  } catch {
    // Without storage a lost answer is recovered from the release list's active publication instead.
  }
}

const running = (p: Publication | undefined) => p?.status === 'running' || p?.status === 'failing';
const settled = (p: Publication) => !running(p) && p.notify.state !== 'pending';

const TAB_OF: Partial<Record<TdContentType, string>> = {
  'card-categories': 'round-1',
  cards: 'round-1',
  'whoami-subjects': 'round-2',
  'box-categories': 'round-3',
  'box-questions': 'round-3',
  'penalty-questions': 'penalties',
  'practice-questions': 'practice',
  media: 'media',
  clubs: 'clubs',
  'football-logic': 'dailies',
  'put-in-order': 'dailies',
  'career-path': 'dailies',
  'daily-schedule': 'dailies',
  'daily-settings': 'dailies',
};

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
  const [confirm, setConfirm] = useState<{ kind: 'publish' } | { kind: 'rollback'; releaseId: string } | null>(null);
  const [requestError, setRequestError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);
  const recovered = useRef(false);

  const send = async (request: PendingRequest) => {
    if (!user) return;
    setSending(true);
    setRequestError(null);
    // Kept before it goes out: an answer lost to a reload is asked for again with the same key.
    writePending(user.id, request);
    try {
      const publication = await write(
        (operation) => (request.kind === 'publish' ? tdAdmin.releases.publish(request.idemKey, operation) : tdAdmin.releases.rollback(request.releaseId!, request.idemKey, operation)),
        [tdKeys.releases],
      );
      writePending(user.id, { ...request, publicationId: publication.id });
      queryClient.setQueryData([...tdKeys.releases, 'publication', publication.id], publication);
      setWatching(publication.id);
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'publication_in_progress') {
        const busy = (caught.details as { publicationId?: string } | undefined)?.publicationId;
        if (busy) setWatching(busy);
      }
      // A refusal is an answer: this request is over, a new attempt takes a new key.
      if (caught instanceof TdApiError && caught.status > 0) writePending(user.id, null);
      setRequestError(caught);
    } finally {
      setSending(false);
    }
  };

  // A request whose answer never arrived (closed tab, reload) is sent again, as the same request.
  useEffect(() => {
    if (!user || recovered.current) return;
    recovered.current = true;
    const pending = readPending(user.id);
    if (pending) void send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, for the signed-in member
  }, [user]);

  const active = list.data?.active ?? null;
  const shownId = watching ?? active?.id ?? null;

  const onSettled = (publication: Publication) => {
    if (!user) return;
    const pending = readPending(user.id);
    if (pending?.publicationId === publication.id) writePending(user.id, null);
    void queryClient.invalidateQueries({ queryKey: tdKeys.releases });
  };

  return (
    <>
      <TdSection
        title="Next release"
        description="What publishing the approved content now would give. Errors stop a publish; warnings do not."
        actions={
          <>
            <Button variant="secondary" className="rounded-lg" disabled={report.isFetching} onClick={() => void report.refetch()}>
              {report.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Check again
            </Button>
            {publisher && (
              <Button
                className="rounded-lg"
                disabled={!report.data?.ok || report.data.unchanged || running(active ?? undefined) || sending}
                title={report.data?.unchanged ? 'The approved content is the current release' : undefined}
                onClick={() => setConfirm({ kind: 'publish' })}
              >
                <Rocket />
                Publish
              </Button>
            )}
          </>
        }
      >
        <div className="p-5">
          <TdErrorPanel error={report.error ?? requestError} />
          {report.isLoading && <p className="text-sm text-(--td-text-3)">Checking the approved content…</p>}
          {report.data && <ReleaseReportView report={report.data} />}
          {!publisher && <p className="mt-4 text-xs text-(--td-text-3)">Publishing and rolling back are for publishers.</p>}
        </div>
      </TdSection>

      {shownId && <PublicationProgress id={shownId} onSettled={onSettled} />}

      <ReleaseHistory canRollback={publisher && !running(active ?? undefined) && !sending} onRollback={(releaseId) => setConfirm({ kind: 'rollback', releaseId })} />

      {confirm && (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <DialogContent className="bg-(--td-surface-2)">
            <DialogHeader>
              <DialogTitle>{confirm.kind === 'publish' ? 'Publish the approved content?' : `Roll back to ${confirm.releaseId}?`}</DialogTitle>
              <DialogDescription>
                {confirm.kind === 'publish'
                  ? 'New matches, dailies and practice runs use it once it is current. Matches already under way keep the release they started with.'
                  : 'The current release pointer moves back to this release. New matches use it; matches under way keep theirs.'}
              </DialogDescription>
            </DialogHeader>
            {confirm.kind === 'publish' && report.data && <ChangeSummary report={report.data} />}
            <DialogFooter>
              <Button variant="secondary" className="rounded-lg" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button
                className="rounded-lg"
                onClick={() => {
                  const request: PendingRequest =
                    confirm.kind === 'publish'
                      ? { kind: 'publish', idemKey: `publish:${crypto.randomUUID()}`, releaseId: null, publicationId: null }
                      : { kind: 'rollback', idemKey: `rollback:${crypto.randomUUID()}`, releaseId: confirm.releaseId, publicationId: null };
                  setConfirm(null);
                  void send(request).then(() => toast.message(confirm.kind === 'publish' ? 'Publishing…' : 'Rolling back…'));
                }}
              >
                {confirm.kind === 'publish' ? <Rocket /> : <Undo2 />}
                {confirm.kind === 'publish' ? 'Publish' : 'Roll back'}
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
        <span className="text-sm font-normal text-(--td-text-3)"> / {needed} needed</span>
      </p>
      {detail && <p className="text-xs text-(--td-text-3)">{detail}</p>}
    </div>
  );
}

const GAME_LABELS = { footballLogic: 'Football Logic', putInOrder: 'Put in Order', careerPath: 'Career Path' } as const;

function IssueList({ issues, tone }: { issues: ReleaseReport['errors']; tone: 'error' | 'warning' }) {
  return (
    <ul className={cn('flex flex-col gap-1 rounded-lg px-3 py-2 text-sm', tone === 'error' ? 'bg-(--td-danger)/10 text-(--td-danger)' : 'bg-amber-400/10 text-amber-200')}>
      {issues.map((issue, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs opacity-80">{issue.code}</span>
          <span>{issue.message}</span>
          {issue.ref && TAB_OF[issue.ref.type as TdContentType] && (
            <Link href={`/td/${TAB_OF[issue.ref.type as TdContentType]}?q=${encodeURIComponent(issue.ref.key)}`} className="font-mono text-xs underline">
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
        {report.ok ? (report.unchanged ? 'Valid, and already the current release: nothing to publish.' : 'Valid: it can be published.') : `${report.errors.length} error${report.errors.length === 1 ? '' : 's'} stop a publish.`}
        <span className="font-normal text-(--td-text-3)">Checked {formatGeorgiaTime(report.checkedAt)}</span>
      </p>
      {report.errors.length > 0 && <IssueList issues={report.errors} tone="error" />}
      {report.warnings.length > 0 && <IssueList issues={report.warnings} tone="warning" />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Meter label="Card decks" ready={pools.cardDecks.ready} needed={pools.cardDecks.needed} detail={`categories with ${pools.cardDecks.deckSize}+ cards`} />
        <Meter label="Round II subjects" ready={pools.whoAmI.ready} needed={pools.whoAmI.needed} detail={`with ${pools.whoAmI.clues}+ clues`} />
        <Meter label="Box categories" ready={pools.box.ready} needed={pools.box.needed} detail={`with ${pools.box.questions}+ questions`} />
        <Meter label="Penalty questions" ready={pools.penalties.ready} needed={pools.penalties.needed} />
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-(--td-text-3)">Practice</p>
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <p key={d} className={cn('text-sm tabular-nums', pools.practice[d] < pools.practice.needed[d] && 'text-(--td-danger)')}>
              <span className="capitalize">{d}</span> {pools.practice[d]} <span className="text-(--td-text-3)">/ {pools.practice.needed[d]}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(GAME_LABELS) as Array<keyof typeof GAME_LABELS>).map((game) => (
          <div key={game} className="rounded-lg border border-border p-3">
            <p className="text-xs text-(--td-text-3)">{GAME_LABELS[game]}: next {report.days} days from {formatDay(report.from)}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', dailies[game].missing.length && 'text-(--td-danger)')}>
              {dailies[game].covered}
              <span className="text-sm font-normal text-(--td-text-3)"> / {report.days} covered</span>
            </p>
            {dailies[game].missing.length > 0 && <p className="text-xs text-(--td-danger)">Missing: {dailies[game].missing.slice(0, 5).map(formatDay).join(', ')}{dailies[game].missing.length > 5 ? '…' : ''}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-(--td-text-3)">
        Images: {media.images} shown ({media.uploaded} uploaded, {media.external} by URL) · {media.missingRights} missing rights · {media.pending} to make public at publish
      </p>
      <ChangeSummary report={report} />
    </div>
  );
}

function ChangeSummary({ report }: { report: ReleaseReport }) {
  const { changes } = report;
  if (!changes.types.length) return <p className="text-sm text-(--td-text-3)">No changes since the current release.</p>;
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-(--td-divider) px-3 py-2 text-xs font-medium text-(--td-text-3)">
        Changes since the current release{report.currentReleaseId ? ` (${report.currentReleaseId})` : ''}
        {!changes.complete && ' · the current release has no recorded rows, so this is incomplete'}
      </p>
      <ul className="divide-y divide-(--td-divider) text-sm">
        {changes.types.map((c) => (
          <li key={c.type} className="flex items-center justify-between px-3 py-1.5">
            <span className="capitalize">{TD_TYPE_CONFIG[c.type as TdContentType]?.plural ?? c.type}</span>
            <span className="text-xs tabular-nums">
              {c.added > 0 && <span className="text-(--td-new)">+{c.added} </span>}
              {c.changed > 0 && <span className="text-amber-300">~{c.changed} </span>}
              {c.removed > 0 && <span className="text-(--td-danger)">−{c.removed}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PHASE_LABELS: Record<string, string> = {
  snapshot: 'Snapshot of the approved content',
  validate: 'Validation',
  media: 'Images made public',
  artifact: 'Release file written',
  available: 'Release stored',
  pointer: 'Made current',
};

const PUBLICATION_ERRORS: Record<string, string> = {
  validation_failed: 'The approved content did not validate at the snapshot. Fix the errors and publish again.',
  actor_revoked: 'The member who asked was disabled or lost the role before it finished.',
  pointer_moved: 'The current release moved meanwhile (another tool). The release is stored; a roll back can make it current.',
  release_unavailable: 'The release could not be read back.',
  image_missing: 'An uploaded image’s file is missing.',
  storage_failed: 'Storage kept failing.',
  artifact_conflict: 'A different release file already had this name.',
  gave_up: 'It kept failing and was given up; what it made was removed.',
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
  const title = data.kind === 'publish' ? 'Publish' : `Roll back to ${data.releaseId}`;
  return (
    <TdSection title={title} description={`Asked by ${data.requestedBy.name} at ${formatGeorgiaTime(data.requestedAt)}.`}>
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
            {data.changed === false ? `${data.releaseId} was current already.` : `${data.releaseId} is current now.`}
            <span className="text-(--td-text-3)">
              {data.notify.state === 'sent' ? 'Game servers notified.' : data.notify.state === 'pending' ? 'Notifying game servers…' : data.notify.state === 'gave_up' ? 'Game servers pick it up within 30 seconds.' : ''}
            </span>
          </p>
        )}
        {(data.status === 'failed' || data.status === 'failing') && data.error && (
          <div className="rounded-lg bg-(--td-danger)/10 px-3 py-2 text-sm text-(--td-danger)">
            <p className="font-medium">{data.status === 'failing' ? 'Failing: removing what it made…' : 'Failed.'} {PUBLICATION_ERRORS[data.error.code] ?? data.error.message}</p>
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
    <TdSection title="History" description="Every stored release; any that was current before can be made current again.">
      <TdErrorPanel error={releases.error} className="m-5" />
      {first && (
        <p className="border-b border-(--td-divider) px-5 py-3 text-sm">
          Current: <span className="font-mono">{first.pointer.releaseId ?? 'none'}</span>
          {first.pointer.movedAt && (
            <span className="text-(--td-text-3)">
              {' '}
              since {formatGeorgiaTime(first.pointer.movedAt)}
              {first.pointer.movedBy && ` (${first.pointer.movedBy.name})`}
            </span>
          )}
        </p>
      )}
      {releases.isSuccess && items.length === 0 && <TdEmptyState icon={History} title="No releases yet" />}
      <ul className="divide-y divide-(--td-divider)">
        {items.map((release) => (
          <li key={release.id} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOpen(open === release.id ? null : release.id)} aria-expanded={open === release.id}>
                <ChevronDown className={cn('size-4 text-(--td-text-3) transition-transform', open === release.id && 'rotate-180')} />
                <span className="font-mono text-sm">{release.id}</span>
              </button>
              {release.current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Current</span>}
              {release.status === 'retired' && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Retired</span>}
              <span className="text-xs text-(--td-text-3)">
                {formatGeorgiaTime(release.createdAt)} · {release.createdBy.name} · {release.members} rows
              </span>
              <span className="flex-1" />
              {canRollback && release.wasCurrent && !release.current && release.status === 'available' && (
                <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => onRollback(release.id)}>
                  <Undo2 />
                  Roll back to this
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
            Load more
          </Button>
        </div>
      )}
      {first && first.history.length > 0 && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <p className="mb-2 text-xs font-medium text-(--td-text-3)">Pointer moves</p>
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
  if (detail.isLoading) return <p className="mt-2 text-xs text-(--td-text-3)">Loading…</p>;
  if (!detail.data) return <TdErrorPanel error={detail.error} className="mt-2" />;
  const { manifest, diff }: ReleaseDetail = detail.data;
  const counts: Array<[string, string]> = [
    ['Card categories', `${manifest.cards.categories} · ${manifest.cards.cards} cards`],
    ['Round II subjects', String(manifest.whoAmI.subjects)],
    ['Box categories', `${manifest.box.categories} · ${manifest.box.questions} questions`],
    ['Penalty questions', String(manifest.penalties.questions)],
    ['Practice', `${manifest.practice.easy} easy · ${manifest.practice.medium} medium · ${manifest.practice.hard} hard`],
    ['Clubs · images', `${manifest.clubs} · ${manifest.media}`],
    ...(Object.keys(GAME_LABELS) as Array<keyof typeof GAME_LABELS>).map((game): [string, string] => [
      GAME_LABELS[game],
      `${manifest.dailies[game].sets} sets · ${manifest.dailies[game].scheduledDates} dated · ${manifest.dailies[game].coveredDays}/30 days`,
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
              Against <span className="font-mono">{diff.against}</span>
              {!diff.complete && (
                <span className="text-amber-300">
                  {' '}
                  <AlertTriangle className="inline size-3" /> incomplete: one of them has no recorded rows
                </span>
              )}
            </p>
            {diff.types.length === 0 && <p className="text-(--td-text-3)">No differences.</p>}
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {diff.types.map((t) => (
                <li key={t.type}>
                  <p className="font-medium capitalize">{TD_TYPE_CONFIG[t.type as TdContentType]?.plural ?? t.type}</p>
                  {t.added.map((m) => (
                    <p key={m.id} className="text-(--td-new)">+ {m.label}</p>
                  ))}
                  {t.changed.map((m) => (
                    <p key={m.id} className="text-amber-300">
                      ~ {m.label} (v{m.from} → v{m.to})
                    </p>
                  ))}
                  {t.removed.map((m) => (
                    <p key={m.id} className="text-(--td-danger)">− {m.label}</p>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-(--td-text-3)">No earlier release to compare with.</p>
        )}
      </div>
    </div>
  );
}
