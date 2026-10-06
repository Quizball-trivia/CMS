'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Image as ImageIcon, List, Plus, Route, Settings2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dailyGame, TD_DAILY_GAMES } from '@/components/td/content/editors/dailies';
import { TdContentEditorDialog, type TdEditorTarget } from '@/components/td/content/td-content-editor';
import { TD_STATUS_WORDS } from '@/components/td/content/td-status';
import { TD_STATUS_PILL } from '@/components/td/categories/td-category-data';
import { TdBulkUploadDialog } from '@/components/td/questions/td-bulk-upload-dialog';
import { TdErrorPanel } from '@/components/td/td-error-panel';
import { tdKeys, useTdAllRows, useTdWrite } from '@/hooks/use-td-content';
import { useGeorgiaToday } from '@/hooks/use-georgia-today';
import type { TdContentRow, TdDailyGame } from '@/lib/td/admin-api';
import { tdAdmin } from '@/lib/td/client';
import { shortHash, TD_DAILY_DAY_SIZES, TD_DAY_PREFIX } from '@/lib/td/dailies';
import { tdErrorText } from '@/lib/td/errors';
import { formatDay } from '@/lib/td/georgia';
import { t, tn } from '@/lib/td/i18n';
import { isTdPublisher } from '@/lib/td/workflow';
import { cn } from '@/lib/utils';
import { useTdAuth } from '@/providers/td-auth-provider';

const LIVE = 'draft,ready,approved';
/** Days per publish request (DailyPublishRequest). */
const PUBLISH_BATCH = 60;
const ICONS: Record<TdDailyGame, LucideIcon> = { footballLogic: ImageIcon, putInOrder: List, careerPath: Route };

type QuestionRow = TdContentRow<'football-logic'> | TdContentRow<'put-in-order'> | TdContentRow<'career-path'>;
type ScheduleRow = TdContentRow<'daily-schedule'>;

export type TdDayStatus = 'published' | 'changes' | 'ready' | 'incomplete';

export interface TdDay {
  key: string;
  questions: QuestionRow[];
  /** The dates it plays on, in order (its schedule entries). */
  dates: string[];
  /** In the repeat order after the last date. */
  repeats: boolean;
  status: TdDayStatus;
  createdAt: string;
}

const questionText = (row: QuestionRow): string => {
  const data = row.data as { prompt?: string; displayAnswer?: string };
  return data.prompt || data.displayAnswer || '';
};

