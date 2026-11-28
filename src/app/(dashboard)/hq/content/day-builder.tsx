'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, Hammer, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBuildDays, useHarnessDayRounds, useHarnessDays, useHqClock, useSetHarnessPolicy } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { cn } from '@/lib/utils';
import type { HarnessDayGame, HarnessDayRound } from '@/types';
import { EmptyState, errorMessage, HQ_LABEL, LoadErrorState, Panel, RefreshErrorBanner, Section } from '../hq-ui';

// The Day Builder: agents write the next days of a daily game before its
// calendar runs out. A footballer is named, their clues are written with the
// pages behind them, another model checks every clue against the web, a third
// translates and the translations are checked. Finished rounds wait as "ready"; code puts ten of them together
// into a day. Storing days can be switched off, so a person can read the first
// rounds before players ever see one.

const STEPS: Array<{ key: keyof HarnessDayGame['rounds']; label: string; hint: string }> = [
  { key: 'planned', label: 'Named', hint: 'A footballer was chosen; the clues are not written yet' },
  { key: 'written', label: 'Written', hint: 'Clues written, waiting for the fact check' },
  { key: 'checked', label: 'Checked', hint: 'Every clue confirmed, waiting for translation' },
  { key: 'localized', label: 'Translated', hint: 'In every language, waiting for the translations to be checked' },
  { key: 'ready', label: 'Ready', hint: 'Translations checked, waiting to go into a day' },
];

const STATUS: Record<HarnessDayRound['status'], { label: string; tone: string }> = {
  planned: { label: 'Named', tone: 'bg-slate-100 text-slate-700' },
  written: { label: 'Written, not checked yet', tone: 'bg-sky-50 text-sky-700' },
  checked: { label: 'Checked, not translated yet', tone: 'bg-sky-50 text-sky-700' },
  localized: { label: 'Translated, translations not checked yet', tone: 'bg-sky-50 text-sky-700' },
  ready: { label: 'Ready', tone: 'bg-brand-soft text-brand-deep' },
  dropped: { label: 'Dropped', tone: 'bg-red-50 text-red-700' },
};

/** How many whole days the ready rounds make: the difficulty that runs out first decides. */
export function daysReady(g: Pick<HarnessDayGame, 'readyByDifficulty' | 'perDay'>): number {
  return Math.min(...(['easy', 'medium', 'hard'] as const).map((d) => (g.perDay[d] > 0 ? Math.floor(g.readyByDifficulty[d] / g.perDay[d]) : Infinity)));
}

/** A page address only when it is a real https page. */
function page(source: string): { href: string; host: string } | null {
  try {
    const u = new URL(source);
    return u.protocol === 'https:' ? { href: u.toString(), host: u.hostname.replace(/^www\./, '') } : null;
  } catch {
    return null;
  }
}

