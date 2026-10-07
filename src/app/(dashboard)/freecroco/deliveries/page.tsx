'use client';

import { Fragment, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, RotateCw, Send } from 'lucide-react';
import { useAuth } from '@/providers';
import { useFreecrocoAttempts, useFreecrocoDeliveries, useResendFreecrocoDelivery } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canResendDeliveries } from '@/lib/freecroco/access';
import { isNotResendable, NOT_RESENDABLE_MESSAGE } from '@/lib/freecroco/errors';
import { GAME_LABELS, PARTNER_GAME_IDS } from '@/lib/freecroco/games';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { getErrorFeedback } from '@/lib/error-feedback';
import type { DeliveriesQuery, DeliveryItem, DeliveryStatus, PartnerGameId } from '@/types/freecroco';

const ANY = 'any';
const STATUSES: DeliveryStatus[] = ['pending', 'sent', 'dead'];

interface FilterDraft {
  status: DeliveryStatus | typeof ANY;
  gameId: PartnerGameId | typeof ANY;
  playerId: string;
  from: string;
  to: string;
}

const EMPTY: FilterDraft = { status: ANY, gameId: ANY, playerId: '', from: '', to: '' };

function toQuery(f: FilterDraft): Omit<DeliveriesQuery, 'cursor'> {
  return {
    status: f.status === ANY ? undefined : f.status,
    gameId: f.gameId === ANY ? undefined : f.gameId,
    playerId: f.playerId.trim() || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
  };
}

const STATUS_LABELS: Record<DeliveryStatus, string> = { sent: 'Sent', pending: 'Pending', dead: 'Failed' };

function StatusBadge({ status }: { status: DeliveryStatus }) {
  if (status === 'sent') return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Sent</Badge>;
  if (status === 'dead') return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Failed</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
}

/** qb_72fc8a70-…-7b48ed72504e → qb_72fc8a70…504e; the full id is in the tooltip and copied on click. */
function shortEventId(eventId: string): string {
  return eventId.length > 20 ? `${eventId.slice(0, 11)}…${eventId.slice(-4)}` : eventId;
}

/** "6 Oct, 14:40" in Georgia time. */
function shortGeorgiaTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tbilisi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