/** A game's days: its questions grouped by day (puzzle), with the dates each plays and what publishing would do. */
export function buildDays(game: TdDailyGame, questions: readonly QuestionRow[], schedule: readonly ScheduleRow[], cycleSets: readonly string[]): TdDay[] {
  const size = TD_DAILY_DAY_SIZES[game];
  const byKey = new Map<string, QuestionRow[]>();
  for (const row of questions) {
    if (row.status === 'archived') continue;
    const key = String(row.data.puzzle);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }
  // The calendar as releases read it: approved entries (a pending change to one is not on it yet).
  const datesOf = new Map<string, string[]>();
  for (const row of schedule) {
    const entry = row.status !== 'archived' && row.approvedVersion !== null ? row.approved : null;
    if (entry && entry.game === game) datesOf.set(entry.puzzle, [...(datesOf.get(entry.puzzle) ?? []), entry.date].sort());
  }
  return [...byKey.entries()]
    .map(([key, rows]) => {
      const dates = datesOf.get(key) ?? [];
      const repeats = cycleSets.includes(key);
      const pending = rows.some((row) => row.status !== 'approved');
      const status: TdDayStatus = rows.length !== size ? 'incomplete' : dates.length || repeats ? (pending ? 'changes' : 'published') : 'ready';
      return {
        key,
        questions: [...rows].sort((a, b) => a.position - b.position),
        dates,
        repeats,
        status,
        createdAt: rows.reduce((min, row) => (row.createdAt < min ? row.createdAt : min), rows[0]!.createdAt),
      };
    })
    .sort((a, b) => {
      // Dated days by their first date, then the rest in the order they were made.
      if (a.dates.length && b.dates.length) return a.dates[0]!.localeCompare(b.dates[0]!);
      if (a.dates.length !== b.dates.length) return a.dates.length ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/** When a day plays, in words. */
function whenText(day: TdDay, today: string | null): string {
  const next = today ? day.dates.find((date) => date >= today) : day.dates[0];
  if (next) return next === today ? t('Today · {date}', { date: formatDay(next) }) : formatDay(next);
  const played = day.dates[day.dates.length - 1];
  if (played) return t('Played {date}', { date: formatDay(played) });
  if (day.repeats) return t('In the repeat order');
  return t('Not published');
}

function statusText(day: TdDay, size: number): string {
  switch (day.status) {
    case 'published':
      return t('Published');
    case 'changes':
      return t('Changes to publish');
    case 'ready':
      return t('Ready to publish');
    case 'incomplete':
      return day.questions.length < size
        ? tn(size - day.questions.length, 'Add {count} more question', 'Add {count} more questions')
        : tn(day.questions.length - size, 'Remove {count} question', 'Remove {count} questions');
  }
}

/** The Daily page: the three games; a game's days with when they play; a day's questions; upload, write and publish. */
export function TdDailiesTab() {
  const { user } = useTdAuth();
  const write = useTdWrite();
  const today = useGeorgiaToday();
  const publisher = Boolean(user && isTdPublisher(user.role));
  const [game, setGame] = useState<TdDailyGame>(() => {
    const asked = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('game');
    return TD_DAILY_GAMES.some((g) => g.game === asked) ? (asked as TdDailyGame) : 'footballLogic';
  });
  const { type, label } = dailyGame(game);
  const size = TD_DAILY_DAY_SIZES[game];
  const questions = useTdAllRows(type, { status: LIVE });
  const archived = useTdAllRows(type, { status: 'archived' });
  const schedule = useTdAllRows('daily-schedule', { game, status: LIVE });
  const settings = useTdAllRows('daily-settings', { status: LIVE });
  const settingsRow = settings.data?.rows.find((row) => row.data.game === game) ?? null;
  const days = useMemo(
    () => buildDays(game, (questions.data?.rows ?? []) as QuestionRow[], schedule.data?.rows ?? [], settingsRow?.approved?.cycle?.sets ?? []),
    [game, questions.data, schedule.data, settingsRow],
  );
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [target, setTarget] = useState<TdEditorTarget | null>(null);
  const [editing, setEditing] = useState<{ list: QuestionRow[]; index: number } | null>(null);
  const [seconds, setSeconds] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // A link to one question (the release report): its day opens, and it does.
  const [linked, setLinked] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('q')));
  useEffect(() => {
    if (!linked || !questions.data) return;
    const rows = (questions.data.rows ?? []) as QuestionRow[];
    const found = rows.find((row) => String(row.data.key) === linked) ?? null;
    const inDay = found ? String(found.data.puzzle) : rows.some((row) => String(row.data.puzzle) === linked) ? linked : null;
    if (inDay) {
      setOpenDay(inDay);
      const list = days.find((d) => d.key === inDay)?.questions ?? [];
      if (found && list.length) setEditing({ list, index: Math.max(0, list.findIndex((row) => row.id === found.id)) });
      setLinked(null);
      return;
    }
    // Not a live one: an archived question opens in the archived list, once that list is read.
    if (!archived.data) {
      if (archived.error) setLinked(null);
      return;
    }
    const gone = (archived.data.rows ?? []) as QuestionRow[];
    const index = gone.findIndex((row) => String(row.data.key) === linked);
    if (index >= 0) {
      setShowArchived(true);
      setEditing({ list: gone, index });
    }
    setLinked(null);
  }, [linked, questions.data, archived.data, archived.error, days]);
  const readError = questions.error ?? archived.error ?? schedule.error ?? settings.error ?? null;

  const publishable = days.filter((day) => day.status === 'ready' || day.status === 'changes');
  // Only chosen days that can still be published (one may have changed since it was ticked).
  const chosenDays = publishable.filter((d) => chosen.includes(d.key));
  const day = days.find((d) => d.key === openDay) ?? null;
  const ahead = today ? days.filter((d) => d.dates.some((date) => date > today)).length : 0;

  const changeGame = (next: TdDailyGame) => {
    setGame(next);
    setOpenDay(null);
    setChosen([]);
    setError(null);
    window.history.replaceState(null, '', `?game=${next}`);
  };

  const publish = async (keys: string[]) => {
    if (!keys.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const published: { puzzle: string; date: string }[] = [];
      for (let start = 0; start < keys.length; start += PUBLISH_BATCH) {
        const out = await write((operation) => tdAdmin.dailies.publish(game, keys.slice(start, start + PUBLISH_BATCH), operation), [tdKeys.content, tdKeys.releases]);
        published.push(...out.days);
      }
      setChosen([]);
      const dates = published.map((d) => formatDay(d.date));
      toast.success(
        tn(published.length, 'Published {count} day: {dates}. Players get it with the next release.', 'Published {count} days: {dates}. Players get them with the next release.', {
          dates: dates.length > 5 ? `${dates.slice(0, 5).join(', ')}…` : dates.join(', '),
        }),
      );
    } catch (caught) {
      setError(caught);
      toast.error(tdErrorText(caught));
    } finally {
      setBusy(false);
    }
  };

  // A new question goes into the open day while it is short of a whole one, else it starts a new day.
  const newQuestion = () => {
    const into = day && day.status === 'incomplete' && day.questions.length < size ? day.key : `${TD_DAY_PREFIX[game]}-${shortHash(`${Date.now()}:${Math.random()}`)}`;
    setTarget({ type, row: null, preset: { puzzle: into } as never });
  };

  return (
    <div className="space-y-6">
      {/* The games */}
      <div className="grid gap-3 sm:grid-cols-3">
        {TD_DAILY_GAMES.map((g) => {
          const Icon = ICONS[g.game];
          const selected = g.game === game;
          return (
            <button
              key={g.game}
              type="button"
              onClick={() => changeGame(g.game)}
              aria-pressed={selected}
              className={cn(
                'flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-300',
              )}
            >
              <span className={cn('grid size-10 place-items-center rounded-xl', selected ? 'bg-white/10' : 'bg-slate-100 text-slate-600')}>
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{g.label}</span>
                <span className={cn('block text-xs', selected ? 'text-white/70' : 'text-slate-500')}>{tn(TD_DAILY_DAY_SIZES[g.game], 'A day: {count} question', 'A day: {count} questions')}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* The chosen game's days */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-auto">
            <h2 className="text-lg font-bold">{label}</h2>
            <p className="text-sm text-slate-500">
              {tn(ahead, '{count} day planned after today.', '{count} days planned after today.')} {t('Published days reach players with the next release.')}
            </p>
          </div>
          {game !== 'careerPath' && settingsRow && (
            <Button variant="ghost" size="icon" aria-label={t('Seconds per question')} onClick={() => setSeconds(true)}>
              <Settings2 className="size-4" />
            </Button>
          )}
          <TdBulkUploadDialog key={game} initialType={type} types={[type]} />
          <Button variant="outline" onClick={newQuestion}>
            <Plus className="mr-1 size-4" />
            {t('New Question')}
          </Button>
          {publisher && (
            <Button disabled={busy || publishable.length === 0} onClick={() => void publish(publishable.map((d) => d.key))}>
              <CalendarCheck className="mr-1 size-4" />
              {tn(publishable.length, 'Publish {count} ready day', 'Publish all {count} ready days')}
            </Button>
          )}
        </div>

        {error !== null && <TdErrorPanel error={error} className="mt-3" />}
        {readError !== null && <TdErrorPanel error={readError} className="mt-3" />}

        {(questions.isLoading || schedule.isLoading) && <p className="mt-4 text-sm text-slate-500">{t('Loading…')}</p>}
        {!questions.isLoading && readError === null && days.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{t('No questions yet: upload a file or write one.')}</p>
        )}

        {days.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {days.map((d) => {
              const canPublish = publisher && (d.status === 'ready' || d.status === 'changes');
              return (
                <li key={d.key}>
                  <div className={cn('flex items-center gap-3 px-3 py-2.5', openDay === d.key && 'bg-slate-50')}>
                    {publisher && (
                      <Checkbox
                        aria-label={t('Choose {day}', { day: whenText(d, today) })}
                        disabled={!canPublish}
                        checked={canPublish && chosen.includes(d.key)}
                        onCheckedChange={(on) => setChosen((list) => (on ? [...list, d.key] : list.filter((k) => k !== d.key)))}
                      />
                    )}
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpenDay(openDay === d.key ? null : d.key)} aria-expanded={openDay === d.key}>
                      <span className="w-32 shrink-0 text-sm font-semibold">{whenText(d, today)}</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{questionText(d.questions[0]!)}</span>
                      <span className="shrink-0 text-xs text-slate-500">{`${d.questions.length}/${size}`}</span>
                      <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold', d.status === 'published' ? 'bg-emerald-50 text-emerald-700' : d.status === 'incomplete' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700')}>
                        {statusText(d, size)}
                      </span>
                    </button>
                    {canPublish && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => void publish([d.key])}>
                        {t('Publish')}
                      </Button>
                    )}
                  </div>
                  {openDay === d.key && (
                    <ul className="space-y-1 bg-slate-50 px-3 pb-3">
                      {d.questions.map((row, index) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => setEditing({ list: d.questions, index })}
                            className="flex w-full items-center gap-3 rounded-lg bg-white px-3 py-2 text-left text-sm hover:bg-slate-100"
                          >
                            <span className="w-6 text-xs text-slate-400">{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate">{questionText(row)}</span>
                            <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', TD_STATUS_PILL[row.status])}>{TD_STATUS_WORDS[row.status]}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {(archived.data?.rows.length ?? 0) > 0 && (
          <div className="mt-4">
            <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-900" aria-expanded={showArchived} onClick={() => setShowArchived((on) => !on)}>
              {tn(archived.data!.rows.length, 'Archived question ({count})', 'Archived questions ({count})')}
            </button>
            {showArchived && (
              <ul className="mt-2 space-y-1">
                {(archived.data!.rows as QuestionRow[]).map((row, index, all) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => setEditing({ list: all, index })} className="flex w-full items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100">
                      <span className="min-w-0 flex-1 truncate">{questionText(row)}</span>
                      <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-widest', TD_STATUS_PILL[row.status])}>{TD_STATUS_WORDS[row.status]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {publisher && chosenDays.length > 0 && (
          <div className="mt-3 flex justify-end">
            <Button disabled={busy} onClick={() => void publish(chosenDays.map((d) => d.key))}>
              {tn(chosenDays.length, 'Publish {count} chosen day', 'Publish {count} chosen days')}
            </Button>
          </div>
        )}
      </div>

      <TdContentEditorDialog target={target} onClose={() => setTarget(null)} />
      {editing && (
        <TdContentEditorDialog
          target={{ type, row: editing.list[editing.index]! }}
          startOn="preview"
          onClose={() => setEditing(null)}
          nav={{ index: editing.index, total: editing.list.length, more: false, onGo: (index) => setEditing({ ...editing, index }) }}
        />
      )}
      {seconds && settingsRow && <SecondsDialog row={settingsRow} publisher={publisher} onClose={() => setSeconds(false)} />}
    </div>
  );
}

/** Seconds per question of a game (its settings row), saved, marked ready and, by a publisher, approved. */
function SecondsDialog({ row, publisher, onClose }: { row: TdContentRow<'daily-settings'>; publisher: boolean; onClose: () => void }) {
  const write = useTdWrite();
  const [value, setValue] = useState(String(row.data.seconds ?? ''));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const seconds = Number(value);
  const valid = Number.isInteger(seconds) && seconds >= 1 && seconds <= 600;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await write(async (operation) => {
        let saved = await tdAdmin.content('daily-settings').edit(row.id, { version: row.version, data: { ...row.data, seconds }, position: row.position, note: row.note }, operation);
        if (saved.status === 'draft') saved = await tdAdmin.content('daily-settings').ready(saved.id, saved.version, operation);
        if (publisher && saved.status === 'ready') saved = await tdAdmin.content('daily-settings').approve(saved.id, saved.version, undefined, operation);
        return saved;
      });
      toast.success(publisher ? t('Saved') : t('Saved; a publisher approves it'));
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('Seconds per question')}</DialogTitle>
          <DialogDescription>{t('How long a player has for each question of this game.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="td-seconds">{t('Seconds')}</Label>
          <Input id="td-seconds" inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} />
          {!valid && <p className="text-xs text-destructive">{t('1 to 600 seconds.')}</p>}
        </div>
        {error !== null && <TdErrorPanel error={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={!valid || busy} onClick={() => void save()}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
