'use client';

import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTdAllRows } from '@/hooks/use-td-content';
import type { TdDailyGame } from '@/lib/td/admin-api';
import { georgiaToday } from '@/lib/td/georgia';
import { t, tn } from '@/lib/td/i18n';
import { cn } from '@/lib/utils';
import { issuesAt, tdInputClass, TdField, TdIssueText, TdNumberField, TdNumberInput, TdOptionalTextField, TdSelectField, TdSpellingsField, TdSwitchField, TdTextField } from '../td-form';
import { KeyField, type TdEditorProps } from './rounds';

export const TD_DAILY_GAMES: ReadonlyArray<{ game: TdDailyGame; type: 'football-logic' | 'put-in-order' | 'career-path'; label: string }> = [
  { game: 'footballLogic', type: 'football-logic', label: t('Football Logic') },
  { game: 'putInOrder', type: 'put-in-order', label: t('Put in Order') },
  { game: 'careerPath', type: 'career-path', label: t('Career Path') },
];

export const dailyGame = (game: TdDailyGame) => TD_DAILY_GAMES.find((g) => g.game === game)!;

export interface TdPuzzle {
  key: string;
  questions: number;
  /** A release can play it: some question has approved content in it (a pending edit does not matter). */
  playable: boolean;
}

/** The puzzles (sets) a daily game has, from its live questions, as written and as approved. */
export function useTdPuzzles(game: TdDailyGame) {
  const rows = useTdAllRows(dailyGame(game).type, { status: 'draft,ready,approved' });
  const puzzles = useMemo(() => {
    const byKey = new Map<string, TdPuzzle>();
    for (const row of rows.data?.rows ?? []) {
      const add = (key: string, playable: boolean, counts: boolean) => {
        const found = byKey.get(key) ?? { key, questions: 0, playable: false };
        byKey.set(key, { key, questions: found.questions + (counts ? 1 : 0), playable: found.playable || playable });
      };
      add(String(row.data.puzzle), false, true);
      if (row.approvedVersion !== null && row.approved) add(String(row.approved.puzzle), true, false);
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [rows.data]);
  return { puzzles, isLoading: rows.isLoading };
}

function PuzzleField({ game, value, onChange, issues, path, label = t('Category') }: { game: TdDailyGame; value: string; onChange: (key: string) => void; issues: ReturnType<typeof issuesAt>; path: string; label?: string }) {
  const { puzzles, isLoading } = useTdPuzzles(game);
  const known = puzzles.some((p) => p.key === value);
  return (
    <TdSelectField
      label={label}
      value={value}
      onChange={onChange}
      issues={issuesAt(issues, path)}
      options={[
        { value: '', label: isLoading ? t('Loading…') : t('Choose a category') },
        ...(!known && value ? [{ value, label: t('{puzzle} (no questions)', { puzzle: value }) }] : []),
        ...puzzles.map((p) => ({
          value: p.key,
          label: p.playable
            ? tn(p.questions, '{puzzle} · {count} question', '{puzzle} · {count} questions', { puzzle: p.key })
            : tn(p.questions, '{puzzle} · {count} question · none approved', '{puzzle} · {count} questions · none approved', { puzzle: p.key }),
        })),
      ]}
      hint={t('A day plays one category; only categories with an approved question can be scheduled.')}
    />
  );
}

/** A question's day is where it was added on the Daily page (a day is a whole set); only a problem with it shows. */
function PuzzleKeyField({ issues }: { value: string; onChange: (puzzle: string) => void; issues: ReturnType<typeof issuesAt> }) {
  return <TdIssueText issues={issuesAt(issues, 'data.puzzle')} />;
}

export function FootballLogicEditor({ value, onChange, issues, creating }: TdEditorProps<'football-logic'>) {
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <div className="grid gap-3 sm:grid-cols-2">
        <PuzzleKeyField value={value.puzzle} onChange={(puzzle) => onChange({ ...value, puzzle })} issues={issues} />
        <TdTextField label={t('Topic')} value={value.category} onChange={(category) => onChange({ ...value, category })} issues={issuesAt(issues, 'data.category')} hint={t('Shown above the question in the game.')} />
      </div>
      <TdTextField label={t('Prompt (optional)')} multiline value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TdOptionalTextField label={t('Image A')} value={value.imageA} onChange={(imageA) => onChange({ ...value, imageA })} issues={issuesAt(issues, 'data.imageA')} placeholder={t('/assets/… or https://…')} />
        <TdOptionalTextField label={t('Image B')} value={value.imageB} onChange={(imageB) => onChange({ ...value, imageB })} issues={issuesAt(issues, 'data.imageB')} placeholder={t('/assets/… or https://…')} />
      </div>
      <TdTextField label={t('Answer (as shown)')} value={value.displayAnswer} onChange={(displayAnswer) => onChange({ ...value, displayAnswer })} issues={issuesAt(issues, 'data.displayAnswer')} />
      <TdSpellingsField values={value.acceptedAnswers} onChange={(acceptedAnswers) => onChange({ ...value, acceptedAnswers })} issues={issues} path="data.acceptedAnswers" />
    </>
  );
}

/** An item's key, never shown: the first `item-n` the round does not use yet. */
function freeItemKey(items: ReadonlyArray<{ key: string }>): string {
  let n = items.length + 1;
  while (items.some((item) => item.key === `item-${n}`)) n++;
  return `item-${n}`;
}

export function PutInOrderEditor({ value, onChange, issues, creating }: TdEditorProps<'put-in-order'>) {
  const items = value.items;
  const set = (index: number, patch: Partial<(typeof items)[number]>) => onChange({ ...value, items: items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const move = (index: number, by: number) => {
    const next = [...items];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange({ ...value, items: next });
  };
  const order = [...items].sort((a, b) => a.sortValue - b.sortValue);
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <PuzzleKeyField value={value.puzzle} onChange={(puzzle) => onChange({ ...value, puzzle })} issues={issues} />
      <TdTextField label={t('Prompt')} value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} placeholder={t('Order these from earliest to latest')} />
      <TdField label={t('Items, in the order shown (the sort value decides the right order)')} issues={issues.filter((i) => i.path === 'data.items')}>
        <ol className="flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={index} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1fr_7rem_auto] gap-2">
                <Input aria-label={t('Item {n} label', { n: index + 1 })} value={item.label} onChange={(event) => set(index, { label: event.target.value })} className={tdInputClass} placeholder={t('Label')} />
                <TdNumberInput label={t('Item {n} sort value', { n: index + 1 })} value={item.sortValue} onChange={(sortValue) => set(index, { sortValue })} />
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Move up')} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Move down')} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remove')} onClick={() => onChange({ ...value, items: items.filter((_, i) => i !== index) })}>
                    <X />
                  </Button>
                </div>
              </div>
              <TdIssueText issues={issuesAt(issues, `data.items.${index}`)} />
            </li>
          ))}
        </ol>
        <Button type="button" variant="secondary" size="sm" className="w-fit rounded-lg" disabled={items.length >= 12} onClick={() => onChange({ ...value, items: [...items, { key: freeItemKey(items), label: '', sortValue: items.length + 1 }] })}>
          <Plus />
          {t('Add an item')}
        </Button>
      </TdField>
      {order.length > 1 && (
        <p className="rounded-lg bg-(--td-input)/60 px-3 py-2 text-xs text-(--td-text-2)">
          {t('Right order: {order}', { order: order.map((item) => item.label || item.key).join(' → ') })}
        </p>
      )}
    </>
  );
}

