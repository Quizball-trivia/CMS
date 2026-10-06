'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Gamepad } from 'lucide-react';
import { useFreecrocoGames, useSaveFreecrocoGames } from '@/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  buildGamesPayload,
  GAME_LABELS,
  isGamesDirty,
  maxLimitFor,
  moveGame,
  normalizeOrder,
  updateGame,
  validateGames,
} from '@/lib/freecroco/games';
import { isStaleVersion, STALE_GAMES_MESSAGE } from '@/lib/freecroco/errors';
import { getErrorFeedback } from '@/lib/error-feedback';
import type { PartnerGameConfig, PartnerGameId } from '@/types/freecroco';

export default function FreecrocoGamesPage() {
  const { data, isLoading, isError, isFetching, refetch } = useFreecrocoGames();
  const save = useSaveFreecrocoGames();
  // null = no local edits; the table then shows the server copy. The version is pinned when editing
  // starts: a later refetch must not quietly turn an old draft into a save against newer data.
  const [draft, setDraft] = useState<{ baseVersion: number; games: PartnerGameConfig[] } | null>(null);
  // Held from clicking Save until the draft is cleaned up, conflict recovery included, so nothing typed
  // in between is wiped by that cleanup.
  const [busy, setBusy] = useState(false);
  // A save was refused (someone else saved) and the latest copy could not be loaded yet. The draft is
  // kept, and Save stays blocked until a reload succeeds.
  const [conflict, setConflict] = useState(false);

  if (isLoading) return <p className="text-sm text-gray-400">Loading…</p>;
  // A failed refetch keeps the data it had: only a screen with nothing to show gives way to an error.
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">Failed to load the games.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const games = normalizeOrder(draft?.games ?? data.games);
  // A refetch (reconnect, another tab) can move the server copy under an open draft.
  const outdated = draft !== null && draft.baseVersion !== data.version;
  const dirty = draft !== null && isGamesDirty(data.games, draft.games);
  const validation = validateGames(games);
  const saving = busy || save.isPending;

  const edit = (next: PartnerGameConfig[]) => setDraft({ baseVersion: draft?.baseVersion ?? data.version, games: next });

  const handleRetry = async () => {
    // Held through the reload and the draft cleanup, so nothing typed meanwhile is wiped by it.
    setBusy(true);
    try {
      const reloaded = await refetch();
      if (reloaded.isError || !conflict) return;
      setConflict(false);
      setDraft(null);
      toast.warning(STALE_GAMES_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!draft || outdated || conflict || !validation.valid) {
      toast.error(outdated ? 'The games changed since you started editing' : 'Fix the highlighted fields first');
      return;
    }
    setBusy(true);
    try {
      await save.mutateAsync(buildGamesPayload(draft.baseVersion, games));
      setDraft(null);
      toast.success('Games saved');
    } catch (err) {
      if (isStaleVersion(err)) {
        // The hook already tried to reload the server copy; confirm it, then drop the draft that was
        // based on the old one. If it cannot be loaded, keep the draft and the form and ask for a retry.
        const reloaded = await refetch();
        if (reloaded.isError) {
          setConflict(true);
          toast.error('Someone else saved first, and the latest games could not be loaded. Retry the refresh.');
          return;
        }
        setDraft(null);
        toast.warning(STALE_GAMES_MESSAGE);
        return;
      }
      const feedback = getErrorFeedback(err, 'Failed to save games');
      toast.error(feedback.title, { description: feedback.description });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gamepad className="size-6 text-gray-700" />
          <h1 className="text-2xl font-semibold text-gray-900">Freecroco games</h1>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" onClick={() => {
              setDraft(null);
              setConflict(false);
            }} disabled={saving}>
              Discard changes
            </Button>
          )}
          <Button onClick={handleSave} disabled={!dirty || outdated || conflict || !validation.valid || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        Which games Freecroco players see, in what order, and how many times a day each can be played. Ranked is
        always shown first when enabled. A date can override the daily count on the Calendar.
      </p>

      {(isError || conflict) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            Could not refresh the games. Showing the last copy that loaded
            {conflict ? '; your changes are kept but cannot be saved until it refreshes.' : '.'}
          </span>
          <Button variant="outline" size="sm" disabled={isFetching || saving} onClick={() => void handleRetry()}>
            Refresh again
          </Button>
        </div>
      )}

      {outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>The games were updated while you were editing, so your changes can no longer be saved.</span>
          <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
            Discard my changes and show the latest
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Order</TableHead>
            <TableHead>Game</TableHead>
            <TableHead className="w-24">Enabled</TableHead>
            <TableHead className="w-48">Plays per day</TableHead>
            <TableHead className="w-36">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map((game, index) => {
            const errors = validation.rows[game.gameId];
            return (
              <TableRow key={game.gameId} className={game.enabled ? undefined : 'opacity-60'}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="w-6 text-sm tabular-nums text-gray-500">{game.order}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${GAME_LABELS[game.gameId]} up`}
                      disabled={saving || index === 0}
                      onClick={() => edit(moveGame(games, game.gameId, -1))}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move ${GAME_LABELS[game.gameId]} down`}
                      disabled={saving || index === games.length - 1}
                      onClick={() => edit(moveGame(games, game.gameId, 1))}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium text-gray-900">{GAME_LABELS[game.gameId]}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={game.enabled}
                    disabled={saving}
                    aria-label={`${GAME_LABELS[game.gameId]} enabled`}
                    onCheckedChange={(checked) => edit(updateGame(games, game.gameId, { enabled: checked === true }))}
                  />
                </TableCell>
                <TableCell>
                  <LimitInput
                    gameId={game.gameId}
                    value={game.defaultLimit}
                    error={errors?.defaultLimit}
                    disabled={saving}
                    onChange={(value) => edit(updateGame(games, game.gameId, { defaultLimit: value }))}
                  />
                </TableCell>
                <TableCell>
                  {game.ready ? (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ready</Badge>
                  ) : (
                    <Badge variant="secondary">Not live yet</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function LimitInput({
  gameId,
  value,
  error,
  disabled,
  onChange,
}: {
  gameId: PartnerGameId;
  value: number;
  error?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Input
        type="number"
        min={0}
        max={maxLimitFor(gameId)}
        step={1}
        className="h-8 w-24"
        disabled={disabled}
        aria-label={`${GAME_LABELS[gameId]} plays per day`}
        aria-invalid={Boolean(error)}
        // An emptied box is NaN, which validateGames rejects.
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
