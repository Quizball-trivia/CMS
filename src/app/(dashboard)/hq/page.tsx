'use client';

import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useContentFixes, useHarnessGames, useHarnessOverview, useHqAnalytics, useHqClock } from '@/hooks';
import { agentsOf, readyToStart } from '@/lib/hq-agents';
import { DEPARTMENT_LOOK, HQ_DEPARTMENTS, type HqDepartmentInfo } from '@/lib/hq-departments';
import { cn } from '@/lib/utils';
import type { HarnessGames, HarnessOverview } from '@/types';
import { agentsNow, seatState } from './content/plain';
import { worthALook } from './games/games';
import { needsYou, pulse } from './home';
import { Delta, EmptyState, Hero, HeroStat, HQ_PAGE, Panel, Section, Stat } from './hq-ui';

// HQ home: the one overview. What the agents are doing right now, what needs
// a person, how the product is doing, and every department with its headline
// numbers and its way in. Each part loads on its own, so a slow count never
// blanks the page.

const SEAT_DOT: Record<string, string> = { working: 'bg-brand', free: 'bg-white/30', 'used-up': 'bg-amber-400', login: 'bg-red-400', off: 'bg-white/10' };
const AREA_KEY = { Content: 'content', Games: 'games', Agents: 'content' } as const;

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

