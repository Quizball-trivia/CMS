'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateHarnessIdea, useHarnessOverview, useSetHarnessPolicy, useUpdateHarnessSettings, useHqClock } from '@/hooks';
import { formatRelative } from '@/lib/hq-time';
import { DEPARTMENT_LOOK } from '@/lib/hq-departments';
import { cn } from '@/lib/utils';
import type { HarnessMarket, HarnessOverview, HarnessReleaseStatus } from '@/types';
import { EmptyState, errorMessage, HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { AskHq } from './ask';
import { EngineRoom } from './engine';
import { EMPTY_IDEA, Ideas, IdeasSummary, waitingByMarket, waitingIdeas, type IdeaComposer, type IdeaDraft } from './ideas';
import { inScope, isMarket, MarketNote, marketName, MarketSwitcher, type MarketScope } from './markets';
import { agentsNow, flow, plainEvent, stuckCount } from './plain';
import { JustLive, NeedsYou } from './questions';
import { Runway } from './runway';
import { Seats } from './seats';
import { Show, ShowSummary } from './show';
import { Events, NewCategories } from './plans';
import { CategoryBoard, Orders, QuietCategories } from './steering';

// HQ → Content, for the content team: what the agents are doing in plain
// words, what needs a person, and the controls that steer the agents
// (priority, direction, orders, flags). The engine room is collapsed.

function releaseStatus(o: HarnessOverview): HarnessReleaseStatus {
  return o.policies.find((p) => p.key === 'classic.release_status')?.value === 'published' ? 'published' : 'draft';
}

function Controls({ data }: { data: HarnessOverview }) {
  const update = useUpdateHarnessSettings();
  const setPolicy = useSetHarnessPolicy();
  const paused = data.settings.paused;
  const toggle = () =>
    update.mutate(
      { paused: !paused, pausedReason: paused ? null : 'Paused from the CMS' },
      {
        onSuccess: () => toast.success(paused ? 'Agents switched on' : 'Agents paused'),
        onError: (e) => toast.error(errorMessage(e, 'Could not change the pause switch')),
      }
    );
  return (
    <>
      <div className="flex items-center gap-2 text-sm text-white/70">
        <span>New questions go</span>
        <Select
          value={releaseStatus(data)}
          onValueChange={(v) =>
            setPolicy.mutate(
              { key: 'classic.release_status', value: v },
              {
                onSuccess: () => toast.success(v === 'published' ? 'New questions now go straight into ranked' : 'New questions now wait in the draft queue'),
                onError: (e) => toast.error(errorMessage(e, 'Could not change where new questions go')),
              }
            )
          }
          disabled={setPolicy.isPending}
        >
          <SelectTrigger id="harness-release-status" className="h-9 w-[200px] border-white/15 bg-white/10 text-white" aria-label="Where new questions go">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">to the draft queue</SelectItem>
            <SelectItem value="published">straight into ranked</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={toggle} disabled={update.isPending} className={paused ? 'bg-brand text-ink hover:bg-brand/90' : 'border border-white/15 bg-white/10 text-white hover:bg-white/20'}>
        {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : paused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
        {paused ? 'Switch agents on' : 'Pause agents'}
      </Button>
    </>
  );
}

const NOW_TONE: Record<string, [string, string]> = {
  working: ['text-emerald-700', 'animate-pulse bg-emerald-500'],
  paused: ['text-amber-700', 'bg-amber-500'],
  waiting: ['text-amber-700', 'bg-amber-500'],
  idle: ['text-slate-700', 'bg-slate-400'],
};

function StatusLine({ data }: { data: HarnessOverview }) {
  const stuck = stuckCount(data);
  const now = agentsNow(data, useHqClock().getTime());
  const parts: Array<{ n: number; text: string; tone: string }> = [
    { n: data.today.live, text: 'new questions in ranked today', tone: 'text-emerald-700' },
    { n: data.classic.totalShortage, text: `still missing in ${data.classic.shortCategories} categories`, tone: data.classic.totalShortage ? 'text-amber-700' : 'text-emerald-700' },
    { n: stuck, text: stuck === 1 ? 'question needs you' : 'questions need you', tone: stuck ? 'text-red-700' : 'text-slate-700' },
  ];
  return (
    <Panel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
      <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', NOW_TONE[now.tone][0])}>
        <span className={cn('h-2.5 w-2.5 rounded-full', NOW_TONE[now.tone][1])} aria-hidden />
        {now.headline}
      </span>
      {parts.map((p) => (
        <span key={p.text} className="text-[15px] text-slate-700">
          <b className={cn('text-xl tabular-nums', p.tone)}>{p.n.toLocaleString()}</b> {p.text}
        </span>
      ))}
      {now.detail && <p className="w-full text-[13px] text-slate-600">{now.detail}</p>}
    </Panel>
  );
}

function Flow({ data }: { data: HarnessOverview }) {
  const steps = flow(data);
  return (
    <Section title="How questions move" description="Every question goes through these steps. Numbers are what is in each step right now.">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <Panel key={s.key} className={cn('relative px-4 py-3', s.key === 'live' && 'border-emerald-200 bg-emerald-50')}>
            <div className={HQ_LABEL}>
              {i + 1}. {s.label}
            </div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums', s.key === 'live' ? 'text-emerald-700' : 'text-slate-950')}>{s.count}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-slate-600">{s.hint}</div>
          </Panel>
        ))}
      </div>
    </Section>
  );
}

