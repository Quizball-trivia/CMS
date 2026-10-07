'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardPaste, Copy } from 'lucide-react';
import { useFreecrocoCalendar, useFreecrocoGames, useReloadFreecrocoCalendar, useSaveFreecrocoCalendar } from '@/hooks';
import { useGeorgiaToday } from '@/hooks/use-georgia-today';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatDay, formatMonth, shiftMonth } from '@/lib/td/georgia';
import {
  buildChangeSet,
  isEditableDate,
  monthRange,
  monthWeeks,
  overrideFor,
  overrideMap,
  pasteWeek,
  setCellEdit,
  snapshotWeek,
  validateChangeSet,
  type CalendarEdits,
  type WeekSnapshot,
} from '@/lib/freecroco/calendar';
import { GAME_LABELS, isValidLimit, maxLimitFor, sortByOrder } from '@/lib/freecroco/games';
import { isStaleVersion, STALE_CALENDAR_MESSAGE } from '@/lib/freecroco/errors';
import { getErrorFeedback } from '@/lib/error-feedback';
import type { PartnerGameConfig, PartnerGameId } from '@/types/freecroco';

const NO_EDITS: CalendarEdits = new Map();
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function FreecrocoCalendarPage() {
  const today = useGeorgiaToday();
  if (!today) return <p className="text-sm text-gray-400">Loading…</p>;
  return <CalendarView today={today} />;
}