export function CareerPathEditor({ value, onChange, issues, creating }: TdEditorProps<'career-path'>) {
  const clubs = useTdAllRows('clubs', { status: 'draft,ready,approved' });
  const options = [{ value: '', label: t('No crest') }, ...(clubs.data?.rows ?? []).map((row) => ({ value: row.data.key, label: `${row.data.label} (${row.data.key})` }))];
  const path = value.clubs;
  const set = (index: number, patch: Partial<(typeof path)[number]>) => onChange({ ...value, clubs: path.map((club, i) => (i === index ? { ...club, ...patch } : club)) });
  const move = (index: number, by: number) => {
    const next = [...path];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange({ ...value, clubs: next });
  };
  return (
    <>
      <KeyField value={value.key} onChange={(key) => onChange({ ...value, key })} issues={issues} creating={creating} />
      <PuzzleKeyField value={value.puzzle} onChange={(puzzle) => onChange({ ...value, puzzle })} issues={issues} />
      <TdTextField label={t('Prompt')} value={value.prompt} onChange={(prompt) => onChange({ ...value, prompt })} issues={issuesAt(issues, 'data.prompt')} />
      <TdTextField label={t('Answer (as shown)')} value={value.displayAnswer} onChange={(displayAnswer) => onChange({ ...value, displayAnswer })} issues={issuesAt(issues, 'data.displayAnswer')} />
      <TdSpellingsField values={value.acceptedAnswers} onChange={(acceptedAnswers) => onChange({ ...value, acceptedAnswers })} issues={issues} path="data.acceptedAnswers" />
      <TdField label={t('The career, in order (each step is revealed as a clue)')} issues={issues.filter((i) => i.path === 'data.clubs')}>
        <ol className="flex flex-col gap-2">
          {path.map((club, index) => (
            <li key={index} className="flex flex-col gap-1">
              <div className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[1.5rem_1fr_14rem_auto]">
                <span className="text-right text-xs tabular-nums text-(--td-text-3)">{index + 1}</span>
                <Input aria-label={t('Step {n} name', { n: index + 1 })} value={club.name} onChange={(event) => set(index, { name: event.target.value })} className={tdInputClass} placeholder={t('Club name as shown')} />
                <select aria-label={t('Step {n} crest', { n: index + 1 })} value={club.clubKey ?? ''} onChange={(event) => set(index, { clubKey: event.target.value || null })} className={cn(tdInputClass, 'col-span-2 border px-3 sm:col-span-1')}>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="flex items-center">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Move up')} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Move down')} disabled={index === path.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remove')} onClick={() => onChange({ ...value, clubs: path.filter((_, i) => i !== index) })}>
                    <X />
                  </Button>
                </div>
              </div>
              <TdIssueText issues={issuesAt(issues, `data.clubs.${index}`)} />
            </li>
          ))}
        </ol>
        <Button type="button" variant="secondary" size="sm" className="w-fit rounded-lg" disabled={path.length >= 20} onClick={() => onChange({ ...value, clubs: [...path, { name: '', clubKey: null }] })}>
          <Plus />
          {t('Add a club')}
        </Button>
      </TdField>
    </>
  );
}

