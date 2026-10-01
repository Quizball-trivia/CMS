'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TdSection } from '@/components/td/td-page';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { TdCellTitle, TdContentList } from '@/components/td/content/td-content-list';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TD_DAILY_GAMES, useTdPuzzles, type TdPuzzle } from '@/components/td/content/editors/dailies';
import { TdStatusChip } from '@/components/td/content/td-status';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdContentRow, TdDailyGame } from '@/lib/td/admin-api';
import { addDays, daysFrom, formatDay, formatMonth, monthGrid, scheduledSet, shiftMonth, type DailyCycle } from '@/lib/td/georgia';
import { useGeorgiaToday } from '@/hooks/use-georgia-today';
import { cn } from '@/lib/utils';

const ALL = 'draft,ready,approved,archived';
const COVERAGE_DAYS = 30;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ScheduleRow = TdContentRow<'daily-schedule'>;
type SettingsRow = TdContentRow<'daily-settings'>;

export interface TdDayView {
  date: string;
  /** What a release published now would play (approved content only). */
  planned: string | null;
  source: 'date' | 'cycle' | null;
  playable: boolean;
  /** The date's own row, whatever its status. */
  row: ScheduleRow | null;
  /** A pending change: the row's working puzzle when it is not what is planned. */
  pending: string | null;
  inWindow: boolean;
  missing: boolean;
}

/**
 * The calendar as the next release would play it: a date's approved entry,
 * otherwise the approved cycle, archived rows left out (as the API's release
 * snapshot does); working drafts shown beside it as pending changes.
 */
export function planDays(dates: string[], today: string, rows: ScheduleRow[], settings: SettingsRow | null, puzzles: TdPuzzle[]): TdDayView[] {
  const byDate = new Map<string, ScheduleRow>();
  for (const row of rows) {
    const known = byDate.get(row.data.date);
    // A live row wins over an archived one for the same date (there is only one per date and game).
    if (!known || known.status === 'archived') byDate.set(row.data.date, row);
  }
  const approvedCycle = settings && settings.status !== 'archived' && settings.approvedVersion !== null ? ((settings.approved?.cycle ?? null) as DailyCycle | null) : null;
  const playable = new Map(puzzles.map((p) => [p.key, p.playable]));
  const windowEnd = addDays(today, COVERAGE_DAYS - 1);
  return dates.map((date) => {
    const row = byDate.get(date) ?? null;
    const own = row && row.status !== 'archived' && row.approvedVersion !== null ? row.approved?.puzzle : undefined;
    const planned = scheduledSet(own, approvedCycle, date);
    const inWindow = date >= today && date <= windowEnd;
    const ok = planned !== null && (playable.get(planned) ?? false);
    return {
      date,
      planned,
      source: own !== undefined ? 'date' : planned ? 'cycle' : null,
      playable: ok,
      row,
      pending: row && row.status !== 'archived' && row.data.puzzle !== planned ? row.data.puzzle : null,
      inWindow,
      missing: inWindow && !ok,
    };
  });
}

export function TdDailiesTab() {
  const [game, setGame] = useState<TdDailyGame>('footballLogic');
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const info = TD_DAILY_GAMES.find((g) => g.game === game)!;
  return (
    <>
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1" role="tablist" aria-label="Daily game">
        {TD_DAILY_GAMES.map((g) => (
          <button
            key={g.game}
            type="button"
            role="tab"
            aria-selected={g.game === game}
            onClick={() => setGame(g.game)}
            className={cn('rounded-lg px-4 py-2 text-sm font-medium', g.game === game ? 'bg-(--td-input) text-foreground' : 'text-(--td-text-3) hover:text-foreground')}
          >
            {g.label}
          </button>
        ))}
      </div>
      <TdCalendar key={game} game={game} onOpen={setTarget} />
      <TdGameSettings game={game} onOpen={setTarget} />
      <TdContentList
        key={`list-${game}`}
        type={info.type}
        title={`${info.label}: puzzles`}
        description="Every question belongs to a puzzle (set); a date plays one puzzle."
        onOpen={(row) => setTarget({ type: info.type, row })}
        onCreate={() => setTarget({ type: info.type, row: null })}
        createLabel="New question"
        emptyTitle="No questions yet"
        columns={[
          { header: 'Puzzle', className: 'w-32', cell: (row) => <span className="font-mono text-xs">{String(row.data.puzzle)}</span> },
          {
            header: 'Question',
            cell: (row) => {
              const data = row.data as { key: string; displayAnswer?: string; prompt?: string };
              return <TdCellTitle title={data.displayAnswer ?? data.prompt} sub={data.key} />;
            },
          },
        ]}
      />
      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
    </>
  );
}