function CalendarView({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  // The calendar version is pinned when the first edit is made and survives month navigation: the
  // month on screen may have been loaded later, and saving against its version would overwrite a
  // change another editor made in between.
  const [draft, setDraft] = useState<{ baseVersion: number; edits: CalendarEdits } | null>(null);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<WeekSnapshot | null>(null);

  const range = useMemo(() => monthRange(month), [month]);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const gamesQuery = useFreecrocoGames();
  const calendar = useFreecrocoCalendar(range.from, range.to);
  const save = useSaveFreecrocoCalendar();
  const reloadRanges = useReloadFreecrocoCalendar();
  // Held from clicking Save (or Reload) until recovery and draft cleanup are done, so nothing typed in
  // between is wiped by that cleanup.
  const [busy, setBusy] = useState(false);
  // Set when a conflict (or a manual reload) could not reload the calendar consistently. The draft is
  // kept, and Save stays blocked until a reload succeeds.
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);
  const edits = draft?.edits ?? NO_EDITS;

  const server = useMemo(() => overrideMap(calendar.data?.overrides ?? []), [calendar.data]);
  const games = useMemo(() => sortByOrder(gamesQuery.data?.games ?? []), [gamesQuery.data]);
  const changes = useMemo(() => buildChangeSet(server, edits, today, range), [server, edits, today, range]);
  const changeError = validateChangeSet(changes);

  if (calendar.isLoading || gamesQuery.isLoading) return <p className="text-sm text-gray-400">Loading…</p>;
  // A failed refetch keeps the data it had: only a screen with nothing to show gives way to an error.
  if (!calendar.data || !gamesQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-500">Failed to load the calendar.</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void calendar.refetch();
            void gamesQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  const version = calendar.data.version;
  const saving = busy || save.isPending;
  const outdated = draft !== null && draft.baseVersion !== version;
  // Save waits for a consistent reload after a conflict, and while the shown month is newer than the draft.
  const blocked = outdated || recoveryNeeded;

  const applyEdits = (update: (current: CalendarEdits) => Map<string, number | null>) =>
    setDraft((current) => {
      const next = update(current?.edits ?? NO_EDITS);
      return next.size === 0 ? null : { baseVersion: current?.baseVersion ?? version, edits: next };
    });

  // Reloads every month the pending edits touch (plus the one on screen) so the user sees what the other
  // editor saved. The draft moves to the new version only if every range reported the same one, i.e. the
  // user saw one consistent calendar; otherwise it stays pinned and Save stays blocked. Applied only to
  // the draft that existed when the reload began. Never throws: a failed reload keeps the draft and the
  // editor and asks for a retry.
  const rebase = async (captured: NonNullable<typeof draft>): Promise<boolean> => {
    const months = new Set([month, ...[...captured.edits.keys()].map((k) => k.slice(0, 7))]);
    let consistent: number | null = null;
    try {
      consistent = await reloadRanges([...months].map(monthRange));
    } catch {
      toast.error('Could not reload the calendar. Your changes are kept; retry when you are back online.');
      setRecoveryNeeded(true);
      return false;
    }
    if (consistent === null) {
      toast.error('The calendar keeps changing. Retry the reload.');
      setRecoveryNeeded(true);
      return false;
    }
    setDraft((current) => (current === captured ? { ...captured, baseVersion: consistent } : current));
    setRecoveryNeeded(false);
    return true;
  };

  const handleReload = async () => {
    if (!draft) {
      setRecoveryNeeded(false);
      return;
    }
    setBusy(true);
    try {
      await rebase(draft);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!draft || blocked || changeError || changes.length === 0) return;
    setBusy(true);
    try {
      await save.mutateAsync({ version: draft.baseVersion, changes });
      setDraft(null);
      toast.success(`Saved ${changes.length} change${changes.length === 1 ? '' : 's'}`);
    } catch (err) {
      if (isStaleVersion(err)) {
        // Pending edits stay: they are keyed by date and game, so they sit cleanly on the reloaded calendar.
        if (await rebase(draft)) toast.warning(STALE_CALENDAR_MESSAGE);
        return;
      }
      const feedback = getErrorFeedback(err, 'Failed to save the calendar');
      toast.error(feedback.title, { description: feedback.description });
    } finally {
      setBusy(false);
    }
  };

  const pasteInto = (monday: string) => {
    if (!clipboard) return;
    const result = pasteWeek(server, edits, clipboard, monday, today);
    applyEdits(() => result.edits);
    if (result.skippedDays > 0) {
      toast.info(`${result.skippedDays} past or out-of-range day${result.skippedDays === 1 ? ' was' : 's were'} left unchanged`);
    }
  };

  const overrideCount = (date: string) =>
    games.filter((g) => overrideFor(server, edits, date, g.gameId) !== undefined).length;
  const pendingCount = (date: string) => games.filter((g) => edits.has(`${date}|${g.gameId}`)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-6 text-gray-700" />
          <h1 className="text-2xl font-semibold text-gray-900">Freecroco calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          {changes.length > 0 && <span className="text-sm text-gray-500">{changes.length} pending</span>}
          {edits.size > 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setRecoveryNeeded(false);
              }}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          <Button onClick={handleSave} disabled={changes.length === 0 || blocked || Boolean(changeError) || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <p className="-mt-4 text-sm text-gray-500">
        Override how many times a game can be played on a given day (Georgia time). 0 turns the game off that day;
        no override means the default from Games. Dates from today to 90 days ahead can be edited.
      </p>
      {changeError && <p className="text-sm text-red-500">{changeError}</p>}
      {(calendar.isError || gamesQuery.isError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Could not refresh the calendar. Showing the last data that loaded.</span>
          <Button
            variant="outline"
            size="sm"
            disabled={calendar.isFetching || gamesQuery.isFetching}
            onClick={() => {
              if (calendar.isError) void calendar.refetch();
              if (gamesQuery.isError) void gamesQuery.refetch();
            }}
          >
            Refresh again
          </Button>
        </div>
      )}
      {blocked && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            {recoveryNeeded
              ? 'The latest calendar could not be loaded. Your pending changes are kept, but cannot be saved until it loads.'
              : 'The calendar changed after you started editing. Reload it to see the latest, then review your pending changes.'}
          </span>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => void handleReload()}>
            {recoveryNeeded ? 'Retry' : 'Reload and review'}
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <h2 className="w-44 text-center text-lg font-medium text-gray-900">{formatMonth(month)}</h2>
        <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
          Today
        </Button>
        {clipboard && (
          <Button variant="ghost" size="sm" onClick={() => setClipboard(null)}>
            Clear copied week
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px] space-y-1">
          <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_6rem] gap-1 text-xs font-medium text-gray-500">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-1">{d}</div>
            ))}
            <div />
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-[repeat(7,minmax(0,1fr))_6rem] gap-1">
              {week.map((date) => {
                const editable = isEditableDate(date, today);
                const overrides = overrideCount(date);
                const pending = pendingCount(date);
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setOpenDate(date)}
                    className={cn(
                      'min-h-20 rounded-md border p-2 text-left text-xs transition',
                      date.slice(0, 7) === month ? 'bg-white' : 'bg-gray-50 text-gray-400',
                      !editable && 'bg-gray-100 text-gray-400',
                      pending > 0 ? 'border-blue-400' : 'border-gray-200 hover:border-gray-400',
                      date === today && 'ring-1 ring-blue-500',
                    )}
                    aria-label={`${formatDay(date)}${editable ? '' : ' (read-only)'}`}
                  >
                    <div className="font-medium">{Number(date.slice(8))}</div>
                    <div className="mt-1 space-y-0.5">
                      {overrides > 0 ? (
                        <div className="text-gray-700">{overrides} override{overrides === 1 ? '' : 's'}</div>
                      ) : (
                        <div className="text-gray-400">Default</div>
                      )}
                      {pending > 0 && <div className="text-blue-600">{pending} pending</div>}
                    </div>
                  </button>
                );
              })}
              <div className="flex flex-col justify-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setClipboard(snapshotWeek(server, edits, week[0]))}
                  aria-label={`Copy week of ${formatDay(week[0])}`}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
                {clipboard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => pasteInto(week[0])}
                    aria-label={`Paste into week of ${formatDay(week[0])}`}
                  >
                    <ClipboardPaste className="size-3.5" /> Paste
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DayDialog
        date={openDate}
        today={today}
        games={games}
        server={server}
        edits={edits}
        saving={saving}
        onEdit={(date, gameId, value) => applyEdits((current) => setCellEdit(server, current, date, gameId, value))}
        onClose={() => setOpenDate(null)}
      />
    </div>
  );
}

