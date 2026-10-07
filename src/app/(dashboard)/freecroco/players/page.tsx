'use client';

import { useState } from 'react';
import { UserSearch } from 'lucide-react';
import { useFreecrocoPlayer } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GAME_LABELS } from '@/lib/freecroco/games';
import { formatGeorgiaTime } from '@/lib/td/georgia';
import { ApiClientError } from '@/services';

export default function FreecrocoPlayersPage() {
  const [input, setInput] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useFreecrocoPlayer(playerId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <UserSearch className="size-6 text-gray-700" />
        <h1 className="text-2xl font-semibold text-gray-900">Freecroco players</h1>
      </div>
      <p className="-mt-4 text-sm text-gray-500">Look up a player by their Freecroco player id.</p>

      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const next = input.trim() || null;
          // The same id gives the query the same key, so a state change would send nothing: ask again.
          if (next !== null && next === playerId) void refetch();
          else setPlayerId(next);
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="fc-player-lookup">Player id</Label>
          <Input id="fc-player-lookup" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <Button type="submit" disabled={!input.trim()}>Look up</Button>
      </form>

      {playerId && isLoading && <p className="text-sm text-gray-400">Loading…</p>}
      {playerId && error && (
        <p className="text-sm text-red-500">
          {error instanceof ApiClientError && error.status === 404 ? 'No player with that id.' : 'Failed to look up the player.'}
        </p>
      )}
      {data && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-medium text-gray-900">{data.displayName}</span>
            <span className="font-mono text-xs text-gray-500">{data.playerId}</span>
            {data.status === 'blocked' ? (
              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Blocked</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Active</Badge>
            )}
            <span className="text-gray-500">First seen {formatGeorgiaTime(data.firstSeenAt)}</span>
            <span className="text-gray-500">Last seen {formatGeorgiaTime(data.lastSeenAt)}</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Game</TableHead>
                <TableHead className="w-32">Plays today</TableHead>
                <TableHead className="w-32">Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.today.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-gray-400">No plays today.</TableCell>
                </TableRow>
              ) : (
                data.today.map((row) => (
                  <TableRow key={row.gameId}>
                    <TableCell>{GAME_LABELS[row.gameId]}</TableCell>
                    <TableCell className="tabular-nums">{row.playsUsed}</TableCell>
                    <TableCell className="tabular-nums">{row.playsLimit}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