function Activity({ data }: { data: HarnessOverview }) {
  const lines = data.events.map((e) => ({ e, p: plainEvent(e) })).filter((x) => x.p) as Array<{ e: HarnessOverview['events'][number]; p: NonNullable<ReturnType<typeof plainEvent>> }>;
  return (
    <Section title="What the agents are doing">
      <Panel className="divide-y divide-slate-100">
        {lines.length === 0 ? (
          <EmptyState className="px-4 py-3">No activity yet.</EmptyState>
        ) : (
          lines.slice(0, 20).map(({ e, p }) => (
            <div key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
              <span className="w-20 shrink-0 text-[12px] text-slate-500">{formatRelative(e.createdAt)}</span>
              <span className={cn('min-w-0 flex-1', p.tone === 'good' ? 'text-emerald-800' : p.tone === 'attention' ? 'text-amber-800' : 'text-slate-800')}>{p.text}</span>
            </div>
          ))
        )}
      </Panel>
    </Section>
  );
}

const TEAM_LABEL: Record<string, [string, string]> = {
  sensing: ['Sensing', 'Notice what is happening'],
  suggesting: ['Suggesting', 'Turn it into proposals for you'],
  making: ['Making', 'Create the content'],
  checking: ['Checking', 'A different AI checks every piece'],
  localization: ['Localizing', 'Make it native in each language'],
  foundation: ['Looking after', 'Keep what is live true and fair'],
  live: ['Live', 'Run things as they happen'],
};

/** The agents as a team, in plain words. The technical view (accounts, fallbacks) is in the Engine room. */
function Team({ data }: { data: HarnessOverview }) {
  const teams = Object.keys(TEAM_LABEL).filter((t) => data.agents.some((a) => a.team === t));
  // The pause switch stops every agent, whatever its own setting.
  const working = (a: HarnessOverview['agents'][number]) => a.status === 'active' && !data.settings.paused;
  return (
    <div className="space-y-6">
      {teams.map((t) => (
        <Section key={t} title={TEAM_LABEL[t][0]} description={TEAM_LABEL[t][1]}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.agents.filter((a) => a.team === t).map((a) => (
              <Panel key={a.slug} className="space-y-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-900">{a.name}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[12px] font-medium', working(a) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                    {working(a) ? 'Working' : 'Paused'}
                  </span>
                </div>
                <p className="text-[13px] text-slate-600">{a.description}</p>
                {a.altModel && <p className="text-[12px] text-slate-500">When its own AI is busy or used up, it works on {a.altProvider === 'claude' ? 'Claude' : 'Codex'} instead.</p>}
                <p className="text-[12px] tabular-nums text-slate-500">
                  {a.runsToday} runs today{a.lastRunAt ? ` · last ${formatRelative(a.lastRunAt)}` : ''}
                </p>
              </Panel>
            ))}
          </div>
        </Section>
      ))}
      <p className="text-[13px] text-slate-600">A checker never runs on the AI model that wrote what it checks, so no agent marks its own work.</p>
    </div>
  );
}

