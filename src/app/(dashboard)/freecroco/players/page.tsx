'use client';

import { useState } from 'react';
import { Ban, ChevronLeft, ChevronRight, Search, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useDebouncedValue, useFreecrocoPlayer, useFreecrocoPlayers, useSetFreecrocoPlayerStatus } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useFcText } from '@/lib/freecroco/i18n';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { cn } from '@/lib/utils';
import { ApiClientError } from '@/services';
import type { PartnerPlayerListItem, PlayerStatusAction, PlayerStatusFilter } from '@/types/freecroco';

const PAGE_SIZE = 50;
const REASON_MAX = 200;
const FILTERS: Array<{ value: PlayerStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Banned' },
];

interface PendingChange {
  player: Pick<PartnerPlayerListItem, 'playerId' | 'displayName'>;
  action: PlayerStatusAction;
}

export default function FreecrocoPlayersPage() {
  const { t } = useFcText();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PlayerStatusFilter>('all');
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const debounced = useDebouncedValue(search.trim(), 300);
  const { data, isLoading, error } = useFreecrocoPlayers({
    search: debounced || undefined,
    status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="size-6 text-gray-700" />
        <h1 className="text-2xl font-semibold text-gray-900">{t('Freecroco players')}</h1>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        {t("Everyone who has opened Quizball from Freecroco. Banning ends a player's open game at once and stops them opening Quizball until they are unbanned.")}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-sm space-y-1.5">
          <Label htmlFor="fc-player-search">{t('Search')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <Input
              id="fc-player-search"
              className="pl-8"
              placeholder={t('Freecroco player id or name')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </div>
        </div>
        <div className="flex gap-1" role="group" aria-label={t('Status')}>
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={status === f.value ? 'default' : 'outline'}
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(0);
              }}
            >
              {t(f.label)}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{t('Failed to load players.')}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Player')}</TableHead>
            <TableHead className="w-56">{t('Status')}</TableHead>
            <TableHead className="w-20 text-right">{t('Plays')}</TableHead>
            <TableHead className="w-44">{t('First seen')}</TableHead>
            <TableHead className="w-44">{t('Last seen')}</TableHead>
            <TableHead className="w-32 text-right">{t('Action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && !data ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-gray-400">{t('Loading…')}</TableCell>
            </TableRow>
          ) : data?.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-gray-400">{t('No players match.')}</TableCell>
            </TableRow>
          ) : (
            data?.items.map((p) => (
              <TableRow key={p.playerId}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setDetails(p.playerId)}
                  >
                    <div className="font-medium text-gray-900">{p.displayName || '—'}</div>
                    <div className="font-mono text-xs text-gray-500">{p.playerId}</div>
                  </button>
                </TableCell>
                <TableCell>
                  {p.status === 'blocked' ? (
                    <div className="space-y-0.5">
                      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{t('Banned')}</Badge>
                      {p.blockReason && <div className="text-xs text-gray-500">{p.blockReason}</div>}
                    </div>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">{t('Active')}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.plays}</TableCell>
                <TableCell className="text-sm text-gray-600">{formatGeorgiaTime(p.firstSeenAt)}</TableCell>
                <TableCell className="text-sm text-gray-600">{formatGeorgiaTime(p.lastSeenAt)}</TableCell>
                <TableCell className="text-right">
                  {p.status === 'blocked' ? (
                    <Button variant="outline" size="sm" onClick={() => setPending({ player: p, action: 'unblock' })}>
                      <UserCheck className="size-4" /> {t('Unban')}
                    </Button>
                  ) : (
                    <Button variant="destructive" size="sm" onClick={() => setPending({ player: p, action: 'block' })}>
                      <Ban className="size-4" /> {t('Ban')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className={cn('flex items-center justify-end gap-3 text-sm text-gray-500', total === 0 && 'invisible')}>
        <span className="tabular-nums">{t('{from}–{to} of {total}', { from, to, total })}</span>
        <Button variant="outline" size="icon-sm" aria-label={t('Previous page')} disabled={page === 0} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label={t('Next page')} disabled={to >= total} onClick={() => setPage(page + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <StatusDialog pending={pending} onClose={() => setPending(null)} />
      <PlayerDetails
        playerId={details}
        onClose={() => setDetails(null)}
        onChange={(change) => {
          setDetails(null);
          setPending(change);
        }}
      />
    </div>
  );
}

function StatusDialog({ pending, onClose }: { pending: PendingChange | null; onClose: () => void }) {
  const { t } = useFcText();
  const [reason, setReason] = useState('');
  const setStatus = useSetFreecrocoPlayerStatus();
  const action = pending?.action;
  const name = pending ? pending.player.displayName || pending.player.playerId : '';

  const close = () => {
    if (setStatus.isPending) return;
    setReason('');
    onClose();
  };

  const confirm = () => {
    if (!pending) return;
    setStatus.mutate(
      { playerId: pending.player.playerId, action: pending.action, reason: pending.action === 'block' ? reason.trim() || null : null },
      {
        onSuccess: () => {
          toast.success(pending.action === 'block' ? t('{name} is banned', { name }) : t('{name} is unbanned', { name }));
          setReason('');
          onClose();
        },
        onError: (error) => {
          toast.error(
            error instanceof ApiClientError && error.status === 403
              ? t('Only editors can ban or unban players.')
              : pending.action === 'block'
                ? t('Failed to ban the player.')
                : t('Failed to unban the player.'),
          );
        },
      },
    );
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{action === 'block' ? t('Ban {name}?', { name }) : t('Unban {name}?', { name })}</DialogTitle>
          <DialogDescription>
            {action === 'block'
              ? t('Their open game ends now without a score, and they cannot open Quizball from Freecroco until unbanned.')
              : t('They can open Quizball from Freecroco again. A game that ended with the ban stays used.')}
          </DialogDescription>
        </DialogHeader>
        {action === 'block' && (
          <div className="space-y-1.5">
            <Label htmlFor="fc-ban-reason">{t('Reason (optional)')}</Label>
            <Textarea
              id="fc-ban-reason"
              value={reason}
              maxLength={REASON_MAX}
              rows={3}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-right text-xs text-gray-400">{reason.length}/{REASON_MAX}</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={setStatus.isPending} onClick={close}>{t('Cancel')}</Button>
          <Button variant={action === 'block' ? 'destructive' : 'default'} disabled={setStatus.isPending} onClick={confirm}>
            {setStatus.isPending ? t('Saving…') : action === 'block' ? t('Ban player') : t('Unban')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayerDetails({
  playerId,
  onClose,
  onChange,
}: {
  playerId: string | null;
  onClose: () => void;
  onChange: (change: PendingChange) => void;
}) {
  const { t, game } = useFcText();
  const { data, isLoading, error } = useFreecrocoPlayer(playerId);
  return (
    <Dialog open={playerId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{data?.displayName || playerId}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{playerId}</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-gray-400">{t('Loading…')}</p>}
        {error && <p className="text-sm text-red-500">{t('Failed to load the player.')}</p>}
        {data && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1 text-gray-600">
              <div>
                {t('Status:')}{' '}
                {data.status === 'blocked' ? (
                  <span className="font-medium text-red-700">
                    {data.statusChangedAt
                      ? t('Banned since {time}', { time: formatGeorgiaTime(data.statusChangedAt) })
                      : t('Banned')}
                    {data.blockReason && ` · ${data.blockReason}`}
                  </span>
                ) : (
                  <span className="font-medium text-green-700">{t('Active')}</span>
                )}
              </div>
              <div>
                {t('First seen {first} · Last seen {last}', {
                  first: formatGeorgiaTime(data.firstSeenAt),
                  last: formatGeorgiaTime(data.lastSeenAt),
                })}
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Game')}</TableHead>
                  <TableHead className="w-28">{t('Plays today')}</TableHead>
                  <TableHead className="w-20">{t('Limit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.today.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-gray-400">{t('No games today.')}</TableCell>
                  </TableRow>
                ) : (
                  data.today.map((row) => (
                    <TableRow key={row.gameId}>
                      <TableCell>{game(row.gameId)}</TableCell>
                      <TableCell className="tabular-nums">{row.playsUsed}</TableCell>
                      <TableCell className="tabular-nums">{row.playsLimit}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          {data &&
            (data.status === 'blocked' ? (
              <Button variant="outline" onClick={() => onChange({ player: data, action: 'unblock' })}>
                <UserCheck className="size-4" /> {t('Unban')}
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => onChange({ player: data, action: 'block' })}>
                <Ban className="size-4" /> {t('Ban')}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
