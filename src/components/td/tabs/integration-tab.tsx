'use client';

import { useState, type ReactNode } from 'react';
import { KeyRound, Loader2, RefreshCw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import { SESSION_CHANGED, TdApiError } from '@/lib/td/api-client';
import { tdAdmin, tdTokens } from '@/lib/td/client';
import type { WebhookEvent, WebhookEventDetail, WebhookEventList } from '@/lib/td/contract';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

type Status = WebhookEvent['status'];

const STATUS: Record<Status, { label: string; className: string }> = {
  sent: { label: 'Delivered', className: 'bg-(--td-new)/15 text-(--td-new)' },
  pending: { label: 'Retrying', className: 'bg-amber-400/15 text-amber-300' },
  dead: { label: 'Given up', className: 'bg-(--td-danger)/15 text-(--td-danger)' },
};

const TYPE_LABELS: Record<WebhookEvent['type'], string> = {
  score: 'Score',
  'match.settled': 'Match settled',
  'match.voided': 'Match voided',
  'match.corrected': 'Match corrected',
  'daily.completed': 'Daily completed',
  'practice.completed': 'Practice completed',
};

// Partner contract v1: delivery reasons, and the refusal codes a session init or launch will carry.
const REASON_CODES: Array<[code: string, meaning: string]> = [
  ['webhook_timeout', 'Betsson did not answer within 10 s'],
  ['webhook_http_<status>', 'Betsson answered with that non-2xx status'],
  ['webhook_dead_lettered', 'Given up after 24 hours of retries'],
  ['invalid_signature', 'HMAC signature does not match'],
  ['unknown_key', 'X-Partner-Key-Id is not an active key'],
  ['timestamp_skew', 'Timestamp outside ±300 s'],
  ['nonce_replayed', 'Nonce already used in the last 10 min'],
  ['ip_not_allowed', 'Source IP is not on the allowlist'],
  ['request_conflict', 'Same requestId, different payload'],
  ['player_blocked', 'Player is blocked or self-excluded'],
  ['rate_limited', 'Too many requests'],
];

function StatusChip({ event }: { event: Pick<WebhookEvent, 'status' | 'sending'> }) {
  const status = STATUS[event.status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', status.className)}>
      {event.sending && <Loader2 className="size-3 animate-spin" />}
      {event.sending ? 'Sending' : status.label}
    </span>
  );
}

export function TdIntegrationTab() {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [open, setOpen] = useState<string | null>(null);
  const events = useInfiniteQuery({
    queryKey: [...tdKeys.integration, 'webhooks', q, status],
    queryFn: ({ pageParam, signal }) => tdAdmin.integration.webhooks({ q: q || undefined, status: status || undefined, cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: WebhookEventList) => last.nextCursor ?? undefined,
  });
  const items = events.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <TdSection
        title="Webhook deliveries"
        description="Signed result events to Betsson, newest first: retried with backoff for 24 hours, then given up. Search by an exact event id, session id, Betsson player id or player id."
        actions={
          <>
            <form
              className="relative w-full sm:w-64"
              onSubmit={(event) => {
                event.preventDefault();
                setQ(text.trim());
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--td-text-3)" />
              <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Event, session or player id" aria-label="Search webhook events" className="h-10 rounded-full bg-(--td-input) pl-9" />
            </form>
            <select aria-label="Delivery status" value={status} onChange={(event) => setStatus(event.target.value as Status | '')} className="h-10 rounded-full border border-border bg-(--td-input) px-3 text-sm">
              <option value="">All</option>
              <option value="pending">Retrying</option>
              <option value="sent">Delivered</option>
              <option value="dead">Given up</option>
            </select>
          </>
        }
      >
        <TdErrorPanel error={events.error} className="m-5" />
        {events.isLoading && <p className="px-5 py-4 text-sm text-(--td-text-3)">Loading…</p>}
        {events.isSuccess && items.length === 0 && (
          <TdEmptyState icon={Send} title={q ? 'No event matches' : 'No webhook events yet'}>
            {q ? 'The search takes a whole id: an event id, a session id, a Betsson player id or a player id.' : undefined}
          </TdEmptyState>
        )}
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-(--td-divider) hover:bg-transparent">
                  {['Occurred', 'Event', 'Betsson player', 'Status', 'Attempts', 'Last error', 'Next attempt'].map((h) => (
                    <TableHead key={h} className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-(--td-text-3) first:pl-5">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.eventId} onClick={() => setOpen(e.eventId)} className={cn('cursor-pointer border-(--td-divider) hover:bg-secondary/40', open === e.eventId && 'bg-secondary/60')}>
                    <TableCell className="px-3 py-2.5 pl-5 text-xs text-(--td-text-2)">{formatGeorgiaTime(e.occurredAt)}</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <span className="block text-sm">{TYPE_LABELS[e.type]}</span>
                      <span className="block font-mono text-[11px] text-(--td-text-3)">{e.eventId}</span>
                    </TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs">{e.playerId}</TableCell>
                    <TableCell className="px-3 py-2.5">
                      <StatusChip event={e} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 tabular-nums">{e.attempts}</TableCell>
                    <TableCell className="px-3 py-2.5 font-mono text-xs text-(--td-text-2)">{e.lastError ?? '—'}</TableCell>
                    <TableCell className="px-3 py-2.5 text-xs text-(--td-text-3)">{e.nextAttemptAt ? formatGeorgiaTime(e.nextAttemptAt) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {events.hasNextPage && (
          <div className="border-t border-(--td-divider) px-5 py-3">
            <Button variant="secondary" size="sm" className="rounded-lg" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </TdSection>

      <TdSection title="Session inits and launches" description="POST /partner/v1/sessions/init from Betsson's servers, and the iframe's one-time token exchanges.">
        <TdEmptyState icon={KeyRound} title="Coming with the next admin contract">
          The admin API (contract v5) has no route for session inits or launches yet. They will show here, with their reason codes, once it does.
        </TdEmptyState>
      </TdSection>

      <TdSection title="Reason codes">
        <dl className="grid gap-x-8 gap-y-3 p-5 sm:grid-cols-2">
          {REASON_CODES.map(([code, meaning]) => (
            <div key={code} className="flex flex-col gap-0.5">
              <dt className="font-mono text-xs text-primary">{code}</dt>
              <dd className="text-sm text-(--td-text-2)">{meaning}</dd>
            </div>
          ))}
        </dl>
      </TdSection>

      <Sheet open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-border bg-(--td-surface) p-0 sm:max-w-3xl">
          {open && <WebhookDetail key={open} eventId={open} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** What a refused retry means here, in plain words (a conflict says why in the API's own message). */
export function retryRefusal(error: unknown): string {
  if (!(error instanceof TdApiError)) return 'The retry got no answer. Look at the event again before retrying.';
  switch (error.code) {
    case 'conflict':
      return error.message;
    case 'rate_limited':
      return 'You have retried 60 events in the last hour, the most one member may. Try again later.';
    case 'not_found':
      return 'This event no longer exists.';
    case 'forbidden':
      return 'Only Quizball ops can retry an event.';
    case SESSION_CHANGED:
      return 'You signed out or switched accounts; the retry was cancelled.';
    default:
      return error.message;
  }
}

function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-(--td-text-3)">{label}</dt>
      <dd className={cn('break-all text-sm', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  );
}

/**
 * How soon to look again: every few seconds while an attempt is on its way or due, then no later
 * than its next attempt (at most a minute apart) while it is pending; never once it is settled.
 */
export function pollInterval(detail: WebhookEventDetail | undefined, now: number = Date.now()): number | false {
  if (!detail) return false;
  if (detail.event.sending) return 3_000;
  if (detail.event.status !== 'pending' || detail.event.nextAttemptAt === null) return false;
  return Math.min(60_000, Math.max(3_000, Date.parse(detail.event.nextAttemptAt) - now));
}

function WebhookDetail({ eventId }: { eventId: string }) {
  const { user } = useTdAuth();
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const key = [...tdKeys.integration, 'event', eventId];
  const detail = useQuery({ queryKey: key, queryFn: ({ signal }) => tdAdmin.integration.webhook(eventId, { signal }), refetchInterval: (query) => pollInterval(query.state.data) });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirmRetarget, setConfirmRetarget] = useState(false);
  const d = detail.data;
  const e = d?.event;

  const retry = async (retarget: boolean) => {
    setRefusal(null);
    // Only under the member this page shows: a sign-in made meanwhile must not retry in their name.
    if (!user || tdTokens.read()?.staffId !== user.id) {
      setRefusal(retryRefusal(new TdApiError(0, SESSION_CHANGED, 'The session changed')));
      return;
    }
    setBusy(true);
    try {
      const next = await write((operation) => tdAdmin.integration.retryWebhook(eventId, retarget, operation), []);
      // The answer first, then a fresh read: the dispatcher may already have moved the event on.
      queryClient.setQueryData(key, next);
      void queryClient.invalidateQueries({ queryKey: tdKeys.integration });
      setConfirmRetarget(false);
      toast.success(retarget ? 'Moved to the current address and due now' : 'Due now: its 24 hours of retries start again');
    } catch (caught) {
      setRefusal(retryRefusal(caught));
      // A conflict means the event moved on (delivered, being sent): show it as it is now.
      if (caught instanceof TdApiError && caught.code === 'conflict') void detail.refetch();
    } finally {
      setBusy(false);
    }
  };

  const ops = user?.role === 'ops';
  return (
    <>
      <SheetHeader className="gap-1 border-b border-(--td-divider) px-6 pb-4 pt-5">
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {e ? TYPE_LABELS[e.type] : 'Webhook event'}
          {e && <StatusChip event={e} />}
        </SheetTitle>
        <SheetDescription asChild>
          <div className="text-xs text-(--td-text-3)">
            <span className="font-mono">{eventId}</span>
            {e && ` · occurred ${formatGeorgiaTime(e.occurredAt)} · ${e.partner} ${e.environment}`}
          </div>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 py-5">
        <TdErrorPanel error={detail.error} />
        {d && e && (
          <>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Session id" mono>
                {e.sessionId}
              </Fact>
              <Fact label="Betsson player id" mono>
                {e.playerId}
              </Fact>
              <Fact label="Player id" mono>
                {e.userId}
              </Fact>
              <Fact label="Match id" mono>
                {e.matchId ?? '—'}
              </Fact>
              <Fact label="Enqueued">{formatGeorgiaTime(e.enqueuedAt)}</Fact>
              <Fact label="Attempts">{e.attempts}</Fact>
              <Fact label="Next attempt">{e.nextAttemptAt ? formatGeorgiaTime(e.nextAttemptAt) : '—'}</Fact>
              <Fact label="Delivered at">{e.sentAt ? formatGeorgiaTime(e.sentAt) : '—'}</Fact>
              <Fact label="Given up at">{e.deadAt ? formatGeorgiaTime(e.deadAt) : '—'}</Fact>
              <Fact label="Retried by hand">{e.revivedAt ? formatGeorgiaTime(e.revivedAt) : '—'}</Fact>
              <Fact label="Last error" mono>
                {e.lastError ?? '—'}
              </Fact>
              <Fact label="Address" mono>
                {e.destination ?? 'not bound yet'}
                {!e.destinationCurrent && <span className="ml-2 rounded-full bg-amber-400/15 px-2 py-0.5 font-sans text-[11px] font-semibold text-amber-300">earlier address</span>}
              </Fact>
            </dl>

            {ops && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
                {e.status === 'sent' ? (
                  <p className="text-sm text-(--td-text-2)">Delivered: nothing to retry.</p>
                ) : e.sending ? (
                  <p className="text-sm text-(--td-text-2)">Being sent now; look again in a moment.</p>
                ) : e.destinationCurrent ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button className="rounded-lg" disabled={busy} onClick={() => void retry(false)}>
                      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      Retry now
                    </Button>
                    <p className="text-xs text-(--td-text-3)">Due at once, with 24 hours of retries from now. Recorded under your name.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-amber-200">
                      This event went to an earlier webhook address. A retry sends it to the address this deployment uses now, and it stays there.
                    </p>
                    {confirmRetarget ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button className="rounded-lg" disabled={busy} onClick={() => void retry(true)}>
                          {busy ? <Loader2 className="animate-spin" /> : <Send />}
                          Send to the current address
                        </Button>
                        <Button variant="ghost" className="rounded-lg" disabled={busy} onClick={() => setConfirmRetarget(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="secondary" className="w-fit rounded-lg" onClick={() => setConfirmRetarget(true)}>
                        <RefreshCw />
                        Retry to the current address
                      </Button>
                    )}
                  </div>
                )}
                {refusal && (
                  <p role="alert" className="text-sm text-(--td-danger)">
                    {refusal}
                  </p>
                )}
              </div>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Envelope sent</h3>
              <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-(--td-input) p-3 font-mono text-xs leading-relaxed">{JSON.stringify(d.payload, null, 2)}</pre>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">
                Attempts{e.attempts > d.attempts.length && <span className="font-normal text-(--td-text-3)"> (the latest {d.attempts.length} of {e.attempts})</span>}
              </h3>
              {d.attempts.length === 0 ? (
                <p className="text-sm text-(--td-text-3)">No attempt recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-(--td-divider) hover:bg-transparent">
                        {['#', 'Started', 'Latency', 'Result', 'Reason', 'Response'].map((h) => (
                          <TableHead key={h} className="h-9 px-3 text-xs text-(--td-text-3)">
                            {h}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.attempts.map((a) => (
                        <TableRow key={`${a.attempt}-${a.startedAt}`} className="border-(--td-divider) align-top hover:bg-transparent">
                          <TableCell className="px-3 py-2 tabular-nums text-(--td-text-3)">{a.attempt}</TableCell>
                          <TableCell className="px-3 py-2 text-xs">{formatGeorgiaTime(a.startedAt)}</TableCell>
                          <TableCell className="px-3 py-2 text-xs tabular-nums">{a.latencyMs === null ? '—' : `${a.latencyMs} ms`}</TableCell>
                          <TableCell className={cn('px-3 py-2 text-xs', a.delivered ? 'text-(--td-new)' : 'text-(--td-danger)')}>
                            {a.httpStatus !== null ? `HTTP ${a.httpStatus}` : (a.error ?? '—')}
                          </TableCell>
                          <TableCell className="px-3 py-2 font-mono text-xs">{a.reason ?? '—'}</TableCell>
                          <TableCell className="max-w-64 px-3 py-2">
                            {/* The partner's words as text, never markup (the API scrubs credentials out first). */}
                            {a.responseSnippet ? <code className="line-clamp-3 break-all font-mono text-[11px] text-(--td-text-2)">{a.responseSnippet}</code> : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
