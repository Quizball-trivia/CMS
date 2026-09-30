'use client';

import { useState } from 'react';
import { Camera, Download, Loader2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TdEmptyState, TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { TdIssueText, TdSwitchField } from '@/components/td/content/td-form';
import { tdKeys, useTdWrite } from '@/hooks/use-td-content';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { checkContract, type BoardPage, type SchemaIssue, type Settings, type SnapshotList, type SnapshotPage } from '@/lib/td/contract';
import { downloadText } from '@/lib/td/download';
import { formatDay, formatGeorgiaTime, georgiaToday } from '@/lib/td/georgia';
import type { TdOperation } from '@/lib/td/operation';
import { cn } from '@/lib/utils';

type Row = BoardPage['items'][number];

function BoardTable({ rows }: { rows: Row[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-(--td-divider) hover:bg-transparent">
            {['Rank', 'Player', 'Betsson id', 'Rating', 'Games', 'W–L'].map((h) => (
              <TableHead key={h} className="h-10 px-3 text-xs font-semibold uppercase tracking-wide text-(--td-text-3) first:pl-5">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.playerId} className="border-(--td-divider) hover:bg-secondary/40">
              <TableCell className={cn('px-3 py-2 pl-5 font-semibold tabular-nums', row.rank <= 3 && 'text-primary')}>{row.rank}</TableCell>
              <TableCell className="px-3 py-2">{row.displayName}</TableCell>
              <TableCell className="px-3 py-2 font-mono text-xs text-(--td-text-2)">{row.partnerPlayerId ?? '—'}</TableCell>
              <TableCell className="px-3 py-2 tabular-nums">{row.rating}</TableCell>
              <TableCell className="px-3 py-2 tabular-nums">{row.games}</TableCell>
              <TableCell className="px-3 py-2 tabular-nums text-(--td-text-2)">
                {row.wins}–{row.losses}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function useExport() {
  const write = useTdWrite();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (name: string, fetchCsv: (operation: TdOperation) => Promise<string>, fileName: string) => {
    setBusy(name);
    try {
      downloadText(await write(fetchCsv, []), fileName);
    } catch (caught) {
      toast.error(caught instanceof TdApiError ? caught.message : 'The export failed');
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

export function TdLeaderboardTab() {
  const queryClient = useQueryClient();
  const write = useTdWrite();
  const exporter = useExport();
  const [label, setLabel] = useState('');
  const [labelIssues, setLabelIssues] = useState<SchemaIssue[]>([]);
  const [snapshotError, setSnapshotError] = useState<unknown>(null);
  const [taking, setTaking] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const board = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'board'],
    queryFn: ({ pageParam, signal }) => tdAdmin.leaderboard.standings({ cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: BoardPage) => last.nextCursor ?? undefined,
  });
  const snapshots = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'snapshots'],
    queryFn: ({ pageParam, signal }) => tdAdmin.leaderboard.snapshots({ cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SnapshotList) => last.nextCursor ?? undefined,
  });
  const snapshotItems = snapshots.data?.pages.flatMap((page) => page.items) ?? [];
  const first = board.data?.pages[0];

  const take = async () => {
    const trimmed = label.trim();
    const issues = checkContract('SnapshotCreateRequest', { label: trimmed });
    setLabelIssues(issues);
    if (issues.length) return;
    setTaking(true);
    setSnapshotError(null);
    try {
      const snapshot = await write((operation) => tdAdmin.leaderboard.takeSnapshot(trimmed, operation), [tdKeys.ops]);
      toast.success(`Snapshot “${snapshot.label}” taken: ${snapshot.players} players`);
      setLabel('');
      await queryClient.invalidateQueries({ queryKey: [...tdKeys.ops, 'snapshots'] });
    } catch (caught) {
      setSnapshotError(caught);
    } finally {
      setTaking(false);
    }
  };

  return (
    <>
      <TdSection
        title="Standings"
        description={first ? `${first.total} ranked players, as of ${formatGeorgiaTime(first.asOf)}. Blocked players are left out.` : 'Active players with a finished ranked game, by rating.'}
        actions={
          <Button variant="secondary" className="rounded-lg" disabled={exporter.busy !== null} onClick={() => void exporter.run('board', (operation) => tdAdmin.leaderboard.exportCsv(operation), `table-derby-leaderboard-${georgiaToday()}.csv`)}>
            {exporter.busy === 'board' ? <Loader2 className="animate-spin" /> : <Download />}
            Export CSV
          </Button>
        }
      >
        <TdErrorPanel error={board.error} className="m-5" />
        {board.data && <BoardTable rows={board.data.pages.flatMap((page) => page.items)} />}
        {first && first.items.length === 0 && <TdEmptyState icon={Trophy} title="No ranked players yet" />}
        {board.hasNextPage && (
          <div className="border-t border-(--td-divider) px-5 py-3">
            <Button variant="secondary" size="sm" className="rounded-lg" disabled={board.isFetchingNextPage} onClick={() => void board.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </TdSection>

      <TdSection title="Frozen snapshots" description="A snapshot is the standings at the moment it is taken, kept unchanged: prizes are paid from snapshots, not from live standings.">
        <div className="flex flex-col gap-2 border-b border-(--td-divider) px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Label, e.g. Week 40 prizes" aria-label="Snapshot label" className="h-10 max-w-sm rounded-lg bg-(--td-input)" />
            <Button className="rounded-lg" disabled={taking || !label.trim()} onClick={() => void take()}>
              {taking ? <Loader2 className="animate-spin" /> : <Camera />}
              Take snapshot
            </Button>
          </div>
          <TdIssueText issues={labelIssues} />
          <TdErrorPanel error={snapshotError} />
        </div>
        <TdErrorPanel error={snapshots.error} className="m-5" />
        {snapshots.isSuccess && snapshotItems.length === 0 && <TdEmptyState title="No snapshots yet" />}
        <ul className="divide-y divide-(--td-divider)">
          {snapshotItems.map((snapshot) => (
            <li key={snapshot.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button type="button" className="font-medium hover:underline" onClick={() => setOpen(open === snapshot.id ? null : snapshot.id)} aria-expanded={open === snapshot.id}>
                  {snapshot.label}
                </button>
                <span className="text-xs text-(--td-text-3)">
                  {formatGeorgiaTime(snapshot.takenAt)} · {snapshot.takenBy?.name ?? 'System'} · {snapshot.players} players
                </span>
                <span className="flex-1" />
                <Button
                  variant="secondary"
                  size="sm"
                  className="rounded-lg"
                  disabled={exporter.busy !== null}
                  onClick={() => void exporter.run(snapshot.id, (operation) => tdAdmin.leaderboard.exportSnapshotCsv(snapshot.id, operation), `table-derby-snapshot-${snapshot.label.replace(/[^\p{L}\p{N}]+/gu, '-')}.csv`)}
                >
                  {exporter.busy === snapshot.id ? <Loader2 className="animate-spin" /> : <Download />}
                  CSV
                </Button>
              </div>
              {open === snapshot.id && <SnapshotRows id={snapshot.id} />}
            </li>
          ))}
        </ul>
        {snapshots.hasNextPage && (
          <div className="border-t border-(--td-divider) px-5 py-3">
            <Button variant="secondary" size="sm" className="rounded-lg" disabled={snapshots.isFetchingNextPage} onClick={() => void snapshots.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </TdSection>
    </>
  );
}

function SnapshotRows({ id }: { id: string }) {
  const page = useInfiniteQuery({
    queryKey: [...tdKeys.ops, 'snapshot', id],
    queryFn: ({ pageParam, signal }) => tdAdmin.leaderboard.snapshot(id, { cursor: pageParam, limit: 50 }, { signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SnapshotPage) => last.nextCursor ?? undefined,
  });
  if (!page.data) return page.error ? <TdErrorPanel error={page.error} className="mt-2" /> : <p className="mt-2 text-xs text-(--td-text-3)">Loading…</p>;
  return (
    <div className="mt-3 rounded-lg border border-border">
      <BoardTable rows={page.data.pages.flatMap((p) => p.items)} />
      {page.hasNextPage && (
        <div className="px-5 py-2">
          <Button variant="secondary" size="sm" className="rounded-lg" onClick={() => void page.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

/* ── settings (ops) ─────────────────────────────────────────────────── */

export function TdSettingsTab() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: [...tdKeys.ops, 'settings'], queryFn: ({ signal }) => tdAdmin.settings.get({ signal }) });
  const onChanged = (next: Settings) => queryClient.setQueryData([...tdKeys.ops, 'settings'], next);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [...tdKeys.ops, 'settings'] });
  if (!settings.data) return settings.error ? <TdErrorPanel error={settings.error} /> : <p className="text-sm text-(--td-text-3)">Loading…</p>;
  return (
    <>
      <TicketsSetting settings={settings.data} onChanged={onChanged} onConflict={refresh} />
      <MaintenanceSetting settings={settings.data} onChanged={onChanged} onConflict={refresh} />
      <p className="text-xs text-(--td-text-3)">Bot fallback delay and bot difficulty are not in the admin contract (v4); they stay server configuration for now.</p>
    </>
  );
}

const changedBy = (s: { version: number; updatedAt: string | null; updatedBy: { name: string } | null }) =>
  s.version === 0 ? 'Never changed.' : `Changed by ${s.updatedBy?.name ?? 'System'} at ${formatGeorgiaTime(s.updatedAt)} (version ${s.version}).`;

function TicketsSetting({ settings, onChanged, onConflict }: { settings: Settings; onChanged: (s: Settings) => void; onConflict: () => void }) {
  const write = useTdWrite();
  const tickets = settings.ticketsPerDay;
  const [value, setValue] = useState(String(tickets.value));
  const [issues, setIssues] = useState<SchemaIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const body = { version: tickets.version, value: Number(value) };
    const found = checkContract('TicketsPerDayRequest', body);
    setIssues(found);
    if (found.length) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await write((operation) => tdAdmin.settings.ticketsPerDay(body.version, body.value, operation), []));
      toast.success('Saved: it applies from tomorrow (Georgia)');
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'revision_conflict') onConflict();
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <TdSection title="Tickets per day" description="Ranked tickets every player gets each Georgian day. A change applies from the next day, never within five minutes of midnight.">
      <div className="flex flex-col gap-3 p-5">
        <p className="text-sm">
          Today: <span className="font-semibold tabular-nums">{tickets.today}</span>
          {tickets.effectiveFrom && tickets.value !== tickets.today && (
            <span className="text-(--td-text-3)">
              {' '}
              · {tickets.value} from {formatDay(tickets.effectiveFrom)}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Tickets per day" className="h-10 w-28 rounded-lg bg-(--td-input) tabular-nums" />
          <Button className="rounded-lg" disabled={busy || value === String(tickets.value)} onClick={() => void save()}>
            {busy && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
        <TdIssueText issues={issues} />
        <TdErrorPanel error={error} />
        <p className="text-xs text-(--td-text-3)">{changedBy(tickets)}</p>
      </div>
    </TdSection>
  );
}

function MaintenanceSetting({ settings, onChanged, onConflict }: { settings: Settings; onChanged: (s: Settings) => void; onConflict: () => void }) {
  const write = useTdWrite();
  const maintenance = settings.maintenance;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await write((operation) => tdAdmin.settings.maintenance(maintenance.version, !maintenance.enabled, operation), []));
      toast.success(maintenance.enabled ? 'Maintenance mode off' : 'Maintenance mode on');
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'revision_conflict') onConflict();
      setError(caught);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };
  return (
    <TdSection title="Maintenance mode" description="On: new ranked searches, matches, dailies and practice runs are refused with the Georgian maintenance screen; matches under way finish.">
      <div className="flex flex-col gap-3 p-5">
        <TdSwitchField label={maintenance.enabled ? 'On: the game is closed to new play' : 'Off: the game is open'} checked={maintenance.enabled} onChange={() => setConfirming(true)} />
        {confirming && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-(--td-danger)/10 px-3 py-2 text-sm">
            <span>{maintenance.enabled ? 'Open the game to players again?' : 'Close the game to new play for every player?'}</span>
            <Button size="sm" variant={maintenance.enabled ? 'default' : 'destructive'} className="rounded-lg" disabled={busy} onClick={() => void toggle()}>
              {busy && <Loader2 className="animate-spin" />}
              {maintenance.enabled ? 'Turn off' : 'Turn on'}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
        <TdErrorPanel error={error} />
        <p className="text-xs text-(--td-text-3)">{changedBy(maintenance)}</p>
      </div>
    </TdSection>
  );
}
