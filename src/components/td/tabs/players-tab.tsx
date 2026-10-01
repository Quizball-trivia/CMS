'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Play, Search, SkipBack, SkipForward, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { TdIssueText } from '@/components/td/content/td-form';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { checkContract, type AdminLedgerList, type AdminMatchRecord, type AdminPlayerList, type AdminPlayerMatchList, type OpsReviewList, type SchemaIssue } from '@/lib/td/contract';
import { formatDay, formatGeorgiaTime } from '@/lib/td/georgia';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

const OUTCOME_STYLES = { win: 'text-(--td-new)', loss: 'text-(--td-danger)', noContest: 'text-(--td-text-3)' } as const;
const OUTCOME_LABELS = { win: 'Win', loss: 'Loss', noContest: 'No contest' } as const;

const signed = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n > 0 ? `+${n}` : String(n));

export function TdPlayersTab() {
  const { user } = useTdAuth();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [player, setPlayer] = useState<string | null>(null);
  const [match, setMatch] = useState<string | null>(null);
  const results = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'players', q],
    queryFn: ({ pageParam, signal }) => tdAdmin.players.search(q, { cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AdminPlayerList) => last.nextCursor ?? undefined,
    enabled: q !== '',
  });
  const found = results.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <TdSection
        title="Find a player"
        description="By nickname (its start, any case), Betsson player id or player id."
        actions={
          <form
            className="relative w-full sm:w-80"
            onSubmit={(event) => {
              event.preventDefault();
              setQ(text.trim());
              setPlayer(null);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Nickname or Betsson id" aria-label="Search players" className="h-10 rounded-full bg-(--td-input) pl-9" />
          </form>
        }
      >
        <TdErrorPanel error={results.error} className="m-5" />
        {!q && <TdEmptyState icon={Users} title="Search to see players" />}
        {results.isLoading && <p className="px-5 py-4 text-sm text-(--td-text-3)">Searching…</p>}
        {results.data && found.length === 0 && <TdEmptyState title="No player matches" />}
        {found.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-(--td-divider) hover:bg-transparent">
                  {['Nickname', 'Betsson id', 'Rating', 'Games', 'Status', 'Joined'].map((h) => (
                    <TableHead key={h} className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-(--td-text-3) first:pl-5">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {found.map((p) => (
                  <TableRow key={p.id} onClick={() => setPlayer(p.id)} className={cn('cursor-pointer border-(--td-divider) hover:bg-secondary/40', player === p.id && 'bg-secondary/60')}>
                    <TableCell className="px-3 py-2.5 pl-5 font-medium">{p.displayName}</TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs text-(--td-text-2)">{p.partnerPlayerId ?? `${p.provider}`}</TableCell>
                    <TableCell className="px-3 py-2.5 tabular-nums">{p.rating}</TableCell>
                    <TableCell className="px-3 py-2.5 tabular-nums">{p.games}</TableCell>
                    <TableCell className="px-3 py-2.5 text-xs capitalize">{p.status.replace('_', ' ')}</TableCell>
                    <TableCell className="px-3 py-2.5 text-xs text-(--td-text-3)">{formatGeorgiaTime(p.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {results.hasNextPage && (
          <div className="border-t border-(--td-divider) px-5 py-3">
            <Button variant="secondary" size="sm" className="rounded-lg" disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </TdSection>
      {player && <PlayerDetail key={player} id={player} onMatch={setMatch} />}
      {user?.role === 'ops' && <OpsReviews onMatch={setMatch} />}
      <Sheet open={match !== null} onOpenChange={(open) => !open && setMatch(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-border bg-(--td-surface) p-0 sm:max-w-3xl">
          {match && <MatchRecord key={match} id={match} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-(--td-text-3)">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-(--td-text-3)">{sub}</p>}
    </div>
  );
}

function PlayerDetail({ id, onMatch }: { id: string; onMatch: (id: string) => void }) {
  const [tab, setTab] = useState<'matches' | 'tickets'>('matches');
  const profile = useQuery({ queryKey: [...tdKeys.ops, 'player', id], queryFn: ({ signal }) => tdAdmin.players.get(id, { signal }) });
  const matches = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'player', id, 'matches'],
    queryFn: ({ pageParam, signal }) => tdAdmin.players.matches(id, { cursor: pageParam, limit: 25 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AdminPlayerMatchList) => last.nextCursor ?? undefined,
  });
  const tickets = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'player', id, 'tickets'],
    queryFn: ({ pageParam, signal }) => tdAdmin.players.tickets(id, { cursor: pageParam, limit: 25 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AdminLedgerList) => last.nextCursor ?? undefined,
    enabled: tab === 'tickets',
  });
  const p = profile.data;
  if (!p) return <TdErrorPanel error={profile.error} />;
  return (
    <TdSection title={p.displayName} description={`${p.partnerPlayerId ? `Betsson id ${p.partnerPlayerId} · ` : ''}${p.provider} · ${p.status.replace('_', ' ')} · joined ${formatGeorgiaTime(p.createdAt)} · last seen ${formatGeorgiaTime(p.lastSeenAt)}`}>
      <div className="flex flex-col gap-4 p-5">
        {p.liveMatchId && (
          <button type="button" onClick={() => onMatch(p.liveMatchId!)} className="w-fit rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary">
            In a match now: open it
          </button>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Rating" value={p.rating.rating} sub={`${p.rating.wins} W · ${p.rating.losses} L · ${p.rating.noContests} no contest`} />
          <Stat label="Streak" value={p.rating.streak} sub={`best ${p.rating.bestStreak}`} />
          <Stat label="Tickets today" value={`${p.tickets.balance} / ${p.tickets.perDay}`} sub={p.tickets.refilledOn ? `topped up ${formatDay(p.tickets.refilledOn)}` : 'never used'} />
          <Stat label="Dailies · practice" value={`${p.dailies.completed}/${p.dailies.attempts}`} sub={`${p.practice.runs} practice runs, best streak ${p.practice.bestStreak}`} />
        </div>
        <div className="flex gap-1" role="tablist">
          {(['matches', 'tickets'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1 text-sm capitalize', tab === t ? 'bg-(--td-input) text-foreground' : 'text-(--td-text-3)')}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'matches' ? (
          <>
            <TdErrorPanel error={matches.error} />
            <ul className="divide-y divide-(--td-divider) rounded-lg border border-border">
              {matches.data?.pages.flatMap((page) => page.items).map((m) => (
                <li key={m.matchId}>
                  <button type="button" onClick={() => onMatch(m.matchId)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-secondary/40">
                    <span className="w-32 text-xs tabular-nums text-(--td-text-3)">{formatGeorgiaTime(m.createdAt)}</span>
                    <span className="min-w-32 flex-1">vs {m.opponent.displayName}</span>
                    <span className="tabular-nums">{m.score ? `${m.score.mine} – ${m.score.theirs}` : '—'}</span>
                    <span className={cn('w-24 text-xs font-semibold', m.outcome ? OUTCOME_STYLES[m.outcome] : 'text-primary')}>{m.outcome ? OUTCOME_LABELS[m.outcome] : m.status}</span>
                    <span className="w-12 text-right text-xs tabular-nums">{signed(m.ratingDelta)}</span>
                    {m.resultVersion > 1 && <span className="text-xs text-amber-800">corrected</span>}
                  </button>
                </li>
              ))}
            </ul>
            {matches.data?.pages[0]?.items.length === 0 && <p className="text-sm text-(--td-text-3)">No matches yet.</p>}
            {matches.hasNextPage && (
              <Button variant="secondary" size="sm" className="w-fit rounded-lg" onClick={() => void matches.fetchNextPage()}>
                Load more
              </Button>
            )}
          </>
        ) : (
          <>
            <TdErrorPanel error={tickets.error} />
            <ul className="divide-y divide-(--td-divider) rounded-lg border border-border text-sm">
              {tickets.data?.pages.flatMap((page) => page.items).map((entry) => (
                <li key={entry.id} className="flex flex-wrap gap-x-4 px-3 py-2">
                  <span className="w-32 text-xs tabular-nums text-(--td-text-3)">{formatGeorgiaTime(entry.createdAt)}</span>
                  <span className={cn('w-10 tabular-nums', entry.delta > 0 ? 'text-(--td-new)' : 'text-(--td-danger)')}>{signed(entry.delta)}</span>
                  <span className="w-16 capitalize">{entry.reason}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-(--td-text-3)">{entry.ref}</span>
                  <span className="text-xs tabular-nums">balance {entry.balanceAfter}</span>
                </li>
              ))}
            </ul>
            {tickets.hasNextPage && (
              <Button variant="secondary" size="sm" className="w-fit rounded-lg" onClick={() => void tickets.fetchNextPage()}>
                Load more
              </Button>
            )}
          </>
        )}
      </div>
    </TdSection>
  );
}

/* ── a match's record, replay and correction ───────────────────────── */

export interface TdReplayStep {
  /** Milliseconds from the first input; null when the entry has no time. */
  offset: number | null;
  seat: string | null;
  kind: string;
  details: Record<string, unknown> | null;
  /** An entry this reader does not understand, as it came. */
  raw: unknown;
}

type Input = Record<string, unknown>;

/** One kept entry: the match queue's `<stamp µs>|<input JSON>` (the admin API passes it on as a string), or an object. */
function decodeEntry(entry: unknown): { stamp: number | null; input: Input } | null {
  if (typeof entry === 'string') {
    const m = /^(\d{1,20})\|([\s\S]*)$/.exec(entry);
    if (!m) return null;
    try {
      const input = JSON.parse(m[2]) as unknown;
      return input && typeof input === 'object' && !Array.isArray(input) ? { stamp: Number(m[1]), input: input as Input } : null;
    } catch {
      return null;
    }
  }
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const input = entry as Input;
    return { stamp: typeof input.at === 'number' ? input.at * 1000 : null, input };
  }
  return null;
}

/**
 * The kept input log as steps. Contract v4 types the entries as unknown (the
 * engine's queued inputs): `{kind: 'command', seat, command: {kind, …}}`,
 * `presence`, `ready`, `void`. Anything else is shown as it came.
 */
export function replaySteps(entries: unknown[]): TdReplayStep[] {
  const decoded = entries.map(decodeEntry);
  const first = decoded.find((d) => d?.stamp !== null && d?.stamp !== undefined)?.stamp ?? null;
  return entries.map((entry, i) => {
    const d = decoded[i];
    if (!d) return { offset: null, seat: null, kind: 'unknown', details: null, raw: entry };
    const offset = d.stamp !== null && first !== null ? Math.round((d.stamp - first) / 1000) : null;
    const { kind, seat, command, ...rest } = d.input;
    delete rest.at;
    if (kind === 'command' && command && typeof command === 'object') {
      const { kind: commandKind, seat: commandSeat, ...details } = command as Input;
      delete details.id;
      return {
        offset,
        seat: typeof seat === 'string' ? seat : typeof commandSeat === 'string' ? commandSeat : null,
        kind: typeof commandKind === 'string' ? commandKind : 'command',
        details: Object.keys(details).length ? details : null,
        raw: null,
      };
    }
    return { offset, seat: typeof seat === 'string' ? seat : null, kind: typeof kind === 'string' ? kind : 'unknown', details: Object.keys(rest).length ? rest : null, raw: null };
  });
}

const clock = (ms: number | null) => (ms === null ? '—' : `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}.${String(Math.floor((ms % 1000) / 100))}`);

const MISSING: Record<NonNullable<AdminMatchRecord['inputs']['missing']>, string> = {
  redis_lost: 'Its inputs were lost with the live state (a Redis restart), so it was voided.',
  never_started: 'It was voided before it started.',
  not_recorded: 'Its inputs were not kept.',
  archived: 'Its inputs are in the archive, which cannot be read just now. Try again in a moment.',
  expired: 'Its inputs were deleted from the archive, 730 days after the match.',
};

export function Replay({ record }: { record: AdminMatchRecord }) {
  const steps = useMemo(() => (record.inputs.entries ? replaySteps(record.inputs.entries) : []), [record.inputs.entries]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const atEnd = index >= steps.length - 1;
  const running = playing && !atEnd;
  useEffect(() => {
    if (!running) return;
    const gap = (steps[index + 1].offset ?? 0) - (steps[index].offset ?? 0);
    const timer = setTimeout(() => setIndex(index + 1), Math.min(1500, Math.max(120, gap / speed)));
    return () => clearTimeout(timer);
  }, [running, index, steps, speed]);
  const names = new Map(record.players.map((p) => [p.seat, p.displayName]));

  const archivedAt = record.inputs.archivedAt ? <p className="text-xs text-(--td-text-3)">Archived {formatGeorgiaTime(record.inputs.archivedAt)}</p> : null;

  if (!record.inputs.kept) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-(--td-text-3)">{record.inputs.missing ? MISSING[record.inputs.missing] : record.status === 'live' ? 'The match is live: its inputs are kept when it settles.' : 'No inputs were kept.'}</p>
        {archivedAt}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {archivedAt}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon-sm" aria-label="First step" onClick={() => setIndex(0)}>
          <SkipBack />
        </Button>
        <Button
          size="icon-sm"
          aria-label={running ? 'Pause' : 'Play'}
          onClick={() => {
            if (atEnd) setIndex(0);
            setPlaying(!running);
          }}
        >
          {running ? <Pause /> : <Play />}
        </Button>
        <Button variant="secondary" size="icon-sm" aria-label="Next step" disabled={index >= steps.length - 1} onClick={() => setIndex(index + 1)}>
          <SkipForward />
        </Button>
        <select aria-label="Speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} className="h-8 rounded-lg border border-border bg-(--td-input) px-2 text-xs">
          {[1, 4, 16].map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
        </select>
        <span className="text-xs tabular-nums text-(--td-text-3)">
          {steps.length ? index + 1 : 0} / {steps.length} · {clock(steps[index]?.offset ?? null)}
        </span>
      </div>
      <ol className="max-h-80 overflow-y-auto rounded-lg border border-border text-xs">
        {steps.map((step, i) => (
          <li key={i} className={cn('flex gap-3 border-b border-(--td-divider) px-3 py-1.5 last:border-0', i === index && 'bg-primary/10', i > index && 'opacity-40')}>
            <button type="button" className="w-14 text-left tabular-nums text-(--td-text-3)" onClick={() => setIndex(i)}>
              {clock(step.offset)}
            </button>
            <span className="w-24 truncate">{step.seat ? (names.get(step.seat as 'me' | 'op') ?? step.seat) : '—'}</span>
            <span className="w-20 font-medium">{step.kind}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-(--td-text-3)">{step.details ? JSON.stringify(step.details) : step.raw !== null ? JSON.stringify(step.raw) : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchRecord({ id }: { id: string }) {
  const { user } = useTdAuth();
  const record = useQuery({ queryKey: [...tdKeys.ops, 'match', id], queryFn: ({ signal }) => tdAdmin.matches.get(id, { signal }) });
  const r = record.data;
  return (
    <>
      <SheetHeader className="gap-1 border-b border-(--td-divider) px-6 pb-4 pt-5">
        <SheetTitle>{r ? r.players.map((p) => p.displayName).join(' vs ') : 'Match'}</SheetTitle>
        <SheetDescription asChild>
          <div className="text-xs text-(--td-text-3)">
            {r ? (
              <>
                <span className="capitalize">{r.status}</span>
                {r.decidedBy && ` · ${r.decidedBy}`}
                {r.score && ` · ${r.score.me} – ${r.score.op}`} · started {formatGeorgiaTime(r.createdAt)}
                {r.settledAt && ` · decided ${formatGeorgiaTime(r.settledAt)}`} · result v{r.resultVersion}
                {r.correctedAt && ` · corrected ${formatGeorgiaTime(r.correctedAt)}`} · release <span className="font-mono">{r.releaseId}</span>
              </>
            ) : (
              <span className="font-mono">{id}</span>
            )}
          </div>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 py-5">
        <TdErrorPanel error={record.error} />
        {r && (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-(--td-divider) hover:bg-transparent">
                    {['Player', 'Outcome', 'Rating', 'Ticket', 'Early forfeit'].map((h) => (
                      <TableHead key={h} className="h-9 px-3 text-xs text-(--td-text-3)">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.players.map((p) => (
                    <TableRow key={p.playerId} className="border-(--td-divider) hover:bg-transparent">
                      <TableCell className="px-3 py-2">
                        {p.displayName}
                        <span className="block font-mono text-xs text-(--td-text-3)">{p.partnerPlayerId ?? 'no Betsson id'}</span>
                      </TableCell>
                      <TableCell className={cn('px-3 py-2 text-sm font-semibold', p.outcome && OUTCOME_STYLES[p.outcome])}>{p.outcome ? OUTCOME_LABELS[p.outcome] : '—'}</TableCell>
                      <TableCell className="px-3 py-2 tabular-nums">{signed(p.ratingDelta)}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{p.ticketRefunded === null ? '—' : p.ticketRefunded ? 'Refunded' : 'Spent'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs">{p.earlyForfeit ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Replay</h3>
              <Replay record={r} />
            </section>
            {r.corrections.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Corrections</h3>
                <ul className="flex flex-col gap-2 text-sm">
                  {r.corrections.map((c) => (
                    <li key={c.id} className="rounded-lg border border-border p-3">
                      <p>
                        <span className="font-semibold capitalize">{c.kind === 'void' ? 'Voided' : 'Winner set'}</span> by {c.staff.name} at {formatGeorgiaTime(c.createdAt)} (result v{c.resultVersion})
                      </p>
                      <p className="mt-1 text-(--td-text-2)">“{c.reason}”</p>
                      {c.penaltiesToReview.length > 0 && <p className="mt-1 text-xs text-amber-800">{c.penaltiesToReview.length} later penalty(ies) to review</p>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Rating events, tickets and result deliveries</summary>
              <div className="flex flex-col gap-3 border-t border-(--td-divider) p-3 text-xs">
                {r.players.map((p) => (
                  <div key={p.playerId}>
                    <p className="font-semibold">{p.displayName}</p>
                    {p.ratingEvents.map((e) => (
                      <p key={e.seq} className="tabular-nums text-(--td-text-2)">
                        #{e.seq} rule {signed(e.deltaRule)} applied {signed(e.appliedDelta)} → {e.ratingAfter}
                        {e.correctionId && ' (correction)'} · {formatGeorgiaTime(e.at)}
                      </p>
                    ))}
                    {p.tickets.map((t) => (
                      <p key={t.id} className="text-(--td-text-2)">
                        ticket {signed(t.delta)} {t.reason} · balance {t.balanceAfter}
                      </p>
                    ))}
                    {p.deliveries.map((d) => (
                      <p key={d.resultVersion} className="text-(--td-text-3)">
                        result v{d.resultVersion}: {d.ackedAt ? `seen ${formatGeorgiaTime(d.ackedAt)}` : d.supersededAt ? 'replaced before it was seen' : `not seen yet (${d.attempts} attempts)`}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </details>
            {user?.role === 'ops' && <CorrectionForm record={r} />}
          </>
        )}
      </div>
    </>
  );
}

/**
 * A correction is written at the result version the operator reviewed. If the
 * record refreshes to another version (someone corrected it meanwhile) the
 * draft is flagged and cannot be sent until the operator reviews the new
 * result: the version is never swapped under a draft or a confirmation.
 */
export function CorrectionForm({ record }: { record: AdminMatchRecord }) {
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const [reviewed, setReviewed] = useState(record.resultVersion);
  const [kind, setKind] = useState<'void' | 'win'>('void');
  const [winner, setWinner] = useState(record.players[0]?.playerId ?? '');
  const [reason, setReason] = useState('');
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  if (record.status !== 'settled' && record.status !== 'void') return <p className="text-xs text-(--td-text-3)">A correction is possible once the match is decided.</p>;
  const moved = record.resultVersion !== reviewed;
  const latest = record.corrections.at(-1);
  const body = { version: reviewed, outcome: kind === 'void' ? { kind: 'void' as const } : { kind: 'win' as const, winner }, reason: reason.trim() };
  // Any change to the draft asks for confirmation again.
  const edit = (apply: () => void) => {
    apply();
    setConfirming(false);
  };
  const submit = async () => {
    if (moved) return;
    const found = checkContract('MatchCorrectionRequest', body);
    setIssues(found);
    if (found.length) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await write((operation) => tdAdmin.matches.correct(record.id, body, operation), [tdKeys.ops]);
      setReviewed(next.resultVersion);
      queryClient.setQueryData([...tdKeys.ops, 'match', record.id], next);
      toast.success(kind === 'void' ? 'Voided: both tickets refunded' : 'Winner set');
      setReason('');
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'revision_conflict') await queryClient.invalidateQueries({ queryKey: [...tdKeys.ops, 'match', record.id] });
      setError(caught);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-(--td-danger)/30 p-4">
      <h3 className="text-sm font-semibold">Correct the result (ops)</h3>
      <p className="text-xs text-(--td-text-3)">Both players’ ratings are recomputed from this match on; a void refunds both tickets. The players see the corrected result, and Betsson gets it.</p>
      {moved && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <span className="min-w-0 flex-1">
            The result changed while you were reviewing it: now result v{record.resultVersion}
            {latest ? ` (${latest.kind === 'void' ? 'voided' : 'winner set'} by ${latest.staff.name})` : ''}. Check the record above before correcting it again.
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-lg"
            onClick={() => {
              setReviewed(record.resultVersion);
              setConfirming(false);
              setError(null);
            }}
          >
            Review the new result
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        {(['void', 'win'] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="radio" name="correction-kind" checked={kind === k} onChange={() => edit(() => setKind(k))} className="accent-(--td-primary)" />
            {k === 'void' ? 'Void (no contest, refund both)' : 'Set the winner'}
          </label>
        ))}
      </div>
      {kind === 'win' && (
        <select aria-label="Winner" value={winner} onChange={(event) => edit(() => setWinner(event.target.value))} className="h-10 w-fit rounded-lg border border-border bg-(--td-input) px-3 text-sm">
          {record.players.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.displayName}
            </option>
          ))}
        </select>
      )}
      <label className="flex flex-col gap-1.5 text-xs font-medium text-(--td-text-3)">
        Reason (kept with the correction; up to 500 characters)
        <Textarea value={reason} onChange={(event) => edit(() => setReason(event.target.value))} className="min-h-16 rounded-lg border-border bg-(--td-input) text-sm text-foreground" />
      </label>
      <TdIssueText issues={issues} />
      <TdErrorPanel error={error} />
      <div className="flex gap-2">
        <Button variant={confirming ? 'destructive' : 'secondary'} className="w-fit rounded-lg" disabled={busy || moved} onClick={() => void submit()}>
          {busy && <Loader2 className="animate-spin" />}
          {confirming ? `Confirm: ${kind === 'void' ? 'void this match' : 'set the winner'} (result v${reviewed})` : 'Correct the result'}
        </Button>
        {confirming && (
          <Button variant="ghost" className="rounded-lg" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}

export function OpsReviews({ onMatch }: { onMatch: (id: string) => void }) {
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const reviews = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'reviews', status],
    queryFn: ({ pageParam, signal }) => tdAdmin.reviews.list(status, { cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: OpsReviewList) => last.nextCursor ?? undefined,
  });
  const items = reviews.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <TdSection
      title="Early-quit penalties to re-check"
      description="A player who quits matches early too often in one day is penalised. If one of that day's matches is voided later, the count drops and a penalty may no longer be deserved. Open the match to correct it, or dismiss the entry with a note."
      actions={
        <select aria-label="Which reviews" value={status} onChange={(event) => setStatus(event.target.value as 'open' | 'all')} className="h-9 rounded-full border border-border bg-(--td-input) px-3 text-sm">
          <option value="open">Open</option>
          <option value="all">All</option>
        </select>
      }
    >
      <TdErrorPanel error={reviews.error} className="m-5" />
      {reviews.isSuccess && items.length === 0 && <TdEmptyState title="Nothing to review" />}
      <ul className="divide-y divide-(--td-divider)">
        {items.map((review) => (
          <ReviewRow key={review.id} review={review} onMatch={onMatch} />
        ))}
      </ul>
      {reviews.hasNextPage && (
        <div className="border-t border-(--td-divider) px-5 py-3">
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={reviews.isFetchingNextPage} onClick={() => void reviews.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </TdSection>
  );
}

function ReviewRow({ review, onMatch }: { review: OpsReviewList['items'][number]; onMatch: (id: string) => void }) {
  const write = useTdWrite();
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const dismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      await write((operation) => tdAdmin.reviews.dismiss(review.id, note.trim(), operation), [tdKeys.ops]);
      toast.success('Dismissed');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="flex flex-col gap-2 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="tabular-nums text-(--td-text-3)">{formatDay(review.georgiaDate)}</span>
        <span>
          Counted {review.countedThen ?? '?'} then, {review.countedNow} now · raised by a {review.source}
        </span>
        <button type="button" className="text-primary underline" onClick={() => onMatch(review.matchId)}>
          Open the match
        </button>
        <span className="text-xs capitalize text-(--td-text-3)">{review.status}</span>
      </div>
      {review.status === 'open' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why nothing needs correcting" aria-label="Dismissal note" className="h-9 max-w-md rounded-lg bg-(--td-input)" />
          <Button variant="secondary" size="sm" className="rounded-lg" disabled={busy || !note.trim()} onClick={() => void dismiss()}>
            Dismiss
          </Button>
        </div>
      ) : (
        review.note && <p className="text-xs text-(--td-text-3)">“{review.note}” · {review.closedBy?.name}</p>
      )}
      <TdErrorPanel error={error} />
    </li>
  );
}
