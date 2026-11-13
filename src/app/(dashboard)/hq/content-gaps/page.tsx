'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContentFixes, useContentGaps, useContentGapsSummary, useUpdateContentFix, useUpdateContentGap } from '@/hooks';
import { cn } from '@/lib/utils';
import { gameLabel } from '@/lib/audience-labels';
import { formatRelative } from '@/lib/hq-board';
import type { ContentFix, ContentFixHumanTarget, ContentFixStatus, ContentGap, ContentGapHumanTarget, ContentGapStatus, ContentGapVerdict } from '@/types';
import { EmptyState, HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, Section, Stat } from '../hq-ui';

type Tab = 'queue' | 'fixes';

/**
 * What each verdict means, from the backend (content-gaps.buffer.ts, darts501.rules.ts, tenable.gaps.ts,
 * footballers.gaps.ts, wordgame-reports.service.ts): the text a player typed and how the game's matcher read it.
 */
const VERDICT_INFO: Record<ContentGapVerdict, { label: string; hint: string }> = {
  unknown: { label: 'Name not recognised', hint: 'The matcher could not tell who was meant: nobody the game knows matched what was typed.' },
  uncovered: { label: 'Player has no data here', hint: 'A real footballer the game recognised, but our source has no numbers for him, so we cannot say whether he belongs in this category.' },
  ambiguous: { label: 'Matches several people', hint: 'What was typed could be more than one person, so the matcher could not pick one.' },
  miss: { label: 'Recognised, not on the list', hint: 'The matcher knew exactly who was meant, but this board does not hold him, so it counted as wrong. His entry may be missing.' },
  reported: { label: 'Player says it was right', hint: 'A player reported that an answer the game refused was actually right.' },
};

