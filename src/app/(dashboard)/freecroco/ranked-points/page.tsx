'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Trophy } from 'lucide-react';
import { useAuth } from '@/providers';
import { useFreecrocoRankedPoints, useSaveFreecrocoRankedPoints } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { canEditRankedPoints } from '@/lib/freecroco/access';
import { isStaleVersion, STALE_RANKED_POINTS_MESSAGE } from '@/lib/freecroco/errors';
import {
  DRAW_AFTER_PENALTIES_LABEL,
  isRankedPointsDirty,
  LEFT_NOT_AHEAD_LABEL,
  MARGIN_LABELS,
  MAX_RANKED_POINTS,
  PENALTY_WIN_LABEL,
  rankedMaxScore,
  updateMargin,
  updatePenaltyWin,
  validateRankedPoints,
  type PairSide,
} from '@/lib/freecroco/ranked-points';
import { getErrorFeedback } from '@/lib/error-feedback';
import type { RankedPointsPair, RankedPointsTable } from '@/types/freecroco';

export default function FreecrocoRankedPointsPage() {
  const { user } = useAuth();
  const canEdit = canEditRankedPoints(user?.role);
  const { data, isLoading, isError, isFetching, refetch } = useFreecrocoRankedPoints();
  const save = useSaveFreecrocoRankedPoints();
  // Same draft model as the Games page: the version is pinned when editing starts, the form is held
  // through a save and its conflict recovery, and a refused save with no reload keeps the draft.
  const [draft, setDraft] = useState<{ baseVersion: number; points: RankedPointsTable } | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);

  if (isLoading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (!data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">Failed to load the ranked points.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const points = draft?.points ?? data.points;
  const outdated = draft !== null && draft.baseVersion !== data.version;
  const dirty = draft !== null && isRankedPointsDirty(data.points, draft.points);
  const validation = validateRankedPoints(points);
  const saving = busy || save.isPending;
  const locked = !canEdit || saving;
  const maxScore = validation.valid ? rankedMaxScore(points) : null;

  const edit = (next: RankedPointsTable) => setDraft({ baseVersion: draft?.baseVersion ?? data.version, points: next });

  const handleRetry = async () => {
    setBusy(true);
    try {
      const reloaded = await refetch();
      if (reloaded.isError || !conflict) return;
      setConflict(false);
      setDraft(null);
      toast.warning(STALE_RANKED_POINTS_MESSAGE);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!draft || outdated || conflict || !validation.valid) {
      toast.error(outdated ? 'The ranked points changed since you started editing' : 'Fix the highlighted fields first');
      return;
    }
    setBusy(true);
    try {
      await save.mutateAsync({ version: draft.baseVersion, points: draft.points });
      setDraft(null);
      toast.success('Ranked points saved');
    } catch (err) {
      if (isStaleVersion(err)) {
        const reloaded = await refetch();
        if (reloaded.isError) {
          setConflict(true);
          toast.error('Someone else saved first, and the latest ranked points could not be loaded. Retry the refresh.');
          return;
        }
        setDraft(null);
        toast.warning(STALE_RANKED_POINTS_MESSAGE);
        return;
      }
      const feedback = getErrorFeedback(err, 'Failed to save ranked points');
      toast.error(feedback.title, { description: feedback.description });
    } finally {
      setBusy(false);
    }
  };

  const pairRow = (label: string, key: string, pair: RankedPointsPair, onChange: (side: PairSide, value: number) => void) => (
    <TableRow key={key}>
      <TableCell className="font-medium text-gray-900">
        {label}
        {validation.errors[`${key}.row`] && <p className="text-xs font-normal text-red-500">{validation.errors[`${key}.row`]}</p>}
      </TableCell>
      {(['winner', 'loser'] as const).map((side) => (
        <TableCell key={side}>
          <PointsInput
            label={`${label} ${side}`}
            value={pair[side]}
            error={validation.errors[`${key}.${side}`]}
            disabled={locked}
            onChange={(value) => onChange(side, value)}
          />
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="size-6 text-gray-700" />
          <h1 className="text-2xl font-semibold text-gray-900">Ranked points</h1>
        </div>
        {canEdit && (
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
        )}
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        The points a Freecroco ranked match is worth. A match is scored with the table that was in force when it
        started, so a save applies to matches that start after it.
      </p>

      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">
        These values are agreed with Freecroco: changing them changes the points Freecroco receives for every ranked
        match. Agree a change with Freecroco before saving it.
        {!canEdit && ' Only Quizball admins can change them.'}
      </div>

      {(isError || conflict) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            Could not refresh the ranked points. Showing the last copy that loaded
            {conflict ? '; your changes are kept but cannot be saved until it refreshes.' : '.'}
          </span>
          <Button variant="outline" size="sm" disabled={isFetching || saving} onClick={() => void handleRetry()}>
            Refresh again
          </Button>
        </div>
      )}

      {outdated && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>The ranked points were updated while you were editing, so your changes can no longer be saved.</span>
          <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
            Discard my changes and show the latest
          </Button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Result</TableHead>
            <TableHead className="w-40">Winner</TableHead>
            <TableHead className="w-40">Loser</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.margins.map((pair, i) =>
            pairRow(MARGIN_LABELS[i] ?? `Win by ${i + 1} goals`, `margins.${i}`, pair, (side, value) =>
              edit(updateMargin(points, i, side, value)),
            ),
          )}
          {pairRow(PENALTY_WIN_LABEL, 'penaltyWin', points.penaltyWin, (side, value) =>
            edit(updatePenaltyWin(points, side, value)),
          )}
        </TableBody>
      </Table>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Result</TableHead>
            <TableHead className="w-40">Points</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium text-gray-900">
              {DRAW_AFTER_PENALTIES_LABEL}
              <p className="text-xs font-normal text-gray-500">Each player</p>
            </TableCell>
            <TableCell>
              <PointsInput
                label={DRAW_AFTER_PENALTIES_LABEL}
                value={points.drawAfterPenalties}
                error={validation.errors.drawAfterPenalties}
                disabled={locked}
                onChange={(value) => edit({ ...points, drawAfterPenalties: value })}
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium text-gray-900">
              {LEFT_NOT_AHEAD_LABEL}
              <p className="text-xs font-normal text-gray-500">
                The player who stayed; when ahead they get the winner points for the margin instead. The leaver gets 0.
              </p>
            </TableCell>
            <TableCell>
              <PointsInput
                label={LEFT_NOT_AHEAD_LABEL}
                value={points.leftNotAhead}
                error={validation.errors.leftNotAhead}
                disabled={locked}
                onChange={(value) => edit({ ...points, leftNotAhead: value })}
              />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <p className="text-sm text-gray-500">
        Most one match can score: <span className="font-medium tabular-nums text-gray-900">{maxScore ?? '–'}</span>
        {' '}(players see it as &ldquo;up to&rdquo;). Values are whole numbers from 0 to {MAX_RANKED_POINTS}.
      </p>
    </div>
  );
}

function PointsInput({
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
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
        max={MAX_RANKED_POINTS}
        step={1}
        className="h-8 w-28"
        disabled={disabled}
        aria-label={label}
        aria-invalid={Boolean(error)}
        // An emptied box is NaN, which validateRankedPoints rejects.
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
