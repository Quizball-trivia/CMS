'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, FileSearch, ListChecks, Loader2, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContentFixes, useContentGaps, useContentGapsSummary, useUpdateContentFix, useUpdateContentGap } from '@/hooks';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/hq-board';
import type { ContentFix, ContentFixHumanTarget, ContentFixStatus, ContentGap, ContentGapHumanTarget, ContentGapStatus, ContentGapVerdict } from '@/types';
import { EmptyState, LoadErrorState, PageHeader } from '../hq-ui';

type Tab = 'queue' | 'fixes';

const VERDICT_LABEL: Record<ContentGapVerdict, string> = {
  unknown: 'Name not known',
  uncovered: 'No data for him',
  ambiguous: 'Several people',
  miss: 'Refused',
  reported: 'Player report',
};
const GAP_TABS: Array<{ status: ContentGapStatus; label: string }> = [
  { status: 'open', label: 'Open' },
  { status: 'checking', label: 'Being checked' },
  { status: 'proposed', label: 'Fix proposed' },
  { status: 'verified', label: 'Verified' },
  { status: 'held', label: 'Needs you' },
  { status: 'fixed', label: 'Fixed' },
  { status: 'junk', label: 'Not an answer' },
  { status: 'correct', label: 'Our verdict was right' },
  { status: 'wontfix', label: "Won't fix" },
];
const FIX_TABS: Array<{ status: ContentFixStatus; label: string }> = [
  { status: 'proposed', label: 'Waiting for the verifier' },
  { status: 'held', label: 'Needs you' },
  { status: 'verified', label: 'Verified' },
  { status: 'rejected', label: 'Rejected' },
];
const STATUS_TONE: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700', checking: 'bg-sky-100 text-sky-800', proposed: 'bg-violet-100 text-violet-800',
  verified: 'bg-emerald-100 text-emerald-800', held: 'bg-amber-100 text-amber-900', rejected: 'bg-rose-100 text-rose-800',
  fixed: 'bg-emerald-100 text-emerald-800', junk: 'bg-slate-100 text-slate-500', correct: 'bg-slate-100 text-slate-500', wontfix: 'bg-slate-100 text-slate-500',
};

function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tone ?? 'bg-slate-100 text-slate-700')}>{children}</span>;
}

function Tabs<T extends string>({ items, value, onChange, label }: { items: Array<{ key: T; label: string; count?: number }>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-xs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors', value === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{t.count}</span>}
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {byGame.map(([game, g]) => (
        <div key={game} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{game}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{g.open}</div>
          <div className="text-xs text-slate-500">open gaps · typed {g.typed.toLocaleString()}× · {g.fixed} fixed/verified</div>
        </div>
      ))}
    </div>
  );
}

function GapRow({ gap }: { gap: ContentGap }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-3 text-sm tabular-nums text-slate-900">{gap.count}</td>
      <td className="py-2 pr-3 text-sm">
        <div className="font-medium text-slate-900">{gap.game}</div>
        <div className="max-w-[14rem] truncate text-xs text-slate-500" title={gap.boardKey}>{gap.boardKey}</div>
      </td>
      <td className="py-2 pr-3"><Pill>{VERDICT_LABEL[gap.verdict]}</Pill></td>
      <td className="py-2 pr-3 text-sm text-slate-800">
        <div className="flex flex-wrap gap-1">
          {gap.samples.length ? gap.samples.map((s) => (
            <span key={`${s.locale}:${s.typed}`} className="rounded bg-slate-50 px-1.5 py-0.5 text-xs ring-1 ring-slate-200">
              <span className="mr-1 uppercase text-slate-400">{s.locale}</span>{s.typed}
            </span>
          )) : <span className="text-xs text-slate-400">{gap.norm}</span>}
        </div>
        {(gap.resolvedId || gap.candidateIds?.length) && (
          <div className="mt-1 text-xs text-slate-500">
            {gap.resolvedId ? <>read as <code>{gap.resolvedId}</code></> : <>could be {gap.candidateIds!.slice(0, 4).map((c) => <code key={c} className="mr-1">{c}</code>)}</>}
          </div>
        )}
      </td>
      <td className="py-2 pr-3"><Pill tone={STATUS_TONE[gap.status]}>{gap.status}</Pill></td>
      <td className="py-2 pr-3 text-xs text-slate-500">{formatRelative(gap.lastSeen)}</td>
      <td className="py-2">
        <GapActions gap={gap} />
        {(gap.audit ?? []).length > 0 && (
          <ul className="mt-1 text-xs text-slate-500">
            {(gap.audit ?? []).map((a, i) => <li key={i}>{formatRelative(a.at)}: {a.from} → {a.to} — {a.reason}</li>)}
          </ul>
        )}
      </td>
    </tr>
  );
}