function RoundCard({ r, now }: { r: HarnessDayRound; now: number }) {
  const [georgian, setGeorgian] = useState(false);
  const st = STATUS[r.status];
  const pages = r.sources.map(page).filter((p): p is { href: string; host: string } => p !== null);
  const facts = georgian && r.georgian.length ? r.georgian : r.facts;
  return (
    <li className="space-y-2 px-4 py-3.5" aria-label={`Round ${r.number}`}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate-500">
        <span className="font-medium tabular-nums text-slate-700">Round {r.number}</span>
        <span className={cn('rounded-full px-2 py-0.5 font-medium', st.tone)}>{st.label}</span>
        <span className="capitalize">{r.difficulty}</span>
        <span className="ml-auto">{formatRelative(r.updatedAt, now)}</span>
      </div>
      <div className="font-display text-[16px] font-semibold text-slate-950">
        {r.subject}
        {r.names?.ka && <span className="ml-2 text-[14px] font-normal text-slate-500">{r.names.ka}</span>}
      </div>
      {r.profile && (
        <p className="text-[12.5px] text-slate-600">
          {[r.profile.confed, r.profile.position, r.profile.foot ? `${r.profile.foot}-footed` : null, `born ${r.profile.born}`].filter(Boolean).join(' · ')}
        </p>
      )}
      {r.note && <p className={cn('text-[12.5px]', r.status === 'dropped' ? 'text-red-700' : 'text-amber-800')}>{r.status === 'dropped' ? `Why: ${r.note}` : `Note: ${r.note}`}</p>}
      {facts.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5 text-[13.5px] leading-relaxed text-slate-800 marker:text-slate-400" lang={georgian ? 'ka' : 'en'}>
          {facts.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ol>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        {r.georgian.length > 0 && (
          <button type="button" onClick={() => setGeorgian((v) => !v)} className="font-medium text-slate-700 underline-offset-2 hover:underline" aria-pressed={georgian}>
            {georgian ? 'Show the English' : 'Show the Georgian'}
          </button>
        )}
        {pages.map((p, i) => (
          <a key={`${p.href}-${i}`} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline">
            {p.host} <ExternalLink className="size-3" aria-hidden />
          </a>
        ))}
      </div>
    </li>
  );
}

function Rounds({ game }: { game: string }) {
  const { data, error, isLoading } = useHarnessDayRounds(game, true);
  const now = useHqClock().getTime();
  if (error && !data) return <LoadErrorState error={error} fallback="Could not load the rounds" />;
  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the rounds…
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <>
        {/* "No rounds" is the last answer that loaded: say so when it could not be refreshed. */}
        {error && <RefreshErrorBanner className="mx-4 mt-3" />}
        <EmptyState className="m-4">No rounds yet. The first ones appear a few minutes after the builder starts.</EmptyState>
      </>
    );
  }
  return (
    <>
      {error && <RefreshErrorBanner className="mx-4 mb-2" />}
      <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-[12.5px] text-amber-900">These are the answers and clues of days players have not seen yet. Keep them inside the team.</p>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {data.map((r) => (
          <RoundCard key={r.id} r={r} now={now} />
        ))}
      </ul>
    </>
  );
}