function TdCalendar({ game, onOpen }: { game: TdDailyGame; onOpen: (target: TdEditorTarget) => void }) {
  const today = useGeorgiaToday();
  const [month, setMonth] = useState<string | null>(null);
  const shown = month ?? today?.slice(0, 7) ?? null;
  const weeks = shown ? monthGrid(`${shown}-01`) : [];
  const monthDates = weeks.flat().filter((d): d is string => d !== null);
  const earlier = (a: string, b: string) => (a < b ? a : b);
  const later = (a: string, b: string) => (a > b ? a : b);
  const from = today && shown ? earlier(monthDates[0], today) : undefined;
  const to = today && shown ? later(monthDates[monthDates.length - 1], addDays(today, COVERAGE_DAYS - 1)) : undefined;
  const rows = useTdAllRows('daily-schedule', { game, from, to, status: ALL }, Boolean(from));
  const settings = useTdAllRows('daily-settings', { game, status: ALL });
  const { puzzles } = useTdPuzzles(game);
  const setting = settings.data?.rows.find((row) => row.status !== 'archived') ?? null;

  const days = today && from && to ? planDays(daysFrom(from, Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1), today, rows.data?.rows ?? [], setting, puzzles) : [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  const coverage = days.filter((d) => d.inWindow);
  const missing = coverage.filter((d) => d.missing);

  const open = (day: TdDayView) =>
    onOpen(day.row ? { type: 'daily-schedule', row: day.row } : { type: 'daily-schedule', row: null, preset: { game, date: day.date, puzzle: day.planned ?? '' } });

  return (
    <TdSection
      title="Calendar"
      description="One puzzle per Georgia date: the date’s own entry, otherwise the cycle. It shows what a release published now would play; pending changes are marked."
      actions={
        shown && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(shown, -1))}>
              <ChevronLeft />
            </Button>
            <span className="w-36 text-center text-sm font-medium">{formatMonth(shown)}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(shown, 1))}>
              <ChevronRight />
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4">
        <TdErrorPanel error={rows.error ?? settings.error} />
        {today && rows.isSuccess && (
          <p className={cn('rounded-lg px-3 py-2 text-sm', missing.length ? 'bg-(--td-danger)/10 text-(--td-danger)' : 'bg-(--td-new)/10 text-(--td-new)')}>
            {missing.length
              ? `${missing.length} of the next ${COVERAGE_DAYS} days have no playable puzzle (from ${formatDay(missing[0].date)}). A release needs all ${COVERAGE_DAYS}.`
              : `The next ${COVERAGE_DAYS} days all have a playable puzzle.`}
          </p>
        )}
        <div className="grid grid-cols-7 gap-1 text-xs">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-1 pb-1 text-center font-medium text-(--td-text-3)">
              {day}
            </div>
          ))}
          {weeks.flat().map((date, i) => {
            if (!date) return <div key={`pad-${i}`} />;
            const day = byDate.get(date);
            return (
              <button
                key={date}
                type="button"
                onClick={() => day && open(day)}
                aria-label={`${formatDay(date)}: ${day?.planned ?? 'no puzzle'}`}
                className={cn(
                  'flex min-h-20 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors hover:bg-secondary/60',
                  day?.inWindow ? 'border-border bg-(--td-input)/40' : 'border-transparent bg-(--td-input)/15',
                  day?.missing && 'border-(--td-danger)/60',
                  date === today && 'ring-1 ring-primary',
                )}
              >
                <span className="flex items-center justify-between">
                  <span className={cn('tabular-nums', date === today ? 'font-bold text-primary' : 'text-(--td-text-3)')}>{Number(date.slice(8))}</span>
                  {day?.row && <TdStatusChip status={day.row.status} className="px-1.5 py-0 text-[10px]" />}
                </span>
                {day?.planned ? (
                  <span className={cn('truncate font-mono text-[11px]', day.playable ? 'text-foreground' : 'text-(--td-danger)')} title={day.playable ? undefined : 'No approved question in this puzzle'}>
                    {day.planned}
                  </span>
                ) : (
                  day?.inWindow && <span className="text-[11px] text-(--td-danger)">No puzzle</span>
                )}
                {day?.planned && <span className="text-[10px] text-(--td-text-3)">{day.source === 'cycle' ? 'cycle' : 'own date'}</span>}
                {day?.pending && <span className="truncate text-[10px] text-amber-800">→ {day.pending}</span>}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-(--td-text-3)">Click a date to schedule it or open its entry. An archived entry still holds its date: a publisher restores it rather than making a new one.</p>
      </div>
    </TdSection>
  );
}

function TdGameSettings({ game, onOpen }: { game: TdDailyGame; onOpen: (target: TdEditorTarget) => void }) {
  const settings = useTdAllRows('daily-settings', { game, status: ALL });
  const row = settings.data?.rows.find((r) => r.status !== 'archived') ?? settings.data?.rows[0] ?? null;
  const data = row?.data;
  return (
    <TdSection
      title="Timing and cycle"
      description="Seconds per question or round, and the puzzles played in turn on dates without their own."
      actions={
        row ? (
          <Button variant="secondary" className="rounded-lg" onClick={() => onOpen({ type: 'daily-settings', row })}>
            <Pencil />
            Edit
          </Button>
        ) : (
          settings.isSuccess && (
            <Button className="rounded-lg" onClick={() => onOpen({ type: 'daily-settings', row: null, preset: { game, seconds: game === 'careerPath' ? null : 30, cycle: null } })}>
              <Plus />
              Create settings
            </Button>
          )
        )
      }
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-4 text-sm">
        {settings.isLoading && <span className="text-(--td-text-3)">Loading…</span>}
        {settings.isSuccess && !row && <span className="text-(--td-text-3)">No settings yet: a release needs them.</span>}
        {row && data && (
          <>
            <TdStatusChip status={row.status} />
            <span>
              <span className="text-(--td-text-3)">Seconds </span>
              {data.seconds ?? '—'}
            </span>
            <span>
              <span className="text-(--td-text-3)">Cycle </span>
              {data.cycle ? `${data.cycle.sets.join(' → ')} from ${formatDay(data.cycle.anchor)}` : 'none'}
            </span>
          </>
        )}
      </div>
    </TdSection>
  );
}
