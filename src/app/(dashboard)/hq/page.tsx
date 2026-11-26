'use client';

import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/providers';
import { useContentFixes, useHarnessGames, useHarnessOverview, useHqAnalytics, useHqClock } from '@/hooks';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import { DEPARTMENT_LOOK, HQ_DEPARTMENTS, toolsForUser, withoutHiddenRealData, type HqDepartmentInfo } from '@/lib/hq-departments';
import { cn } from '@/lib/utils';
import type { HarnessGames, HarnessOverview } from '@/types';
import { agentsNow, seatState } from './content/plain';
import { worthALook } from './games/games';
import { needsYou, pulse } from './home';
import { Delta, EmptyState, HQ_PAGE, Panel, Section, Stat } from './hq-ui';

// HQ home: the one overview. How the product is doing, what the agents are
// doing right now, what needs a person, and every department with its
// headline numbers and its way in. Each part loads on its own, so a slow
// count never blanks the page.

const NOW_DOT: Record<string, string> = { working: 'animate-pulse bg-emerald-400', paused: 'bg-amber-400', waiting: 'bg-amber-400', idle: 'bg-slate-400' };
const SEAT_DOT: Record<string, string> = { working: 'bg-emerald-400', free: 'bg-slate-500', 'used-up': 'bg-amber-400', login: 'bg-red-400', off: 'bg-slate-700' };
const AREA_BAR: Record<string, string> = { Content: 'bg-violet-500', Games: 'bg-sky-500', Agents: 'bg-amber-500' };
const AREA_TONE: Record<string, string> = { Content: 'bg-violet-50 text-violet-700', Games: 'bg-sky-50 text-sky-700', Agents: 'bg-amber-50 text-amber-800' };

/** "20 Nov" from a YYYY-MM-DD day. */
const shortDay = (d: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));

/** A department's headline numbers, as label and value pairs. Null while loading; empty when it has none yet. */
function headline(key: string, o: HarnessOverview | undefined, g: HarnessGames | undefined): Array<{ label: string; value: string; note?: string; attention?: boolean }> | null {
  if (key === 'content') {
    if (!o) return null;
    const shortest = o.runway[0];
    return [
      { label: 'Live today', value: o.today.live.toLocaleString(), note: 'new questions' },
      { label: 'Still missing', value: o.classic.totalShortage.toLocaleString(), note: o.classic.totalShortage > 0 ? `in ${o.classic.shortCategories} categories` : 'every category is full', attention: o.classic.totalShortage > 0 },
      ...(shortest ? [{ label: 'Runway', value: `${shortest.daysLeft} days`, note: `shortest: ${shortest.label}`, attention: shortest.daysLeft < 14 }] : []),
    ];
  }
  if (key === 'games') {
    if (!g) return null;
    const live = g.games.filter((x) => x.state === 'on' || x.state === 'beta').length;
    const flags = worthALook(g.games).length;
    return [
      { label: 'Games on', value: String(live), note: `of ${g.games.length}` },
      { label: 'Worth a look', value: String(flags), note: flags ? 'this week' : 'nothing stands out', attention: flags > 0 },
    ];
  }
  return [];
}

