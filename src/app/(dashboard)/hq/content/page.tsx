'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useHarnessOverview, useSetHarnessPolicy, useUpdateHarnessSettings } from '@/hooks';
import { formatRelative } from '@/lib/hq-board';
import { cn } from '@/lib/utils';
import type { HarnessOverview, HarnessReleaseStatus } from '@/types';
import { EmptyState, errorMessage, HQ_LABEL, HQ_PAGE, LoadErrorState, PageHeader, Panel, RefreshErrorBanner, Section } from '../hq-ui';
import { AskHq } from './ask';
import { EngineRoom } from './engine';
import { flow, plainEvent, stuckCount } from './plain';
import { JustLive, NeedsYou } from './questions';
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

function StatusLine({ data }: { data: HarnessOverview }) {
  const stuck = stuckCount(data);
  const parts: Array<{ n: number; text: string; tone: string }> = [
    { n: data.today.live, text: 'new questions in ranked today', tone: 'text-emerald-700' },
    { n: data.classic.totalShortage, text: `still missing in ${data.classic.shortCategories} categories`, tone: data.classic.totalShortage ? 'text-amber-700' : 'text-emerald-700' },
    { n: stuck, text: stuck === 1 ? 'question needs you' : 'questions need you', tone: stuck ? 'text-red-700' : 'text-slate-700' },
  ];
  return (
    <Panel className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
      <span className={cn('inline-flex items-center gap-2 text-sm font-semibold', data.settings.paused ? 'text-amber-700' : 'text-emerald-700')}>
        <span className={cn('h-2.5 w-2.5 rounded-full', data.settings.paused ? 'bg-amber-500' : 'animate-pulse bg-emerald-500')} aria-hidden />
        {data.settings.paused ? 'Agents paused' : 'Agents working'}
      </span>
      {parts.map((p) => (
        <span key={p.text} className="text-[15px] text-slate-700">
          <b className={cn('text-xl tabular-nums', p.tone)}>{p.n.toLocaleString()}</b> {p.text}
        </span>
      ))}
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

export default function HqContentPage() {
  const { data, error, isLoading, refetch } = useHarnessOverview();
  const [engineOpen, setEngineOpen] = useState(false);

  return (
    <div className={HQ_PAGE}>
      <PageHeader
        eyebrow="HQ"
        title="Content"
        description="Agents keep the game's questions full, checked and translated. You steer: what goes first, what it should be about, and what isn't good enough."
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

          <StatusLine data={data} />
          <AskHq asks={data.asks} paused={data.settings.paused} />
          <Flow data={data} />
          {data.needsYou.length > 0 && <NeedsYou items={data.needsYou} total={stuckCount(data)} />}
          <CategoryBoard categories={data.classic.categories} direction={data.direction} />
          <Orders requests={data.requests} categories={data.allCategories} />
          <Events events={data.contentEvents} categories={data.allCategories} />
          <NewCategories proposals={data.proposals} />
          <JustLive items={data.recentLive} />
          <Activity data={data} />

          <section className="rounded-lg border border-slate-200">
            <button
              type="button"
              aria-expanded={engineOpen}
              onClick={() => setEngineOpen((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span>
                <span className="text-[15px] font-semibold text-slate-950">Engine room</span>
                <span className="ml-2 text-sm text-slate-600">
                  agents, model accounts, work queue · {data.today.runs} runs today{data.today.failed ? `, ${data.today.failed} failed` : ''}
                </span>
              </span>
              <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', engineOpen && 'rotate-180')} />
            </button>
            {engineOpen && (
              <div className="border-t border-slate-200 p-4">
                <EngineRoom data={data} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