const TABS = [
  { key: 'today', label: 'Today' },
  { key: 'runway', label: 'Runway' },
  { key: 'show', label: 'Monday show' },
  { key: 'library', label: 'Library' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'plans', label: 'In progress' },
  { key: 'agents', label: 'Agents' },
  { key: 'engine', label: 'Engine room' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

/** On Today, when a market is picked: what HQ has for it, and the way to add more. */
function MarketToday({ data, market, onIdeas, onLibrary }: { data: HarnessOverview; market: HarnessMarket; onIdeas: () => void; onLibrary: () => void }) {
  const only: MarketScope = { market, withEveryone: false };
  // Every category made for the market counts, also one nobody played lately; only the played ones have a shortage.
  const made = data.allCategories.filter((c) => inScope(only, c.market)).length;
  const cats = data.classic.categories.filter((c) => inScope(only, c.market));
  const short = cats.reduce((n, c) => n + c.shortage, 0);
  const events = data.contentEvents.filter((e) => e.status === 'open' && inScope(only, e.market)).length;
  const filling = data.proposals.filter((p) => p.status === 'filling' && inScope(only, p.market)).length;
  const ideas = waitingIdeas(data.ideas, only).length;
  const emptiest = [...cats].filter((c) => c.shortage > 0).sort((a, b) => b.shortage - a.shortage).slice(0, 4);
  const stats: Array<[number, string]> = [
    [made, made === 1 ? 'category of its own' : 'categories of its own'],
    [short, 'questions short in them'],
    [filling, filling === 1 ? 'new category being filled' : 'new categories being filled'],
    [events, events === 1 ? 'event coming' : 'events coming'],
    [ideas, ideas === 1 ? 'idea waiting' : 'ideas waiting'],
  ];
  return (
    <Panel className="space-y-3 border-orange-200 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-slate-950">{marketName(market)}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onLibrary}>
            Its categories
          </Button>
          <Button size="sm" onClick={onIdeas}>
            Launch something for {marketName(market)}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {stats.map(([n, text]) => (
          <span key={text} className="text-[15px] text-slate-700">
            <b className="text-xl tabular-nums text-slate-950">{n.toLocaleString()}</b> {text}
          </span>
        ))}
      </div>
      {made === 0 ? (
        <p className="text-sm text-amber-800">Nothing is made for {marketName(market)} yet. Its players see the same categories as everyone else.</p>
      ) : (
        emptiest.length > 0 && (
          <p className="text-sm text-slate-700">
            Emptiest: {emptiest.map((c) => `${c.name} (${c.pool} of ${c.needed})`).join(' · ')}
          </p>
        )
      )}
      <MarketNote market={market} />
    </Panel>
  );
}

export default function HqContentPage() {
  const { data, error, isLoading, refetch } = useHarnessOverview();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get('tab');
  const [tab, setTabState] = useState<TabKey>(isTab(fromUrl) ? fromUrl : 'today');
  // The address wins when it changes under the page (the sidebar link, back and forward).
  const [seenUrl, setSeenUrl] = useState(fromUrl);
  if (fromUrl !== seenUrl) {
    setSeenUrl(fromUrl);
    setTabState(isTab(fromUrl) ? fromUrl : 'today');
  }
  const marketFromUrl = params.get('market');
  const market: HarnessMarket = isMarket(marketFromUrl) ? marketFromUrl : 'all';
  const [withEveryone, setWithEveryone] = useState(false);
  // Kept here, not in the Ideas tab: an idea half written survives a look at the Library.
  // Sending lives here too: the page knows one is on its way (no second send), and clears the draft when it lands.
  const [ideaDraft, setIdeaDraft] = useState<IdeaDraft>(EMPTY_IDEA);
  const createIdea = useCreateHarnessIdea();
  const composer: IdeaComposer = {
    draft: ideaDraft,
    onDraft: setIdeaDraft,
    sending: createIdea.isPending,
    onSend: (body) =>
      createIdea.mutate(body, {
        onSuccess: () => {
          setIdeaDraft(EMPTY_IDEA);
          toast.success('Sent: the HQ Assistant comes back with a plan');
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not send the idea')),
      }),
  };
  const scope: MarketScope = { market, withEveryone };
  const address = (t: TabKey, m: HarnessMarket) => {
    const q = new URLSearchParams();
    if (t !== 'today') q.set('tab', t);
    if (m !== 'all') q.set('market', m);
    const text = q.toString();
    return text ? `${pathname}?${text}` : pathname;
  };
  // The tab and the market are in the address, so a link opens the same view.
  const setTab = (next: TabKey) => {
    setTabState(next);
    router.replace(address(next, market));
  };
  const setScope = (next: MarketScope) => {
    setWithEveryone(next.withEveryone);
    if (next.market !== market) router.replace(address(tab, next.market));
  };

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="Department · led by Tato"
        glow={DEPARTMENT_LOOK.content.hex}
        title="Content"
        description="Agents keep the game's content full, checked and translated. You steer: what goes first, what it should be about, and what isn't good enough."
        actions={data ? <Controls data={data} /> : undefined}
      />

      {error && !data ? (
        <LoadErrorState error={error} fallback="Could not load the content agents" onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {/* A failed refresh keeps the last data on screen; say so, so nobody acts on stale numbers. */}
          {error && <RefreshErrorBanner />}
          {data.settings.paused && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>Agents are paused.</b> {data.settings.pausedReason ?? ''} Nothing new starts until someone switches them on.
            </div>
          )}

          <MarketSwitcher scope={scope} onChange={setScope} counts={waitingByMarket(data.ideas)} />

          <div role="tablist" aria-label="Content sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => {
              const badge =
                t.key === 'runway' ? data.runway.filter((r) => r.daysLeft < 14).length : t.key === 'show' ? Number(data.show?.pack?.status === 'ready') : t.key === 'plans' ? data.requests.filter((r) => r.status === 'open' && inScope(scope, r.market)).length : t.key === 'ideas' ? waitingIdeas(data.ideas, scope).length : 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
                    tab === t.key ? 'border-slate-900 text-slate-950' : 'border-transparent text-slate-600 hover:text-slate-900'
                  )}
                >
                  {t.label}
                  {badge > 0 && (
                    <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', t.key === 'runway' ? 'bg-red-50 text-red-700' : t.key === 'show' || t.key === 'ideas' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Steering in plain words lives with the day's picture; the other tabs start straight at their own content.
              It stays mounted (only hidden) on them, so a message being typed or sent is never lost by switching tabs. */}
          <div hidden={tab !== 'today'}>
            <AskHq asks={data.asks} paused={data.settings.paused} />
          </div>

          {tab === 'today' && (
            <>
              {market !== 'all' && <MarketToday data={data} market={market} onIdeas={() => setTab('ideas')} onLibrary={() => setTab('library')} />}
              <StatusLine data={data} />
              <IdeasSummary ideas={data.ideas} scope={scope} onOpen={() => setTab('ideas')} />
              <Runway rows={data.runway} />
              {/* `show` is missing only while the backend is a version behind this page. */}
              {data.show && <ShowSummary show={data.show} paused={data.settings.paused} onOpen={() => setTab('show')} />}
              <Flow data={data} />
              {data.needsYou.length > 0 && <NeedsYou items={data.needsYou} total={stuckCount(data)} />}
              <JustLive items={data.recentLive} />
              <Activity data={data} />
            </>
          )}
          {tab === 'runway' && <Runway rows={data.runway} expanded />}
          {tab === 'show' && (data.show ? <Show show={data.show} paused={data.settings.paused} /> : <p className="text-sm text-slate-600">The Monday show is not available yet.</p>)}
          {tab === 'library' && (
            <>
              <MarketNote market={market} />
              <CategoryBoard
                categories={data.classic.categories.filter((c) => inScope(scope, c.market))}
                direction={data.direction}
                market={market}
                hasCategories={data.allCategories.some((c) => inScope(scope, c.market))}
                onSuggest={() => setTab('ideas')}
              />
              <QuietCategories categories={data.allCategories.filter((c) => inScope(scope, c.market) && !data.classic.categories.some((h) => h.categoryId === c.id))} market={market} />
            </>
          )}
          {tab === 'ideas' && (
            <>
              <MarketNote market={market} />
              <Ideas ideas={data.ideas} scope={scope} scouting={data.scouting} paused={data.settings.paused} composer={composer} />
            </>
          )}
          {tab === 'plans' && (
            <>
              <MarketNote market={market} />
              {/* The same scope for what can be ordered as for what is listed: an order never lands out of sight. */}
              <Orders requests={data.requests.filter((r) => inScope(scope, r.market))} categories={data.allCategories.filter((c) => inScope(scope, c.market))} market={market} />
              <Events events={data.contentEvents.filter((e) => inScope(scope, e.market))} categories={data.allCategories} market={market} />
              <NewCategories proposals={data.proposals.filter((p) => inScope(scope, p.market))} market={market} />
            </>
          )}
          {tab === 'agents' && (
            <>
              <Seats data={data} />
              <Team data={data} />
            </>
          )}
          {tab === 'engine' && (
            <>
              <p className="text-sm text-slate-600">
                For whoever looks after the system: {data.today.runs} runs today{data.today.failed ? `, ${data.today.failed} failed` : ''}.
              </p>
              <EngineRoom data={data} />
            </>
          )}
        </>
      )}
    </div>
  );
}