export default function FreecrocoDeliveriesPage() {
  const { user } = useAuth();
  const canResend = canResendDeliveries(user?.role);
  // Filters apply on demand, so typing a player id does not fire a request per keystroke.
  const [draft, setDraft] = useState<FilterDraft>(EMPTY);
  const [applied, setApplied] = useState<FilterDraft>(EMPTY);
  const [expanded, setExpanded] = useState<string | null>(null);

  const deliveries = useFreecrocoDeliveries(toQuery(applied));
  const resend = useResendFreecrocoDelivery();
  // The same filters give the query the same key, so a state change would send nothing: ask again.
  const applyFilters = (next: FilterDraft) => {
    setExpanded(null);
    if (JSON.stringify(toQuery(next)) === JSON.stringify(toQuery(applied))) void deliveries.refetch();
    setApplied(next);
  };
  const items = deliveries.data?.pages.flatMap((page) => page.items) ?? [];

  const handleResend = async (item: DeliveryItem) => {
    if (!window.confirm(`Resend event ${item.eventId} to Freecroco?\n\nIt is sent again with the same event id.`)) return;
    try {
      await resend.mutateAsync(item.eventId);
      toast.success('Resend queued');
    } catch (err) {
      if (isNotResendable(err)) {
        // The list is stale: the hook already refetched it, so the row now shows its real status.
        toast.warning(NOT_RESENDABLE_MESSAGE);
        return;
      }
      const feedback = getErrorFeedback(err, 'Failed to resend');
      toast.error(feedback.title, { description: feedback.description });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Send className="size-6 text-gray-700" />
        <h1 className="text-2xl font-semibold text-gray-900">Freecroco deliveries</h1>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        Score events sent to Freecroco. Open a row to see each attempt. Times are Georgia time.
      </p>

      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(draft);
        }}
      >
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as FilterDraft['status'] })}>
            <SelectTrigger className="w-full" aria-label="Status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Game</Label>
          <Select value={draft.gameId} onValueChange={(v) => setDraft({ ...draft, gameId: v as FilterDraft['gameId'] })}>
            <SelectTrigger className="w-full" aria-label="Game"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any game</SelectItem>
              {PARTNER_GAME_IDS.map((id) => (
                <SelectItem key={id} value={id}>{GAME_LABELS[id]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fc-player">Player id</Label>
          <Input id="fc-player" value={draft.playerId} onChange={(e) => setDraft({ ...draft, playerId: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fc-from">From</Label>
          <Input id="fc-from" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fc-to">To</Label>
          <Input id="fc-to" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              applyFilters(EMPTY);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {deliveries.isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : deliveries.error && items.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-red-500">Failed to load deliveries.</p>
          <Button variant="outline" size="sm" disabled={deliveries.isFetching} onClick={() => void deliveries.refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No deliveries match.
        </div>
      ) : (
        <>
          <Table className="text-sm [&_td]:py-1.5 [&_th]:h-9">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Game</TableHead>
                <TableHead className="w-16 text-right">Score</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Event</TableHead>
                {canResend && <TableHead className="w-24 text-right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const open = expanded === item.eventId;
                return (
                  <Fragment key={item.eventId}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} attempts for ${item.eventId}`}
                          onClick={() => setExpanded(open ? null : item.eventId)}
                        >
                          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500" title={formatGeorgiaTime(item.occurredAt)}>
                        {shortGeorgiaTime(item.occurredAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.playerId}</TableCell>
                      <TableCell className="whitespace-nowrap">{GAME_LABELS[item.gameId]}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.score}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <StatusBadge status={item.status} />
                          <span className="text-xs text-gray-500">
                            {item.attempts} {item.attempts === 1 ? 'try' : 'tries'}
                            {item.lastHttpStatus !== null && item.lastHttpStatus !== undefined ? ` · ${item.lastHttpStatus}` : ''}
                          </span>
                        </div>
                        {item.lastError && (
                          <p className="max-w-[16rem] truncate text-xs text-red-600" title={item.lastError}>{item.lastError}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="font-mono text-xs text-gray-500 hover:text-gray-900"
                          title={`${item.eventId} (click to copy)`}
                          onClick={() => {
                            void navigator.clipboard?.writeText(item.eventId).then(() => toast.success('Event id copied'), () => undefined);
                          }}
                        >
                          {shortEventId(item.eventId)}
                        </button>
                      </TableCell>
                      {canResend && (
                        <TableCell className="text-right">
                          {item.status === 'dead' && (
                            <Button variant="outline" size="sm" disabled={resend.isPending} onClick={() => handleResend(item)}>
                              <RotateCw className="size-3.5" /> Resend
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={canResend ? 7 : 6}>
                          <Attempts eventId={item.eventId} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          {deliveries.error && <p className="text-sm text-red-600">Could not load more deliveries. Try again.</p>}
          {deliveries.hasNextPage && (
            <Button variant="outline" onClick={() => deliveries.fetchNextPage()} disabled={deliveries.isFetchingNextPage}>
              {deliveries.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Attempts({ eventId }: { eventId: string }) {
  const { data, isLoading, error } = useFreecrocoAttempts(eventId, true);
  if (isLoading) return <p className="text-xs text-gray-400">Loading attempts…</p>;
  if (error) return <p className="text-xs text-red-500">Failed to load attempts.</p>;
  if (!data || data.length === 0) return <p className="text-xs text-gray-400">No attempts yet; waiting for the first one.</p>;
  return (
    <ol className="space-y-1 text-xs">
      {data.map((attempt) => (
        <li key={attempt.attempt} className="flex flex-wrap gap-x-3">
          <span className="w-6 text-gray-400">#{attempt.attempt}</span>
          <span className="text-gray-600">{formatGeorgiaTime(attempt.attemptedAt)}</span>
          <span className={attempt.httpStatus !== null && attempt.httpStatus < 300 ? 'text-green-700' : 'text-red-600'}>
            {attempt.httpStatus ?? 'no response'}
          </span>
          {attempt.latencyMs !== null && <span className="text-gray-400">{attempt.latencyMs} ms</span>}
          {attempt.error && <span className="text-gray-500">{attempt.error}</span>}
        </li>
      ))}
    </ol>
  );
}
