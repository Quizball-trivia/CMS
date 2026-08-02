'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Pencil, Search, Snowflake, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBotRoster, useSetBotFrozen } from '@/hooks';
import { botTuningErrorMessage } from '@/lib/bot-tuning-errors';
import { cn } from '@/lib/utils';
import { EditBotDialog } from './edit-bot-dialog';
import type {
  BotRosterDirection,
  BotRosterRow,
  BotRosterSort,
  BotTuningRails,
} from '@/types';

const PAGE_SIZE = 25;

const SORTABLE: { key: BotRosterSort; label: string; className?: string }[] = [
  { key: 'nickname', label: 'Nickname' },
  { key: 'rp', label: 'RP', className: 'text-right' },
  { key: 'winrate', label: 'Win rate', className: 'text-right' },
  { key: 'matches_today', label: 'Today', className: 'text-right' },
];

type FrozenFilter = 'all' | 'frozen' | 'active';

function formatWinrate(row: BotRosterRow): string {
  if (row.winrateEma === null) return '—';
  return `${(row.winrateEma * 100).toFixed(1)}%`;
}

function formatOffset(value: number): string {
  const fixed = value.toFixed(3);
  return value > 0 ? `+${fixed}` : fixed;
}

export function RosterTable({ rails }: { rails?: BotTuningRails }) {
  const [editing, setEditing] = useState<BotRosterRow | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [frozenFilter, setFrozenFilter] = useState<FrozenFilter>('all');
  const [sort, setSort] = useState<BotRosterSort>('rp');
  const [direction, setDirection] = useState<BotRosterDirection>('desc');

  const freezeMutation = useSetBotFrozen();

  const { data, isLoading, error } = useBotRoster({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    frozen: frozenFilter === 'all' ? undefined : frozenFilter === 'frozen',
    sort,
    direction,
  });

  const toggleSort = (key: BotRosterSort) => {
    if (sort === key) {
      setDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setDirection(key === 'nickname' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleFreeze = async (row: BotRosterRow) => {
    const next = !row.selectionFrozen;
    try {
      await freezeMutation.mutateAsync({ botUserId: row.botUserId, frozen: next });
      toast.success(
        `${row.nickname ?? 'Bot'} ${next ? 'frozen (will not be selected)' : 'unfrozen'}`
      );
    } catch (err) {
      toast.error(botTuningErrorMessage(err, 'Failed to change freeze state'));
    }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={searchInput}
            placeholder="Search nickname…"
            className="w-56"
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applySearch();
            }}
          />
          <Button variant="outline" onClick={applySearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={frozenFilter}
          onValueChange={(value) => {
            setFrozenFilter(value as FrozenFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bots</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="frozen">Frozen only</SelectItem>
          </SelectContent>
        </Select>

        <span className="ml-auto text-sm font-medium text-gray-500">
          {isLoading ? 'Loading…' : `${total} bot${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {botTuningErrorMessage(error, 'Failed to load roster')}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              {SORTABLE.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      'inline-flex items-center gap-1 font-semibold hover:text-gray-900',
                      sort === col.key ? 'text-gray-900' : 'text-gray-500'
                    )}
                  >
                    {col.label}
                    {sort === col.key &&
                      (direction === 'asc' ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Auto-handicap</TableHead>
              <TableHead className="text-right">Daily limit</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-gray-500">
                  No persistent bots found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.botUserId}>
                  <TableCell className="font-medium text-gray-900">
                    {row.nickname ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.rp ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatWinrate(row)}
                    <span className="ml-1 text-xs text-gray-400">({row.winrateSamples})</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.matchesToday}</TableCell>
                  <TableCell className="text-gray-600">{row.tier ?? '—'}</TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      row.governorAdjustment > 0 && 'text-emerald-600',
                      row.governorAdjustment < 0 && 'text-red-600'
                    )}
                  >
                    {formatOffset(row.governorAdjustment)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-gray-600">
                    {row.dailyCap}
                  </TableCell>
                  <TableCell>
                    {row.selectionFrozen ? (
                      <Badge variant="secondary" className="bg-sky-100 text-sky-700">
                        Frozen
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                        {row.status}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(row)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={freezeMutation.isPending}
                        onClick={() => handleFreeze(row)}
                      >
                        {row.selectionFrozen ? (
                          <>
                            <Sun className="mr-1.5 h-3.5 w-3.5" />
                            Unfreeze
                          </>
                        ) : (
                          <>
                            <Snowflake className="mr-1.5 h-3.5 w-3.5" />
                            Freeze
                          </>
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">
          Page {data?.page ?? page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <EditBotDialog bot={editing} rails={rails} onClose={() => setEditing(null)} />
    </div>
  );
}
