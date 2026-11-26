'use client';

import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/providers';
import { useContentFixes, useHarnessGames, useHarnessOverview, useHqAnalytics, useHqClock } from '@/hooks';
import { useRealAnalyticsVisible } from '@/hooks/use-real-analytics-visible';
import { HQ_DEPARTMENTS, toolsForUser, withoutHiddenRealData, type HqDepartmentInfo } from '@/lib/hq-departments';
import { cn } from '@/lib/utils';
import type { HarnessGames, HarnessOverview } from '@/types';
import { agentsNow, seatState } from './content/plain';
import { change, worthALook } from './games/games';
import { needsYou, pulse } from './home';
import { EmptyState, HQ_PAGE, PageHeader, Panel, Section, Stat } from './hq-ui';

// HQ home: the one overview. How the product is doing, what the agents are
// doing right now, what needs a person, and every department with its
// headline numbers and its way in. Each part loads on its own, so a slow
// count never blanks the page.

const NOW_TONE: Record<string, [string, string]> = {
  working: ['text-emerald-700', 'animate-pulse bg-emerald-500'],
  paused: ['text-amber-700', 'bg-amber-500'],
  waiting: ['text-amber-700', 'bg-amber-500'],
  idle: ['text-slate-700', 'bg-slate-400'],
};
const CHANGE_TONE = { up: 'text-emerald-700', down: 'text-red-700', flat: 'text-slate-500' } as const;
const AREA_TONE: Record<string, string> = { Content: 'bg-violet-50 text-violet-700', Games: 'bg-sky-50 text-sky-700', Agents: 'bg-amber-50 text-amber-800' };

function Trend({ c }: { c: { now: number; before: number } }) {
  const ch = change(c);
  if (!ch) return <>the week before: {c.before.toLocaleString()}</>;
  return (
    <>
      <span className={CHANGE_TONE[ch.tone]}>{ch.text}</span> on the week before
    </>
  );
}

/** What a department is doing, in one or two lines of its own numbers. */
function headline(key: string, o: HarnessOverview | undefined, g: HarnessGames | undefined): string[] | null {
  if (key === 'content') {
    if (!o) return null;
    const shortest = o.runway[0];
    return [
      `${o.today.live.toLocaleString()} new questions went live today.`,
      o.classic.totalShortage > 0 ? `${o.classic.totalShortage.toLocaleString()} still missing across ${o.classic.shortCategories} categories.` : 'Every ranked category is full.',
      ...(shortest ? [`Shortest daily game: ${shortest.label}, ${shortest.daysLeft} days of content left.`] : []),
    ];
  }
  if (key === 'games') {
    if (!g) return null;
    const live = g.games.filter((x) => x.state === 'on' || x.state === 'beta').length;
    const flags = worthALook(g.games).length;
    return [`${live} games are on.`, flags ? `${flags} worth a look this week.` : 'Nothing stands out this week.'];
  }
  return [];
}

function Department({ d, o, g, failed, email, showRealData }: { d: HqDepartmentInfo; o: HarnessOverview | undefined; g: HarnessGames | undefined; failed: boolean; email: string | null | undefined; showRealData: boolean }) {
  const lines = headline(d.key, o, g);
  const tools = withoutHiddenRealData(toolsForUser(d, email), showRealData);
  return (
    <Panel as="article" className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-slate-900">{d.name}</h3>
        {d.home ? (
          <Link href={d.home} className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-900 underline-offset-2 hover:underline" aria-label={`Open ${d.name}`}>
            Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-medium text-slate-600">Agents not set up yet</span>
        )}
      </div>
      <p className="text-[13px] text-slate-600">{d.mission}</p>
      {lines === null && failed ? (
        <p className="text-[13px] text-amber-800">Could not load its numbers. Trying again.</p>
      ) : lines === null ? (
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading its numbers…
        </p>
      ) : (
        lines.length > 0 && (
          <ul className="space-y-0.5 text-[13px] text-slate-800">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )
      )}
      {tools.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[13px]">
          {tools.map((t) => (
            <Link key={t.href} href={t.href} title={t.description} className="text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline">
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

  return (
    <div className={HQ_PAGE}>
      <PageHeader eyebrow="QuizBall" title="HQ" description="How we are doing, what the agents are doing, and what needs a person. Each department has its own space below." />

      <Panel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        {now ? (
          <>
            <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', NOW_TONE[now.tone][0])}>
              <span className={cn('h-2.5 w-2.5 rounded-full', NOW_TONE[now.tone][1])} aria-hidden />
              {now.headline}
            </span>
            {now.detail && <span className="text-sm text-slate-700">{now.detail}</span>}
            <Link href="/hq/content?tab=agents" className="ml-auto text-[13px] font-medium text-slate-700 underline-offset-2 hover:underline">
              {usable} of {seats.length} subscriptions available
            </Link>
          </>
        ) : overview.error ? (
          <span className="text-sm text-red-700">Could not load what the agents are doing.</span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking on the agents…
          </span>
        )}
      </Panel>

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
              <div key={i.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', AREA_TONE[i.area])}>{i.area}</span>
                <span className="min-w-0 flex-1 text-slate-800">{i.text}</span>
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
        description={p ? `New players and games are for the last 7 whole days (${p.from} to ${p.to}).` : 'Players and plays.'}
        actions={
          <Link href="/hq/analytics" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            Open analytics
          </Link>
        }
      >
        {a ? (
          <Panel className="grid grid-cols-2 divide-slate-100 sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
            <Stat label="Active today" value={a.actives.dau.toLocaleString()} hint="players so far today" />
            <Stat label="Active this week" value={a.actives.wau.toLocaleString()} hint="in the last 7 days" />
            <Stat label="Active this month" value={a.actives.mau.toLocaleString()} hint="in the last 30 days" />
            <Stat label="New players" value={p ? p.newPlayers.now.toLocaleString() : '—'} hint={p ? <Trend c={p.newPlayers} /> : undefined} />
            <Stat label="Games played" value={p ? p.games.now.toLocaleString() : '—'} hint={p ? <Trend c={p.games} /> : undefined} />
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
