'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHarnessOverview, useSetHarnessPolicy, useUpdateHarnessSettings, useHqClock } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { cn } from '@/lib/utils';
import type { HarnessOverview, HarnessReleaseStatus } from '@/types';
import { EmptyState, errorMessage, HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { AskHq } from './ask';
import { EngineRoom } from './engine';
import { agentsNow, flow, plainEvent, stuckCount } from './plain';
import { JustLive, NeedsYou } from './questions';
import { Runway } from './runway';
import { Seats } from './seats';
import { Show, ShowSummary } from './show';
import { Events, NewCategories } from './plans';
import { CategoryBoard, Orders } from './steering';

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
      <div className="flex items-center gap-2 text-sm text-slate-600">
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
          <SelectTrigger id="harness-release-status" className="h-9 w-[200px]" aria-label="Where new questions go">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">to the draft queue</SelectItem>
            <SelectItem value="published">straight into ranked</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={toggle} disabled={update.isPending} variant={paused ? 'default' : 'outline'}>
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
  { key: 'plans', label: 'In progress' },
  { key: 'agents', label: 'Agents' },
  { key: 'engine', label: 'Engine room' },
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

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
  // The tab is in the address, so a link opens the same view.
  const setTab = (next: TabKey) => {
    setTabState(next);
    router.replace(next === 'today' ? pathname : `${pathname}?tab=${next}`);
  };

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="HQ"
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

          <AskHq asks={data.asks} paused={data.settings.paused} />

          <div role="tablist" aria-label="Content sections" className="flex gap-1 overflow-x-auto border-b border-slate-200">
            {TABS.map((t) => {
              const badge =
                t.key === 'runway' ? data.runway.filter((r) => r.daysLeft < 14).length : t.key === 'show' ? Number(data.show?.pack?.status === 'ready') : t.key === 'plans' ? data.requests.filter((r) => r.status === 'open').length : 0;
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
                    <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold', t.key === 'runway' ? 'bg-red-50 text-red-700' : t.key === 'show' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700')}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tab === 'today' && (
            <>
              <StatusLine data={data} />
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
          {tab === 'library' && <CategoryBoard categories={data.classic.categories} direction={data.direction} />}
          {tab === 'plans' && (
            <>
              <Orders requests={data.requests} categories={data.allCategories} />
              <Events events={data.contentEvents} categories={data.allCategories} />
              <NewCategories proposals={data.proposals} />
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