export function DailyScheduleEditor({ value, onChange, issues, creating }: TdEditorProps<'daily-schedule'>) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TdSelectField label={t('Game')} value={value.game} onChange={(game) => onChange({ ...value, game })} locked={!creating} options={TD_DAILY_GAMES.map((g) => ({ value: g.game, label: g.label }))} issues={issuesAt(issues, 'data.game')} />
        <TdTextField label={t('Date (Georgia)')} type="date" value={value.date} onChange={(date) => onChange({ ...value, date })} locked={!creating} issues={issuesAt(issues, 'data.date')} />
      </div>
      <PuzzleField game={value.game} value={value.puzzle} onChange={(puzzle) => onChange({ ...value, puzzle })} issues={issues} path="data.puzzle" />
    </>
  );
}

export function DailySettingsEditor({ value, onChange, issues, creating }: TdEditorProps<'daily-settings'>) {
  const { puzzles } = useTdPuzzles(value.game);
  const cycle = value.cycle;
  return (
    <>
      <TdSelectField label={t('Game')} value={value.game} onChange={(game) => onChange({ ...value, game, seconds: game === 'careerPath' ? null : (value.seconds ?? 30) })} locked={!creating} options={TD_DAILY_GAMES.map((g) => ({ value: g.game, label: g.label }))} issues={issuesAt(issues, 'data.game')} />
      {value.game !== 'careerPath' && (
        <TdNumberField label={value.game === 'footballLogic' ? t('Seconds per question') : t('Seconds per round')} value={value.seconds} onChange={(seconds) => onChange({ ...value, seconds })} issues={issuesAt(issues, 'data.seconds')} hint={t('1 to 600 seconds.')} />
      )}
      <TdSwitchField
        label={t('Question pool categories')}
        checked={cycle !== null}
        onChange={(on) => onChange({ ...value, cycle: on ? { anchor: georgiaToday(), sets: puzzles.slice(0, 1).map((p) => p.key) } : null })}
        hint={t('Days without a category of their own play these in turn, one a day, the anchor date playing the first.')}
      />
      {cycle && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <TdTextField label={t('Anchor date (Georgia)')} type="date" value={cycle.anchor} onChange={(anchor) => onChange({ ...value, cycle: { ...cycle, anchor } })} issues={issuesAt(issues, 'data.cycle.anchor')} />
          <TdField label={t('Categories, in turn')} issues={issuesAt(issues, 'data.cycle.sets')}>
            <ol className="flex flex-col gap-1.5">
              {cycle.sets.map((set, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs tabular-nums text-(--td-text-3)">{index + 1}</span>
                  <select aria-label={t('Rotation category {n}', { n: index + 1 })} value={set} onChange={(event) => onChange({ ...value, cycle: { ...cycle, sets: cycle.sets.map((s, i) => (i === index ? event.target.value : s)) } })} className={cn(tdInputClass, 'flex-1 border px-3')}>
                    {!puzzles.some((p) => p.key === set) && <option value={set}>{t('{puzzle} (no questions)', { puzzle: set })}</option>}
                    {puzzles.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.playable ? p.key : t('{puzzle} · none approved', { puzzle: p.key })}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t('Remove')} onClick={() => onChange({ ...value, cycle: { ...cycle, sets: cycle.sets.filter((_, i) => i !== index) } })}>
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
            <Button type="button" variant="secondary" size="sm" className="w-fit rounded-lg" disabled={puzzles.length === 0} onClick={() => onChange({ ...value, cycle: { ...cycle, sets: [...cycle.sets, puzzles[0]?.key ?? ''] } })}>
              <Plus />
              {t('Add a category')}
            </Button>
          </TdField>
        </div>
      )}
    </>
  );
}
