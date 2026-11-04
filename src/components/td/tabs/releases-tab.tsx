'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Circle, CircleDashed, CircleX, History, Loader2, RefreshCw, Rocket, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TdDialogContent } from '@/components/td/td-dialog';
import { TD_TYPE_CONFIG } from '@/components/td/content/content-types';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import type { TdContentType } from '@/lib/td/admin-api';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { Publication, ReleaseDetail, ReleaseList, ReleaseReport } from '@/lib/td/contract';
import { tdActorName } from '@/lib/td/actors';
import { dailyEntries, TD_DAILY_GAME_LABELS } from '@/lib/td/dailies';
import { formatDate, formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { t, TD_LANG, tn, tr } from '@/lib/td/i18n';
import { beginOperation, operationIsCurrent, type TdOperation } from '@/lib/td/operation';
import { browserPendingPublications, type HeldRequest, type PendingPublications, type PendingRequest } from '@/lib/td/pending-publications';
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
  return null;
}

/** `autoPublish`: opened right after Publish on questions; the release starts on its own once the check passes. */
export function TdReleasesTab({ autoPublish = false }: { autoPublish?: boolean } = {}) {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const publisher = Boolean(user);
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
  const [recovered, setRecovered] = useState(false);
  // Why a publish asked for on opening (autoPublish) did not go out.
  const [autoHeld, setAutoHeld] = useState<'invalid' | 'unchanged' | 'busy' | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const autoDone = useRef(false);
  const unansweredNow = useRef(unanswered);
  useEffect(() => {
    unansweredNow.current = unanswered;
  }, [unanswered]);

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
    if (!operation) return setRecovered(true);
    void (async () => {
      const requests = await browserPendingPublications(staffId)
        .then((kept) => kept.claim())
        .catch(() => []);
      for (const request of requests) {
        if (!operationIsCurrent(tdTokens, operation)) break;
        await send(request, staffId, operation);
      }
      setRecovered(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per member, per mount
  }, [user]);

  // Only a request this tab created: one taken over from a closed tab is settled by the API's answer alone.
  const forget = (request: HeldRequest) => {
    setUnanswered(without(request));
    if (user) void browserPendingPublications(user.id).then((kept) => kept.forget(request.idemKey)).catch(() => undefined);
  };

  const active = list.data?.active ?? null;
  // A running publication comes first; a finished one this tab watched stays in view until another starts.
  const shownId = active?.id ?? watching ?? null;

  // Once, after this member's kept requests were asked again: the check and the slot are read now (never from the
  // cache, nor joined to a read begun before the approvals), and the publish goes out only if both allow it.
  useEffect(() => {
    if (!autoPublish || autoDone.current || !publisher || !recovered || sending) return;
    autoDone.current = true;
    setConfirm(null);
    setAutoBusy(true);
    void (async () => {
      try {
        const [checked, listed] = await Promise.all([tdAdmin.releases.validate(), tdAdmin.releases.list({ limit: 1 })]);
        queryClient.setQueryData([...tdKeys.releases, 'report'], checked);
        queryClient.setQueryData([...tdKeys.releases, 'list', 'first'], listed);
        const held = !checked.ok ? 'invalid' : checked.unchanged ? 'unchanged' : running(listed.active ?? undefined) || unansweredNow.current.length > 0 ? 'busy' : null;
        if (held) return setAutoHeld(held);
        await start({ kind: 'publish', idemKey: `publish:${crypto.randomUUID()}`, releaseId: null, publicationId: null, adopted: false }, () => toast.message(t('Publishing…')));
      } catch (caught) {
        setRequestError(caught);
      } finally {
        setAutoBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start reads the current state; this runs once
  }, [autoPublish, publisher, recovered, sending]);

  // Published, but the game is still short of content elsewhere (a new game filling up): said plainly, the full check behind Details.
  if (autoPublish && autoHeld === 'invalid' && report.data && missingContentOnly(report.data)) return <WaitingForContent report={report.data} />;

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
                disabled={!report.data?.ok || report.data.unchanged || running(active ?? undefined) || sending || unanswered.length > 0 || !recovered || autoBusy}
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
          {publisher && unanswered.map((request) => (
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
          {autoHeld && (
            <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              {autoHeld === 'invalid'
                ? t('Your questions are approved, but the game was not updated: fix what is listed below, then press Publish.')
                : autoHeld === 'unchanged'
                  ? t('Nothing new for players: the game already has this content.')
                  : t('Another publish is running or waiting for an answer; press Publish when it is done.')}
            </p>
          )}
          <TdErrorPanel error={report.error ?? requestError} />
          {report.isLoading && <p className="text-sm text-(--td-text-3)">{t('Checking the approved content…')}</p>}
          {report.data && <ReleaseReportView report={report.data} />}
        </div>
      </TdSection>

      {shownId && (
        <PublicationProgress
          id={shownId}
          onSettled={onSettled}
          onMoved={(publication) => {
            // Kept in view until it settles (the list read next no longer names it as active), and lists showing what players have read again.
            setWatching(publication.id);
            void queryClient.invalidateQueries({ queryKey: [...tdKeys.releases, 'list'] });
          }}
        />
      )}

      <ReleaseHistory canRollback={publisher && !running(active ?? undefined) && !sending && unanswered.length === 0 && recovered && !autoBusy} onRollback={(releaseId) => setConfirm({ kind: 'rollback', releaseId })} />

      {confirm && (
        <Dialog open onOpenChange={(open) => !open && setConfirm(null)}>
          <TdDialogContent className="bg-(--td-surface-2)">
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
          </TdDialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Errors that only say the game has too little published content yet: rounds short of a match, dailies short of days
 *  (the dailies ship with the game's code since contract 12, so in practice only rounds). */
const MISSING_CONTENT = new Set(['pool', 'dailies']);
const missingContentOnly = (report: ReleaseReport) => !report.ok && report.errors.every((error) => MISSING_CONTENT.has(error.code));

/** After a Publish while the game still lacks content in other modes: what was asked for is published; the game gets it once every mode has its minimum. */
function WaitingForContent({ report }: { report: ReleaseReport }) {
  const [details, setDetails] = useState(false);
  const { pools } = report;
  const short = [
    pools.cardDecks.ready < pools.cardDecks.needed && t('Round I: {needed} categories with {size}+ cards (now {ready})', { needed: pools.cardDecks.needed, size: pools.cardDecks.deckSize, ready: pools.cardDecks.ready }),
    pools.whoAmI.ready < pools.whoAmI.needed && t('Round II: {needed} subjects with {clues}+ clues (now {ready})', { needed: pools.whoAmI.needed, clues: pools.whoAmI.clues, ready: pools.whoAmI.ready }),
    pools.box.ready < pools.box.needed && t('Round III: {needed} categories with {questions}+ questions (now {ready})', { needed: pools.box.needed, questions: pools.box.questions, ready: pools.box.ready }),
    pools.penalties.ready < pools.penalties.needed && t('Penalties: {needed} questions (now {ready})', { needed: pools.penalties.needed, ready: pools.penalties.ready }),
    ...reportDailies(report).map(
      ([game, daily]) => daily.missing.length > 0 && t('{game}: {days} days (now {covered})', { game: TD_DAILY_GAME_LABELS[game], days: report.days, covered: daily.covered }),
    ),
  ].filter((line): line is string => Boolean(line));
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="flex items-center gap-2 text-base font-bold text-emerald-800">
          <CheckCircle2 className="size-5" />
          {t('Published.')}
        </p>
        <p className="mt-1 text-sm text-emerald-900">{t('Players get it once the game has enough published content in every mode. Still missing:')}</p>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-slate-700">
          {short.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Circle className="mt-1 size-3 shrink-0 text-slate-400" />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-emerald-900/80">{t('Publish the rest the same way: with the last of it, the game gets everything at once.')}</p>
      </div>
      <button type="button" className="self-start text-xs font-semibold text-(--td-text-3) underline" onClick={() => setDetails(!details)}>
        {details ? t('Hide details') : t('Details')}
      </button>
      {details && <ReleaseReportView report={report} />}
    </div>
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

/** The daily games a report names (Stat Sniper, or Football Logic in one from before), as the API gives them. */
const reportDailies = (report: ReleaseReport) => dailyEntries<{ covered: number; missing: string[] }>(report.dailies);
const DIFFICULTY_LABELS = { easy: t('easy'), medium: t('medium'), hard: t('hard') };

/** What a group of issues means, in a line, for the codes an editor meets; the API's own lines are listed below it. */
const ISSUE_SUMMARIES: Partial<Record<ReleaseReport['warnings'][number]['code'], (count: number) => string>> = {
  image_external: (count) =>
    tn(count, '{count} picture is shown from a link to another site’s storage, not kept in Table Derby’s own: if that site moves it, it disappears. Upload it again to keep it.', '{count} pictures are shown from links to another site’s storage, not kept in Table Derby’s own: if that site moves them, they disappear. Upload them again to keep them.'),
  dailies: (count) => tn(count, '{count} daily game is missing days.', '{count} daily games are missing days.'),
  pool: (count) => tn(count, '{count} round has too little approved content for a match.', '{count} rounds have too little approved content for a match.'),
  practice: () => t('Practice needs more approved questions of a difficulty.'),
  image_missing: (count) => tn(count, '{count} uploaded picture’s file is missing.', '{count} uploaded pictures’ files are missing.'),
  rights_missing: (count) => tn(count, '{count} picture has no credit, licence or source.', '{count} pictures have no credit, licence or source.'),
  schema: (count) => tn(count, '{count} item does not fit the game’s format.', '{count} items do not fit the game’s format.'),
  storage: () => t('Picture storage is not set up.'),
};
const ISSUES_SHOWN = 3;

const gameName = (game: string) => TD_DAILY_GAME_LABELS[game as keyof typeof TD_DAILY_GAME_LABELS] ?? game;

/** A line of the API's report (English) in the workspace's language; null for a line it has no wording for. */
export function reportLine(message: string): string | null {
  if (TD_LANG === 'en') return message;
  const body = message.replace(/^cannot run a match: /, '');
  let m: RegExpExecArray | null;
  if ((m = /^round I needs a category with at least (\d+) cards$/.exec(body))) return t('Round I needs a category with at least {n} cards.', { n: m[1]! });
  if ((m = /^round II needs (\d+) subjects with (\d+)\+ clues, has (\d+)$/.exec(body)))
    return t('Round II needs {n} subjects with {clues} or more clues; it has {has}.', { n: m[1]!, clues: m[2]!, has: m[3]! });
  if ((m = /^round III needs (\d+) categories with (\d+)\+ questions, has (\d+)$/.exec(body)))
    return t('Round III needs {n} categories with {questions} or more questions; it has {has}.', { n: m[1]!, questions: m[2]!, has: m[3]! });
  if ((m = /^penalties need (\d+) questions, have (\d+)$/.exec(body))) return t('Penalties need {n} questions; they have {has}.', { n: m[1]!, has: m[2]! });
  if ((m = /^duplicate (card|box question) id (.+)$/.exec(body))) return m[1] === 'card' ? t('Two cards have the ID {id}.', { id: m[2]! }) : t('Two box questions have the ID {id}.', { id: m[2]! });
  if ((m = /^practice needs (\d+) (easy|medium|hard) questions, has (\d+)$/.exec(body)))
    return t('Practice needs {n} {difficulty} questions; it has {has}.', { n: m[1]!, difficulty: DIFFICULTY_LABELS[m[2] as keyof typeof DIFFICULTY_LABELS], has: m[3]! });
  if ((m = /^(\w+) has no set on (\d+) of the (\d+) days from (\S+) \(first (\S+)\)$/.exec(body)))
    return t('{game} has nothing on {n} of the {days} days from {from} (the first: {first}).', { game: gameName(m[1]!), n: m[2]!, days: m[3]!, from: formatDate(m[4]!), first: formatDate(m[5]!) });
  if ((m = /^(\w+) has no set$/.exec(body))) return t('{game} has no set.', { game: gameName(m[1]!) });
  if ((m = /^(\w+) schedules no date$/.exec(body))) return t('{game} has no date in its calendar.', { game: gameName(m[1]!) });
  if ((m = /^the image (\S+) is shown from its URL, not re-hosted: upload it to keep it$/.exec(body))) return t('The picture {key} is shown from its link, not kept here: upload it to keep it.', { key: m[1]! });
  if ((m = /^the uploaded file of the image (\S+) is missing$/.exec(body))) return t('The uploaded file of the picture {key} is missing.', { key: m[1]! });
  if (body === 'the release shows uploaded images and no storage is configured') return t('The release shows uploaded pictures, and picture storage is not set up.');
  return null;
}

function IssueGroup({ code, issues, tone }: { code: string; issues: ReleaseReport['errors']; tone: 'error' | 'warning' }) {
  const [all, setAll] = useState(false);
  // A line with no wording here and nothing to open says no more than the summary above it.
  const lines = issues.filter((issue) => reportLine(issue.message) !== null || (issue.ref && editHref(issue.ref.type as TdContentType, issue.ref.key)));
  const shown = all ? lines : lines.slice(0, ISSUES_SHOWN);
  return (
    <li className="flex flex-col gap-1">
      <p className="font-medium">
        {ISSUE_SUMMARIES[code as keyof typeof ISSUE_SUMMARIES]?.(issues.length) ?? `${code} (${issues.length})`}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs opacity-90">
        {shown.map((issue, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2">
            {reportLine(issue.message) !== null && <span>{reportLine(issue.message)}</span>}
            {issue.ref && editHref(issue.ref.type as TdContentType, issue.ref.key) && (
              <Link href={editHref(issue.ref.type as TdContentType, issue.ref.key)!} className="font-mono underline">
                {issue.ref.key}
              </Link>
            )}
          </li>
        ))}
      </ul>
      {lines.length > ISSUES_SHOWN && (
        <button type="button" className={cn('self-start text-xs font-semibold underline', tone === 'error' ? 'text-(--td-danger)' : 'text-amber-800')} onClick={() => setAll(!all)}>
          {all ? t('Show fewer') : t('Show all {count}', { count: lines.length })}
        </button>
      )}
    </li>
  );
}

function IssueList({ issues, tone }: { issues: ReleaseReport['errors']; tone: 'error' | 'warning' }) {
  const groups = new Map<string, ReleaseReport['errors']>();
  for (const issue of issues) groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
  return (
    <ul className={cn('flex flex-col gap-3 rounded-lg px-3 py-2 text-sm', tone === 'error' ? 'bg-(--td-danger)/10 text-(--td-danger)' : 'bg-amber-50 text-amber-800')}>
      {[...groups].map(([code, group]) => (
        <IssueGroup key={code} code={code} issues={group} tone={tone} />
      ))}
    </ul>
  );
}

export function ReleaseReportView({ report }: { report: ReleaseReport }) {
  const { pools, media } = report;
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
      {report.ok && report.unchanged && <p className="-mt-2 text-xs text-(--td-text-3)">{t('Only published content goes out: a draft goes out once it is published.')}</p>}
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
        {reportDailies(report).map(([game, daily]) => (
          <div key={game} className="rounded-lg border border-border p-3">
            <p className="text-xs text-(--td-text-3)">{t('{game}: next {days} days from {date}', { game: TD_DAILY_GAME_LABELS[game], days: report.days, date: formatDay(report.from) })}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', daily.missing.length && 'text-(--td-danger)')}>
              {daily.covered}
              <span className="text-sm font-normal text-(--td-text-3)"> {t('/ {days} covered', { days: report.days })}</span>
            </p>
            {daily.missing.length > 0 && <p className="text-xs text-(--td-danger)">{t('Missing: {days}', { days: `${daily.missing.slice(0, 5).map(formatDay).join(', ')}${daily.missing.length > 5 ? '…' : ''}` })}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-(--td-text-3)">
        {t('Images: {images} shown ({uploaded} uploaded, {external} by URL) · {pending} to make public at publish', {
          images: media.images,
          uploaded: media.uploaded,
          external: media.external,
          pending: media.pending,
        })}
      </p>
      <ChangeSummary report={report} />
    </div>
  );
}

function ChangeSummary({ report }: { report: ReleaseReport }) {
  const { changes } = report;
  // A release that has no recorded rows lists everything as added; the same content as the current release changes nothing.
  if (!changes.types.length || report.unchanged) return <p className="text-sm text-(--td-text-3)">{t('No changes since the current release.')}</p>;
  return (
    <div className="rounded-lg border border-border">
      <p className="border-b border-(--td-divider) px-3 py-2 text-xs font-medium text-(--td-text-3)">
        {report.currentReleaseId ? t('Changes since the current release ({release})', { release: report.currentReleaseId }) : t('Changes since the current release')}
      </p>
      {!changes.complete && (
        <p className="border-b border-(--td-divider) bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t('The current release came with the first deploy and keeps no list of its rows, so everything shows as new here. From the first publish on, this lists only what changed.')}
        </p>
      )}
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

function PublicationProgress({ id, onSettled, onMoved }: { id: string; onSettled: (publication: Publication) => void; onMoved: (publication: Publication) => void }) {
  const publication = useQuery({
    queryKey: [...tdKeys.releases, 'publication', id],
    queryFn: ({ signal }) => tdAdmin.releases.publication(id, { signal }),
    refetchInterval: (query) => (query.state.data && settled(query.state.data) ? false : 1000),
  });
  const data = publication.data;
  // Current as soon as the pointer moved, while the notice to game servers may still be on its way.
  const moved = useRef<string | null>(null);
  useEffect(() => {
    if (data?.status === 'published' && moved.current !== data.id) {
      moved.current = data.id;
      onMoved(data);
    }
  }, [data, onMoved]);
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
    <TdSection title={title} description={t('Asked by {name} at {time}.', { name: tdActorName(data.requestedBy.name), time: formatGeorgiaTime(data.requestedAt) })}>
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
          <div className="rounded-lg bg-(--td-danger)/10 px-3 py-2 text-sm text-(--td-danger)" title={data.error.code}>
            <p className="font-medium">{data.status === 'failing' ? t('Failing: removing what it made…') : t('Failed.')} {PUBLICATION_ERRORS[data.error.code] ?? reportLine(data.error.message) ?? ''}</p>
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
                ? t('since {time} ({name})', { time: formatGeorgiaTime(first.pointer.movedAt), name: tdActorName(first.pointer.movedBy.name) })
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
                {t('{time} · {name} · {n} rows', { time: formatGeorgiaTime(release.createdAt), name: tdActorName(release.createdBy.name), n: release.members })}
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
                  {formatGeorgiaTime(move.movedAt)} · {tdActorName(move.movedBy.name)}
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
    // Whichever dailies the release holds: Football Logic in one from before Stat Sniper.
    ...dailyEntries<{ sets: number; scheduledDates: number; coveredDays: number }>(manifest.dailies).map(([game, daily]): [string, string] => [
      TD_DAILY_GAME_LABELS[game],
      t('{sets} sets · {dated} dated · {covered}/30 days', { sets: daily.sets, dated: daily.scheduledDates, covered: daily.coveredDays }),
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