function QueueTab() {
  const [status, setStatus] = useState<ContentGapStatus>('open');
  const [game, setGame] = useState('');
  const gaps = useContentGaps({ status, game: game || undefined, limit: 100 });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs label="Gap state" items={GAP_TABS.map((t) => ({ key: t.status, label: t.label }))} value={status} onChange={setStatus} />
        <input
          value={game}
          onChange={(e) => setGame(e.target.value.trim())}
          placeholder="Game (e.g. darts501)"
          aria-label="Filter by game"
          className="h-9 w-48 rounded-lg border border-slate-200 px-3 text-sm"
        />
      </div>
      {gaps.error && !gaps.data ? (
        <LoadErrorState error={gaps.error} fallback="Could not load the content gaps." onRetry={() => void gaps.refetch()} />
      ) : gaps.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !gaps.data?.length ? (
        <EmptyState><SearchX className="mx-auto mb-2 h-6 w-6 text-slate-400" />No gaps in this state.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <table className="w-full min-w-[56rem] text-left">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3 font-medium">Typed</th><th className="pb-2 pr-3 font-medium">Board</th><th className="pb-2 pr-3 font-medium">Why</th>
                <th className="pb-2 pr-3 font-medium">What players typed</th><th className="pb-2 pr-3 font-medium">State</th><th className="pb-2 pr-3 font-medium">Last</th><th className="pb-2 font-medium">Decide</th>
              </tr>
            </thead>
            <tbody>{gaps.data.map((g) => <GapRow key={g.id} gap={g} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Sources({ items }: { items: ContentFix['evidence'] }) {
  if (!items?.length) return <div className="text-xs text-slate-400">No sources.</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => {
        const url = safeWebUrl(s.url);
        return (
        <li key={`${s.url}-${i}`} className="text-xs">
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
      <table className="text-xs">
        <tbody>
          {leagues.map((r, i) => (
            <tr key={i}><td className="pr-3 text-slate-500">{r.league}</td><td className="pr-3 text-slate-800">{r.club}</td><td className="pr-2 tabular-nums">{r.apps} apps</td><td className="tabular-nums">{r.goals} goals</td></tr>
          ))}
        </tbody>
      </table>
    );
  }
  return <pre className="whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs text-slate-700">{JSON.stringify(fix.payload, null, 2)}</pre>;
}

/**
 * A person's decision with a reason. The revision is captured when the choice is opened: if the item changes while the
 * form is open (polling brings a new verification, an agent moves it), submitting is blocked until it is reopened.
 */
function DecisionForm<T extends string>({
  options, revision, onSubmit, pending, error,
}: {
  options: Array<{ to: T; label: string }>;
  revision: number;
  onSubmit: (to: T, expectedRevision: number, reason: string, done: () => void) => void;
  pending: boolean;
  error: unknown;
}) {
  const [open, setOpen] = useState<{ to: T; revision: number } | null>(null);
  const [reason, setReason] = useState('');
  const stale = open !== null && open.revision !== revision;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.to} size="sm" variant={open?.to === o.to ? 'default' : 'outline'} onClick={() => setOpen(open?.to === o.to ? null : { to: o.to, revision })}>{o.label}</Button>
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
            className="h-9 min-w-[16rem] flex-1 rounded-lg border border-slate-200 px-3 text-sm"
          />
          <Button type="submit" size="sm" disabled={stale || reason.trim().length < 3 || pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
          </Button>
          {stale && <span className="text-xs text-amber-800">This changed while you were deciding: close and reopen it.</span>}
          {!!error && <span className="text-xs text-rose-700">{(error as Error).message}</span>}
        </form>
      )}
    </div>
  );
}

function GapActions({ gap }: { gap: ContentGap }) {
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
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900">#{fix.id} · {fix.kind} · {fix.game}</div>
          <div className="text-xs text-slate-500">{ctx.title ?? fix.boardKey}{ctx.asOf ? ` · as of ${ctx.asOf}` : ''} · proposed {formatRelative(fix.createdAt)}</div>
        </div>
        <Pill tone={STATUS_TONE[fix.status]}>{fix.status}</Pill>
      </div>
      <div className="flex flex-wrap gap-1 text-xs text-slate-600">
        Typed: {(fix.gaps ?? []).map((g) => <span key={g.id} className="rounded bg-slate-50 px-1.5 ring-1 ring-slate-200">{g.norm} ×{g.count}</span>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content Fixer</div>
          <Claim fix={fix} />
          <Sources items={fix.evidence} />
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Content Verifier</div>
          {v ? (
            <>
              <div className="text-xs text-slate-700">
                Verdict <b>{v.verdict}</b> · {v.checks.matches ? 'same result' : 'different result'} · {v.checks.publishers} publisher{v.checks.publishers === 1 ? '' : 's'}
              </div>
              {!v.checks.matches && <pre className="whitespace-pre-wrap break-words rounded bg-amber-50 p-2 text-xs text-amber-900">{JSON.stringify(v.extracted, null, 2)}</pre>}
              <Sources items={v.sources} />
            </>
          ) : <div className="text-xs text-slate-400">Not checked yet.</div>}
        </div>
      </div>
      {(fix.audit ?? []).length > 0 && (
        <ul className="text-xs text-slate-500">
          {(fix.audit ?? []).map((a, i) => <li key={i}>{formatRelative(a.at)}: {a.from} → {a.to} — {a.reason}</li>)}
        </ul>
      )}
      <FixActions fix={fix} />
    </div>
  );
}

function FixesTab() {
  const [status, setStatus] = useState<ContentFixStatus>('held');
  const fixes = useContentFixes({ status, limit: 50 });
  return (
    <div className="space-y-3">
      <Tabs label="Fix state" items={FIX_TABS.map((t) => ({ key: t.status, label: t.label }))} value={status} onChange={setStatus} />
      {fixes.error && !fixes.data ? (
        <LoadErrorState error={fixes.error} fallback="Could not load the fixes." onRetry={() => void fixes.refetch()} />
      ) : fixes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : !fixes.data?.length ? (
        <EmptyState><ListChecks className="mx-auto mb-2 h-6 w-6 text-slate-400" />No fixes in this state.</EmptyState>
      ) : (
        <div className="space-y-3">{fixes.data.map((f) => <FixCard key={f.id} fix={f} />)}</div>
      )}
    </div>
  );
}

export default function ContentGapsPage() {
  const [tab, setTab] = useState<Tab>('queue');
  return (
    <div className="space-y-5">
      <PageHeader
        icon={<FileSearch className="h-6 w-6 text-slate-700" />}
        title="Content gaps"
        description="Answers players typed that our content could not judge, and the fixes the Content Fixer found and the Content Verifier re-checked. Nothing here changes the game yet."
      />
      <SummaryTiles />
      <Tabs label="Content gaps sections" items={[{ key: 'queue' as const, label: 'Queue' }, { key: 'fixes' as const, label: 'Fixes' }]} value={tab} onChange={setTab} />
      {tab === 'queue' ? <QueueTab /> : <FixesTab />}
    </div>
  );
}
