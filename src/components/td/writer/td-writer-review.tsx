'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Archive, Check, CheckCircle2, ClipboardCheck, ExternalLink, Layers, Loader2, Pencil, Rocket, Sparkles, ThumbsDown, X } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { TdDialogContent } from '@/components/td/td-dialog';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TdReleasesTab } from '@/components/td/tabs/releases-tab';
import { tdKeys, useTdCurrentRelease, useTdWrite } from '@/hooks/use-td-content';
import {
  TD_WRITER_REVIEW_REASONS,
  type TdContentRow,
  type TdWriterMode,
  type TdWriterOverview,
  type TdWriterRejectFailure,
  type TdWriterReviewItem,
  type TdWriterReviewKind,
  type TdWriterReviewReason,
} from '@/lib/td/admin-api';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import { tdErrorText } from '@/lib/td/errors';
import { t } from '@/lib/td/i18n';
import { beginOperation, operationIsCurrent } from '@/lib/td/operation';
import { approveForPublish, categoryHeldText } from '@/lib/td/publish-rows';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';
import { WRITER_AUTO_COUNT, WRITER_MODE_LABEL, WRITER_MODES, WRITER_TO_REVIEW } from './writer-modes';

const PAGE = 20;
/** Following a removal's own release: every half second, for up to a minute. */
const WITHDRAW_POLL_MS = 500;
const WITHDRAW_WAITS = 120;
/** The API takes at most this many in one rejection. */
const REJECT_BATCH = 100;
const NOTE_MAX = 300;

export const REVIEW_REASON_LABEL: Record<TdWriterReviewReason, string> = {
  wrong: t('Wrong'),
  too_easy: t('Too easy'),
  duplicate: t('Duplicate'),
  ambiguous: t('Ambiguous'),
  bad_georgian: t('Bad Georgian'),
  other: t('Other'),
};

const REJECT_FAILURE: Record<TdWriterRejectFailure, string> = {
  stale: t('Someone changed it: refresh'),
  published: t('Already published: archive it from the Questions page'),
  not_ai: t('Not written by the AI writer'),
  not_found: t('It no longer exists: refresh'),
};

export interface TdWriterReviewFilter {
  mode: TdWriterMode;
  /** One job's drafts only, with how to name it. */
  job: { id: string; label: string } | null;
  /** What waits for a member, or what jobs published on their own (to take out of the game). */
  kind: TdWriterReviewKind;
}

const KIND_LABEL: Record<TdWriterReviewKind, string> = {
  waiting: t('Needs review'),
  auto: t('Published automatically'),
};

const LABEL = 'text-[10px] font-black uppercase tracking-widest text-slate-400';

const str = (value: unknown) => (typeof value === 'string' ? value : '');
const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

/** The item in one line, for a refusal or a confirmation. */
export function reviewItemTitle(item: Pick<TdWriterReviewItem, 'type' | 'data'>): string {
  const d = item.data;
  switch (item.type) {
    case 'cards':
    case 'whoami-subjects':
      return str(d.display);
    case 'practice-questions':
      return str(d.prompt);
    default:
      return str(d.q);
  }
}

/** The row as the publish path takes it, at the revision the member saw (a newer one is refused, never published unseen). */
const asRow = (item: TdWriterReviewItem) =>
  ({ id: item.id, status: item.status, version: item.rowRevision, contentVersion: item.contentVersion, approvedVersion: item.approvedVersion, data: item.data }) as unknown as TdContentRow;

/** Only a draft never published can be rejected: archiving an edited published one would take it out of the game. */
const rejectable = (item: TdWriterReviewItem) => item.approvedVersion === null;

