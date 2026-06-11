'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Trophy, Users as UsersIcon } from 'lucide-react';
import { useAdminUsers } from '@/hooks';
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
import { UserEditDialog } from '@/components/users/user-edit-dialog';
import { ResetLeaderboardDialog } from '@/components/users/reset-leaderboard-dialog';
import { API_BASE_URL } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type {
  AdminUserListItem,
  AdminUsersListQuery,
} from '@/types/admin-users';

type OrderBy = NonNullable<AdminUsersListQuery>['orderBy'];

const PAGE_SIZE = 25;

/**
 * Read-only environment badge. Which env this CMS targets is decided by the
 * backend it was built against (`NEXT_PUBLIC_API_URL`) — staging-CMS → staging
 * backend, prod-CMS → prod backend. There's no live in-page switch; each
 * environment is a separate deployment with its own login.
 */
function EnvironmentBadge() {
  const isProd = /(?:^|\/\/)api\.quizball\.io/.test(API_BASE_URL);
  return (
    <div
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs"
      title={`This CMS targets the ${isProd ? 'production' : 'staging'} backend`}
    >
      <span
        className={cn(
          'rounded px-2 py-1 font-medium',
          !isProd ? 'bg-foreground text-background' : 'text-gray-300'
        )}
      >
        Staging
      </span>
      <span
        className={cn(
          'rounded px-2 py-1 font-medium',
          isProd ? 'bg-red-600 text-white' : 'text-gray-300'
        )}
      >
        Production
      </span>
    </div>
  );
}

function formatTier(tier: string | null): string {
  return tier ?? '—';
}

export default function UsersPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [orderBy, setOrderBy] = useState<OrderBy>('created_at');
  const [editingUser, setEditingUser] = useState<AdminUserListItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // Debounce the search input so we don't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const query: AdminUsersListQuery = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      orderBy,
      orderDir: 'desc',
      ...(search ? { search } : {}),
    }),
    [page, orderBy, search]
  );

  const { data, isLoading, isError, isFetching } = useAdminUsers(query);

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  const total = data?.total ?? 0;

  const openEdit = (user: AdminUserListItem) => {
    setEditingUser(user);
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <UsersIcon className="h-6 w-6 text-slate-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users</h1>
            <p className="text-sm text-slate-500">
              View and grant XP, rank points, coins and tickets.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <EnvironmentBadge />
          <Button variant="destructive" onClick={() => setResetOpen(true)}>
            <Trophy className="h-4 w-4" />
            Reset ranks &amp; placement
          </Button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search by nickname or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={orderBy}
          onValueChange={(value) => {
            setOrderBy(value as OrderBy);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created_at">Newest</SelectItem>
            <SelectItem value="total_xp">XP</SelectItem>
            <SelectItem value="rp">Rank Points</SelectItem>
            <SelectItem value="nickname">Nickname</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200/70 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Level</TableHead>
              <TableHead className="text-right">XP</TableHead>
              <TableHead className="text-right">RP</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Coins</TableHead>
              <TableHead className="text-right">Tickets</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-sm text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-sm text-red-500">
                  Failed to load users. You may not have admin access.
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-sm text-gray-400">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="font-medium text-slate-900">
                      {user.nickname ?? <span className="text-gray-400">no nickname</span>}
                    </div>
                    <div className="text-xs text-gray-400">{user.email ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{user.country ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{user.level}</TableCell>
                  <TableCell className="text-right tabular-nums">{user.total_xp.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{user.rp ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-slate-300 text-slate-600">
                      {formatTier(user.tier)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{user.coins.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{user.tickets.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {total.toLocaleString()} user{total === 1 ? '' : 's'}
          {isFetching && !isLoading ? ' · updating…' : ''}
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="tabular-nums">
            {totalPages === 0 ? 0 : page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <UserEditDialog
        key={`edit-${editingUser?.id ?? 'none'}-${editOpen}`}
        user={editingUser}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ResetLeaderboardDialog
        key={`reset-${resetOpen}`}
        open={resetOpen}
        onOpenChange={setResetOpen}
      />
    </div>
  );
}