function DayDialog({
  date,
  today,
  games,
  server,
  edits,
  saving,
  onEdit,
  onClose,
}: {
  date: string | null;
  today: string;
  games: PartnerGameConfig[];
  server: ReadonlyMap<string, number>;
  edits: CalendarEdits;
  saving: boolean;
  onEdit: (date: string, gameId: PartnerGameId, value: number | null) => void;
  onClose: () => void;
}) {
  const editable = date !== null && isEditableDate(date, today);
  return (
    <Dialog open={date !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        {date && (
          <>
            <DialogHeader>
              <DialogTitle>{formatDay(date)}</DialogTitle>
              <DialogDescription>
                {editable
                  ? 'Leave the override empty to use the default. 0 turns the game off for this day.'
                  : 'This date is read-only.'}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
              {games.map((game) => {
                const override = overrideFor(server, edits, date, game.gameId);
                const pending = edits.has(`${date}|${game.gameId}`);
                const invalid = override !== undefined && !isValidLimit(game.gameId, override);
                return (
                  <div key={game.gameId} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className={cn('font-medium', !game.enabled && 'text-gray-400')}>{GAME_LABELS[game.gameId]}</span>
                      {!game.enabled && <span className="ml-2 text-xs text-gray-400">disabled</span>}
                    </div>
                    <div className="text-xs text-gray-500">Default {game.defaultLimit}</div>
                    <div>
                      <Input
                        type="number"
                        min={0}
                        max={maxLimitFor(game.gameId)}
                        step={1}
                        className="h-8"
                        disabled={!editable || saving}
                        placeholder="Default"
                        aria-label={`${GAME_LABELS[game.gameId]} override`}
                        aria-invalid={invalid}
                        value={override ?? ''}
                        onChange={(e) => onEdit(date, game.gameId, e.target.value === '' ? null : Number(e.target.value))}
                      />
                      {invalid && <p className="mt-0.5 text-xs text-red-500">0 to {maxLimitFor(game.gameId)}</p>}
                    </div>
                    <div className="flex items-center gap-1">
                      {override === 0 && <Badge variant="secondary">Off</Badge>}
                      {pending && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Pending</Badge>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