export function TdWriterReview({
  overview,
  filter,
  onFilter,
}: {
  overview: TdWriterOverview;
  filter: TdWriterReviewFilter;
  onFilter: (filter: TdWriterReviewFilter) => void;
}) {
  const counts = (kind: TdWriterReviewKind) => (kind === 'auto' ? overview.autoPublished : overview.toReview);
  const countOf = (kind: TdWriterReviewKind, m: TdWriterMode) => counts(kind)[kind === 'auto' ? WRITER_AUTO_COUNT[m] : WRITER_TO_REVIEW[m]];
  const total = (kind: TdWriterReviewKind) => WRITER_MODES.reduce((sum, m) => sum + countOf(kind, m), 0);
  return (
    <TdSection title={t('Needs review')} description={t('Every AI draft waits here until you publish or reject it. Rejected ones are archived, and the AI is told why.')}>
      <div id="writer-review" className="scroll-mt-24 border-b border-(--td-divider) px-5 py-3">
        <div role="tablist" aria-label={t('Which list')} className="mb-3 flex flex-wrap gap-4 border-b border-(--td-divider)">
          {(['waiting', 'auto'] as const).map((kind) => {
            const on = kind === filter.kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onFilter({ mode: filter.mode, job: null, kind })}
                className={cn('-mb-px flex items-center gap-1.5 border-b-2 pb-2 text-sm font-bold transition-colors', on ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600')}
              >
                {kind === 'auto' && <Sparkles className="h-3.5 w-3.5" />}
                {KIND_LABEL[kind]}
                <span className="rounded-full bg-slate-100 px-1.5 text-xs tabular-nums text-slate-500">{total(kind)}</span>
              </button>
            );
          })}
        </div>
        <div role="tablist" aria-label={t('Game mode')} className="flex flex-wrap gap-2">
          {WRITER_MODES.map((m) => {
            const count = countOf(filter.kind, m);
            const on = m === filter.mode;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onFilter({ mode: m, job: null, kind: filter.kind })}
                className={cn(
                  'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold transition-colors',
                  on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {WRITER_MODE_LABEL[m]}
                <span
                  className={cn(
                    'rounded-full px-1.5 tabular-nums',
                    on ? 'bg-white/20' : count > 0 ? (filter.kind === 'auto' ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-800') : 'bg-white text-slate-400',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        {filter.job && (
          <button
            type="button"
            onClick={() => onFilter({ mode: filter.mode, job: null, kind: filter.kind })}
            className="mt-3 flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white transition-all hover:bg-slate-800"
          >
            {t('Job: {name}', { name: filter.job.label })}
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <ReviewList
        key={`${filter.kind}:${filter.mode}:${filter.job?.id ?? ''}`}
        mode={filter.mode}
        kind={filter.kind}
        jobId={filter.job?.id ?? null}
        count={countOf(filter.kind, filter.mode)}
      />
    </TdSection>
  );
}

/** A question sent to players: its approved version, to find in the current release. */
interface Sent {
  id: string;
  title: string;
  version: number;
}

function ReviewList({ mode, kind, jobId, count }: { mode: TdWriterMode; kind: TdWriterReviewKind; jobId: string | null; count: number }) {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const reviewList = useInfiniteQuery({
    queryKey: [...tdKeys.writer, 'review', kind, mode, jobId],
    queryFn: ({ pageParam, signal }) =>
      tdAdmin.writer.review({ mode, ...(kind === 'auto' ? { filter: 'auto' as const } : {}), ...(jobId ? { jobId } : {}), cursor: pageParam, limit: PAGE }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = reviewList.data?.pages.flatMap((p) => p.items) ?? [];
  // The overview polls; the list follows when its mode's count moves (a job wrote more, a colleague published some).
  const { refetch } = reviewList;
  const counted = useRef(count);
  useEffect(() => {
    if (counted.current === count) return;
    counted.current = count;
    void refetch();
  }, [count, refetch]);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ completed: number; total: number; failed: number } | null>(null);
  const [refusals, setRefusals] = useState<Array<{ label: string; message: string }>>([]);
  const [confirming, setConfirming] = useState<TdWriterReviewItem[] | null>(null);
  const [rejecting, setRejecting] = useState<TdWriterReviewItem[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [sent, setSent] = useState<Sent[] | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const [removing, setRemoving] = useState<TdWriterReviewItem | null>(null);
  // The release dialog without publishing on its own: the member sees every change and confirms.
  const [manual, setManual] = useState(false);
  const busy = bulk !== null;
  const member = Boolean(user);
  const auto = kind === 'auto';

  const chosen = items.filter((item) => selected.includes(item.id));
  const chosenRejectable = chosen.filter(rejectable);
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  const refresh = async () => {
    await Promise.all([tdKeys.writer, tdKeys.content, tdKeys.releases].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };

  /** The Questions page's own publish: each approved (with a new category it needs), then the release goes out on its own. */
  const publish = async (targets: TdWriterReviewItem[]) => {
    setRefusals([]);
    setSent(null);
    setBulk({ completed: 0, total: targets.length, failed: 0 });
    const operation = beginOperation(tdTokens);
    const { results, categories: held } = await approveForPublish(tdTokens, mode, targets.map(asRow), operation, (completed, failed) =>
      setBulk({ completed, total: targets.length, failed }),
    );
    const refused = results.filter((r) => !r.ok);
    const categoryTitle = (key: string) => {
      const found = targets.find((item) => str(item.data.categoryKey) === key);
      return found?.category ?? key;
    };
    setRefusals([
      ...refused.map((r) => ({ label: reviewItemTitle(targets.find((item) => item.id === r.item.id)!) || r.item.id, message: tdErrorText(!r.ok ? r.error : null) })),
      ...held.map((c) => ({ label: categoryTitle(c.key), message: categoryHeldText(c.error, false) })),
    ]);
    setBulk(null);
    setSelected([]);
    await refresh();
    // A question whose category stays unpublished does not reach players: only the rest count, and the release goes
    // out only for them (else it would publish whatever else waits, and say these were published).
    const heldKeys = new Set(held.map((c) => c.key));
    const shippable = results.flatMap((r) =>
      r.ok && r.value.approvedVersion !== null && !heldKeys.has(str((r.value.data as Record<string, unknown>).categoryKey))
        ? [{ id: r.value.id, title: reviewItemTitle(targets.find((item) => item.id === r.value.id)!) || r.value.id, version: r.value.approvedVersion }]
        : [],
    );
    // Not after a sign-out or another sign-in meanwhile: the release would go out as someone else.
    if (shippable.length && operationIsCurrent(tdTokens, operation)) {
      setSent(shippable);
      setPublishing(true);
    }
  };

  const reject = async (targets: TdWriterReviewItem[], reason: TdWriterReviewReason, note: string) => {
    setRefusals([]);
    setBulk({ completed: 0, total: targets.length, failed: 0 });
    let done = 0;
    const failed: Array<{ label: string; message: string }> = [];
    try {
      for (let start = 0; start < targets.length; start += REJECT_BATCH) {
        const batch = targets.slice(start, start + REJECT_BATCH);
        const { items: results } = await write(
          (operation) =>
            tdAdmin.writer.reject({ items: batch.map((item) => ({ id: item.id, rowRevision: item.rowRevision })), reason, ...(note ? { note } : {}) }, operation),
          [tdKeys.writer, tdKeys.content],
        );
        for (const result of results) {
          if (result.ok) done++;
          else {
            const item = batch.find((i) => i.id === result.id);
            failed.push({ label: (item && reviewItemTitle(item)) || result.id, message: REJECT_FAILURE[result.code] ?? result.code });
          }
        }
        setBulk({ completed: Math.min(start + REJECT_BATCH, targets.length), total: targets.length, failed: failed.length });
      }
    } catch (caught) {
      toast.error(tdErrorText(caught));
    } finally {
      setBulk(null);
    }
    if (done) toast.success(t('{n} rejected', { n: done }));
    setRefusals(failed);
    setSelected([]);
  };

  /** A release that takes only this question out of the game: if anything else waits to be published too, it is
   *  refused (held) and the member gets the full list of changes to confirm, never a blind release of everything. */
  const withdraw = async (item: TdWriterReviewItem) => {
    const operation = beginOperation(tdTokens);
    let publication = await tdAdmin.releases.publish(`withdraw:${crypto.randomUUID()}`, operation, [{ type: item.type, id: item.id, version: null }]);
    for (let wait = 0; wait < WITHDRAW_WAITS && (publication.status === 'running' || publication.status === 'failing'); wait++) {
      await new Promise((resolve) => setTimeout(resolve, WITHDRAW_POLL_MS));
      publication = await tdAdmin.releases.publication(publication.id, operation);
    }
    await refresh();
    if (publication.status === 'published') {
      // Said only when the current release does not hold it, and is still current once that was read (a rollback
      // may come at any point): the pointer is read again last.
      const current = (await tdAdmin.releases.list({ limit: 1 }, operation)).pointer.releaseId;
      const release = current ? await tdAdmin.releases.get(current, operation) : null;
      const still = (await tdAdmin.releases.list({ limit: 1 }, operation)).pointer.releaseId;
      if (release && still === current && !release.members.some((m) => m.id === item.id))
        toast.success(t('Taken out of the game: players no longer get it.'));
      else setRefusals([{ label: reviewItemTitle(item) || item.id, message: t('Still in the game: the release still holds it. Try again.') }]);
    } else if (publication.error?.code === 'held') {
      setManual(true);
      setPublishing(true);
    } else if (publication.status === 'failed') setRefusals([{ label: reviewItemTitle(item) || item.id, message: publication.error?.message ?? t('The release failed') }]);
  };

  /** Out of the game: the Questions page's archive of a live row, then the release that takes it alone out. */
  const remove = async (item: TdWriterReviewItem) => {
    setRefusals([]);
    setBulk({ completed: 0, total: 1, failed: 0 });
    try {
      await write((operation) => tdAdmin.content(item.type).archive(item.id, item.rowRevision, operation), [tdKeys.writer, tdKeys.content]);
      toast.success(t('{n} archived', { n: 1 }));
      await withdraw(item);
    } catch (caught) {
      setRefusals([{ label: reviewItemTitle(item) || item.id, message: tdErrorText(caught) }]);
    } finally {
      setBulk(null);
    }
  };

  const retryWithdraw = async (item: TdWriterReviewItem) => {
    setRefusals([]);
    setBulk({ completed: 0, total: 1, failed: 0 });
    try {
      await withdraw(item);
    } catch (caught) {
      setRefusals([{ label: reviewItemTitle(item) || item.id, message: tdErrorText(caught) }]);
    } finally {
      setBulk(null);
    }
  };

  const edit = async (item: TdWriterReviewItem) => {
    setOpening(item.id);
    try {
      const row = await tdAdmin.content(item.type).get(item.id);
      setTarget({ type: item.type, row });
    } catch (caught) {
      toast.error(tdErrorText(caught));
    } finally {
      setOpening(null);
    }
  };

  if (reviewList.error) return <TdErrorPanel error={reviewList.error} />;
  if (!reviewList.data)
    return (
      <div className="grid place-items-center py-12 text-(--td-text-3)">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );

  return (
    <div>
      {sent && <LiveCheck sent={sent} poll={publishing} onDismiss={() => setSent(null)} />}
      {refusals.length > 0 && (
        <div role="alert" className="mx-5 mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          <p className="font-bold">{t('{n} refused', { n: refusals.length })}</p>
          <ul className="mt-1 list-disc pl-4">
            {refusals.map((r, i) => (
              <li key={i}>
                <span className="font-semibold">{r.label}</span>: {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 ? (
        auto ? (
          <TdEmptyState icon={Sparkles} title={t('Nothing published automatically')}>
            {t('Questions a job with automatic publishing puts in the game are listed here, to take out if needed.')}
          </TdEmptyState>
        ) : (
          <TdEmptyState icon={ClipboardCheck} title={t('Nothing waits')}>
            {jobId ? t('This job has nothing left to review.') : t('When the AI writes questions of this mode, they wait here.')}
          </TdEmptyState>
        )
      ) : (
        <>
          {!auto && (
            <div className="flex flex-wrap items-center gap-3 border-b border-(--td-divider) bg-slate-50/60 px-5 py-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                <input
                  type="checkbox"
                  aria-label={t('Select all shown')}
                  className="h-4 w-4 rounded-md border-gray-200 text-slate-900"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? [] : items.map((item) => item.id))}
                />
                {t('Select all')}
              </label>
              {selected.length > 0 && (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {bulk ? (
                    <div className="flex min-w-[200px] items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                        <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(bulk.completed / bulk.total) * 100}%` }} />
                      </div>
                      <span className="whitespace-nowrap text-xs font-bold text-gray-600">
                        {bulk.completed}/{bulk.total}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-gray-600">{t('{n} selected', { n: selected.length })}</span>
                      {member && (
                        <Button size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={chosen.length === 0} onClick={() => setConfirming(chosen)}>
                          <Rocket className="h-3.5 w-3.5" />
                          {t('Publish {n}', { n: chosen.length })}
                        </Button>
                      )}
                      {member && (
                        <Button variant="destructive" size="sm" className="h-8 rounded-lg text-xs font-bold" disabled={chosenRejectable.length === 0} onClick={() => setRejecting(chosenRejectable)}>
                          <ThumbsDown className="h-3.5 w-3.5" />
                          {t('Reject {n}', { n: chosenRejectable.length })}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          <ul className="divide-y divide-(--td-divider)">
            {items.map((item) => (
              <ReviewCard
                key={item.id}
                item={item}
                selectable={!auto}
                selected={selected.includes(item.id)}
                onToggle={() => toggle(item.id)}
                actions={
                  member && (
                    <>
                      {!item.removalPending && (
                        <Button size="sm" variant="outline" className="text-slate-600" disabled={busy || opening !== null} onClick={() => void edit(item)}>
                          {opening === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                          {t('Edit')}
                        </Button>
                      )}
                      {auto ? (
                        item.removalPending ? (
                          // Archived, but players still have it until a release goes out: the release can be asked again.
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => void retryWithdraw(item)}>
                            <Rocket className="h-4 w-4" />
                            {t('Publish again')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" disabled={busy} onClick={() => setRemoving(item)}>
                            <Archive className="h-4 w-4" />
                            {t('Remove from the game')}
                          </Button>
                        )
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            disabled={busy || !rejectable(item)}
                            title={rejectable(item) ? undefined : t('Already published: archive it from the Questions page')}
                            onClick={() => setRejecting([item])}
                          >
                            <ThumbsDown className="h-4 w-4" />
                            {t('Reject')}
                          </Button>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => setConfirming([item])}>
                            <Rocket className="h-4 w-4" />
                            {t('Publish')}
                          </Button>
                        </>
                      )}
                    </>
                  )
                }
              />
            ))}
          </ul>
          {reviewList.hasNextPage && (
            <div className="border-t border-(--td-divider) px-5 py-3 text-center">
              <Button variant="ghost" size="sm" disabled={reviewList.isFetchingNextPage} onClick={() => void reviewList.fetchNextPage()}>
                {reviewList.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('Load more')}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={confirming !== null} onOpenChange={(isOpen) => !isOpen && setConfirming(null)}>
        <TdDialogContent>
          <DialogHeader>
            <DialogTitle>{t('Publish')}</DialogTitle>
            <DialogDescription>
              {confirming && confirming.length > 1
                ? t('Publish {n} questions? Players get them in a minute, with anything else waiting to publish; matches already under way finish with the questions they started with.', { n: confirming.length })
                : t('Publish this question? Players get it in a minute, with anything else waiting to publish; matches already under way finish with the questions they started with.')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              {t('Cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                const targets = confirming ?? [];
                setConfirming(null);
                void publish(targets);
              }}
            >
              <Rocket className="h-4 w-4" />
              {t('Publish')}
            </Button>
          </DialogFooter>
        </TdDialogContent>
      </Dialog>

      {/* The Questions page's archive confirmation */}
      <Dialog open={removing !== null} onOpenChange={(isOpen) => !isOpen && setRemoving(null)}>
        <TdDialogContent>
          <DialogHeader>
            <DialogTitle>{t('Archive Question')}</DialogTitle>
            <DialogDescription>{t('Archive this question? It leaves the game at the next publish and can be restored.')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const item = removing!;
                setRemoving(null);
                void remove(item);
              }}
            >
              {t('Archive')}
            </Button>
          </DialogFooter>
        </TdDialogContent>
      </Dialog>

      <RejectDialog
        targets={rejecting}
        busy={busy}
        onClose={() => setRejecting(null)}
        onReject={(reason, note) => {
          const targets = rejecting ?? [];
          setRejecting(null);
          void reject(targets, reason, note);
        }}
      />

      <Dialog
        open={publishing}
        onOpenChange={(isOpen) => {
          setPublishing(isOpen);
          if (!isOpen) {
            setManual(false);
            void refresh();
          }
        }}
      >
        <TdDialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-[2rem] border-slate-200 bg-white p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-slate-100 px-6 pb-4 pt-5">
            <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">{t('Publish')}</DialogTitle>
            <DialogDescription>
              {manual
                ? t('Other changes wait to be published too, so the question was not taken out on its own. Check every change below and publish if they should all go; until then the question is listed as removal pending.')
                : refusals.length
                  ? t('Those refused are listed on the page; this release takes the rest to players. The page says when each is live.')
                  : t('This release takes your questions to players. The page says when each is live.')}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">{publishing && <TdReleasesTab autoPublish={!manual} />}</div>
        </TdDialogContent>
      </Dialog>

      <TdContentEditorDialog
        target={target}
        onClose={() => setTarget(null)}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: tdKeys.writer })}
        onPublished={() => {
          setTarget(null);
          setPublishing(true);
        }}
      />
    </div>
  );
}

function RejectDialog({
  targets,
  busy,
  onClose,
  onReject,
}: {
  targets: TdWriterReviewItem[] | null;
  busy: boolean;
  onClose: () => void;
  onReject: (reason: TdWriterReviewReason, note: string) => void;
}) {
  const [reason, setReason] = useState<TdWriterReviewReason | null>(null);
  const [note, setNote] = useState('');
  const close = () => {
    setReason(null);
    setNote('');
    onClose();
  };
  return (
    <Dialog open={targets !== null} onOpenChange={(isOpen) => !isOpen && close()}>
      <TdDialogContent>
        <DialogHeader>
          <DialogTitle>{t('Reject')}</DialogTitle>
          <DialogDescription>
            {targets && targets.length > 1
              ? t('Reject {n} drafts? They are archived (nothing is deleted), and the AI is told why so it does not write like them again.', { n: targets.length })
              : t('Reject this draft? It is archived (nothing is deleted), and the AI is told why so it does not write like it again.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div role="radiogroup" aria-label={t('Why?')} className="flex flex-wrap gap-2">
            {TD_WRITER_REVIEW_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={reason === r}
                onClick={() => setReason(r)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                  reason === r ? 'border-red-600 bg-red-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                )}
              >
                {REVIEW_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="writer-reject-note" className={LABEL}>
              {t('Note (optional)')}
            </label>
            <Textarea id="writer-reject-note" value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || reason === null}
            onClick={() => {
              const chosen = reason!;
              const text = note.trim();
              setReason(null);
              setNote('');
              onReject(chosen, text);
            }}
          >
            <ThumbsDown className="h-4 w-4" />
            {t('Reject')}
          </Button>
        </DialogFooter>
      </TdDialogContent>
    </Dialog>
  );
}

const DIFFICULTY_TONE = ['', 'bg-emerald-50 text-emerald-700', 'bg-emerald-50 text-emerald-700', 'bg-amber-50 text-amber-700', 'bg-red-50 text-red-600', 'bg-red-50 text-red-600'];

/** A link the fact-checker gave, only when it is a web address. */
const webLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);

function ReviewCard({
  item,
  selectable,
  selected,
  onToggle,
  actions,
}: {
  item: TdWriterReviewItem;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  actions: ReactNode;
}) {
  const title = reviewItemTitle(item);
  const verdict = item.verdict;
  const source = webLink(verdict?.factSource ?? null);
  return (
    <li className={cn('px-5 py-4 transition-colors', selected && 'bg-blue-50/40')}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            aria-label={t('Select {label}', { label: title || item.id })}
            className="mt-1 h-4 w-4 shrink-0 rounded-md border-gray-200 text-slate-900"
            checked={selected}
            onChange={onToggle}
          />
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {item.autoPublishedAt && <AutoChip />}
            {item.removalPending ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">{t('Removal pending')}</span>
            ) : (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 font-semibold',
                  item.published ? 'bg-emerald-50 text-emerald-700' : item.status === 'approved' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500',
                )}
              >
                {item.published ? t('In the game') : item.status === 'approved' ? t('Waiting to publish') : t('Draft')}
              </span>
            )}
            {verdict?.difficulty != null && (
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', DIFFICULTY_TONE[verdict.difficulty])}>{t('Difficulty {n}/5', { n: verdict.difficulty })}</span>
            )}
            {item.category && (
              <span className="flex items-center gap-1 text-slate-500">
                <Layers className="h-3.5 w-3.5 text-slate-300" />
                {item.category}
              </span>
            )}
            {verdict?.stale && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {t('Changed since the check')}
              </span>
            )}
            {!verdict && <span className="rounded-full bg-slate-50 px-2 py-0.5 font-semibold text-slate-400">{t('Not checked by the AI')}</span>}
          </div>
          <ItemBody item={item} />
          {verdict && (verdict.factReason || verdict.judgeReason) && (
            <div className="flex flex-wrap gap-2 text-xs">
              {verdict.factReason && (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                  <span className="font-semibold text-slate-500">{t('Fact check:')}</span> {verdict.factReason}
                  {source && (
                    <>
                      {' '}
                      <a href={source} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-blue-600 hover:underline">
                        {t('Source')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </span>
              )}
              {verdict.judgeReason && (
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-600">
                  <span className="font-semibold text-slate-500">{t('Judge:')}</span> {verdict.judgeReason}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </li>
  );
}

/** A row a job published on its own (the Questions page shows the same). */
export function AutoChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700" title={t('Published by the AI writer without a member')}>
      <Sparkles className="h-3 w-3" /> {t('AI · automatic')}
    </span>
  );
}

function Answer({ display, aliases }: { display: string; aliases: string[] }) {
  const others = aliases.filter((alias) => alias.trim().toLowerCase() !== display.trim().toLowerCase());
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{t('Answer')}</span>
      <div className="text-sm font-semibold text-slate-800">{display || '—'}</div>
      {others.length > 0 && <div className="mt-0.5 text-[11px] text-slate-500">{t('Also accepted: {list}', { list: others.join(', ') })}</div>}
    </div>
  );
}

/** What the player sees, by mode. */
function ItemBody({ item }: { item: TdWriterReviewItem }) {
  const d = item.data;
  switch (item.type) {
    case 'penalty-questions':
    case 'box-questions':
      return (
        <div className="space-y-2">
          <p className="break-words text-sm font-medium text-slate-900">{str(d.q)}</p>
          <Answer display={str(d.display)} aliases={list(d.aliases)} />
        </div>
      );
    case 'cards':
      return (
        <div className="space-y-2">
          <ol className="space-y-1">
            {list(d.lines).map((line, i) => (
              <li key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                {line}
              </li>
            ))}
          </ol>
          <Answer display={str(d.display)} aliases={list(d.aliases)} />
        </div>
      );
    case 'whoami-subjects':
      return (
        <div className="space-y-2">
          <ol className="space-y-1.5">
            {list(d.clues).map((clue, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                <span className="mt-0.5 shrink-0 text-xs font-bold text-slate-400">{i + 1}</span>
                <span className="break-words text-sm text-slate-700">{clue}</span>
              </li>
            ))}
          </ol>
          <Answer display={str(d.display)} aliases={list(d.aliases)} />
        </div>
      );
    case 'practice-questions': {
      const correct = Number(d.answer);
      return (
        <div className="space-y-2">
          <p className="break-words text-sm font-medium text-slate-900">{str(d.prompt)}</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {list(d.options).map((option, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm',
                  i === correct ? 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 bg-white text-slate-600',
                )}
              >
                {i === correct && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={t('Correct')} />}
                {option}
              </div>
            ))}
          </div>
          {str(d.explanation) && <p className="text-xs text-slate-500">{str(d.explanation)}</p>}
        </div>
      );
    }
  }
}

const LIVE_POLL_MS = 3_000;

/** Which of the questions sent are in the current release now: a question counts as published only once it is. */
function LiveCheck({ sent, poll, onDismiss }: { sent: Sent[]; poll: boolean; onDismiss: () => void }) {
  const queryClient = useQueryClient();
  const { members, loaded } = useTdCurrentRelease();
  const pending = sent.filter((item) => members.get(item.id) !== item.version);
  const done = loaded && pending.length === 0;
  // While the release goes out, the current release is read again until every question is in it.
  useEffect(() => {
    if (!poll || done) return;
    const timer = setInterval(() => void queryClient.invalidateQueries({ queryKey: [...tdKeys.releases, 'list', 'first'] }), LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [poll, done, queryClient]);
  return (
    <div
      role="status"
      className={cn(
        'mx-5 mt-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-xs',
        done ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <Loader2 className={cn('mt-0.5 h-4 w-4 shrink-0', poll && 'animate-spin')} />}
      <div className="min-w-0 flex-1">
        {done ? (
          <p className="font-bold">{t('Published: players have all {n} now.', { n: sent.length })}</p>
        ) : (
          <>
            <p className="font-bold">{t('{live} of {total} are live so far.', { live: sent.length - pending.length, total: sent.length })}</p>
            <p className="mt-1">{t('Not live yet: {list}', { list: pending.map((item) => item.title).join(' · ') })}</p>
          </>
        )}
      </div>
      <button type="button" aria-label={t('Close')} onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
