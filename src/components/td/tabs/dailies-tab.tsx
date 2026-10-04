'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { Image as ImageIcon, List, Route, Search, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { dailyGame, TD_DAILY_GAMES, type TdPuzzle } from '@/components/td/content/editors/dailies';
import { TD_STATUS_LABELS } from '@/components/td/content/td-status';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import { useGeorgiaToday } from '@/hooks/use-georgia-today';
import type { TdContentData, TdContentRow, TdDailyGame } from '@/lib/td/admin-api';
import { TdApiError } from '@/lib/td/api-client';
import { tdAdmin } from '@/lib/td/client';
import { addDays, dayNumber, daysFrom, formatDay, scheduledSet, type DailyCycle } from '@/lib/td/georgia';
import { t, tc, tn } from '@/lib/td/i18n';
import { contentActions, isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

const ALL = 'draft,ready,approved,archived';
const COVERAGE_DAYS = 30;
const DEFAULT_SECONDS = 30;

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

// Quizball's icons for the same three games (daily-challenges.definitions.ts).
const META: Record<TdDailyGame, { Icon: LucideIcon; description: string }> = {
  footballLogic: { Icon: ImageIcon, description: t('Use the visual clues to decode the footballer, match, or moment.') },
  putInOrder: { Icon: List, description: t('Put the items into the correct order.') },
  careerPath: { Icon: Route, description: t('Read the club path and identify the player behind the journey.') },
};

interface DailySet extends TdPuzzle {
  /** Questions with approved content in this set. */
  approved: number;
}

/** The sets a game has, from its live questions: how many there are in each and how many are approved. */
function useDailySets(game: TdDailyGame) {
  const rows = useTdAllRows(dailyGame(game).type, { status: 'draft,ready,approved' });
  const sets = useMemo(() => {
    const byKey = new Map<string, DailySet>();
    const entry = (key: string) => byKey.get(key) ?? { key, questions: 0, approved: 0, playable: false };
    for (const row of rows.data?.rows ?? []) {
      const working = entry(String(row.data.puzzle));
      byKey.set(working.key, { ...working, questions: working.questions + 1 });
      if (row.approvedVersion !== null && row.approved) {
        const approved = entry(String(row.approved.puzzle));
        byKey.set(approved.key, { ...approved, approved: approved.approved + 1, playable: true });
      }
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [rows.data]);
  return { sets, isSuccess: rows.isSuccess, error: rows.error };
}

/** What a game has: its settings row, its sets, and whether each of the next 30 days has a playable set. */
function useDailyGame(game: TdDailyGame) {
  const today = useGeorgiaToday();
  const settings = useTdAllRows('daily-settings', { status: ALL });
  const { sets, isSuccess: setsLoaded, error: setsError } = useDailySets(game);
  const range = today ? { from: today, to: addDays(today, COVERAGE_DAYS - 1) } : {};
  const schedule = useTdAllRows('daily-schedule', { game, status: ALL, ...range }, today !== null);

  const row = useMemo(() => {
    const rows = (settings.data?.rows ?? []).filter((r) => r.data.game === game);
    return rows.find((r) => r.status !== 'archived') ?? rows[0] ?? null;
  }, [settings.data, game]);
  const days = useMemo(() => (today && schedule.data && setsLoaded ? planDays(daysFrom(today, COVERAGE_DAYS), today, schedule.data.rows, row, sets) : null), [today, schedule.data, setsLoaded, row, sets]);
  const missing = days ? days.filter((day) => day.missing) : null;
  // Dates with a set of their own play it instead of the rotation (made before this page; it has no calendar).
  const own = days ? days.filter((day) => day.source === 'date' && day.row) : [];
  return { today, row, sets, missing, own, loaded: settings.isSuccess && setsLoaded, error: settings.error ?? setsError ?? schedule.error };
}

/** What the form holds: the seconds as typed, the cycle's start and its sets in turn (none: no cycle). */
interface Form {
  seconds: string;
  anchor: string;
  sets: string[];
  /** The revision an edit started from (null: there was no row, so it saves as a new one): a save sent at it is refused if someone changed the row meanwhile. */
  base?: number | null;
  /** The fields as they were when the edit started: what was changed, against what someone else changed meanwhile. */
  from?: Fields;
}

type Fields = Pick<Form, 'seconds' | 'anchor' | 'sets'>;

/** Theirs where this edit left a field as it found it, this edit's where it changed it. */
function rebase(edit: Form, theirs: Fields, version: number): Form {
  const from = edit.from ?? theirs;
  const pick = <K extends keyof Fields>(key: K): Fields[K] => (JSON.stringify(edit[key]) === JSON.stringify(from[key]) ? theirs[key] : edit[key]);
  return { seconds: pick('seconds'), anchor: pick('anchor'), sets: pick('sets'), base: version, from: theirs };
}

function formOf(game: TdDailyGame, row: SettingsRow | null, today: string | null): Form {
  return {
    seconds: game === 'careerPath' ? '' : String(row ? (row.data.seconds ?? '') : DEFAULT_SECONDS),
    anchor: row?.data.cycle?.anchor ?? today ?? '',
    sets: row?.data.cycle?.sets ?? [],
  };
}

function dataOf(game: TdDailyGame, form: Form): TdContentData<'daily-settings'> {
  return { game, seconds: game === 'careerPath' ? null : Number(form.seconds), cycle: form.sets.length > 0 ? { anchor: form.anchor, sets: form.sets } : null };
}

function problemsOf(game: TdDailyGame, form: Form) {
  const seconds = form.seconds.trim();
  const secondsOk = game === 'careerPath' || (/^\d+$/.test(seconds) && Number(seconds) >= 1 && Number(seconds) <= 600);
  return {
    seconds: secondsOk ? null : t('1 to 600 seconds.'),
    anchor: form.sets.length === 0 || dayNumber(form.anchor) !== null ? null : t('A date (YYYY-MM-DD)'),
  };
}

function sameForm(game: TdDailyGame, a: Form, b: Form): boolean {
  return a.sets.join() === b.sets.join() && (a.sets.length === 0 || a.anchor === b.anchor) && (game === 'careerPath' || a.seconds.trim() === b.seconds.trim());
}

function SettingField({ label, type, value, onChange, problem, min, max }: { label: string; type: 'number' | 'date'; value: string; onChange: (value: string) => void; problem: string | null; min?: number; max?: number }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</Label>
      <Input id={id} type={type} value={value} min={min} max={max} aria-invalid={problem !== null} onChange={(event) => onChange(event.target.value)} className="h-10" />
      {problem && <p role="alert" className="text-xs text-red-600">{problem}</p>}
    </div>
  );
}

function DailySets({
  options,
  turns,
  coverage,
  onToggle,
  onSelectAll,
  onClear,
}: {
  options: DailySet[];
  /** The cycle: set keys in turn, a set that plays twice twice. */
  turns: string[];
  coverage: ReactNode;
  onToggle: (key: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const selected = useMemo(() => new Set(turns), [turns]);
  const filtered = useMemo(() => {
    const toShow = normalizedQuery.length === 0 ? options : options.filter((set) => set.key.toLowerCase().includes(normalizedQuery));
    // The sets in turn first, in turn: the order shows what plays after what.
    const rank = (key: string) => (selected.has(key) ? turns.indexOf(key) : turns.length);
    return [...toShow].sort((left, right) => rank(left.key) - rank(right.key) || right.approved - left.approved || left.key.localeCompare(right.key));
  }, [options, normalizedQuery, selected, turns]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search sets...')}
            className="h-9 bg-white pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClear} disabled={turns.length === 0}>
            {t('Clear')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSelectAll} disabled={options.every((set) => selected.has(set.key))}>
            {t('Select all')}
          </Button>
        </div>
      </div>

      <div className="mt-3 max-h-64 overflow-y-auto pr-1">
        <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((set) => {
            const isSelected = selected.has(set.key);
            const positions = turns.flatMap((key, index) => (key === set.key ? [index + 1] : []));
            return (
              <label
                key={set.key}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-xl border bg-white px-3 py-2 transition-colors',
                  isSelected ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onToggle(set.key, checked === true)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {set.key}
                  </div>
                  <div className={cn('mt-0.5 text-xs', isSelected && !set.playable ? 'text-amber-600' : 'text-slate-500')}>
                    {isSelected ? `${t('Day {turns}', { turns: positions.join(', ') })} · ` : ''}
                    {t('{approved} approved · {total} total', { approved: set.approved, total: set.questions })}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {options.length === 0
              ? t('No sets yet. Give questions a set on the Questions page or in an upload.')
              : t('No sets match this search.')}
          </div>
        ) : null}
      </div>

      {coverage}

      <p className="mt-3 text-xs text-slate-500">
        {t('One set a day, in this order, the first on the day the cycle starts. With none selected, no set is played in turn.')}
      </p>
    </div>
  );
}

type Action = 'save' | 'ready' | 'approve' | 'restore';

function DailyEditor({ game, edit, onEdit }: { game: TdDailyGame; edit: Form | undefined; onEdit: (form: Form | null | ((current: Form | undefined) => Form | null | undefined)) => void }) {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const queryClient = useQueryClient();
  const { today, row, sets, missing, own } = useDailyGame(game);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<unknown>(null);

  const info = dailyGame(game);
  const { Icon, description } = META[game];
  const saved = formOf(game, row, today);
  const form = edit ?? saved;
  const dirty = !sameForm(game, form, saved);
  const problems = problemsOf(game, form);
  const invalid = problems.seconds !== null || problems.anchor !== null;
  const actions = row && user ? contentActions(row, user) : null;
  const saveAllowed = actions ? actions.save.allowed : true;

  // A set the cycle names that no question has any more stays in the list, so it can be taken out.
  const options = useMemo(() => {
    const known = new Set(sets.map((set) => set.key));
    const gone = [...new Set(form.sets)].filter((key) => !known.has(key));
    return [...sets, ...gone.map((key): DailySet => ({ key, questions: 0, approved: 0, playable: false }))];
  }, [sets, form.sets]);

  const change = (patch: Partial<Form>) => onEdit({ ...form, ...patch, base: edit ? edit.base : (row?.version ?? null), from: edit ? edit.from : saved });

  /** `sent`: the draft a save went out with. Cleared once saved only if it is still the one shown: anything
   *  typed since (after leaving for another game and coming back) stays. */
  async function run(action: Action, work: () => Promise<unknown>, done: string, sent?: Form) {
    setBusy(action);
    setError(null);
    try {
      await work();
      if (sent) onEdit((current) => (current === sent ? null : current));
      toast.success(done);
    } catch (caught) {
      if (caught instanceof TdApiError && caught.code === 'revision_conflict') {
        // Someone changed it meanwhile: their changes come in where this edit left a field alone, and the edit stays on their revision.
        const current = (caught.details as { current?: SettingsRow } | null)?.current;
        if (sent && current && typeof current.version === 'number') onEdit((now) => (now === sent ? rebase(sent, formOf(game, current, today), current.version) : now));
        void queryClient.invalidateQueries({ queryKey: tdKeys.content });
      }
      setError(caught);
    } finally {
      setBusy(null);
    }
  }

  const api = tdAdmin.content('daily-settings');
  const save = () => {
    const data = dataOf(game, form);
    // An edit begun when there was no row saves as a new one: one made meanwhile refuses it, and is not overwritten.
    const version = edit ? edit.base : row?.version;
    void run('save', () => write((operation) => (row && version != null ? api.edit(row.id, { version, data }, operation) : api.create({ data }, operation))), t('{game} saved', { game: info.label }), edit);
  };
  // Archived, a date's own set gives way to the rotation at the next publish.
  const playRotation = () =>
    run(
      'save',
      () => write(async (operation) => {
        for (const day of own) await tdAdmin.content('daily-schedule').archive(day.row!.id, day.row!.version, operation);
      }),
      t('Those days play the rotation from the next publish'),
    );

  const transition = (action: 'ready' | 'approve' | 'restore', done: string) => {
    if (!row) return;
    const { id, version } = row;
    void run(action, () => write((operation) => (action === 'approve' ? api.approve(id, version, undefined, operation) : api[action](id, version, operation))), done);
  };

  const reason = !actions
    ? null
    : dirty && (actions.ready.allowed || actions.approve.allowed || actions.restore.allowed)
      ? t('Unsaved changes. Save before changing the status.')
      : ([...new Set([actions.save.reason, actions.approve.reason, actions.restore.reason])].filter(Boolean).join(' ') || null);

  // What a release published now would play, so settings still waiting for approval are not in it.
  const waiting = row !== null && (row.status === 'draft' || row.status === 'ready');
  const coverage =
    missing === null ? null : (
      <div className={cn('mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-center text-sm', missing.length > 0 ? 'text-amber-600' : 'text-slate-500')}>
        {missing.length > 0
          ? tn(
              missing.length,
              '{missing} of the next {days} days has no playable set (from {date}). A release needs all {days}.',
              '{missing} of the next {days} days have no playable set (from {date}). A release needs all {days}.',
              { missing: missing.length, days: COVERAGE_DAYS, date: formatDay(missing[0].date) },
            )
          : t('The next {days} days all have a playable set.', { days: COVERAGE_DAYS })}
        {waiting && ` ${t('Settings waiting for approval are not counted.')}`}
      </div>
    );

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-3">
              <Icon className="h-5 w-5 text-slate-700" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-950">{info.label}</h2>
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  {tn(form.sets.length, '{count} set', '{count} sets')}
                </Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  {row ? TD_STATUS_LABELS[row.status] : t('No settings yet')}
                </Badge>
              </div>
              <p className="max-w-3xl text-sm text-slate-500">{description}</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={busy !== null || !saveAllowed || invalid || (row !== null && !dirty)}>
                {t('Save')}
              </Button>
              {actions?.ready.allowed && (
                <Button onClick={() => transition('ready', t('Marked ready for review'))} disabled={busy !== null || dirty}>
                  {t('Mark ready')}
                </Button>
              )}
              {actions?.approve.allowed && (
                <Button onClick={() => transition('approve', tc('Approved', 'it happened'))} disabled={busy !== null || dirty}>
                  {t('Approve')}
                </Button>
              )}
              {actions?.restore.allowed && (
                <Button onClick={() => transition('restore', t('Restored'))} disabled={busy !== null || dirty}>
                  {t('Restore')}
                </Button>
              )}
            </div>
            {reason && <p className="max-w-xs text-xs text-slate-500 lg:text-right">{reason}</p>}
          </div>
        </div>

        <TdErrorPanel error={error} />

        <fieldset disabled={busy !== null} className="contents">
          {(game !== 'careerPath' || form.sets.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {game !== 'careerPath' && (
                <SettingField
                  label={game === 'footballLogic' ? t('Seconds / Question') : t('Seconds / Round')}
                  type="number"
                  min={1}
                  max={600}
                  value={form.seconds}
                  onChange={(seconds) => change({ seconds })}
                  problem={problems.seconds}
                />
              )}
              {form.sets.length > 0 && <SettingField label={t('Cycle starts')} type="date" value={form.anchor} onChange={(anchor) => change({ anchor })} problem={problems.anchor} />}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t('Sets in turn')}</Label>
                <p className="mt-1 text-xs text-slate-500">
                  {t('Pick the sets this game plays in turn, one a day.')}
                </p>
              </div>
              <span className={cn('shrink-0 text-xs font-semibold', form.sets.length > 0 ? 'text-slate-600' : 'text-amber-600')}>
                {t('{n} selected', { n: form.sets.length })}
              </span>
            </div>
            <DailySets
              options={options}
              turns={form.sets}
              coverage={coverage}
              onSelectAll={() => change({ sets: [...form.sets, ...options.map((set) => set.key).filter((key) => !form.sets.includes(key))] })}
              onClear={() => change({ sets: [] })}
              onToggle={(key, checked) => change({ sets: checked ? [...form.sets, key] : form.sets.filter((k) => k !== key) })}
            />
          </div>
        </fieldset>
        {own.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            <span>
              {tn(own.length, '{count} day has a set of its own, which plays instead of the rotation: {dates}.', '{count} days have a set of their own, which play instead of the rotation: {dates}.', {
                dates: own.map((day) => `${formatDay(day.date)} (${day.planned})`).join(', '),
              })}
            </span>
            {user && isTdPublisher(user.role) && (
              <Button size="sm" variant="outline" disabled={busy !== null || dirty} title={dirty ? t('Unsaved changes. Save before changing the status.') : undefined} onClick={() => void playRotation()} className="h-8 rounded-lg text-xs font-bold">
                {t('Play the rotation on those days')}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyGameButton({ game, isSelected, edit, onSelect }: { game: TdDailyGame; isSelected: boolean; edit: Form | undefined; onSelect: () => void }) {
  const { today, row, missing } = useDailyGame(game);
  const { Icon } = META[game];
  const form = edit ?? formOf(game, row, today);
  const seconds = game === 'careerPath' ? '' : form.seconds.trim();
  const good = row?.status === 'approved' && missing !== null && missing.length === 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
        isSelected
          ? 'border-slate-900 bg-slate-950 text-white shadow-sm'
          : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('rounded-xl p-2', isSelected ? 'bg-white/10' : 'bg-slate-100')}>
          <Icon className={cn('h-4 w-4', isSelected ? 'text-white' : 'text-slate-600')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-bold">{dailyGame(game).label}</div>
            <div
              role="img"
              aria-label={good ? t('Approved, and the next {days} days are covered', { days: COVERAGE_DAYS }) : t('Not approved, or some of the next {days} days have no playable set', { days: COVERAGE_DAYS })}
              title={good ? t('Approved, and the next {days} days are covered', { days: COVERAGE_DAYS }) : t('Not approved, or some of the next {days} days have no playable set', { days: COVERAGE_DAYS })}
              className={cn('h-2 w-2 rounded-full', good ? 'bg-emerald-500' : 'bg-slate-300')}
            />
          </div>
          <div className={cn('mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]', isSelected ? 'text-slate-300' : 'text-slate-500')}>
            <span>{tn(form.sets.length, '{count} set', '{count} sets')}</span>
            {seconds !== '' && (
              <>
                <span>·</span>
                <span>{t('{seconds} s', { seconds })}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function TdDailiesTab() {
  const [game, setGame] = useState<TdDailyGame>(TD_DAILY_GAMES[0].game);
  // What is typed and not saved, by game: it stays while another game is open.
  const [edits, setEdits] = useState<Partial<Record<TdDailyGame, Form>>>({});
  const settings = useTdAllRows('daily-settings', { status: ALL });
  const { loaded, error } = useDailyGame(game);

  const setEdit = (which: TdDailyGame, form: Form | null | ((current: Form | undefined) => Form | null | undefined)) =>
    setEdits((current) => {
      const next = { ...current };
      const value = typeof form === 'function' ? form(current[which]) : form;
      if (value) next[which] = value;
      else delete next[which];
      return next;
    });

  return (
    <>
      <TdErrorPanel error={error} />

      {!loaded && !error ? (
        <Card>
          <CardContent className="p-8 text-sm text-slate-500">{t('Loading daily challenges…')}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-2">
            <div className="space-y-1">
              {settings.isSuccess &&
                TD_DAILY_GAMES.map((info) => (
                  <DailyGameButton key={info.game} game={info.game} isSelected={info.game === game} edit={edits[info.game]} onSelect={() => setGame(info.game)} />
                ))}
            </div>
          </CardContent>
        </Card>

        {loaded ? <DailyEditor key={game} game={game} edit={edits[game]} onEdit={(form) => setEdit(game, form)} /> : null}
      </div>
    </>
  );
}