function GameCard({ g, allPaused }: { g: HarnessDayGame; allPaused: boolean }) {
  const build = useBuildDays();
  const setPolicy = useSetHarnessPolicy();
  const now = useHqClock().getTime();
  const [open, setOpen] = useState(false);
  const short = Math.max(0, g.ahead - g.daysLeft);
  const waitingDays = daysReady(g);
  const busy = g.rounds.planned + g.rounds.written + g.rounds.checked + g.rounds.localized;
  // The switch that pauses every agent stops this one too, whatever its own switch says.
  const working = g.agent === 'active' && !allPaused;
  return (
    <Panel as="article" aria-label={`${g.label} days`} className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
        <div className="min-w-[12rem] flex-1">
          <h3 className="font-display text-[17px] font-semibold text-slate-950">{g.label}</h3>
          <p className="mt-0.5 text-[13px] text-slate-600">
            {g.daysLeft} {g.daysLeft === 1 ? 'day' : 'days'} stored after today; the builder keeps {g.ahead}.{' '}
            {short === 0 ? 'Nothing is missing.' : `${short} ${short === 1 ? 'day is' : 'days are'} missing.`}
          </p>
        </div>
        <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium', !working ? 'bg-amber-50 text-amber-800' : busy || g.planning ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600')}>
          {(busy > 0 || g.planning) && working && <Loader2 className="size-3 animate-spin" aria-hidden />}
          {g.agent === 'missing' ? 'Not set up' : g.agent === 'paused' ? 'Paused' : allPaused ? 'All agents are paused' : g.planning ? 'Choosing footballers' : busy ? 'Working' : 'Idle'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 sm:grid-cols-5">
        {STEPS.map((s) => (
          <div key={s.key} className="bg-white px-4 py-2.5" title={s.hint}>
            <div className={HQ_LABEL}>{s.label}</div>
            <div className="font-display text-xl font-semibold tabular-nums text-slate-950">{g.rounds[s.key]}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2.5 px-4 py-3.5 text-[13px] leading-relaxed text-slate-700 sm:px-5">
        <p>
          A day takes {g.perDay.easy} easy, {g.perDay.medium} medium and {g.perDay.hard} hard rounds. Ready now: {g.readyByDifficulty.easy} easy, {g.readyByDifficulty.medium} medium, {g.readyByDifficulty.hard} hard, which is{' '}
          <strong className="font-semibold text-slate-950">
            enough for {waitingDays} {waitingDays === 1 ? 'day' : 'days'}
          </strong>
          .
        </p>
        <div className={cn('rounded-xl border px-3.5 py-3', g.storing ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
          <p className={cn('font-medium', g.storing ? 'text-emerald-900' : 'text-amber-900')}>{g.storing ? 'Storing days is on.' : 'Storing days is off.'}</p>
          <p className={g.storing ? 'text-emerald-900' : 'text-amber-900'}>
            {g.storing
              ? 'Whenever ten rounds of the right mix are ready, they become the next day, with no person in between. The game\'s own checks still refuse a day that is not whole.'
              : 'The agents make rounds and they wait here. Nothing reaches players. Read some of the ready rounds below; when you trust them, turn storing on.'}
          </p>
          <button
            type="button"
            disabled={setPolicy.isPending}
            onClick={() =>
              setPolicy.mutate(
                { key: `days.${g.game}.store`, value: !g.storing },
                { onSuccess: () => toast.success(g.storing ? 'Storing is off. Rounds will wait.' : 'Storing is on. Days are built from the next round of checks.'), onError: (e) => toast.error(errorMessage(e, 'Only an owner can change this')) }
              )
            }
            className={cn('mt-2 inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium transition disabled:opacity-50', g.storing ? 'border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-100' : 'bg-slate-950 text-white hover:bg-slate-800')}
          >
            {g.storing ? 'Turn storing off' : 'Turn storing on'}
          </button>
        </div>
        {g.builtLately.length > 0 && (
          <p>
            Built lately: {g.builtLately.map((b) => `${b.day} (${formatRelative(b.at, now)})`).join(', ')}.
          </p>
        )}
        {g.droppedLately.count > 0 && (
          <details>
            <summary className="cursor-pointer font-medium text-slate-900">
              {g.droppedLately.count} {g.droppedLately.count === 1 ? 'round was' : 'rounds were'} dropped in the last 7 days
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-slate-600">
              {g.droppedLately.examples.map((d) => (
                <li key={d.number}>
                  Round {d.number}: {d.note || 'no reason recorded'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-[13px] font-medium text-white transition hover:bg-slate-800">
          {open ? 'Close the rounds' : 'Read the rounds'} <ChevronDown className={cn('size-3.5 transition', open && 'rotate-180')} aria-hidden />
        </button>
        <button
          type="button"
          disabled={build.isPending || g.agent !== 'active'}
          title="Runs by itself every half hour; this does it now"
          onClick={() =>
            build.mutate(g.game, {
              onSuccess: (r) => toast.success(r.built.length ? `Built ${r.built.join(', ')}.` : r.ordered ? `Asked for ${r.ordered} more footballers.` : 'Nothing to do right now.'),
              onError: (e) => toast.error(errorMessage(e, 'Could not start it')),
            })
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {build.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Hammer className="size-3.5" aria-hidden />} Run it now
        </button>
      </div>
      {open && <Rounds game={g.game} />}
    </Panel>
  );
}

/** Under the runway: the games an agent builds days for, and how that is going. */
export function DayBuilder({ allPaused = false }: { allPaused?: boolean }) {
  const { data, error } = useHarnessDays();
  if (error && !data) return <LoadErrorState error={error} fallback="Could not load the Day Builder" />;
  if (!data) return null;
  // No game is built this way: nothing to show, unless that answer is stale.
  if (data.games.length === 0) return error ? <RefreshErrorBanner /> : null;
  return (
    <Section
      title="Day Builder"
      description="An agent names footballers and writes their clues with the pages they come from. A second model checks every clue against the web. A third translates, and the second reads every translation against the English. Ten finished rounds make a day. A clue that cannot be confirmed is removed; a round left too thin is dropped."
    >
      <div className="space-y-3">
        {/* The numbers below are the last ones that loaded, the storing switch included. */}
        {error && <RefreshErrorBanner />}
        {data.games.map((g) => (
          <GameCard key={g.game} g={g} allPaused={allPaused} />
        ))}
      </div>
      <p className="text-[12.5px] text-slate-500">Only Football Clues is built this way so far. The other daily games still need their days made by hand.</p>
    </Section>
  );
}