function Department({ d, o, g, failed, email, showRealData }: { d: HqDepartmentInfo; o: HarnessOverview | undefined; g: HarnessGames | undefined; failed: boolean; email: string | null | undefined; showRealData: boolean }) {
  const lines = headline(d.key, o, g);
  const tools = withoutHiddenRealData(toolsForUser(d, email), showRealData);
  const look = DEPARTMENT_LOOK[d.key];
  const Icon = look.icon;
  return (
    <Panel as="article" className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', look.tint)} aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <h3 className="min-w-0 flex-1 text-base font-semibold tracking-tight text-slate-950">{d.name}</h3>
        {d.home ? (
          <Link
            href={d.home}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-950 px-3 text-[13px] font-medium text-white transition hover:bg-slate-800"
            aria-label={`Open ${d.name}`}
          >
            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-600">Agents not set up yet</span>
        )}
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{d.mission}</p>
      {lines === null && failed ? (
        <p className="text-[13px] text-amber-800">Could not load its numbers. Trying again.</p>
      ) : lines === null ? (
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading its numbers…
        </p>
      ) : (
        lines.length > 0 && (
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3">
            {lines.map((l) => (
              <div key={l.label} className="min-w-0">
                <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{l.label}</dt>
                <dd className={cn('text-lg font-semibold tabular-nums tracking-tight', l.attention ? 'text-amber-700' : 'text-slate-950')}>{l.value}</dd>
                {l.note && <dd className="truncate text-[12px] text-slate-500">{l.note}</dd>}
              </div>
            ))}
          </dl>
        )
      )}
      {tools.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 text-[12px]">
          {tools.map((t) => (
            <Link key={t.href} href={t.href} title={t.description} className="rounded-md border border-slate-200 px-2 py-1 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950">
              {t.title}
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function HqHomePage() {
  const { user } = useAuth();
  const showRealData = useRealAnalyticsVisible();
  const overview = useHarnessOverview();
  const games = useHarnessGames();
  const analytics = useHqAnalytics(30);
  const clock = useHqClock().getTime();
  const o = overview.data;
  const now = o ? agentsNow(o, clock) : null;
  const seats = o ? o.accounts.filter((a) => !a.reservedForPeople && a.status === 'active') : [];
  const usable = seats.filter((a) => ['working', 'free'].includes(seatState(a, clock).kind)).length;
  const fixes = useContentFixes({ status: 'held', limit: 50 });
  const items = needsYou(o, games.data, clock, fixes.data?.length);
  // What the "Needs you" list could not look at, or could not refresh: the all-clear needs every source, up to date.
  const sources = [
    { name: 'the agents and content', q: overview },
    { name: 'the games', q: games },
    { name: 'the held content fixes', q: fixes },
  ];
  const unchecked = sources.filter((x) => !x.q.data || x.q.error).map((x) => x.name);
  const failed = sources.some((x) => !!x.q.error);
  const p = pulse(analytics.data);
  const a = analytics.data;
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Tbilisi' }).format(new Date(clock));
  // Whole days only for the trend lines: today is not over.
  const series = a?.series.slice(0, -1) ?? [];

  return (
    <div className={HQ_PAGE}>
      {/* The one line that matters first: are the agents working, and is anything stopping them. */}
      <header className="overflow-hidden rounded-2xl bg-slate-950 text-white">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 px-6 py-6 sm:px-8">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">QuizBall HQ · {today}</p>
            {now ? (
              <>
                <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                  <span className={cn('h-3 w-3 shrink-0 rounded-full', NOW_DOT[now.tone])} aria-hidden />
                  {now.headline}
                </h1>
                {now.detail && <p className="mt-2 max-w-2xl text-sm text-slate-300">{now.detail}</p>}
              </>
            ) : overview.error ? (
              <h1 className="mt-2 text-xl font-semibold text-red-300">Could not load what the agents are doing.</h1>
            ) : (
              <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold text-slate-300">
                <Loader2 className="h-5 w-5 animate-spin" /> Checking on the agents…
              </h1>
            )}
          </div>
          {o && (
            <Link href="/hq/content?tab=agents" className="group block rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10" aria-label={`${usable} of ${seats.length} subscriptions available`}>
              <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Subscriptions</span>
              <span className="mt-1 flex items-center gap-1.5" aria-hidden>
                {seats.map((a) => (
                  <span key={a.id} title={`${a.label}: ${seatState(a, clock).label}`} className={cn('h-2.5 w-6 rounded-full', SEAT_DOT[seatState(a, clock).kind])} />
                ))}
              </span>
              <span className="mt-1.5 block text-sm text-slate-200">
                <b className="font-semibold text-white">{usable}</b> of {seats.length} available
              </span>
            </Link>
          )}
        </div>
      </header>

      <Section title="Needs you" count={items.length} countTone="attention" description="Agents run everything else by themselves. This is only what a person has to decide or fix.">
        {/* An all-clear needs every source: a part that is loading or failed could be hiding something. */}
        {unchecked.length > 0 && (
          <p role="status" className={cn('mb-2 rounded-lg border px-4 py-2.5 text-sm', failed ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-700')}>
            {failed ? `Could not check ${unchecked.join(' and ')}, so this list may be missing something.` : `Still checking ${unchecked.join(' and ')}…`}
          </p>
        )}
        {items.length === 0 ? (
          unchecked.length === 0 && <EmptyState>Nothing needs you right now.</EmptyState>
        ) : (
          <Panel className="divide-y divide-slate-100">
            {items.map((i) => (
              <div key={i.key} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-3 pl-5 pr-4 text-sm">
                <span className={cn('absolute inset-y-2 left-0 w-1 rounded-r', AREA_BAR[i.area])} aria-hidden />
                <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', AREA_TONE[i.area])}>{i.area}</span>
                {/* On a phone the sentence takes the full row and the link sits under it. */}
                <span className="min-w-0 flex-1 basis-full text-slate-800 sm:basis-0">{i.text}</span>
                <Link href={i.href} className="inline-flex items-center gap-1 font-medium text-slate-900 underline-offset-2 hover:underline">
                  {i.action} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </div>
            ))}
          </Panel>
        )}
      </Section>

      <Section
        title="The product"
        description={p ? `New players and games are for the last 7 whole days (${shortDay(p.from)} to ${shortDay(p.to)}), against the 7 before. The lines show 30 days.` : 'Players and plays.'}
        actions={
          <Link href="/hq/analytics" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            Open analytics
          </Link>
        }
      >
        {a ? (
          <Panel className="grid grid-cols-2 divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            <Stat label="Active today" value={a.actives.dau.toLocaleString()} hint="players so far today" spark={series.map((d) => d.activePlayers)} sparkTone="emerald" />
            <Stat label="Active this week" value={a.actives.wau.toLocaleString()} hint="in the last 7 days" />
            <Stat label="Active this month" value={a.actives.mau.toLocaleString()} hint="in the last 30 days" />
            <Stat label="New players" value={p ? p.newPlayers.now.toLocaleString() : '—'} hint={p ? <Delta now={p.newPlayers.now} before={p.newPlayers.before} /> : undefined} spark={series.map((d) => d.newUsers)} sparkTone="sky" />
            <Stat label="Games played" value={p ? p.games.now.toLocaleString() : '—'} hint={p ? <Delta now={p.games.now} before={p.games.before} /> : undefined} spark={series.map((d) => d.matches)} sparkTone="violet" />
          </Panel>
        ) : analytics.error ? (
          <EmptyState>Could not load the product numbers.</EmptyState>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the product numbers…
          </div>
        )}
      </Section>

      <Section title="Departments" description="Each department has its agents, its numbers and its tools in one place.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {HQ_DEPARTMENTS.map((d) => (
            <Department key={d.key} d={d} o={o} g={games.data} failed={d.key === 'content' ? !!overview.error : d.key === 'games' ? !!games.error : false} email={user?.email} showRealData={showRealData} />
          ))}
        </div>
      </Section>
    </div>
  );
}