function Department({ d, o, g, failed }: { d: HqDepartmentInfo; o: HarnessOverview | undefined; g: HarnessGames | undefined; failed: boolean }) {
  const lines = headline(d.key, o, g);
  const look = DEPARTMENT_LOOK[d.key];
  const Icon = look.icon;
  const team = agentsOf(d.key, o?.agents);
  const ready = readyToStart(team.suggested).length;
  return (
    <Link href={d.home} className="hq-card group relative flex flex-col gap-3 overflow-hidden p-5" aria-label={`Open ${d.name}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: look.hex }} aria-hidden />
      <div className="flex items-center gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', look.tint)} aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-tight tracking-tight text-slate-950">{d.name}</h3>
          <p className="text-[12px] text-slate-500">
            {team.running.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                {o?.settings.paused ? <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden /> : <span className="hq-live-dot" aria-hidden />} {team.running.length} {team.running.length === 1 ? 'agent' : 'agents'} {o?.settings.paused ? 'paused' : 'running'}
              </span>
            ) : o ? (
              'No agents yet'
            ) : (
              ' '
            )}
            {team.suggested.length > 0 && <span> · {team.suggested.length} suggested</span>}
          </p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-900" aria-hidden />
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{d.mission}</p>
      {lines === null && failed ? (
        <p className="text-[13px] text-amber-800">Could not load its numbers. Trying again.</p>
      ) : lines === null ? (
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading its numbers…
        </p>
      ) : lines.length > 0 ? (
        <dl className="mt-auto grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">
          {lines.map((l) => (
            <div key={l.label} className="min-w-0">
              <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{l.label}</dt>
              <dd className={cn('font-display text-xl font-semibold tabular-nums tracking-tight', l.attention ? 'text-amber-700' : 'text-slate-950')}>{l.value}</dd>
              {l.note && <dd className="truncate text-[12px] text-slate-500">{l.note}</dd>}
            </div>
          ))}
        </dl>
      ) : (
        team.suggested.length > 0 && (
          <p className="mt-auto rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
            {ready > 0 ? (
              <>
                <b className="font-semibold text-slate-950">{ready}</b> of its suggested agents can start with what HQ already has.
              </>
            ) : (
              'Its suggested agents each need one thing from us first.'
            )}
          </p>
        )
      )}
    </Link>
  );
}

export default function HqHomePage() {
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
  const activeAgents = o ? o.agents.filter((x) => x.status === 'active').length : 0;

  return (
    <div className={HQ_PAGE}>
      {/* The one line that matters first: are the agents working, and is anything stopping them. */}
      <Hero
        eyebrow={`QuizBall HQ · ${today}`}
        icon={now ? <span className={cn('shrink-0', now.tone === 'working' ? 'hq-live-dot !h-3 !w-3' : cn('h-3 w-3 rounded-full', now.tone === 'idle' ? 'bg-white/40' : 'bg-amber-400'))} aria-hidden /> : undefined}
        title={
          now ? (
            now.headline
          ) : overview.error ? (
            <span className="text-xl text-red-300">Could not load what the agents are doing.</span>
          ) : (
            <span className="flex items-center gap-2 text-xl text-white/70">
              <Loader2 className="h-5 w-5 animate-spin" /> Checking on the agents…
            </span>
          )
        }
        description={now?.detail || undefined}
        aside={
          o && (
            <Link href="/hq/agents" className="group block rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:bg-white/10" aria-label={`${usable} of ${seats.length} subscriptions available`}>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Subscriptions</span>
              <span className="mt-1.5 flex items-center gap-1.5" aria-hidden>
                {seats.map((s) => (
                  <span key={s.id} title={`${s.label}: ${seatState(s, clock).label}`} className={cn('h-2.5 w-6 rounded-full', SEAT_DOT[seatState(s, clock).kind])} />
                ))}
              </span>
              <span className="mt-1.5 block text-sm text-white/80">
                <b className="font-semibold text-white">{usable}</b> of {seats.length} available
              </span>
            </Link>
          )
        }
      >
        {o && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <HeroStat label="Agents" value={activeAgents} note={o.settings.paused ? 'all paused' : 'switched on'} />
            <HeroStat label="Runs today" value={o.today.runs.toLocaleString()} note={o.today.failed ? `${o.today.failed} failed` : 'none failed'} />
            <HeroStat label="Working now" value={o.queue?.running ?? 0} note={o.queue?.ready ? `${o.queue.ready} next in line` : 'nothing queued'} tone={o.queue?.running ? 'good' : undefined} />
            <HeroStat label="New questions live" value={o.today.live.toLocaleString()} note="today" />
          </div>
        )}
      </Hero>

      <Section title="Needs you" count={items.length} countTone="attention" description="Agents run everything else by themselves. This is only what a person has to decide or fix.">
        {/* An all-clear needs every source: a part that is loading or failed could be hiding something. */}
        {unchecked.length > 0 && (
          <p role="status" className={cn('mb-2 rounded-xl border px-4 py-2.5 text-sm', failed ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-slate-700')}>
            {failed ? `Could not check ${unchecked.join(' and ')}, so this list may be missing something.` : `Still checking ${unchecked.join(' and ')}…`}
          </p>
        )}
        {items.length === 0 ? (
          unchecked.length === 0 && <EmptyState>Nothing needs you right now.</EmptyState>
        ) : (
          <Panel className="divide-y divide-slate-100 overflow-hidden">
            {items.map((i) => {
              const look = DEPARTMENT_LOOK[AREA_KEY[i.area]];
              return (
                <div key={i.key} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 py-3.5 pl-5 pr-4 text-sm">
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: i.area === 'Agents' ? '#f59e0b' : look.hex }} aria-hidden />
                  <span className={cn('rounded-full px-2 py-0.5 text-[12px] font-medium', i.area === 'Agents' ? 'bg-amber-50 text-amber-800' : look.tint)}>{i.area}</span>
                  {/* On a phone the sentence takes the full row and the link sits under it. */}
                  <span className="min-w-0 flex-1 basis-full text-slate-800 sm:basis-0">{i.text}</span>
                  <Link href={i.href} className="inline-flex items-center gap-1 font-medium text-slate-950 underline-offset-2 hover:underline">
                    {i.action} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              );
            })}
          </Panel>
        )}
      </Section>

      <Section
        title="The product"
        description={p ? `New players and games are for the last 7 whole days (${shortDay(p.from)} to ${shortDay(p.to)}), against the 7 before. The lines show 30 days.` : 'Players and plays.'}
        actions={
          <Link href="/hq/analytics" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            Open analytics <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        {a ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Panel>
              <Stat label="Active today" value={a.actives.dau.toLocaleString()} hint="players so far today" spark={series.map((d) => d.activePlayers)} sparkTone="emerald" />
            </Panel>
            <Panel>
              <Stat label="Active this week" value={a.actives.wau.toLocaleString()} hint="in the last 7 days" />
            </Panel>
            <Panel>
              <Stat label="Active this month" value={a.actives.mau.toLocaleString()} hint="in the last 30 days" />
            </Panel>
            <Panel>
              <Stat label="New players" value={p ? p.newPlayers.now.toLocaleString() : '—'} hint={p ? <Delta now={p.newPlayers.now} before={p.newPlayers.before} /> : undefined} spark={series.map((d) => d.newUsers)} sparkTone="sky" />
            </Panel>
            <Panel className="col-span-2 sm:col-span-1">
              <Stat label="Games played" value={p ? p.games.now.toLocaleString() : '—'} hint={p ? <Delta now={p.games.now} before={p.games.before} /> : undefined} spark={series.map((d) => d.matches)} sparkTone="violet" />
            </Panel>
          </div>
        ) : analytics.error ? (
          <EmptyState>Could not load the product numbers.</EmptyState>
        ) : (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading the product numbers…
          </div>
        )}
      </Section>

      <Section title="Departments" description="Each department has its agents, its numbers and its tools in one place.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {HQ_DEPARTMENTS.map((d) => (
            <Department key={d.key} d={d} o={o} g={games.data} failed={d.key === 'content' ? !!overview.error : d.key === 'games' ? !!games.error : false} />
          ))}
        </div>
      </Section>
    </div>
  );
}