/** A game id as people say it: the shared name map first, else title-cased ("darts501" → "Darts 501"). */
function readableGame(id: string): string {
  const label = gameLabel(id);
  if (label !== id) return label;
  return id.replace(/([a-z])(\d)/gi, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const GAP_STATUS_LABEL: Record<ContentGapStatus, string> = {
  open: 'Open',
  checking: 'Being checked',
  proposed: 'Fix proposed',
  verified: 'Verified',
  held: 'Needs you',
  fixed: 'Fixed',
  junk: 'Not an answer',
  correct: 'Our verdict was right',
  wontfix: "Won't fix",
};
type GapView = 'review' | 'progress' | 'resolved';
/** Three views over the nine states; each state stays reachable through the State filter inside its view. */
const GAP_VIEWS: Array<{ key: GapView; label: string; empty: string; statuses: ContentGapStatus[] }> = [
  { key: 'review', label: 'Needs review', empty: 'Nothing needs review.', statuses: ['held', 'open'] },
  { key: 'progress', label: 'In progress', empty: 'Nothing in progress.', statuses: ['checking', 'proposed', 'verified'] },
  { key: 'resolved', label: 'Resolved', empty: 'Nothing resolved yet.', statuses: ['fixed', 'junk', 'correct', 'wontfix'] },
];
const FIX_TABS: Array<{ status: ContentFixStatus; label: string }> = [
  { status: 'proposed', label: 'Waiting for the verifier' },
  { status: 'held', label: 'Needs you' },
  { status: 'verified', label: 'Verified' },
  { status: 'rejected', label: 'Rejected' },
];
function Pill({ children, title }: { children: React.ReactNode; title?: string }) {
  return <span title={title} className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[13px] font-medium text-slate-700">{children}</span>;
}

function Tabs<T extends string>({ items, value, onChange, label, compact }: { items: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (v: T) => void; label: string; compact?: boolean }) {
  return (
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'rounded-md font-medium transition-colors',
            compact ? 'px-2.5 py-1 text-[13px] max-sm:min-h-9' : 'min-h-9 px-2.5 py-1.5 text-sm sm:px-3',
            value === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
          )}
        >
          {t.label}
          {!!t.count && <span aria-hidden className={cn('ml-1.5 tabular-nums', value === t.key ? 'text-slate-300' : 'text-slate-500')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

function SummaryTiles() {
  const { data } = useContentGapsSummary();
  const byGame = useMemo(() => {
    const games = new Map<string, { open: number; typed: number; fixed: number }>();
    for (const r of data ?? []) {
      const g = games.get(r.game) ?? { open: 0, typed: 0, fixed: 0 };
      if (r.status === 'open' || r.status === 'checking' || r.status === 'held') { g.open += r.gaps; g.typed += r.typed; }
      if (r.status === 'verified' || r.status === 'fixed') g.fixed += r.gaps;
      games.set(r.game, g);
    }
    return [...games.entries()].sort((a, b) => b[1].typed - a[1].typed);
  }, [data]);
  if (!byGame.length) return null;
  return (
    <Section title="By game" description="Gaps still open, being checked or waiting on you, per game.">
      <div className="flex flex-wrap gap-3">
        {byGame.map(([game, g]) => (
          <div key={game} className="w-[13rem] rounded-lg border border-slate-200 bg-white">
            <Stat
              label={readableGame(game)}
              value={g.open}
              hint={<span className="block whitespace-normal">open gaps · typed {g.typed.toLocaleString()}× · {g.fixed} fixed/verified</span>}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

/** The one decision a person most often makes on a gap in this state; the rest sit behind Details. */
function primaryGapDecision(status: ContentGapStatus): ContentGapHumanTarget {
  return status === 'open' || status === 'checking' || status === 'held' ? 'junk' : 'open';
}

function GapCodes({ gap }: { gap: ContentGap }) {
  if (gap.resolvedId) return <>read as <code className="break-all font-mono">{gap.resolvedId}</code></>;
  if (gap.candidateIds?.length) return <>could be {gap.candidateIds.map((c) => <code key={c} className="mr-1.5 break-all font-mono">{c}</code>)}</>;
  return <>none</>;
}

/** One column template for the header and every row, so the answers line up (from a laptop width up). */
const GAP_COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_4.5rem_13rem_5.5rem_6.5rem]';

/** One typed answer in one board: the board's name sits in its group header, not here. */
function GapRow({ gap }: { gap: ContentGap }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = `gap-details-${gap.id}`;
  return (
    <li className="px-4 py-2.5">
      <div className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1', GAP_COLUMNS)}>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {gap.samples.length ? gap.samples.map((s) => (
            <span key={`${s.locale}:${s.typed}`} className="break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm font-semibold text-slate-950">
              <span className="mr-1.5 text-xs font-medium uppercase text-slate-600">{s.locale}</span>{s.typed}
            </span>
          )) : <span className="break-words text-sm font-semibold text-slate-950">{gap.norm}</span>}
        </div>
        {/* A phone stacks these under the answer; from a laptop width they are columns. */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600 lg:contents">
          <span className="font-medium tabular-nums text-slate-700 lg:text-right">
            {gap.count}×<span className="lg:hidden"> typed</span>
          </span>
          <span className="min-w-0">
            <Pill title={VERDICT_INFO[gap.verdict].hint}>{VERDICT_INFO[gap.verdict].label}</Pill>
          </span>
          <span className="tabular-nums">
            <span className="lg:hidden">last </span>{formatRelative(gap.lastSeen)}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((e) => !e)}
          title={expanded ? 'Hide this gap’s details and decisions' : 'Show this gap’s details and decisions'}
          className="inline-flex min-h-9 items-center gap-1 justify-self-end rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 max-lg:col-start-2 max-lg:row-start-1 lg:order-last"
        >
          <ChevronRight className={cn('size-4 transition', expanded && 'rotate-90')} aria-hidden />
          Review
        </button>
      </div>
      {/* Decisions live with the details, so the queue reads as a list. */}
      {expanded && <div className="mt-2"><GapActions gap={gap} expanded /></div>}
      {expanded && (
        <div id={panelId} className="mt-2 space-y-2 rounded-md bg-slate-50 px-3 py-2 text-[13px] text-slate-700">
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className={HQ_LABEL}>Why</dt><dd>{VERDICT_INFO[gap.verdict].hint}</dd>
            <dt className={HQ_LABEL}>Gap</dt><dd className="tabular-nums">#{gap.id}</dd>
            <dt className={HQ_LABEL}>Board</dt><dd className="break-all">{gap.game} · {gap.mode} · {gap.boardKey}</dd>
            <dt className={HQ_LABEL}>Normalised</dt><dd className="break-words">{gap.norm}</dd>
            <dt className={HQ_LABEL}>Matched</dt><dd><GapCodes gap={gap} /></dd>
            <dt className={HQ_LABEL}>First seen</dt><dd className="tabular-nums">{formatRelative(gap.firstSeen)}</dd>
          </dl>
          {(gap.audit ?? []).length > 0 && (
            <div>
              <div className={HQ_LABEL}>History</div>
              <ul className="mt-1 space-y-0.5">
                {(gap.audit ?? []).map((a, i) => <li key={i}>{formatRelative(a.at)}: {a.from} → {a.to} — {a.reason}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** A board's answers under one header: the game's name and the board key, once. */
function BoardGroup({ game, boardKey, gaps }: { game: string; boardKey: string; gaps: ContentGap[] }) {
  const headingId = useId();
  return (
    <div>
      <div id={headingId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-100 bg-slate-50 px-4 py-2">
        <span className="text-sm font-semibold text-slate-950">{readableGame(game)}</span>
        <span className="min-w-0 break-all text-xs text-slate-500" title={`${game} · ${boardKey}`}>{boardKey}</span>
      </div>
      <ul aria-labelledby={headingId} className="divide-y divide-slate-100">
        {gaps.map((g) => <GapRow key={g.id} gap={g} />)}
      </ul>
    </div>
  );
}

/** The most states any view holds; `useGapStates` reserves one query slot for each. */
const MAX_STATES = 4;

/**
 * The gaps of several states at once. The hook is still one state at a time, so a view's "All" asks once per state;
 * hooks cannot be called in a varying number, so unused slots repeat the first state, which React Query serves from the
 * same request.
 */
function useGapStates(statuses: ContentGapStatus[], game: string) {
  const params = (i: number) => ({ status: statuses[i] ?? statuses[0], game: game || undefined, limit: 100 });
  const queries = [useContentGaps(params(0)), useContentGaps(params(1)), useContentGaps(params(2)), useContentGaps(params(3))];
  return statuses.slice(0, MAX_STATES).map((status, i) => ({ status, query: queries[i] }));
}

function GapsSkeleton() {
  return (
    <div role="status" aria-label="Loading gaps">
      <Panel>
        <ul className="divide-y divide-slate-100">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 px-4 py-3">
              <div className="h-6 w-32 animate-pulse rounded-md bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function GapList({ gaps, label }: { gaps: ContentGap[]; label?: string }) {
  // One group per board (game + board key), in the order the boards first appear.
  const boards = useMemo(() => {
    const byBoard = new Map<string, { game: string; boardKey: string; gaps: ContentGap[] }>();
    for (const g of gaps) {
      const key = JSON.stringify([g.game, g.boardKey]);
      const board = byBoard.get(key) ?? { game: g.game, boardKey: g.boardKey, gaps: [] };
      board.gaps.push(g);
      byBoard.set(key, board);
    }
    return [...byBoard.entries()];
  }, [gaps]);
  return (
    <div className="space-y-2">
      {label && (
        <h3 className="flex items-center gap-3 text-[13px] font-medium text-slate-600">
          {label}
          <span className="h-px flex-1 bg-slate-200" aria-hidden />
        </h3>
      )}
      <Panel className="overflow-hidden">
        <div className={cn('hidden grid-cols-[minmax(0,1fr)] items-center gap-x-3 border-b border-slate-100 px-4 py-2 lg:grid', GAP_COLUMNS)} aria-hidden>
          <span className={HQ_LABEL}>Answer</span>
          <span className={cn(HQ_LABEL, 'text-right')}>Typed</span>
          <span className={HQ_LABEL}>Verdict</span>
          <span className={HQ_LABEL}>Last seen</span>
          <span />
        </div>
        <div className="divide-y divide-slate-200">
          {boards.map(([key, board]) => <BoardGroup key={key} game={board.game} boardKey={board.boardKey} gaps={board.gaps} />)}
        </div>
      </Panel>
    </div>
  );
}

function QueueTab() {
  const [view, setView] = useState<GapView>('review');
  const [state, setState] = useState<ContentGapStatus | 'all'>('all');
  const [game, setGame] = useState('');
  const summary = useContentGapsSummary();
  const counts = useMemo(() => {
    const byStatus = new Map<ContentGapStatus, number>();
    for (const r of summary.data ?? []) {
      if (game && r.game !== game) continue;
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + r.gaps);
    }
    return byStatus;
  }, [summary.data, game]);
  // The games the summary knows about; the current choice stays listed even if the summary no longer has it.
  const games = useMemo(() => {
    const ids = new Set((summary.data ?? []).map((r) => r.game));
    if (game) ids.add(game);
    return [...ids].sort((a, b) => readableGame(a).localeCompare(readableGame(b)));
  }, [summary.data, game]);
  const total = (statuses: ContentGapStatus[]) => statuses.reduce((n, st) => n + (counts.get(st) ?? 0), 0);
  const current = GAP_VIEWS.find((v) => v.key === view) ?? GAP_VIEWS[0];
  const shown = state === 'all' ? current.statuses : [state];

  const states = useGapStates(shown, game);
  const failed = states.filter((s) => s.query.error && !s.query.data);
  // isPending, not isLoading: a first request paused offline is pending but not "loading".
  const loading = states.some((s) => s.query.isPending);
  const withRows = states.filter((s) => s.query.data?.length);
  // Stacked states get a light divider label, but only when more than one of them has gaps.
  const labelled = state === 'all' && withRows.length > 1;
  const forGame = game ? ` for ${readableGame(game)}` : '';
  const emptyText = state === 'all' ? `${current.empty.replace(/\.$/, '')}${forGame}.` : `No gaps in this state${forGame}.`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tabs
          label="Gap views"
          items={GAP_VIEWS.map((v) => ({ key: v.key, label: v.label, count: total(v.statuses) }))}
          value={view}
          onChange={(v) => { setView(v); setState('all'); }}
        />
        <div className="flex w-full gap-2 sm:w-auto">
          <Select value={state} onValueChange={(v) => setState(v as ContentGapStatus | 'all')}>
            <SelectTrigger aria-label="Filter by state" className="min-w-0 flex-1 shadow-none sm:w-48 sm:flex-none">
              <span className="text-slate-500">State:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {current.statuses.map((st) => (
                <SelectItem key={st} value={st}>{GAP_STATUS_LABEL[st]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={game || 'all'} onValueChange={(v) => setGame(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Filter by game" className="min-w-0 flex-1 shadow-none sm:w-52 sm:flex-none">
              <span className="text-slate-500">Game:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All games</SelectItem>
              {games.map((id) => (
                <SelectItem key={id} value={id}>{readableGame(id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {summary.error && !summary.data && (
        <LoadErrorState error={summary.error} fallback="Could not load the game list and counts." onRetry={() => void summary.refetch()} />
      )}
      {failed.length > 0 && (
        <LoadErrorState error={failed[0].query.error} fallback="Could not load the content gaps." onRetry={() => failed.forEach((f) => void f.query.refetch())} />
      )}
      {withRows.length > 0 ? (
        <div className="space-y-4">
          {withRows.map(({ status, query }) => <GapList key={status} gaps={query.data ?? []} label={labelled ? GAP_STATUS_LABEL[status] : undefined} />)}
        </div>
      ) : loading ? (
        <GapsSkeleton />
      ) : failed.length === 0 ? (
        // One message, and only once every state has answered: an empty state alongside rows would be wrong.
        <EmptyState>{emptyText}</EmptyState>
      ) : null}
    </div>
  );
}

function Sources({ items }: { items: ContentFix['evidence'] }) {
  if (!items?.length) return <div className="text-[13px] text-slate-500">No sources.</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => {
        const url = safeWebUrl(s.url);
        return (
        <li key={`${s.url}-${i}`} className="text-[13px]">
          {url ? (
            <a href={url.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-sky-700 hover:underline">
              {s.publisher ?? url.hostname}<ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="font-medium text-slate-700">{s.publisher ?? s.url}</span>
          )}
          <blockquote className="mt-0.5 border-l-2 border-slate-200 pl-2 text-slate-600">{s.quote}</blockquote>
        </li>
        );
      })}
    </ul>
  );
}

/** Agent-recorded evidence: link only well-formed http(s) URLs. */
function safeWebUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function Claim({ fix }: { fix: ContentFix }) {
  const leagues = (fix.payload.leagues as Array<{ league: string; club: string; apps: number; goals: number }> | undefined) ?? null;
  if (fix.kind === 'stats' && leagues) {
    return (
      <table className="text-[13px]">
        <tbody>
          {leagues.map((r, i) => (
            <tr key={i}><td className="pr-3 text-slate-600">{r.league}</td><td className="pr-3 text-slate-800">{r.club}</td><td className="pr-2 tabular-nums">{r.apps} apps</td><td className="tabular-nums">{r.goals} goals</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <pre className="whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-[13px] text-slate-700">{JSON.stringify(fix.payload, null, 2)}</pre>;
}

/**
 * A person's decision with a reason. The revision is captured when the choice is opened: if the item changes while the
 * form is open (polling brings a new verification, an agent moves it), submitting is blocked until it is reopened.
 */
function DecisionForm<T extends string>({
  options, revision, onSubmit, pending, error, primary, expanded = true,
}: {
  options: Array<{ to: T; label: string }>;
  revision: number;
  onSubmit: (to: T, expectedRevision: number, reason: string, done: () => void) => void;
  pending: boolean;
  error: unknown;
  /** With a primary option, only that button shows until `expanded`; every option stays reachable. */
  primary?: T;
  expanded?: boolean;
}) {
  const [open, setOpen] = useState<{ to: T; revision: number } | null>(null);
  const [reason, setReason] = useState('');
  const stale = open !== null && open.revision !== revision;
  const lead = options.find((o) => o.to === primary) ?? (primary !== undefined ? options[0] : undefined);
  const shown = lead && !expanded ? [lead] : lead ? [lead, ...options.filter((o) => o !== lead)] : options;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {shown.map((o) => (
          <Button key={o.to} size="sm" variant={open?.to === o.to ? 'default' : 'outline'} className={cn('max-sm:h-9', open?.to !== o.to && 'shadow-none')} onClick={() => setOpen(open?.to === o.to ? null : { to: o.to, revision })}>{o.label}</Button>
        ))}
      </div>
      {open && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (stale) return;
            onSubmit(open.to, open.revision, reason, () => { setOpen(null); setReason(''); });
          }}
        >
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why (kept in the history)"
            aria-label="Reason"
            className="h-9 min-w-[12rem] flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm"
          />
          <Button type="submit" size="sm" className="max-sm:h-9" disabled={stale || reason.trim().length < 3 || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
          {stale && <span className="text-[13px] text-amber-800">This changed while you were deciding: close and reopen it.</span>}
          {!!error && <span className="text-[13px] text-red-700">{(error as Error).message}</span>}
        </form>
      )}
    </div>
  );
}

function GapActions({ gap, expanded }: { gap: ContentGap; expanded: boolean }) {
  const update = useUpdateContentGap();
  if (gap.status === 'proposed' || gap.status === 'verified') return null;
  const options: Array<{ to: ContentGapHumanTarget; label: string }> = [
    ...(gap.status !== 'held' ? [{ to: 'held' as const, label: 'Hold' }] : []),
    { to: 'junk', label: 'Not an answer' },
    { to: 'correct', label: 'Our verdict was right' },
    { to: 'wontfix', label: "Won't fix" },
    ...(gap.status !== 'open' && gap.status !== 'checking' ? [{ to: 'open' as const, label: 'Reopen' }] : []),
  ];
  return (
    <DecisionForm
      options={options}
      primary={primaryGapDecision(gap.status)}
      expanded={expanded}
      revision={gap.revision}
      pending={update.isPending}
      error={update.error}
      onSubmit={(to, expectedRevision, reason, done) => update.mutate({ id: gap.id, status: to, expectedRevision, reason }, { onSuccess: done })}
    />
  );
}

function FixActions({ fix }: { fix: ContentFix }) {
  const update = useUpdateContentFix();
  if (['published', 'failed', 'rolled_back'].includes(fix.status)) return null;
  const options: Array<{ to: ContentFixHumanTarget; label: string }> = [
    ...(fix.status !== 'rejected' ? [{ to: 'rejected' as const, label: 'Reject' }] : []),
    ...(fix.status !== 'held' ? [{ to: 'held' as const, label: 'Hold' }] : []),
    ...(fix.status === 'held' || fix.status === 'rejected' ? [{ to: 'proposed' as const, label: 'Send back to the verifier' }] : []),
  ];
  return (
    <DecisionForm
      options={options}
      revision={fix.revision}
      pending={update.isPending}
      error={update.error}
      onSubmit={(to, expectedRevision, reason, done) => update.mutate({ id: fix.id, status: to, expectedRevision, reason }, { onSuccess: done })}
    />
  );
}

function FixCard({ fix }: { fix: ContentFix }) {
  const ctx = fix.context as { title?: string; unit?: string; asOf?: string };
  const v = fix.verification;
  return (
    <Panel className="space-y-3 p-4">
      <div>
        <h3 className="text-[15px] font-semibold text-slate-950">{ctx.title ?? fix.boardKey}</h3>
        <div className="mt-0.5 text-[13px] text-slate-600">
          {fix.kind} · {fix.game}{ctx.asOf ? ` · as of ${ctx.asOf}` : ''} · proposed {formatRelative(fix.createdAt)} · <span className="tabular-nums">fix #{fix.id}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-600">
        <span className={HQ_LABEL}>Typed</span>
        {(fix.gaps ?? []).map((g) => <span key={g.id} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 tabular-nums">{g.norm} ×{g.count}</span>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <div className={HQ_LABEL}>Content Fixer</div>
          <Claim fix={fix} />
          <Sources items={fix.evidence} />
        </div>
        <div className="min-w-0 space-y-2">
          <div className={HQ_LABEL}>Content Verifier</div>
          {v ? (
            <>
              <div className="text-[13px] text-slate-700">
                Verdict <b>{v.verdict}</b> · {v.checks.matches ? 'same result' : 'different result'} · {v.checks.publishers} publisher{v.checks.publishers === 1 ? '' : 's'}
              </div>
              {!v.checks.matches && <pre className="whitespace-pre-wrap break-words rounded-md bg-amber-50 p-2 text-[13px] text-amber-900">{JSON.stringify(v.extracted, null, 2)}</pre>}
              <Sources items={v.sources} />
            </>
          ) : <div className="text-[13px] text-slate-500">Not checked yet.</div>}
        </div>
      </div>
      {(fix.audit ?? []).length > 0 && (
        <ul className="text-[13px] text-slate-600">
          {(fix.audit ?? []).map((a, i) => <li key={i}>{formatRelative(a.at)}: {a.from} → {a.to} — {a.reason}</li>)}
        </ul>
      )}
      <FixActions fix={fix} />
    </Panel>
  );
}

function FixesTab() {
  const [status, setStatus] = useState<ContentFixStatus>('held');
  const fixes = useContentFixes({ status, limit: 50 });
  return (
    <div className="space-y-3">
      <Tabs compact label="Fix state" items={FIX_TABS.map((t) => ({ key: t.status, label: t.label }))} value={status} onChange={setStatus} />
      {fixes.error && !fixes.data ? (
        <LoadErrorState error={fixes.error} fallback="Could not load the fixes." onRetry={() => void fixes.refetch()} />
      ) : fixes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !fixes.data?.length ? (
        <EmptyState>No fixes in this state.</EmptyState>
      ) : (
        <div className="space-y-3">{fixes.data.map((f) => <FixCard key={f.id} fix={f} />)}</div>
      )}
    </div>
  );
}

export default function ContentGapsPage() {
  const [tab, setTab] = useState<Tab>('queue');
  return (
    <div className={HQ_PAGE}>
      <PageHeader
        title="Content gaps"
        description="Answers players typed that our content could not judge, and the fixes the Content Fixer found and the Content Verifier re-checked. Nothing here changes the game yet."
        actions={<Tabs label="Content gaps sections" items={[{ key: 'queue' as const, label: 'Queue' }, { key: 'fixes' as const, label: 'Fixes' }]} value={tab} onChange={setTab} />}
      />
      <SummaryTiles />
      {tab === 'queue' ? (
        <Section title="Queue" description="Answers players typed that we could not judge. Open Review on a row for its ids, history and decisions.">
          <QueueTab />
        </Section>
      ) : (
        <Section title="Fixes" description="Fixes proposed for the gaps, each re-checked by a second agent.">
          <FixesTab />
        </Section>
      )}
    </div>
  );
}
